/**
 * Upload nach tus 1.0.0.
 *
 * Klappe spricht denselben Weg wie der Browser, und aus demselben Grund: Ein
 * 40-GB-Master über VPN übersteht keine Verbindung am Stück. Bricht sie ab,
 * geht es an genau der Stelle weiter.
 *
 * Der Protokollanteil ist klein genug, um ihn selbst zu schreiben: Sitzung
 * anlegen (als JSON, damit `versionNumber`, `internal` und `replace` gleich
 * mitgehen und **vor** der Übertragung geprüft werden), Blöcke per `PATCH`
 * schreiben, nach einem Abbruch per `HEAD` nachsehen, wo der Server steht.
 * Dafür ein Fremdpaket in den Plugin-Ordner zu legen, das zur Node-Fassung
 * von Resolve passen muss, wäre der teurere Weg.
 */

const fs = require('node:fs');

const api = require('./api.js');
const { t } = require('./i18n.js');

/** 16 MB je Block – groß genug für Durchsatz, klein genug für zügiges Resume. */
const CHUNK_BYTES = 16 * 1024 * 1024;

/** So oft versuchen wir einen Block erneut, bevor wir aufgeben. */
const MAX_RETRIES = 5;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Sitzung für eine neue Fassung eröffnen.
 *
 * Geprüft wird sofort: Eine belegte `versionNumber` ohne `replace` ergibt hier
 * `409` – und nicht erst nach 90 GB Übertragung.
 */
async function createVersionSession(videoId, meta) {
  const body = {
    filename: meta.filename,
    sizeBytes: meta.sizeBytes,
  };
  if (meta.mimeType) body.mimeType = meta.mimeType;
  if (meta.label) body.label = meta.label;
  if (meta.fileDate) body.fileDate = meta.fileDate;
  if (Number.isFinite(meta.versionNumber)) body.versionNumber = meta.versionNumber;
  if (meta.internal) body.internal = true;
  if (meta.replace) body.replace = true;

  const response = await api.request('POST', `/v1/videos/${videoId}/uploads`, {
    json: body,
    allowStatus: [409, 400],
  });

  if (response.status === 409) {
    throw new api.KlappeError(
      t('Die Fassungsnummer {nummer} ist schon vergeben. Zum Überschreiben „Fassung ersetzen" wählen.', {
        nummer: meta.versionNumber,
      }),
      { status: 409, code: 'nummer-vergeben' },
    );
  }
  if (response.status === 400) {
    // Die Begründung des Servers weitergeben statt sie zu verschlucken – sie
    // sagt genau, welche Angabe nicht passt (etwa `replace` ohne Nummer).
    const detail = response.data?.message;
    throw new api.KlappeError(
      Array.isArray(detail) ? detail.join(', ') : detail || t('Der Server hat den Upload abgelehnt.'),
      { status: 400, code: 'abgelehnt' },
    );
  }

  const session = response.data || {};
  const location = session.location || response.headers.location;
  if (!location) throw new api.KlappeError(t('Der Server hat keine Upload-Adresse genannt.'));

  return { id: session.id, location, session };
}

/** Wo steht der Server? Nach jedem Abbruch die erste Frage. */
async function currentOffset(location) {
  const response = await api.request('HEAD', location, {
    headers: { 'Tus-Resumable': '1.0.0' },
    allowStatus: [404],
  });
  if (response.status === 404) {
    throw new api.KlappeError(
      t('Die Upload-Sitzung gibt es nicht mehr – sie wurde abgebrochen oder ist abgelaufen.'),
      { status: 404, code: 'sitzung-weg' },
    );
  }
  return Number(response.headers['upload-offset']) || 0;
}

/** Angefangene Sitzung wegräumen. */
async function abortSession(location) {
  try {
    await api.request('DELETE', location, {
      headers: { 'Tus-Resumable': '1.0.0' },
      allowStatus: [404, 409],
    });
  } catch {
    /* Wenn der Server sie ohnehin nicht mehr kennt, ist nichts zu tun. */
  }
}

/**
 * Einen Block schreiben. Der Rumpf ist ein Dateiausschnitt als Strom – so
 * liegt nie mehr als ein Block im Speicher, auch bei 40 GB nicht.
 */
async function sendChunk(location, filePath, offset, length, token) {
  const stream = fs.createReadStream(filePath, { start: offset, end: offset + length - 1 });

  const response = await api.raw('PATCH', api.absolute(location), {
    headers: {
      ...api.authHeaders(token),
      'Content-Type': 'application/offset+octet-stream',
      'Content-Length': String(length),
      'Tus-Resumable': '1.0.0',
      'Upload-Offset': String(offset),
    },
    body: stream,
    timeoutMs: 300_000,
  });

  return response;
}

/**
 * Überträgt die Datei vollständig und gibt die entstandene Fassungs-ID zurück
 * (`Klappe-Version-Id` aus der Antwort auf den letzten Block).
 *
 * `signal` ist ein Objekt mit `aborted` – wird es gesetzt, hört die Schleife
 * beim nächsten Block auf. Die schon übertragenen Bytes bleiben beim Server
 * liegen, ein späterer Aufruf setzt dort auf.
 */
async function uploadFile({ location, filePath, sizeBytes, onProgress, signal }) {
  let offset = await currentOffset(location);
  let versionId = '';
  let retries = 0;

  if (onProgress) onProgress(offset, sizeBytes);

  while (offset < sizeBytes) {
    if (signal && signal.aborted) {
      throw new api.KlappeError(t('Der Upload wurde abgebrochen.'), { code: 'abgebrochen' });
    }

    const length = Math.min(CHUNK_BYTES, sizeBytes - offset);
    let response;

    try {
      response = await sendChunk(location, filePath, offset, length);
    } catch (error) {
      // Netzwerkfehler mitten im Block: Der Server hat vielleicht schon einen
      // Teil geschrieben. Nachsehen, wo er steht, und dort weitermachen –
      // nicht von vorn beginnen.
      retries += 1;
      if (retries > MAX_RETRIES) throw error;
      await sleep(Math.min(30_000, 1000 * 2 ** retries));
      offset = await currentOffset(location);
      continue;
    }

    if (response.status === 409) {
      // Unser Offset passt nicht zum Server – der tatsächliche Stand steht in
      // der Meldung, sicherer ist ein HEAD.
      offset = await currentOffset(location);
      continue;
    }

    if (response.status === 429) {
      const wait = Math.min(Number(response.headers['retry-after']) || 5, 60);
      await sleep(wait * 1000);
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      throw api.toError(response, { pathname: location, method: 'PATCH' });
    }

    retries = 0;
    const reported = Number(response.headers['upload-offset']);
    offset = Number.isFinite(reported) ? reported : offset + length;

    const headerVersionId = response.headers['klappe-version-id'];
    if (headerVersionId) versionId = String(headerVersionId);

    if (onProgress) onProgress(offset, sizeBytes);
  }

  return { versionId };
}

module.exports = {
  CHUNK_BYTES,
  createVersionSession,
  currentOffset,
  abortSession,
  uploadFile,
};
