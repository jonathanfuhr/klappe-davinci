import { describe, expect, it } from 'vitest';

import dateiname from '../src/dateiname.js';

/*
 * Die Fälle sind aus Klappes eigenem Test abgeschrieben
 * (`packages/shared/src/filenames.test.ts`). Das ist der Zweck dieser Datei:
 * Der Name entsteht hier im Plugin, geführt wird die Fassung aber in Klappe –
 * laufen die beiden Schemata auseinander, soll es hier auffallen und nicht
 * erst im Projektordner des Kunden.
 */

const basis = {
  datum: '260728',
  kunde: 'Beispiel',
  projektName: 'Imagefilm 2026',
  videoName: 'Schnittfassung',
  nummer: 2,
  aufloesung: '2160p25',
};

describe('Dateiname', () => {
  it('folgt dem vereinbarten Schema', () => {
    expect(dateiname.vollerName(basis, 'mov')).toBe(
      '260728_Beispiel_Imagefilm-2026_Schnittfassung_v2_2160p25.mov',
    );
  });

  it('lässt fehlende Teile weg, statt Lücken zu hinterlassen', () => {
    expect(
      dateiname.vollerName({ ...basis, kunde: null, datum: null, aufloesung: null }, 'mov'),
    ).toBe('Imagefilm-2026_Schnittfassung_v2.mov');
  });

  it('macht aus Leerzeichen Bindestriche und hält den Unterstrich als Trenner frei', () => {
    expect(
      dateiname.vollerName(
        { ...basis, projektName: 'Neues  Projekt', videoName: 'Teil_2 Final' },
        'mov',
      ),
    ).toBe('260728_Beispiel_Neues-Projekt_Teil-2-Final_v2_2160p25.mov');
  });

  it('entschärft Pfad- und Sonderzeichen', () => {
    expect(
      dateiname.vollerName({ ...basis, kunde: '../etc', videoName: 'a:b*c?"d<e>f|g' }, 'mov'),
    ).toBe('260728_etc_Imagefilm-2026_a-b-c-d-e-f-g_v2_2160p25.mov');
  });

  it('behält Umlaute', () => {
    expect(dateiname.vollerName({ ...basis, videoName: 'Grüße für Köln' }, 'mov')).toContain(
      'Grüße-für-Köln',
    );
  });

  it('ignoriert ein Datum in falschem Format', () => {
    expect(dateiname.vollerName({ ...basis, datum: '2026-07-28' }, 'mov')).toBe(
      'Beispiel_Imagefilm-2026_Schnittfassung_v2_2160p25.mov',
    );
  });

  it('kommt ohne Endung aus – die hängt am Preset und setzt Resolve selbst', () => {
    expect(dateiname.basisName(basis)).toBe(
      '260728_Beispiel_Imagefilm-2026_Schnittfassung_v2_2160p25',
    );
  });

  it('schreibt die Endung klein und entfernt Punkte davor', () => {
    expect(dateiname.vollerName(basis, '.MOV')).toMatch(/\.mov$/);
  });

  it('fällt auf einen Ersatznamen zurück, wenn nichts übrig bleibt', () => {
    expect(
      dateiname.vollerName(
        { datum: null, kunde: null, projektName: '...', videoName: '   ', nummer: 0 },
        'mp4',
      ),
    ).toBe('v1.mp4');
  });
});

describe('Endfassung im Namen', () => {
  const teaser = {
    datum: '260304',
    kunde: 'Beispiel',
    projektName: 'Kampagne',
    videoName: 'Teaser',
    nummer: 1,
    aufloesung: '1080p25',
  };

  it('schreibt „Vorschau" hinter die Nummer, solange die Fassung nicht final ist', () => {
    expect(dateiname.vollerName({ ...teaser, istEndfassung: false }, 'mov')).toBe(
      '260304_Beispiel_Kampagne_Teaser_v1_Vorschau_1080p25.mov',
    );
  });

  it('lässt den Namen bei einer Endfassung unverändert', () => {
    expect(dateiname.vollerName({ ...teaser, istEndfassung: true }, 'mov')).toBe(
      '260304_Beispiel_Kampagne_Teaser_v1_1080p25.mov',
    );
  });
});

describe('Namensteil', () => {
  it('entfernt Steuerzeichen und begrenzt die Länge', () => {
    expect(dateiname.namensteil('a\u0000b\u001fc')).toBe('abc');
    expect(dateiname.namensteil('x'.repeat(200))).toHaveLength(60);
  });

  it('zieht mehrfache Trenner zusammen', () => {
    expect(dateiname.namensteil('a___b   c')).toBe('a-b-c');
  });
});

describe('Datum und Nummer', () => {
  it('bildet JJMMTT in Ortszeit', () => {
    expect(dateiname.dateiDatum(new Date(2026, 6, 28))).toBe('260728');
    expect(dateiname.dateiDatum(new Date(2005, 0, 3))).toBe('050103');
  });

  it('schreibt Zwischenfassungen mit Bindestrich', () => {
    expect(dateiname.fassungsteil(2)).toBe('v2');
    expect(dateiname.fassungsteil(2.5)).toBe('v2-5');
    // Unbrauchbares fällt auf v1 zurück – nie `v0` oder `vNaN` im Dateinamen.
    expect(dateiname.fassungsteil(0)).toBe('v1');
    expect(dateiname.fassungsteil(Number.NaN)).toBe('v1');
  });
});

describe('Auflösung', () => {
  it('nennt die kurze Seite und die Bildrate', () => {
    expect(dateiname.aufloesung(1920, 1080, 25)).toBe('1080p25');
    expect(dateiname.aufloesung(3840, 2160, 50)).toBe('2160p50');
  });

  it('schreibt NTSC-Raten ohne Komma', () => {
    expect(dateiname.aufloesung(1920, 1080, 29.97)).toBe('1080p2997');
    expect(dateiname.aufloesung(1920, 1080, 23.976)).toBe('1080p2398');
  });

  it('rät nichts, wenn Resolve nichts Brauchbares sagt', () => {
    // Lieber kein Auflösungsteil als ein falscher: Ein Master, der „1080p"
    // heißt und 2160p ist, führt genau die Ablage in die Irre, für die der
    // Name gemacht ist.
    expect(dateiname.aufloesung(0, 0, 25)).toBeNull();
    expect(dateiname.aufloesung(null, null, null)).toBeNull();
    expect(dateiname.aufloesung(1920, 1080, null)).toBe('1080p');
  });

  it('nimmt die kurze Seite auch im Hochformat', () => {
    expect(dateiname.aufloesung(1080, 1920, 25)).toBe('1080p25');
  });
});
