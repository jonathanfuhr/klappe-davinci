/**
 * HTTP-Client für die Klappe-API.
 *
 * Bewusst ohne Fremdpaket: Gebraucht werden GET, POST, PATCH, DELETE, ein
 * roher Byte-Strom für den Upload und der Zugriff auf einzelne Antwort-Header
 * (`Klappe-Version-Id`, `Upload-Offset`, `ETag`). Das ist mit `node:http`
 * schneller geschrieben als eine Bibliothek eingebunden – und der Plugin-Ordner
 * bleibt ohne node_modules, die zur Resolve-Version passen müssten.
 *
 * Die Fehlerbehandlung folgt den „Regeln des Hauses" aus der Plugin-Doku:
 * 401 heißt neu koppeln, 403 heißt „der Administrator hat den externen Zugriff
 * abgeschaltet" (da hilft kein neuer Token), 404 kann auch „nicht für dieses
 * Konto" bedeuten, 429 kommt mit `Retry-After`.
 */

const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

const config = require('./config.js');
const { t } = require('./i18n.js');
const secrets = require('./secrets.js');

/** Fehler mit Status und einer Meldung, die man einem Menschen zeigen kann. */
class KlappeError extends Error {
  constructor(message, { status = 0, code = '', retryAfter = 0, detail = '' } = {}) {
    super(message);
    this.name = 'KlappeError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
    this.detail = detail;
  }
}

/**
 * Eine Anfrage, roh. Gibt Status, Header und den Rumpf als Buffer zurück –
 * ohne zu deuten, ob das ein Fehler ist. Das entscheidet `request()`.
 *
 * `body` darf ein Buffer oder ein lesbarer Strom sein; Ströme brauchen wir
 * für die Upload-Blöcke, damit nie mehr als ein Block im Speicher liegt.
 */
function raw(method, url, { headers = {}, body = null, timeoutMs = 0 } = {}) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(url);
    } catch {
      reject(new KlappeError(t('Die Adresse „{adresse}" ergibt keine gültige URL.', { adresse: url })));
      return;
    }

    const transport = target.protocol === 'http:' ? http : https;
    const request = transport.request(
      target,
      { method, headers },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode || 0,
            headers: response.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );

    if (timeoutMs > 0) {
      request.setTimeout(timeoutMs, () => {
        request.destroy(new KlappeError(t('Die Anfrage hat zu lange gedauert.')));
      });
    }

    request.on('error', (error) => reject(translateNetworkError(error, target)));

    if (body && typeof body.pipe === 'function') {
      body.on('error', (error) => request.destroy(error));
      body.pipe(request);
    } else {
      if (body) request.write(body);
      request.end();
    }
  });
}

/**
 * Netzwerkfehler in etwas übersetzen, das jemand am Schnittplatz verstehen
 * kann. „ECONNREFUSED" sagt niemandem, dass der Server nicht läuft.
 */
function translateNetworkError(error, target) {
  if (error instanceof KlappeError) return error;

  const host = target ? target.host : t('dem Server');
  switch (error.code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return new KlappeError(
        t('„{host}" ist nicht auffindbar. Stimmt die Adresse in den Einstellungen?', { host }),
        { code: error.code },
      );
    case 'ECONNREFUSED':
      return new KlappeError(
        t('{host} nimmt keine Verbindung an. Läuft die Klappe-Instanz?', { host }),
        { code: error.code },
      );
    case 'ETIMEDOUT':
    case 'ECONNRESET':
      return new KlappeError(t('Die Verbindung zu {host} ist abgerissen.', { host }), {
        code: error.code,
      });
    case 'CERT_HAS_EXPIRED':
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
      return new KlappeError(
        t(
          'Das Zertifikat von {host} lässt sich nicht prüfen. Bei einer Anlage mit eigenem Zertifikat muss es auf diesem Rechner als vertrauenswürdig eingetragen sein.',
          { host },
        ),
        { code: error.code },
      );
    default:
      return new KlappeError(
        t('Verbindung zu {host} fehlgeschlagen: {grund}', { host, grund: error.message }),
        { code: error.code || '' },
      );
  }
}

/** Basisadresse der Instanz, ohne `/v1` – die hängt an jedem Pfad selbst. */
function baseUrl() {
  const { serverUrl } = config.read();
  if (!serverUrl) {
    throw new KlappeError(t('Es ist noch keine Klappe-Adresse eingetragen (Einstellungen).'));
  }
  return serverUrl;
}

/** Aus `/v1/projects` wird `https://klappe.example.de/v1/projects`. */
function absolute(pathname) {
  if (/^https?:\/\//i.test(pathname)) return pathname;
  return `${baseUrl()}${pathname.startsWith('/') ? '' : '/'}${pathname}`;
}

function authHeaders(token = secrets.getToken()) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Deutet den Rumpf einer Fehlerantwort. Die API schickt
 * `{ message, statusCode }`; bei einem Proxy dazwischen kann auch HTML kommen.
 */
function errorDetail(response) {
  const text = response.body.toString('utf8').trim();
  if (!text) return '';
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.message === 'string') return parsed.message;
    if (Array.isArray(parsed?.message)) return parsed.message.join(', ');
  } catch {
    /* kein JSON – dann eben der rohe Text, gekürzt */
  }
  return text.slice(0, 300);
}

/** Aus einer Fehlerantwort einen sprechenden KlappeError machen. */
function toError(response, { pathname = '', method = '' } = {}) {
  const stelle = [method, pathname].filter(Boolean).join(' ');
  const detail = errorDetail(response);
  const status = response.status;

  if (status === 401) {
    return new KlappeError(
      t(
        'Der Zugang gilt nicht mehr – das Gerät wurde getrennt oder das Konto deaktiviert. Bitte neu koppeln.',
      ),
      { status, code: 'nicht-gekoppelt', detail },
    );
  }
  if (status === 403) {
    return new KlappeError(
      t(
        'Der externe API-Zugriff ist auf dem Server abgeschaltet. Das kann nur ein Administrator ändern (Einstellungen → API-Zugriff).',
      ),
      { status, code: 'zugriff-aus', detail },
    );
  }
  if (status === 404) {
    // `detail` kommt vom Server und ist dort schon in der Sprache des
    // Anfragenden – das übersetzen wir nicht noch einmal.
    return new KlappeError(detail || t('Nicht gefunden – oder für dieses Konto nicht sichtbar.'), {
      status,
      code: 'nicht-gefunden',
      detail,
    });
  }
  if (status === 429) {
    const retryAfter = Number(response.headers['retry-after']) || 5;
    return new KlappeError(
      t('Zu viele Anfragen. Klappe bittet um {sekunden} Sekunden Pause.', {
        sekunden: retryAfter,
      }),
      { status, code: 'gebremst', retryAfter, detail },
    );
  }
  if (status >= 500) {
    // Die Stelle gehört in die Meldung: Ein „Internal Server Error" ohne Route
    // ist beim Suchen wertlos – man weiß nicht einmal, welcher Schritt es war.
    return new KlappeError(
      `${t('Der Server meldet einen Fehler ({status}) bei {stelle}.', {
        status,
        stelle: stelle || '?',
      })} ${detail}`.trim(),
      { status, code: 'server', detail, stelle },
    );
  }

  return new KlappeError(
    detail || t('Die Anfrage an {pfad} schlug fehl ({status}).', { pfad: stelle || pathname, status }),
    { status, code: 'abgelehnt', detail, stelle },
  );
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Eine API-Anfrage mit Token, JSON hinein und heraus.
 *
 * `expectBinary` liefert den Rumpf als Buffer statt als geparstes JSON – für
 * `annotation.png`. `allowStatus` nimmt Statuscodes aus der Fehlerbehandlung
 * heraus, wo der Aufrufer sie selbst deuten will (etwa `409` beim Upload oder
 * `304` bei einem `If-None-Match`).
 */
async function request(method, pathname, options = {}) {
  const {
    json,
    body,
    headers = {},
    token,
    expectBinary = false,
    allowStatus = [],
    retryOnRateLimit = true,
    timeoutMs = 120_000,
  } = options;

  const requestHeaders = {
    Accept: expectBinary ? 'image/png' : 'application/json',
    ...authHeaders(token),
    ...headers,
  };

  let payload = body || null;
  if (json !== undefined) {
    payload = Buffer.from(JSON.stringify(json), 'utf8');
    requestHeaders['Content-Type'] = 'application/json';
    requestHeaders['Content-Length'] = String(payload.length);
  }

  const url = absolute(pathname);
  let response = await raw(method, url, { headers: requestHeaders, body: payload, timeoutMs });

  // 429 einmal aussitzen, statt den Fehler durchzureichen: Die Bremse greift
  // vor allem beim Kopplungs-Polling, und dort wäre ein Abbruch ärgerlich.
  if (response.status === 429 && retryOnRateLimit && !allowStatus.includes(429)) {
    const wait = Math.min(Number(response.headers['retry-after']) || 5, 60);
    await sleep(wait * 1000);
    response = await raw(method, url, { headers: requestHeaders, body: payload, timeoutMs });
  }

  const ok = response.status >= 200 && response.status < 300;
  if (!ok && !allowStatus.includes(response.status)) {
    throw toError(response, { pathname, method });
  }

  if (expectBinary || response.status === 204 || response.body.length === 0) {
    return { status: response.status, headers: response.headers, data: response.body };
  }

  const text = response.body.toString('utf8');
  try {
    return { status: response.status, headers: response.headers, data: JSON.parse(text) };
  } catch {
    return { status: response.status, headers: response.headers, data: text };
  }
}

/** Kurzformen – der Normalfall interessiert sich nur für die Daten. */
const get = async (pathname, options) => (await request('GET', pathname, options)).data;
const post = async (pathname, json, options) =>
  (await request('POST', pathname, { json, ...options })).data;
const patch = async (pathname, json, options) =>
  (await request('PATCH', pathname, { json, ...options })).data;
const del = async (pathname, options) => (await request('DELETE', pathname, options)).data;

module.exports = {
  KlappeError,
  raw,
  request,
  get,
  post,
  patch,
  del,
  absolute,
  baseUrl,
  authHeaders,
  toError,
  translateNetworkError,
};
