import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import i18n from '../src/i18n.js';
import en from '../src/locales/en.js';

const WURZEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Alle `t('…')`-Schlüssel aus dem Quelltext einsammeln. */
function schluesselAusCode() {
  const dateien = fs
    .readdirSync(path.join(WURZEL, 'src'))
    .filter((name) => name.endsWith('.js'))
    .map((name) => path.join(WURZEL, 'src', name));
  dateien.push(path.join(WURZEL, 'src', 'ui', 'app.js'));

  const gefunden = new Set();
  for (const datei of dateien) {
    const text = fs.readFileSync(datei, 'utf8');
    for (const treffer of text.matchAll(/\bt\(\s*\n?\s*'((?:[^'\\]|\\.)*)'/g)) {
      gefunden.add(treffer[1].replace(/\\'/g, "'"));
    }
  }
  return [...gefunden];
}

const platzhalter = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('Sprachwahl', () => {
  it('folgt der Einstellung, wenn eine getroffen wurde', () => {
    expect(
      i18n.bestimmen({ einstellung: 'de', kontoLocale: 'en', instanzLocale: 'en' }),
    ).toEqual({ locale: 'de', quelle: 'einstellung' });
  });

  it('nimmt sonst die Sprache des Klappe-Kontos', () => {
    // Wer sich die Web-App auf Englisch gestellt hat, will das Plugin nicht
    // auf Deutsch.
    expect(
      i18n.bestimmen({ einstellung: null, kontoLocale: 'en', instanzLocale: 'de' }),
    ).toEqual({ locale: 'en', quelle: 'konto' });
  });

  it('dann die Vorgabe der Instanz', () => {
    expect(
      i18n.bestimmen({ einstellung: null, kontoLocale: null, instanzLocale: 'de' }),
    ).toEqual({ locale: 'de', quelle: 'instanz' });
  });

  it('dann die Systemsprache – auch als de-DE oder en_US', () => {
    expect(i18n.bestimmen({ systemLocale: 'de-DE' })).toEqual({ locale: 'de', quelle: 'system' });
    expect(i18n.bestimmen({ systemLocale: 'en_US' })).toEqual({ locale: 'en', quelle: 'system' });
  });

  it('fällt auf Englisch zurück, nicht auf Deutsch', () => {
    // Vor der Kopplung weiß das Plugin nicht, wer davorsitzt. Wer kein Deutsch
    // kann, fände in einer deutschen Oberfläche nicht einmal die Einstellung,
    // um sie umzustellen.
    expect(i18n.bestimmen({})).toEqual({ locale: 'en', quelle: 'rueckfall' });
    expect(i18n.bestimmen({ systemLocale: 'fr-FR' })).toEqual({
      locale: 'en',
      quelle: 'rueckfall',
    });
  });
});

describe('Übersetzen', () => {
  it('gibt den deutschen Satz zurück, wenn nichts anderes eingestellt ist', () => {
    i18n.setLocale('de');
    expect(i18n.t('Upload fertig.')).toBe('Upload fertig.');
  });

  it('übersetzt und setzt benannte Platzhalter ein', () => {
    i18n.setLocale('en');
    expect(i18n.t('Fassung {nummer} freigeben?', { nummer: 3 })).toBe('Release version 3?');
  });

  it('lässt einen unbekannten Satz auf Deutsch stehen, statt ihn zu verschlucken', () => {
    i18n.setLocale('en');
    expect(i18n.t('Diesen Satz gibt es im Katalog nicht.')).toBe(
      'Diesen Satz gibt es im Katalog nicht.',
    );
  });

  it('lässt einen Platzhalter ohne Wert stehen – lieber sichtbar als leer', () => {
    i18n.setLocale('de');
    expect(i18n.t('Fassung {nummer}', {})).toBe('Fassung {nummer}');
  });
});

describe('Katalog', () => {
  const schluessel = schluesselAusCode();

  it('findet die Aufrufe im Quelltext überhaupt', () => {
    expect(schluessel.length).toBeGreaterThan(100);
  });

  it('hat für jeden Satz aus dem Code einen englischen Eintrag', () => {
    // Ein fehlender Eintrag ist kein Absturz – der Satz bliebe nur deutsch
    // stehen. Genau das soll auffallen, bevor es jemand im Panel sieht.
    const fehlend = schluessel.filter((satz) => !(satz in en));
    expect(fehlend).toEqual([]);
  });

  it('trägt auf beiden Seiten dieselben Platzhalter', () => {
    // Ein `{nummer}`, das in der Übersetzung fehlt, verschluckt beim Anzeigen
    // die Zahl – und ein erfundener Platzhalter bliebe als `{foo}` stehen.
    const schief = Object.entries(en)
      .filter(([de, eng]) => platzhalter(de).join() !== platzhalter(eng).join())
      .map(([de]) => de);
    expect(schief).toEqual([]);
  });

  it('enthält keinen Eintrag, den es im Code nicht mehr gibt', () => {
    // Die Gegenrichtung: Ein Satz, der aus dem Code verschwunden ist, bleibt
    // sonst für immer im Katalog stehen und wird bei jeder Durchsicht wieder
    // mitgelesen. Die Texte im festen HTML zählen mit – sie sind ebenfalls
    // Schlüssel, stehen aber nicht in einem `t()`.
    const html = fs.readFileSync(path.join(WURZEL, 'src', 'ui', 'index.html'), 'utf8');
    const ausHtml = new Set();
    for (const treffer of html.matchAll(/>([^<>]+)</g)) {
      const satz = treffer[1].replace(/\s+/g, ' ').trim();
      if (satz) ausHtml.add(satz);
    }
    for (const attribut of ['placeholder', 'title']) {
      for (const treffer of html.matchAll(new RegExp(`${attribut}="([^"]+)"`, 'g'))) {
        ausHtml.add(treffer[1].replace(/\s+/g, ' ').trim());
      }
    }

    const bekannt = new Set([...schluessel, ...ausHtml]);
    const verwaist = Object.keys(en).filter((satz) => !bekannt.has(satz));
    expect(verwaist).toEqual([]);
  });
});
