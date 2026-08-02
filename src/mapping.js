/**
 * Timeline ↔ Fassung – das Sidecar.
 *
 * Die Zuordnung ist im Haus bewusst locker: Timelines werden versioniert, ein
 * Video hat mehrere, und nicht jeder Export ist eine Fassung. Deshalb **schlägt
 * das Plugin nur vor, der Mensch bestätigt immer.** Was hier steht, ist eine
 * Erinnerung – keine Wahrheit.
 *
 * Gemerkt wird pro Timeline (`GetUniqueId()`, wandert mit dem Projekt auch auf
 * andere Rechner): wohin zuletzt hochgeladen wurde und **welcher Bereich**
 * dabei ausgespielt wurde. Der Render-Anfang ist der Offset, mit dem
 * Kommentar-Frames später zu Marker-Positionen werden.
 *
 * Die Datei liegt am konfigurierten gemeinsamen Ort (Medien-Server), sonst im
 * Benutzerverzeichnis. Geschrieben wird über eine Zwischendatei und
 * anschließendes Umbenennen: Zwei Schnittplätze, die gleichzeitig hochladen,
 * sollen sich keine halbe Datei hinterlassen.
 */

const fs = require('node:fs');
const path = require('node:path');

const config = require('./config.js');

const FORMAT_VERSION = 1;

function file() {
  return config.mappingFile();
}

/** Liest das Sidecar. Fehlt es oder ist es kaputt, fangen wir leer an. */
function readAll() {
  try {
    const parsed = JSON.parse(fs.readFileSync(file(), 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !parsed.entries) {
      return { version: FORMAT_VERSION, entries: {} };
    }
    return { version: Number(parsed.version) || FORMAT_VERSION, entries: parsed.entries };
  } catch {
    return { version: FORMAT_VERSION, entries: {} };
  }
}

function writeAll(data) {
  const target = file();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(temp, target);
}

/** Der Eintrag zu dieser Timeline – oder `null`. */
function get(timelineId) {
  if (!timelineId) return null;
  const { entries } = readAll();
  return entries[timelineId] || null;
}

/**
 * Eintrag schreiben. Frisch dazu kommt immer der Zeitstempel: Beim nächsten
 * Öffnen soll erkennbar sein, ob der Vorschlag von heute oder von vorletzter
 * Woche stammt.
 */
function put(timelineId, entry) {
  if (!timelineId) return null;
  const data = readAll();
  const merged = {
    ...(data.entries[timelineId] || {}),
    ...entry,
    updatedAt: new Date().toISOString(),
  };
  data.entries[timelineId] = merged;
  data.version = FORMAT_VERSION;
  writeAll(data);
  return merged;
}

function remove(timelineId) {
  const data = readAll();
  if (!data.entries[timelineId]) return false;
  delete data.entries[timelineId];
  writeAll(data);
  return true;
}

/**
 * Der Frame-Offset für Marker und Overlays: Klappe zählt ab dem ersten Bild
 * der Fassung, Resolve ab dem Timeline-Anfang. Wurde die ganze Timeline
 * ausgespielt, ist der Offset 0.
 */
function renderIn(entry) {
  if (!entry || entry.wholeTimeline) return 0;
  const value = Number(entry.renderIn);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

module.exports = { FORMAT_VERSION, file, readAll, get, put, remove, renderIn };
