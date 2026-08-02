/**
 * Ablage des API-Tokens.
 *
 * Der Token ist ein Ausweis, kein Konfigurationswert – er gehört nicht in die
 * config.json und nirgends ins Protokoll. Verschlüsselt wird über Electrons
 * `safeStorage`: unter macOS über den Schlüsselbund, unter Windows über DPAPI.
 * Wo das nicht zu haben ist, bleibt eine Datei mit `chmod 600` – schlechter,
 * aber immer noch besser als Klartext neben den Einstellungen.
 */

const fs = require('node:fs');
const path = require('node:path');

const config = require('./config.js');

const TOKEN_FILE = () => path.join(config.homeDir(), 'token.bin');

/** Merker, ob wir schon einmal auf die Klartext-Ablage ausweichen mussten. */
let plainFallback = false;

/**
 * `electron` wird erst beim Zugriff geholt, nicht beim Laden des Moduls: So
 * lässt sich alles, was darauf aufbaut, außerhalb von Electron laden – etwa
 * in den Unit-Tests.
 */
function safeStorage() {
  try {
    // eslint-disable-next-line global-require
    return require('electron').safeStorage || null;
  } catch {
    return null;
  }
}

function encryptionAvailable() {
  try {
    const store = safeStorage();
    return Boolean(store && store.isEncryptionAvailable());
  } catch {
    return false;
  }
}

/**
 * Speichert den Token. `null` löscht ihn – das ist der Weg, den „Verbindung
 * trennen" geht.
 */
function setToken(token) {
  const file = TOKEN_FILE();

  if (!token) {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      /* nicht vorhanden ist auch gelöscht */
    }
    return;
  }

  if (encryptionAvailable()) {
    const encrypted = safeStorage().encryptString(token);
    // Ein Kennbyte davor, damit clearToken/getToken erkennen, ob die Datei aus
    // dem Schlüsselbund kommt oder aus dem Rückfall – sonst gäbe ein Wechsel
    // der Umgebung wirren Klartext zurück.
    fs.writeFileSync(file, Buffer.concat([Buffer.from([1]), encrypted]), { mode: 0o600 });
    plainFallback = false;
    return;
  }

  plainFallback = true;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0]), Buffer.from(token, 'utf8')]), {
    mode: 0o600,
  });
}

/** Liest den Token oder `null`, wenn keiner da ist oder er nicht lesbar ist. */
function getToken() {
  try {
    const raw = fs.readFileSync(TOKEN_FILE());
    if (raw.length < 2) return null;

    const mode = raw[0];
    const payload = raw.subarray(1);

    if (mode === 1) {
      if (!encryptionAvailable()) return null;
      return safeStorage().decryptString(payload);
    }

    plainFallback = true;
    return payload.toString('utf8');
  } catch {
    return null;
  }
}

function hasToken() {
  return getToken() !== null;
}

/** Für die Einstellungen: Steht der Token im Schlüsselbund oder nur in einer Datei? */
function storageKind() {
  if (!encryptionAvailable()) return 'datei';
  return plainFallback ? 'datei' : 'schluesselbund';
}

module.exports = { setToken, getToken, hasToken, storageKind, encryptionAvailable };
