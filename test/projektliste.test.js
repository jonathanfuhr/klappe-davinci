import { describe, expect, it } from 'vitest';

import projektliste from '../src/projektliste.js';

const VORLAGE = '{nummer}_{kunde}_{projekt}';

function projekt(overrides = {}) {
  return {
    id: 'p1',
    name: 'Kampagne Frühjahr',
    customer: 'Beispiel GmbH',
    archivedAt: null,
    fields: [{ fieldId: 'f1', name: 'Projektnummer', value: '2601' }],
    ...overrides,
  };
}

describe('Vorlage füllen', () => {
  it('setzt die Teile in der vorgegebenen Reihenfolge zusammen', () => {
    expect(
      projektliste.zusammensetzen(VORLAGE, { nummer: '2601', kunde: 'Kunde', projekt: 'Kampagne' }),
    ).toBe('2601_Kunde_Kampagne');
  });

  it('nimmt den Trenner mit, wenn ein Teil fehlt', () => {
    // Sonst stünde da `_Kunde_Kampagne` oder `2601__Kampagne` – dieselbe
    // Regel wie beim Dateinamen: keine Lücken.
    expect(projektliste.zusammensetzen(VORLAGE, { kunde: 'Kunde', projekt: 'Kampagne' })).toBe(
      'Kunde_Kampagne',
    );
    expect(projektliste.zusammensetzen(VORLAGE, { nummer: '2601', projekt: 'Kampagne' })).toBe(
      '2601_Kampagne',
    );
    expect(projektliste.zusammensetzen(VORLAGE, { projekt: 'Kampagne' })).toBe('Kampagne');
  });

  it('lässt sich umstellen und anders trennen', () => {
    expect(
      projektliste.zusammensetzen('{kunde} – {projekt} ({nummer})', {
        nummer: '2601',
        kunde: 'Kunde',
        projekt: 'Kampagne',
      }),
    ).toBe('Kunde – Kampagne (2601)');
  });

  it('gibt eine leere Zeichenkette zurück, wenn nichts bekannt ist', () => {
    expect(projektliste.zusammensetzen(VORLAGE, {})).toBe('');
  });
});

describe('Projektnummer', () => {
  it('kommt aus dem benutzerdefinierten Feld', () => {
    expect(projektliste.nummerUndName(projekt(), 'Projektnummer').nummer).toBe('2601');
  });

  it('vergleicht Feldnamen ohne Rücksicht auf Schreibweise und Trenner', () => {
    const p = projekt({ fields: [{ fieldId: 'f1', name: 'Projekt-Nr', value: '2601' }] });
    expect(projektliste.nummerUndName(p, 'projekt nr').nummer).toBe('2601');
  });

  it('nimmt sonst eine Ziffernfolge am Anfang des Namens – und lässt sie dort weg', () => {
    const p = projekt({ fields: [], name: '2601 Kampagne Frühjahr' });
    expect(projektliste.nummerUndName(p, 'Projektnummer')).toEqual({
      nummer: '2601',
      name: 'Kampagne Frühjahr',
    });
  });

  it('hält „4K Testschnitt" nicht für Projekt Nummer 4', () => {
    // Eine einzelne Ziffer, die zum nächsten Wort gehört, ist keine Nummer.
    const p = projekt({ fields: [], name: '4K Testschnitt' });
    expect(projektliste.nummerUndName(p, 'Projektnummer')).toEqual({
      nummer: '',
      name: '4K Testschnitt',
    });
  });

  it('lässt ein leeres Feld nicht als Nummer gelten', () => {
    const p = projekt({ fields: [{ fieldId: 'f1', name: 'Projektnummer', value: '  ' }] });
    expect(projektliste.nummerUndName(p, 'Projektnummer').nummer).toBe('');
  });
});

describe('Listenname', () => {
  it('stellt die Nummer nach vorn', () => {
    expect(projektliste.listenname(projekt(), { format: VORLAGE, nummernfeld: 'Projektnummer' })).toBe(
      '2601_Beispiel GmbH_Kampagne Frühjahr',
    );
  });

  it('kommt ohne Nummer und ohne Kunden aus', () => {
    const p = projekt({ fields: [], customer: null });
    expect(projektliste.listenname(p, { format: VORLAGE, nummernfeld: 'Projektnummer' })).toBe(
      'Kampagne Frühjahr',
    );
  });

  it('bleibt nie leer – im Zweifel steht der Projektname da', () => {
    const p = projekt({ fields: [], customer: null });
    expect(projektliste.listenname(p, { format: '{nummer}', nummernfeld: 'Projektnummer' })).toBe(
      'Kampagne Frühjahr',
    );
  });
});

describe('Archivierte Projekte', () => {
  const aktiv = projekt({ id: 'a' });
  const alt = projekt({ id: 'b', archivedAt: '2026-01-01T00:00:00.000Z' });

  it('stehen nicht in der Liste – dort wird nichts mehr aktualisiert', () => {
    expect(projektliste.sichtbare([aktiv, alt]).map((p) => p.id)).toEqual(['a']);
  });

  it('bleiben stehen, wenn die Timeline schon dorthin zeigt', () => {
    // Sonst fiele die Auswahl stillschweigend auf ein anderes Projekt, und
    // niemand sähe, warum.
    expect(projektliste.sichtbare([aktiv, alt], { ausser: 'b' }).map((p) => p.id)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('Reihenfolge in der Liste', () => {
  const zeile = (listenname, id = listenname) => ({ id, listenname });

  it('sortiert nach dem, was in der Zeile steht', () => {
    const sortiert = projektliste.nachListennamen([
      zeile('2601_Beispiel_Kampagne'),
      zeile('2542_Muster_Imagefilm'),
      zeile('2603_Beispiel_Teaser'),
    ]);
    expect(sortiert.map((p) => p.listenname)).toEqual([
      '2542_Muster_Imagefilm',
      '2601_Beispiel_Kampagne',
      '2603_Beispiel_Teaser',
    ]);
  });

  it('zählt Nummern als Zahlen, nicht als Zeichenketten', () => {
    // Als Zeichenketten stünde `999` hinter `2601` – deshalb der Collator
    // mit `numeric: true`.
    const sortiert = projektliste.nachListennamen([
      zeile('2601_Kunde_Projekt'),
      zeile('999_Kunde_Projekt'),
      zeile('1200_Kunde_Projekt'),
    ]);
    expect(sortiert.map((p) => p.listenname)).toEqual([
      '999_Kunde_Projekt',
      '1200_Kunde_Projekt',
      '2601_Kunde_Projekt',
    ]);
  });

  it('stellt Projekte mit Nummer vor die ohne – die fangen mit dem Kunden an', () => {
    const sortiert = projektliste.nachListennamen([
      zeile('Ahrens_Internes'),
      zeile('2601_Beispiel_Kampagne'),
      zeile('Zeller_Testschnitt'),
    ]);
    expect(sortiert.map((p) => p.listenname)).toEqual([
      '2601_Beispiel_Kampagne',
      'Ahrens_Internes',
      'Zeller_Testschnitt',
    ]);
  });

  it('sortiert Umlaute dorthin, wo man sie sucht', () => {
    const sortiert = projektliste.nachListennamen([
      zeile('Zeller_Film'),
      zeile('Ötztal_Film'),
      zeile('Ahrens_Film'),
    ]);
    expect(sortiert.map((p) => p.listenname)).toEqual([
      'Ahrens_Film',
      'Ötztal_Film',
      'Zeller_Film',
    ]);
  });

  it('fällt auf den Projektnamen zurück, wenn kein Listenname da ist', () => {
    const sortiert = projektliste.nachListennamen([{ id: 'b', name: 'Beta' }, { id: 'a', name: 'Alpha' }]);
    expect(sortiert.map((p) => p.name)).toEqual(['Alpha', 'Beta']);
  });

  it('lässt die Eingabe unberührt', () => {
    // Die Liste kommt aus dem API-Client; sie an der Stelle umzusortieren wäre
    // eine Nebenwirkung, die niemand erwartet.
    const eingabe = [zeile('B'), zeile('A')];
    projektliste.nachListennamen(eingabe);
    expect(eingabe.map((p) => p.listenname)).toEqual(['B', 'A']);
  });

  it('kommt mit nichts zurecht', () => {
    expect(projektliste.nachListennamen(null)).toEqual([]);
    expect(projektliste.nachListennamen([])).toEqual([]);
  });
});
