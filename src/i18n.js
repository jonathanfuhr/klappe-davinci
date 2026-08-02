/**
 * Mehrsprachigkeit.
 *
 * **Deutsch ist die Quellsprache und zugleich der Schlüssel.** Im Code steht
 * überall ein lesbarer deutscher Satz; übersetzt wird erst beim Anzeigen, und
 * nur, wenn der Satz im Katalog der eingestellten Sprache steht. Fehlt er,
 * geht Deutsch hinaus – nie ein leerer Knopf und nie ein nackter Schlüssel wie
 * `upload.error.offset`.
 *
 * Das ist dasselbe Verfahren wie in der Klappe-API (`api-messages.ts`), und es
 * hat denselben Vorteil: An der Wurfstelle steht ein Satz, den man lesen kann,
 * statt eines Kürzels, das man nachschlagen muss.
 *
 * Ein Unterschied zum Server: Hier sind die Platzhalter **benannt**
 * (`{nummer}`) statt positionell (`{}`). Bei einem Satz mit drei Einsetzungen
 * ist beim Übersetzen sonst nicht zu erkennen, was an welche Stelle gehört –
 * und im Englischen steht es oft in anderer Reihenfolge.
 *
 * **Eine weitere Sprache** braucht genau zwei Handgriffe: eine Datei unter
 * `src/locales/` nach dem Muster von `en.js`, und eine Zeile in `KATALOGE`.
 */

const LOCALES = ['de', 'en'];

/**
 * **Quellsprache** – die Sprache, in der die Sätze im Code stehen und mit der
 * im Katalog nachgeschlagen wird. Das ist etwas anderes als die Sprache, die
 * jemand zu sehen bekommt.
 */
const DEFAULT_LOCALE = 'de';

/**
 * **Anzeigesprache, solange nichts bekannt ist.** Vor der Kopplung weiß das
 * Plugin nicht, wer davorsitzt – und dann ist Englisch die freundlichere
 * Annahme: Ein deutsches Haus stellt binnen einer Minute um (oder der Server
 * sagt es ohnehin), während jemand ohne Deutschkenntnisse vor einer deutschen
 * Oberfläche steht und nicht einmal die Einstellungen findet.
 *
 * Die Systemsprache des Rechners geht trotzdem vor – sie ist eine Auskunft und
 * keine Annahme.
 */
const FALLBACK_LOCALE = 'en';

/** Für die Sprachwahl in den Einstellungen – jede in ihrer eigenen Sprache. */
const LOCALE_NAMES = {
  de: 'Deutsch',
  en: 'English',
};

/**
 * Die Kataloge. Deutsch fehlt hier mit Absicht: Es ist die Quellsprache, und
 * ein Katalog, der jeden Satz auf sich selbst abbildet, wäre eine Datei, die
 * man bei jeder Textänderung zweimal pflegen müsste.
 */
const KATALOGE = {
  // eslint-disable-next-line global-require
  en: require('./locales/en.js'),
};

let aktuell = FALLBACK_LOCALE;

function istLocale(wert) {
  return typeof wert === 'string' && LOCALES.includes(wert);
}

function locale() {
  return aktuell;
}

function setLocale(wert) {
  aktuell = istLocale(wert) ? wert : FALLBACK_LOCALE;
  return aktuell;
}

/** `{name}` durch die Werte ersetzen. Fehlt ein Wert, bleibt der Platzhalter stehen. */
function einsetzen(text, werte) {
  if (!werte) return text;
  return text.replace(/\{(\w+)\}/g, (treffer, name) =>
    Object.prototype.hasOwnProperty.call(werte, name) ? String(werte[name]) : treffer,
  );
}

/**
 * Übersetzen und einsetzen.
 *
 * `t('Fassung {nummer} freigeben?', { nummer: 3 })`
 */
function t(deutsch, werte) {
  const katalog = KATALOGE[aktuell];
  const uebersetzt = katalog && katalog[deutsch] ? katalog[deutsch] : deutsch;
  return einsetzen(uebersetzt, werte);
}

/**
 * Den Katalog der eingestellten Sprache herausgeben – das Panel braucht ihn,
 * weil es im Renderer läuft und nicht `require`n kann.
 */
function katalog(fuer = aktuell) {
  return KATALOGE[fuer] || {};
}

/**
 * Aus `de-DE`, `de_DE` oder `de` wird `de`. Was wir nicht kennen, ergibt
 * `null` – dann entscheidet die nächste Stufe der Kette, nicht der Zufall.
 */
function ausSystemwert(wert) {
  const kurz = String(wert || '')
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0];
  return istLocale(kurz) ? kurz : null;
}

/**
 * Welche Sprache gilt?
 *
 * Die Reihenfolge folgt dem, was am ehesten die Absicht des Menschen trifft:
 *
 * 1. **Die Einstellung im Panel**, wenn sie nicht auf „automatisch" steht.
 *    Wer sie umstellt, meint es so.
 * 2. **Die eigene Wahl im Klappe-Konto** (`UserDto.locale`). Wer sich die
 *    Web-App auf Englisch gestellt hat, will das Plugin nicht auf Deutsch.
 * 3. **Die Vorgabe der Instanz** (`GET /v1/branding` → `defaultLocale`). Sie
 *    gilt im Browser für alle, die nichts eigenes eingestellt haben.
 * 4. **Die Systemsprache des Rechners** – wenn kein Server erreichbar ist,
 *    ist das die beste verbliebene Auskunft. Ein Mac auf Deutsch ist ein
 *    Hinweis, kein Zufall.
 * 5. **Englisch.** Nicht Deutsch: Vor der Kopplung weiß das Plugin nicht, wer
 *    davorsitzt, und wer kein Deutsch kann, findet in einer deutschen
 *    Oberfläche nicht einmal die Einstellungen, um sie umzustellen.
 */
function bestimmen({ einstellung, kontoLocale, instanzLocale, systemLocale }) {
  if (istLocale(einstellung)) return { locale: einstellung, quelle: 'einstellung' };
  if (istLocale(kontoLocale)) return { locale: kontoLocale, quelle: 'konto' };
  if (istLocale(instanzLocale)) return { locale: instanzLocale, quelle: 'instanz' };

  const system = ausSystemwert(systemLocale);
  if (system) return { locale: system, quelle: 'system' };

  return { locale: FALLBACK_LOCALE, quelle: 'rueckfall' };
}

module.exports = {
  LOCALES,
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  LOCALE_NAMES,
  istLocale,
  locale,
  setLocale,
  t,
  katalog,
  einsetzen,
  ausSystemwert,
  bestimmen,
};
