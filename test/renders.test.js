import { describe, expect, it } from 'vitest';

import renders from '../src/renders.js';

const STUNDE = 3600 * 1000;
const jetzt = new Date('2026-08-02T12:00:00.000Z').getTime();

const eintrag = (name, stundenAlt, extra = {}) => ({
  pfad: `/tmp/klappe/${name}`,
  erstellt: new Date(jetzt - stundenAlt * STUNDE).toISOString(),
  inArbeit: false,
  ...extra,
});

describe('Welche Reste dürfen weg?', () => {
  it('lässt frische Dateien liegen – ein zweiter Anlauf soll sie benutzen können', () => {
    const liste = [eintrag('frisch.mov', 2), eintrag('gestern.mov', 30)];
    const weg = renders.zuLoeschen(liste, { jetzt });
    expect(weg.map((e) => e.pfad)).toEqual(['/tmp/klappe/gestern.mov']);
  });

  it('fasst nie an, was gerade hochgeladen wird', () => {
    // Ein zweites Panel, das aufräumt, darf nicht die Datei löschen, die im
    // ersten gerade übertragen wird.
    const liste = [eintrag('laeuft.mov', 40, { inArbeit: true })];
    expect(renders.zuLoeschen(liste, { jetzt })).toEqual([]);
    expect(renders.zuLoeschen(liste, { jetzt, alles: true })).toEqual([]);
  });

  it('nimmt bei „alles" auch die frischen mit – aber nur die untätigen', () => {
    const liste = [
      eintrag('frisch.mov', 1),
      eintrag('alt.mov', 99),
      eintrag('laeuft.mov', 1, { inArbeit: true }),
    ];
    const weg = renders.zuLoeschen(liste, { jetzt, alles: true });
    expect(weg.map((e) => e.pfad)).toEqual(['/tmp/klappe/frisch.mov', '/tmp/klappe/alt.mov']);
  });

  it('räumt Einträge mit unlesbarem Datum weg statt sie ewig zu behalten', () => {
    const kaputt = { pfad: '/tmp/klappe/kaputt.mov', erstellt: 'kein Datum', inArbeit: false };
    expect(renders.zuLoeschen([kaputt], { jetzt })).toEqual([kaputt]);
  });

  it('hält sich an die eingestellte Frist', () => {
    const liste = [eintrag('sechs.mov', 6)];
    expect(renders.zuLoeschen(liste, { jetzt, maxAlterStunden: 24 })).toEqual([]);
    expect(renders.zuLoeschen(liste, { jetzt, maxAlterStunden: 4 })).toHaveLength(1);
  });
});
