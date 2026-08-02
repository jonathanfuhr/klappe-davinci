/**
 * Buch führen über die Zwischen-Master.
 *
 * Ein UHD-Master ist schnell 40 GB groß, und er entsteht in einem Ordner, den
 * niemand ansieht. Drei Wege führen dazu, dass er liegen bleibt: Der Render
 * bricht ab und Resolve hinterlässt ein Fragment, der Upload scheitert nach
 * dem Rendern, oder Resolve stürzt ab und das Aufräumen kommt gar nicht mehr
 * dazu. Ohne Buchführung wüsste hinterher niemand, dass da etwas liegt.
 *
 * Deshalb wird **jede** angelegte Datei hier vermerkt, bevor irgendetwas
 * anderes passiert – und aufgeräumt wird nur, was in diesem Buch steht. Der
 * Renderordner kann ein gemeinsames Arbeitsverzeichnis sein; dort nach
 * Namensmuster zu löschen wäre der Weg, an dessen Ende fremdes Material fehlt.
 */

const fs = require('node:fs');
const path = require('node:path');

const config = require('./config.js');

const FORMAT_VERSION = 1;

/** So lange darf ein Rest liegen bleiben, bevor er beim nächsten Lauf verschwindet. */
const MAX_ALTER_STUNDEN = 24;

function datei() {
  return path.join(config.homeDir(), 'renders.json');
}

function lesen() {
  try {
    const parsed = JSON.parse(fs.readFileSync(datei(), 'utf8'));
    return Array.isArray(parsed?.eintraege) ? parsed.eintraege : [];
  } catch {
    return [];
  }
}

function schreiben(eintraege) {
  const ziel = datei();
  const temp = `${ziel}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify({ version: FORMAT_VERSION, eintraege }, null, 2)}\n`);
  fs.renameSync(temp, ziel);
}

/**
 * Eine Datei ins Buch nehmen. `inArbeit` schützt sie vor dem Aufräumen: Ein
 * zweites Panel, das währenddessen aufräumt, soll nicht die Datei löschen, die
 * hier gerade hochgeladen wird.
 */
function merken(pfad, { timeline = '', inArbeit = true } = {}) {
  const eintraege = lesen().filter((eintrag) => eintrag.pfad !== pfad);
  eintraege.push({ pfad, timeline, erstellt: new Date().toISOString(), inArbeit });
  schreiben(eintraege);
}

/** Den Vermerk „wird gerade benutzt" wieder abnehmen. */
function freigeben(pfad) {
  const eintraege = lesen().map((eintrag) =>
    eintrag.pfad === pfad ? { ...eintrag, inArbeit: false } : eintrag,
  );
  schreiben(eintraege);
}

/**
 * Beim Start alle Vermerke „wird gerade benutzt" abnehmen.
 *
 * Wenn das Panel gerade erst hochfährt, läuft nichts von uns – ein solcher
 * Vermerk kann also nur von einem Absturz oder einem hart geschlossenen
 * Fenster stammen. Ohne das bliebe die Datei für immer geschützt und würde nie
 * aufgeräumt: genau der Fall, den die Buchführung verhindern soll.
 */
function entsperren() {
  const eintraege = lesen();
  const offen = eintraege.filter((eintrag) => eintrag.inArbeit).length;
  if (offen === 0) return 0;
  schreiben(eintraege.map((eintrag) => ({ ...eintrag, inArbeit: false })));
  return offen;
}

/** Datei löschen und aus dem Buch nehmen – der Normalfall nach dem Upload. */
function erledigt(pfad) {
  try {
    fs.rmSync(pfad, { force: true });
  } catch {
    /* Liegen lassen ist besser als abbrechen; der nächste Lauf holt es nach. */
  }
  schreiben(lesen().filter((eintrag) => eintrag.pfad !== pfad));
}

/**
 * Was steht noch im Buch – und liegt wirklich noch da?
 *
 * Einträge zu Dateien, die es nicht mehr gibt (jemand hat den Ordner geleert),
 * verschwinden dabei still: Sie sind keine Reste, sondern nur alte Notizen.
 */
function liste() {
  const eintraege = lesen();
  const vorhanden = [];
  let veraendert = false;

  for (const eintrag of eintraege) {
    try {
      const stat = fs.statSync(eintrag.pfad);
      vorhanden.push({ ...eintrag, bytes: stat.size });
    } catch {
      veraendert = true;
    }
  }

  if (veraendert) schreiben(vorhanden.map(({ bytes, ...rest }) => rest));
  return vorhanden;
}

/**
 * Welche Reste dürfen weg?
 *
 * Rein rechnend, damit die Regel prüfbar ist – hier hängt das Löschen von
 * Dateien dran, die jemand vielleicht noch braucht.
 */
function zuLoeschen(eintraege, { jetzt = Date.now(), maxAlterStunden = MAX_ALTER_STUNDEN, alles = false } = {}) {
  return eintraege.filter((eintrag) => {
    // Was gerade hochgeladen wird, bleibt – immer, auch bei „alles".
    if (eintrag.inArbeit) return false;
    if (alles) return true;
    const alter = jetzt - new Date(eintrag.erstellt).getTime();
    return Number.isFinite(alter) ? alter > maxAlterStunden * 3600 * 1000 : true;
  });
}

/** Reste wegräumen. Gibt zurück, was verschwunden ist. */
function aufraeumen(optionen = {}) {
  const vorhanden = liste();
  const weg = zuLoeschen(vorhanden, optionen);

  let bytes = 0;
  const geloescht = [];

  for (const eintrag of weg) {
    try {
      fs.rmSync(eintrag.pfad, { force: true });
      bytes += eintrag.bytes || 0;
      geloescht.push(eintrag.pfad);
    } catch {
      /* Bleibt eben liegen – beim nächsten Mal wieder. */
    }
  }

  const uebrig = vorhanden.filter((eintrag) => !geloescht.includes(eintrag.pfad));
  schreiben(uebrig.map(({ bytes: _unbenutzt, ...rest }) => rest));

  return {
    geloescht: geloescht.length,
    bytes,
    uebrig: uebrig.length,
    uebrigBytes: uebrig.reduce((summe, eintrag) => summe + (eintrag.bytes || 0), 0),
  };
}

/** Kurzauskunft für die Einstellungen. */
function status() {
  const vorhanden = liste();
  return {
    anzahl: vorhanden.length,
    bytes: vorhanden.reduce((summe, eintrag) => summe + (eintrag.bytes || 0), 0),
    inArbeit: vorhanden.filter((eintrag) => eintrag.inArbeit).length,
    dateien: vorhanden.map((eintrag) => ({
      pfad: eintrag.pfad,
      bytes: eintrag.bytes || 0,
      erstellt: eintrag.erstellt,
      timeline: eintrag.timeline,
      inArbeit: Boolean(eintrag.inArbeit),
    })),
  };
}

module.exports = {
  MAX_ALTER_STUNDEN,
  datei,
  merken,
  freigeben,
  entsperren,
  erledigt,
  liste,
  zuLoeschen,
  aufraeumen,
  status,
};
