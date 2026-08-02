/**
 * Gerätekopplung.
 *
 * Kein Passwortfeld im Plugin – der Ablauf ist der eines Fernsehers, den man
 * mit einem Streamingdienst verbindet: Das Plugin meldet eine Kopplung an,
 * zeigt einen kurzen Benutzercode, ein angemeldeter Mensch bestätigt ihn im
 * Browser unter `/geraet`, und erst dann entsteht der Token. So wandert kein
 * Passwort auf die Platte, und Konten mit Microsoft-365-Anmeldung
 * funktionieren ohne Sonderweg mit.
 */

const os = require('node:os');

const api = require('./api.js');
const { t } = require('./i18n.js');
const secrets = require('./secrets.js');

/** Läuft gerade eine Kopplung? Dann kennt sie sich hier selbst wieder. */
let pending = null;

/**
 * Der Name, den der Mensch beim Bestätigen liest und der später in seiner
 * Geräteliste steht. „DaVinci Resolve" allein wäre zu wenig – in der Liste
 * stehen irgendwann fünf Einträge.
 */
function clientName() {
  const host = os.hostname().replace(/\.local$/i, '');
  return t('DaVinci Resolve auf {rechner}', { rechner: host });
}

/**
 * Schritt 1: Kopplung anmelden. Gibt Benutzercode und Adresse zurück, die das
 * Panel anzeigt. Der Gerätecode bleibt hier.
 */
async function start() {
  const data = await api.post(
    '/v1/auth/geraet/start',
    { clientName: clientName() },
    { token: null },
  );

  if (!data || !data.deviceCode || !data.userCode) {
    throw new api.KlappeError(t('Der Server hat keine Kopplung angelegt.'));
  }

  pending = {
    deviceCode: data.deviceCode,
    intervalSeconds: Math.max(1, Number(data.intervalSeconds) || 5),
    expiresAt: Date.now() + (Number(data.expiresInSeconds) || 600) * 1000,
    cancelled: false,
  };

  return {
    userCode: data.userCode,
    verificationUrl: data.verificationUrl,
    verificationUrlComplete: data.verificationUrlComplete,
    expiresInSeconds: Number(data.expiresInSeconds) || 600,
    clientName: clientName(),
  };
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Schritt 3: Token abholen. Fragt im vom Server genannten Takt nach – nicht
 * öfter, sonst läuft das Plugin in die Bremse.
 *
 * Der Token wird sofort verschlüsselt abgelegt; er kommt genau einmal über
 * die Leitung.
 */
async function waitForToken(onTick) {
  if (!pending) throw new api.KlappeError(t('Es läuft keine Kopplung.'));
  const session = pending;

  for (;;) {
    if (session.cancelled) throw new api.KlappeError(t('Die Kopplung wurde abgebrochen.'));

    if (Date.now() > session.expiresAt) {
      pending = null;
      throw new api.KlappeError(
        t('Die Kopplung ist abgelaufen – sie gilt zehn Minuten. Bitte noch einmal starten.'),
      );
    }

    const response = await api.request('POST', '/v1/auth/geraet/token', {
      json: { deviceCode: session.deviceCode },
      token: null,
      allowStatus: [400, 403, 404],
    });

    if (response.status === 403) {
      pending = null;
      throw new api.KlappeError(
        t(
          'Die Kopplung wurde abgelehnt – oder der externe API-Zugriff ist auf dem Server abgeschaltet.',
        ),
        { status: 403, code: 'abgelehnt' },
      );
    }
    if (response.status === 400 || response.status === 404) {
      pending = null;
      throw new api.KlappeError(
        t('Die Kopplung ist abgelaufen oder unbekannt. Bitte noch einmal starten.'),
        { status: response.status, code: 'abgelaufen' },
      );
    }

    const data = response.data || {};
    if (data.token) {
      pending = null;
      secrets.setToken(data.token);
      return { name: data.name || clientName(), user: data.user || null };
    }

    if (onTick) {
      onTick(Math.max(0, Math.round((session.expiresAt - Date.now()) / 1000)));
    }
    await sleep(session.intervalSeconds * 1000);
  }
}

/** Bricht eine laufende Kopplung ab – der Knopf „Abbrechen" im Dialog. */
function cancel() {
  if (pending) pending.cancelled = true;
  pending = null;
}

/**
 * Verbindungstest. Gibt das Konto zurück, unter dem das Plugin schreibt –
 * oder `null`, wenn kein Token da ist.
 */
async function me() {
  if (!secrets.hasToken()) return null;
  return api.get('/v1/auth/me');
}

/**
 * Verbindung trennen. Wir versuchen zusätzlich, das Gerät serverseitig zu
 * entfernen – gelingt das nicht (Token schon entzogen, Server nicht
 * erreichbar), ist das kein Grund, den Token lokal zu behalten.
 */
async function disconnect() {
  let serverSide = false;
  try {
    const token = secrets.getToken();
    const geraete = await api.get('/v1/geraete');
    // In der Liste steht nur `masked` – der Anfang des Tokens, etwa `klp_a3f…`.
    // Genau damit erkennen wir das eigene Gerät wieder, ohne dass der Server
    // je den ganzen Token herausgeben müsste.
    const own = Array.isArray(geraete)
      ? geraete.find((geraet) => {
          if (!token || geraet.revokedAt) return false;
          const prefix = String(geraet.masked || '').replace(/[….]+$/u, '');
          return prefix.length > 4 && token.startsWith(prefix);
        })
      : null;
    if (own && own.id) {
      await api.del(`/v1/geraete/${own.id}`);
      serverSide = true;
    }
  } catch {
    // Egal warum – lokal wird der Token in jedem Fall gelöscht.
  }

  secrets.setToken(null);
  return { serverSide };
}

module.exports = { clientName, start, waitForToken, cancel, me, disconnect };
