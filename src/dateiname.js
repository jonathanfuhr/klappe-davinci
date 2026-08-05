/**
 * Der Dateiname des Masters – nach demselben Schema wie in Klappe.
 *
 * `JJMMTT_Kunde_Projekt_Video_v2[_Vorschau][_1080p25].mov`
 *
 * Bisher hieß der Zwischen-Master nach der Timeline (`Teaser_ohne_Musik_v4b_
 * FINAL2_20260805231900.mov`), und genau dieser Name stand danach in Klappe
 * unter der Fassung. Timeline-Namen sind Arbeitsnamen; sie gehören nicht zum
 * Kunden. Deshalb wird der Name **hier** gebaut, und zwar bevor gerendert
 * wird: Resolve schreibt die Datei gleich richtig, und von dort geht sie
 * unverändert beide Wege – hoch nach Klappe und in die Zweitablage.
 *
 * Das Schema ist von Klappe abgeschrieben (`packages/shared/src/filenames.ts`),
 * mitsamt den Tests, damit ein Auseinanderlaufen auffällt. Der Server baut
 * seinen Download-Namen weiterhin selbst; abgeglichen wird nach dem Upload.
 *
 * Bewusst **ohne** Server: Der Name entsteht aus dem, was im Dialog steht.
 * Eine Datei, die hier liegt, soll nicht davon abhängen, ob eine Anfrage
 * durchkam.
 */

/** Drei Nachkommastellen – mehr trägt Klappe nicht. */
const NACHKOMMASTELLEN = 3;

/**
 * Ein Namensteil, dateinamentauglich: Der Unterstrich bleibt dem Trenner
 * vorbehalten, Leerzeichen werden zu Bindestrichen. Umlaute bleiben.
 */
function namensteil(wert) {
  return String(wert ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60);
}

/** `JJMMTT` aus einem Datum – in Ortszeit, denn so denkt die Produktion. */
function dateiDatum(datum = new Date()) {
  const zwei = (wert) => String(wert).padStart(2, '0');
  return `${zwei(datum.getFullYear() % 100)}${zwei(datum.getMonth() + 1)}${zwei(datum.getDate())}`;
}

/** `2` bleibt `2`, `2.5` wird `v2-5` – ein Punkt sähe aus wie eine Endung. */
function fassungsteil(nummer) {
  const wert = Number.isFinite(nummer) && nummer > 0 ? nummer : 1;
  return `v${String(Number(wert.toFixed(NACHKOMMASTELLEN))).replace('.', '-')}`;
}

/**
 * `1080p25`, `2160p2997` – dieselbe Schreibweise wie in Klappes
 * `resolutionLabel`. Ohne brauchbare Maße gibt es den Teil nicht; ein
 * geratenes `1080p` wäre schlimmer als gar keins.
 */
function aufloesung(breite, hoehe, bilderProSekunde) {
  const b = Number(breite);
  const h = Number(hoehe);
  if (!Number.isFinite(b) || !Number.isFinite(h) || b <= 0 || h <= 0) return null;

  const kurzeSeite = Math.min(Math.round(b), Math.round(h));
  const fps = Number(bilderProSekunde);
  if (!Number.isFinite(fps) || fps <= 0) return `${kurzeSeite}p`;

  // Ganzzahlige Raten schlicht, NTSC-Raten ohne Komma: 29,97 → 2997.
  const gerundet = Math.round(fps);
  const rate = Math.abs(fps - gerundet) < 0.001 ? String(gerundet) : String(Math.round(fps * 100));
  return `${kurzeSeite}p${rate}`;
}

/**
 * Der Name ohne Endung. Die hängt am Render-Preset, und die setzt Resolve
 * selbst – wir geben ihm nur den Stamm als `CustomName`.
 */
function basisName({
  datum = null,
  kunde = null,
  projektName = '',
  videoName = '',
  nummer = 1,
  istEndfassung = undefined,
  aufloesung: aufl = null,
} = {}) {
  const teile = [
    datum && /^\d{6}$/.test(datum) ? datum : null,
    kunde ? namensteil(kunde) : null,
    namensteil(projektName),
    namensteil(videoName),
    fassungsteil(nummer),
    // Direkt hinter der Nummer, wo man es liest, bevor der Blick zur Auflösung
    // wandert – genauso wie in Klappe.
    istEndfassung === false ? 'Vorschau' : null,
    aufl ? namensteil(aufl) : null,
  ].filter(Boolean);

  return teile.join('_') || 'klappe-master';
}

/** Wie `basisName`, aber mit Endung – zum Vergleich mit Klappes Download-Namen. */
function vollerName(eingabe, endung) {
  const stamm = basisName(eingabe);
  const sauber = String(endung || '')
    .replace(/^\.+/, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
  return sauber ? `${stamm}.${sauber}` : stamm;
}

module.exports = {
  namensteil,
  dateiDatum,
  fassungsteil,
  aufloesung,
  basisName,
  vollerName,
};
