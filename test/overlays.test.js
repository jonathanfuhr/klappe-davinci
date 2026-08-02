import { describe, expect, it } from 'vitest';

import annotation from '../src/annotation.js';
import mapping from '../src/mapping.js';
import overlays from '../src/overlays.js';

describe('Ablage der Zeichnungen', () => {
  it('macht aus Projektnamen brauchbare Ordnernamen', () => {
    expect(overlays.slug('Beispiel Kampagne')).toBe('Beispiel_Kampagne');
    expect(overlays.slug('Kunde / Projekt 2026')).toBe('Kunde_Projekt_2026');
    expect(overlays.slug('')).toBe('Projekt');
  });

  it('legt je Projekt und Fassung einen eigenen Ordner an', () => {
    const pfad = overlays.pngPath('Beispiel Kampagne', 'v1', 'c1', {
      overlayPath: '/Volumes/Medien/klappe',
    });
    expect(pfad).toBe('/Volumes/Medien/klappe/Beispiel_Kampagne/v1/c1.png');
  });
});

describe('Welche Kommentare bekommen ein Overlay?', () => {
  const mitZeichnung = {
    id: 'a',
    frame: 200,
    annotation: { strokes: [{ color: '#ff3b30', width: 0.004, points: [{ x: 0.2, y: 0.4 }] }] },
  };

  it('nimmt nur Kommentare mit Frame und Zeichnung', () => {
    const liste = overlays.withDrawings([
      mitZeichnung,
      { id: 'b', frame: 100, annotation: null },
      { id: 'c', frame: null, annotation: { strokes: [{ points: [] }] } },
      { id: 'd', frame: 50, annotation: { strokes: [] } },
    ]);

    expect(liste.map((eintrag) => eintrag.id)).toEqual(['a']);
  });

  it('sortiert nach Frame – die Timeline wird von vorn befüllt', () => {
    const liste = overlays.withDrawings([
      { ...mitZeichnung, id: 'spaet', frame: 900 },
      { ...mitZeichnung, id: 'frueh', frame: 10 },
    ]);
    expect(liste.map((eintrag) => eintrag.id)).toEqual(['frueh', 'spaet']);
  });
});

describe('Größe des PNG', () => {
  it('folgt der Auflösung der Fassung', () => {
    expect(annotation.targetSize({ width: 3840, height: 2160 }, 1920)).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(annotation.targetSize({ width: 1920, height: 1440 }, 1920)).toEqual({
      width: 1920,
      height: 1440,
    });
  });

  it('nimmt 16:9 an, solange die Maße fehlen – wie der Server auch', () => {
    expect(annotation.targetSize(null, 1920)).toEqual({ width: 1920, height: 1080 });
  });

  it('hält sich an die Grenzen des Servers (64 bis 3840)', () => {
    expect(annotation.targetSize(null, 10).width).toBe(64);
    expect(annotation.targetSize(null, 99999).width).toBe(3840);
  });
});

describe('Render-Anfang aus dem Sidecar', () => {
  it('ist 0, solange die ganze Timeline ausgespielt wurde', () => {
    expect(mapping.renderIn(null)).toBe(0);
    expect(mapping.renderIn({ wholeTimeline: true, renderIn: 500 })).toBe(0);
  });

  it('gilt nur bei einem echten In/Out-Bereich', () => {
    expect(mapping.renderIn({ wholeTimeline: false, renderIn: 500 })).toBe(500);
    expect(mapping.renderIn({ wholeTimeline: false, renderIn: -3 })).toBe(0);
  });
});
