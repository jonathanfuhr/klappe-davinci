/**
 * Einstellungen des Plugins.
 *
 * Sie liegen in `~/.klappe-davinci/config.json` – bewusst außerhalb des
 * Plugin-Ordners: Der wird beim Aktualisieren überschrieben, und unter macOS
 * gehört er root. Der **Token steht hier nie drin**; der geht über den
 * Schlüsselbund (siehe secrets.js).
 *
 * Es gibt drei Schichten, jede überschreibt die vorige:
 *
 * 1. `DEFAULTS` – was ohne jede Einstellung gilt.
 * 2. `vorgaben.json` – was der Installer eingetragen hat (Serveradresse,
 *    Ablagepfade, Presetauswahl). So kann ein Haus seine Werte mitliefern,
 *    ohne dass der Installer je die Einstellungen von jemandem überschreibt.
 * 3. `config.json` – was jemand im Panel selbst geändert hat. Das gewinnt.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

/** Der eigene Ordner im Benutzerverzeichnis – Ablage für alles Persönliche. */
const HOME_DIR = path.join(os.homedir(), '.klappe-davinci');
const CONFIG_FILE = path.join(HOME_DIR, 'config.json');
/** Vom Installer geschrieben, vom Panel nur gelesen. */
const VORGABEN_FILE = path.join(HOME_DIR, 'vorgaben.json');

/**
 * Vorgaben. Leere Pfade heißen „nimm den Ordner im Benutzerverzeichnis" –
 * so steht in der Datei nur, was jemand tatsächlich geändert hat, und ein
 * Umzug des Benutzerverzeichnisses bricht nichts.
 */
const DEFAULTS = {
  /** Adresse der Klappe-Instanz, z. B. `https://klappe.example.de`. */
  serverUrl: '',
  /**
   * Was von den **mitgelieferten** Presets im Upload-Dialog steht:
   * `keine` (Vorgabe), `auswahl` oder `alle`.
   *
   * Ab Werk `keine`: Ein Haus rendert mit seinen eigenen Presets, und die drei
   * Dutzend von Resolve machen die Liste unbedienbar. Ändern lässt sich das
   * jederzeit in den Einstellungen.
   */
  standardPresetsMode: 'keine',
  /** Die Auswahl, wenn `standardPresetsMode` auf `auswahl` steht. */
  renderPresetsStandard: [],
  /**
   * Das Preset, das im Upload-Dialog vorgewählt ist. Leer = das erste der
   * Liste. Gibt es das gemerkte Preset nicht mehr (Resolve-Update, Preset
   * gelöscht), rückt ebenfalls das erste nach – ein Dialog mit einer leeren
   * Auswahl wäre die schlechtere Antwort.
   */
  defaultPreset: '',
  /**
   * Namen, die zusätzlich als mitgeliefertes Preset gelten sollen – für alles,
   * was eine neuere Resolve-Fassung dazulegt und presets.js noch nicht kennt.
   */
  standardPresetsExtra: [],
  /**
   * Wie mit internen Fassungen umgegangen wird:
   *
   * - `immer` – jede Fassung aus dem Panel entsteht intern und wird nach dem
   *   Review freigegeben. Das ist die Vorgabe: So geht nichts versehentlich
   *   zum Kunden, bevor jemand daraufgeschaut hat.
   * - `wahl` – ein Haken im Upload-Dialog entscheidet je Fassung.
   *
   * Kennt der Server die interne Runde nicht (Schalter im Server aus), gilt
   * beides nicht und es wird immer extern hochgeladen.
   */
  internalMode: 'immer',
  /** Markerfarbe für offene Kommentare. Grün/Blau/Orange/Beige sind im Haus belegt. */
  markerColor: 'Pink',
  /** Markerfarbe für erledigte Kommentare – hellerer Ton von Pink. */
  markerColorResolved: 'Rose',
  /** Gemeinsamer Ablageort der Overlay-PNGs; leer = `~/.klappe-davinci/overlays`. */
  overlayPath: '',
  /** Ablage des Timeline↔Fassung-Sidecars; leer = `~/.klappe-davinci`. */
  mappingPath: '',
  /**
   * Wohin Resolve den Master rendert, bevor er hochgeladen wird; leer = der
   * Temp-Ordner des Systems. Bei UHD-Mastern lohnt ein Pfad auf der schnellen
   * Arbeitsplatte – auf der Systemplatte wird es sonst schnell eng.
   */
  renderDir: '',
  /**
   * Standdauer eines Overlay-Clips in Frames. In Klappe steht die Zeichnung
   * auf genau einem Bild – ein frame-genauer Kommentar meint genau dieses.
   * Wer sie länger sehen will, dreht hier auf.
   */
  overlayFrames: 1,
  /** Name der Overlay-Spur. Wird auch zum Wiedererkennen beim Aufräumen benutzt. */
  overlayTrackName: 'KLAPPE',
  /** Bin im Media Pool, in dem die Overlay-PNGs landen. */
  overlayBinName: 'Klappe',
  /** Allgemeine Kommentare (ohne Frame) als Marker auf dem ersten Bild? */
  markGeneralComments: true,
};

/** Eine Namensliste säubern: Zeichenketten, ohne Leere, ohne Doppelte. */
function liste(wert) {
  return Array.isArray(wert) ? [...new Set(wert.map(String).filter(Boolean))] : [];
}

/** `~/.klappe-davinci` – wird bei Bedarf angelegt. */
function homeDir() {
  fs.mkdirSync(HOME_DIR, { recursive: true });
  return HOME_DIR;
}

/** Eine JSON-Datei lesen; kaputt oder fehlend ergibt ein leeres Objekt. */
function readJson(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Liest die Einstellungen über die drei Schichten. Eine kaputte oder fehlende
 * Datei ist kein Fehler, sondern heißt „noch nichts eingestellt" – das Panel
 * fragt dann nach der Serveradresse, statt mit einer Ausnahme aufzugeben.
 */
function read() {
  // Jede Schicht **für sich** nachziehen, nicht erst nach dem Zusammenlegen:
  // Sonst gälte der Modus aus den Vorgaben schon als gesetzt und die alte
  // Auswahl aus der config.json fiele stillschweigend unter den Tisch.
  const stand = {
    ...DEFAULTS,
    ...nachziehen(readJson(VORGABEN_FILE)),
    ...nachziehen(readJson(CONFIG_FILE)),
  };

  // Auch beim **Lesen** begradigen, nicht nur beim Speichern: Die
  // `vorgaben.json` schreibt der Installer, und dort steht die Adresse so, wie
  // jemand sie in den Werteblock getippt hat – gern ohne `https://`.
  stand.serverUrl = normalizeServerUrl(stand.serverUrl);
  return stand;
}

/** Alte Dateien auf den heutigen Stand bringen – ohne etwas wegzuwerfen. */
function nachziehen(schicht) {
  const kopie = { ...schicht };

  // Aus der Zeit vor der Trennung von Standard- und eigenen Presets: Was dort
  // stand, war eine Auswahl über beide – als Standard-Auswahl gelesen ergibt
  // sie dasselbe Ergebnis, weil eigene Presets ohnehin immer mitgehen.
  if (Array.isArray(kopie.renderPresets) && kopie.renderPresets.length > 0) {
    if (!Array.isArray(kopie.renderPresetsStandard) || kopie.renderPresetsStandard.length === 0) {
      kopie.renderPresetsStandard = kopie.renderPresets;
    }
  }
  delete kopie.renderPresets;

  // Aus der Zeit, als eine leere Liste noch „alle" hieß: Wer damals eine
  // Auswahl getroffen hat, meinte genau diese – also `auswahl`, nicht die neue
  // Vorgabe `keine`, die seine Auswahl stillschweigend wegwerfen würde.
  if (!kopie.standardPresetsMode && kopie.renderPresetsStandard?.length > 0) {
    kopie.standardPresetsMode = 'auswahl';
  }

  return kopie;
}

/** Schreibt die geänderten Felder und gibt den vollständigen Stand zurück. */
function update(patch) {
  const next = { ...read(), ...(patch || {}) };

  // Nur bekannte Felder speichern: Was das Panel schickt, ist zwar unser
  // eigener Code, aber ein Tippfehler im Feldnamen soll nicht stillschweigend
  // eine zweite, wirkungslose Einstellung anlegen.
  const clean = {};
  for (const key of Object.keys(DEFAULTS)) clean[key] = next[key];

  clean.serverUrl = normalizeServerUrl(clean.serverUrl);
  clean.overlayFrames = Math.max(1, Math.round(Number(clean.overlayFrames) || 1));
  clean.renderPresetsStandard = liste(clean.renderPresetsStandard);
  clean.standardPresetsExtra = liste(clean.standardPresetsExtra);
  clean.standardPresetsMode = ['keine', 'auswahl', 'alle'].includes(clean.standardPresetsMode)
    ? clean.standardPresetsMode
    : 'keine';
  clean.internalMode = clean.internalMode === 'wahl' ? 'wahl' : 'immer';

  fs.mkdirSync(HOME_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(clean, null, 2)}\n`, { mode: 0o600 });
  return clean;
}

/**
 * `klappe.example.de/` → `https://klappe.example.de`. Ohne Schema nehmen wir
 * HTTPS an: Wer eine Anlage ohne Verschlüsselung betreibt, schreibt `http://`
 * ausdrücklich hin.
 */
function normalizeServerUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme.replace(/\/+$/, '');
}

/** Ablageort der Overlay-PNGs – konfiguriert oder der Ordner im Benutzerverzeichnis. */
function overlayDir(config = read()) {
  return config.overlayPath ? config.overlayPath : path.join(homeDir(), 'overlays');
}

/** Datei des Timeline↔Fassung-Sidecars. */
function mappingFile(config = read()) {
  const dir = config.mappingPath ? config.mappingPath : homeDir();
  return path.join(dir, 'klappe-mapping.json');
}

module.exports = {
  DEFAULTS,
  CONFIG_FILE,
  VORGABEN_FILE,
  homeDir,
  read,
  update,
  normalizeServerUrl,
  overlayDir,
  mappingFile,
};
