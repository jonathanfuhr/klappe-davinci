/**
 * Wie ein Projekt in den Auswahllisten steht.
 *
 * Klappe zeigt ein Projekt als „Name (Kunde)". Am Schnittplatz sucht man aber
 * nach der **Projektnummer** – sie steht auf dem Auftrag, im Projektordner und
 * in der Ablage. Deshalb steht sie hier vorn:
 *
 *     2601_Kunde_Kampagne-Fruehjahr
 *
 * Das Format ist eine Vorlage (`projectListFormat`), keine feste Regel: Wer
 * die Nummer hinten haben will oder Bindestriche statt Unterstriche, trägt es
 * in den Einstellungen oder gleich im Installer ein.
 *
 * Fehlende Teile fallen **samt ihrem Trenner** weg – dieselbe Regel wie beim
 * Dateinamen. Ein Projekt ohne Nummer heißt `Kunde_Kampagne`, nicht
 * `_Kunde_Kampagne`.
 */

/** Platzhalter in der Vorlage: `{nummer}`, `{kunde}`, `{projekt}`. */
const PLATZHALTER = /(\{[a-zA-Z]+\})/;

/**
 * Vorlage füllen. Ein Platzhalter ohne Wert nimmt den Trenner mit, der vor
 * ihm stand – sonst blieben Lücken wie `__` stehen.
 */
function zusammensetzen(format, werte) {
  const teile = String(format || '').split(PLATZHALTER);

  let ergebnis = '';
  let trenner = '';
  let etwasDa = false;
  // Ob zuletzt ein Wert stand: Danach gehört ein abschließendes Stück Text
  // noch dazu (`… ({nummer})`), nach einem weggefallenen Platzhalter nicht.
  let letzteWarWert = false;

  for (const teil of teile) {
    const treffer = teil.match(/^\{([a-zA-Z]+)\}$/);
    if (!treffer) {
      // Zuweisen, nicht anhängen: Fällt ein Platzhalter weg, soll sich sein
      // Trenner nicht zum nächsten dazuaddieren (`2601__Kampagne`).
      trenner = teil;
      continue;
    }

    const wert = String(werte[treffer[1]] ?? '').trim();
    if (!wert) {
      letzteWarWert = false;
      continue;
    }

    ergebnis += (etwasDa ? trenner : '') + wert;
    trenner = '';
    etwasDa = true;
    letzteWarWert = true;
  }

  if (etwasDa && letzteWarWert) ergebnis += trenner;
  return ergebnis.trim();
}

/** Zum Vergleichen von Feldnamen: Groß/klein, Leerzeichen und Bindestriche egal. */
function schluessel(wert) {
  return String(wert || '')
    .toLowerCase()
    .replace(/[\s._-]+/g, '');
}

/**
 * Die Projektnummer – aus einem benutzerdefinierten Feld (Phase 15 des
 * Servers), sonst aus einer Ziffernfolge am Anfang des Projektnamens.
 *
 * Die zweite Quelle ist bewusst eng gefasst (nur Ziffern, gefolgt von einem
 * Trennzeichen): Ein Projekt namens „2026 Jahresrückblick" soll seine 2026
 * nach vorn geben dürfen, „4K Testschnitt" aber nicht zur Nummer 4 werden.
 * Was so erkannt wird, verschwindet aus dem Projektnamen – sonst stünde es
 * zweimal da.
 */
function nummerUndName(projekt, feldname) {
  const gesucht = schluessel(feldname);
  const felder = Array.isArray(projekt?.fields) ? projekt.fields : [];
  const treffer = gesucht
    ? felder.find((feld) => schluessel(feld?.name) === gesucht && String(feld?.value || '').trim())
    : null;

  const name = String(projekt?.name || '').trim();
  if (treffer) return { nummer: String(treffer.value).trim(), name };

  const ausDemNamen = name.match(/^(\d{2,8})[\s._-]+(.+)$/);
  if (ausDemNamen) return { nummer: ausDemNamen[1], name: ausDemNamen[2].trim() };

  return { nummer: '', name };
}

/** Wie das Projekt im Aufklappmenü steht. Leer bleibt es nie. */
function listenname(projekt, { format, nummernfeld } = {}) {
  const { nummer, name } = nummerUndName(projekt, nummernfeld);
  const gebaut = zusammensetzen(format, {
    nummer,
    kunde: projekt?.customer || '',
    projekt: name,
  });
  return gebaut || name || String(projekt?.name || '');
}

/**
 * Archivierte Projekte gehören nicht in die Liste: Dort wird nichts mehr
 * aktualisiert, und ein Upload hinein wäre fast immer ein Versehen.
 *
 * Eine Ausnahme – das Projekt, auf das die aktuelle Timeline schon zeigt.
 * Es stillschweigend verschwinden zu lassen, hieße: Die Auswahl fällt auf
 * irgendein anderes Projekt, und niemand sieht, warum.
 */
function sichtbare(projekte, { ausser = '' } = {}) {
  return (Array.isArray(projekte) ? projekte : []).filter(
    (projekt) => !projekt?.archivedAt || (ausser && projekt.id === ausser),
  );
}

/**
 * Nach dem sortieren, was in der Zeile **steht**.
 *
 * Der Server liefert die Projekte in seiner eigenen Ordnung (zuletzt geändert
 * zuerst). Solange die Zeile „Name (Kunde)" hieß, fiel das kaum auf; seit die
 * Projektnummer vorn steht, sucht man im Aufklappmenü nach ihr – und eine nach
 * Änderungsdatum sortierte Nummernliste ist keine Liste, sondern ein Haufen.
 *
 * Sortiert wird über den **Listennamen**, nicht über ein eigenes Feld: So
 * stimmt die Ordnung immer mit dem überein, was man sieht, auch wenn jemand
 * die Vorlage umstellt. Projekte mit Nummer stehen dadurch vor denen ohne (die
 * fangen mit dem Kundennamen an) – genau die Ordnung, nach der im Haus gesucht
 * wird.
 *
 * `numeric: true` ist der Grund für den Collator: Als Zeichenketten stünde
 * `999` hinter `2601`. Und `de`, weil Umlaute in Kundennamen sonst hinten
 * landen.
 */
const SORTIERUNG = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });

function nachListennamen(projekte) {
  return [...(Array.isArray(projekte) ? projekte : [])].sort((a, b) =>
    SORTIERUNG.compare(a?.listenname || a?.name || '', b?.listenname || b?.name || ''),
  );
}

module.exports = { zusammensetzen, listenname, sichtbare, nummerUndName, nachListennamen };
