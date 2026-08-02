/**
 * Zweitablage des Masters.
 *
 * Der Master geht nach Klappe – aber im Haus soll er oft zusätzlich im
 * Projektordner auf dem Medien-Server liegen. Beides aus Resolve heraus zu
 * rendern hieße, zweimal zu rechnen; deshalb rendert Resolve **einmal** in den
 * Zwischenordner, und von dort geht die Datei zwei Wege gleichzeitig: hoch
 * nach Klappe und hinüber in die Ablage.
 *
 * Gleichzeitig ist hier kein Selbstzweck. Ein UHD-Master über ein Netzlaufwerk
 * zu kopieren dauert so lange wie der Upload; nacheinander wäre der Schnitt
 * doppelt so lange blockiert.
 *
 * Zwei Regeln, beide aus demselben Grund – in diesem Ordner liegt fremde
 * Arbeit:
 *
 * - **Nichts überschreiben.** Gibt es den Namen schon, bekommt die Kopie eine
 *   Nummer.
 * - **Kein Bruchstück hinterlassen.** Bricht die Kopie ab, wird die halbe
 *   Datei weggeräumt: Ein 12-GB-Fragment, das aussieht wie ein Master, ist
 *   schlimmer als gar keine Datei.
 */

const fs = require('node:fs');
const path = require('node:path');

const { t } = require('./i18n.js');

/**
 * Ein Name, der im Zielordner noch frei ist: `Teaser.mov`, `Teaser-2.mov`, …
 *
 * `existiert` ist hereingereicht, damit die Regel ohne Dateisystem prüfbar
 * bleibt.
 */
function freierName(ordner, dateiname, existiert = fs.existsSync) {
  const endung = path.extname(dateiname);
  const stamm = path.basename(dateiname, endung);

  let kandidat = path.join(ordner, dateiname);
  let nummer = 2;
  while (existiert(kandidat)) {
    kandidat = path.join(ordner, `${stamm}-${nummer}${endung}`);
    nummer += 1;
    // Bei 999 stimmt etwas anderes nicht; dann lieber aufgeben als endlos zählen.
    if (nummer > 999) throw new Error(t('Im Zielordner sind zu viele gleichnamige Dateien.'));
  }
  return kandidat;
}

/**
 * Datei kopieren, mit Fortschritt und abbrechbar.
 *
 * Bewusst über Ströme und nicht über `fs.copyFile`: Bei 40 GB über ein
 * Netzlaufwerk will man wissen, wie weit es ist, und man will abbrechen
 * können.
 */
function kopiere(quelle, ziel, { onProgress, signal, blockBytes = 8 * 1024 * 1024 } = {}) {
  return new Promise((fertig, fehlgeschlagen) => {
    let uebertragen = 0;
    let gesamt = 0;
    try {
      gesamt = fs.statSync(quelle).size;
    } catch (error) {
      fehlgeschlagen(error);
      return;
    }

    fs.mkdirSync(path.dirname(ziel), { recursive: true });

    const lesen = fs.createReadStream(quelle, { highWaterMark: blockBytes });
    const schreiben = fs.createWriteStream(ziel);
    let beendet = false;

    const aufraeumen = () => {
      try {
        fs.rmSync(ziel, { force: true });
      } catch {
        /* Dann bleibt das Bruchstück eben liegen – mehr können wir nicht tun. */
      }
    };

    let wache = null;
    const abbrechen = (grund) => {
      if (beendet) return;
      beendet = true;
      if (wache) clearInterval(wache);
      lesen.destroy();
      schreiben.destroy();
      aufraeumen();
      fehlgeschlagen(grund);
    };

    // Der Abbruch kommt von außen (Panel schließen, Upload abbrechen).
    // Geprüft wird **bei jedem Block** – eine Kopie auf eine schnelle Platte
    // wäre sonst längst durch, bevor ein Zeitgeber das erste Mal nachsieht.
    // Der Zeitgeber bleibt trotzdem: Hängt das Netzlaufwerk, kommt gar kein
    // Block mehr, und ohne ihn wartete das Panel beim Schließen ewig.
    wache = signal
      ? setInterval(() => {
          if (signal.aborted) abbrechen(new Error(t('Die Kopie wurde abgebrochen.')));
        }, 500)
      : null;

    lesen.on('data', (block) => {
      if (signal && signal.aborted) {
        abbrechen(new Error(t('Die Kopie wurde abgebrochen.')));
        return;
      }
      uebertragen += block.length;
      if (onProgress) onProgress(uebertragen, gesamt);
    });

    lesen.on('error', abbrechen);
    schreiben.on('error', abbrechen);

    schreiben.on('finish', () => {
      if (beendet) return;
      beendet = true;
      if (wache) clearInterval(wache);
      fertig({ path: ziel, bytes: uebertragen });
    });

    lesen.pipe(schreiben);
  });
}

/**
 * Den Endfassungs-Teil des Namens **lokal** setzen.
 *
 * Klappe hängt an eine Fassung ohne Endfassungs-Haken ein `_Vorschau` an. Ob
 * der Haken gilt, entscheidet aber der Mensch im Dialog – nicht die Frage, ob
 * eine nachgereichte Anfrage schon durchgekommen ist. Die lokale Kopie soll
 * deshalb nicht darauf warten: Wir nehmen den Namen vom Server und richten
 * genau dieses eine Stück nach dem Haken.
 *
 * Eingesetzt wird, wo Klappe es auch tut – hinter der Fassungsnummer und vor
 * der Auflösung.
 */
function endfassungImNamen(dateiname, istEndfassung) {
  const punkt = dateiname.lastIndexOf('.');
  const stamm = punkt > 0 ? dateiname.slice(0, punkt) : dateiname;
  const endung = punkt > 0 ? dateiname.slice(punkt) : '';

  const ohne = stamm.replace(/_Vorschau(?=_|$)/, '');
  if (istEndfassung) return `${ohne}${endung}`;
  if (ohne !== stamm) return `${stamm}${endung}`;

  // Fehlt es, gehört es vor das letzte Stück (die Auflösung). Gibt es keins,
  // ans Ende – dort steht es immer noch richtig.
  const teile = ohne.split('_');
  if (teile.length > 1) teile.splice(teile.length - 1, 0, 'Vorschau');
  else teile.push('Vorschau');
  return `${teile.join('_')}${endung}`;
}

/**
 * Die Kopie am Ende auf den Namen bringen, unter dem Klappe die Fassung führt.
 *
 * Der Zwischen-Master heißt `Teaser_20260802071200.mov` – ein Name, der im
 * Projektordner nichts zu suchen hat. Klappes `downloadFilename` ist dagegen
 * genau die Schreibweise des Hauses (`260802_Kunde_Teaser_v3_1080p25.mov`).
 * Sie steht aber erst fest, wenn die Fassung verarbeitet ist – deshalb wird
 * erst kopiert und dann umbenannt, statt auf den Namen zu warten.
 */
function benenneUm(pfad, neuerName) {
  if (!neuerName) return pfad;

  const ordner = path.dirname(pfad);
  const gewuenscht = path.basename(neuerName);
  if (gewuenscht === path.basename(pfad)) return pfad;

  try {
    const ziel = freierName(ordner, gewuenscht);
    fs.renameSync(pfad, ziel);
    return ziel;
  } catch {
    // Umbenennen ist Kür. Die Datei liegt richtig, nur der Name ist der des
    // Zwischen-Masters – das ist kein Grund, den Upload als gescheitert zu melden.
    return pfad;
  }
}

module.exports = { freierName, kopiere, benenneUm, endfassungImNamen };
