import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import archive from '../src/archive.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'klappe-ablage-'));

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('Freien Namen finden', () => {
  it('nimmt den Namen, wenn er frei ist', () => {
    expect(archive.freierName('/ablage', 'Teaser.mov', () => false)).toBe('/ablage/Teaser.mov');
  });

  it('überschreibt nie – im Zielordner liegt fremde Arbeit', () => {
    const belegt = new Set(['/ablage/Teaser.mov', '/ablage/Teaser-2.mov']);
    expect(archive.freierName('/ablage', 'Teaser.mov', (pfad) => belegt.has(pfad))).toBe(
      '/ablage/Teaser-3.mov',
    );
  });

  it('setzt die Nummer vor die Endung, nicht dahinter', () => {
    const belegt = new Set(['/ablage/Teaser.mov']);
    expect(archive.freierName('/ablage', 'Teaser.mov', (pfad) => belegt.has(pfad))).toBe(
      '/ablage/Teaser-2.mov',
    );
  });

  it('gibt auf, statt endlos zu zählen', () => {
    expect(() => archive.freierName('/ablage', 'Teaser.mov', () => true)).toThrow();
  });
});

describe('Kopieren', () => {
  it('kopiert vollständig und meldet den Fortschritt', async () => {
    const quelle = path.join(tempDir, 'master.mov');
    const ziel = path.join(tempDir, 'ablage', 'master.mov');
    fs.writeFileSync(quelle, Buffer.alloc(5_000_000, 7));

    const stufen = [];
    const ergebnis = await archive.kopiere(quelle, ziel, {
      blockBytes: 1_000_000,
      onProgress: (uebertragen, gesamt) => stufen.push([uebertragen, gesamt]),
    });

    expect(ergebnis.path).toBe(ziel);
    expect(ergebnis.bytes).toBe(5_000_000);
    expect(fs.statSync(ziel).size).toBe(5_000_000);
    expect(stufen.length).toBeGreaterThan(1);
    expect(stufen.at(-1)).toEqual([5_000_000, 5_000_000]);
  });

  it('lässt bei einem Abbruch kein Bruchstück zurück', async () => {
    // Ein 12-GB-Fragment, das aussieht wie ein Master, ist schlimmer als gar
    // keine Datei – deshalb wird die halbe Kopie weggeräumt.
    const quelle = path.join(tempDir, 'gross.mov');
    const ziel = path.join(tempDir, 'ablage', 'gross.mov');
    fs.writeFileSync(quelle, Buffer.alloc(20_000_000, 3));

    const signal = { aborted: false };
    const laeuft = archive.kopiere(quelle, ziel, { blockBytes: 64 * 1024, signal });
    // Sofort abbrechen, noch bevor der erste Block durch ist – so hängt der
    // Test nicht davon ab, wie schnell die Platte gerade ist.
    signal.aborted = true;

    await expect(laeuft).rejects.toThrow();
    expect(fs.existsSync(ziel)).toBe(false);
  });
});

describe('Endfassung im Dateinamen – lokal entschieden', () => {
  // Der Haken ist eine Entscheidung im Dialog. Ob der Server sie schon
  // übernommen hat, darf die lokale Kopie nicht betreffen.
  const mitVorschau = '260802_Kunde_Kampagne_Teaser_v3_Vorschau_1080p25.mov';
  const ohneVorschau = '260802_Kunde_Kampagne_Teaser_v3_1080p25.mov';

  it('nimmt „Vorschau" heraus, wenn die Endfassung angehakt ist', () => {
    expect(archive.endfassungImNamen(mitVorschau, true)).toBe(ohneVorschau);
  });

  it('setzt „Vorschau" ein, wenn sie nicht angehakt ist', () => {
    expect(archive.endfassungImNamen(ohneVorschau, false)).toBe(mitVorschau);
  });

  it('lässt einen schon richtigen Namen in Ruhe', () => {
    expect(archive.endfassungImNamen(mitVorschau, false)).toBe(mitVorschau);
    expect(archive.endfassungImNamen(ohneVorschau, true)).toBe(ohneVorschau);
  });

  it('setzt es vor die Auflösung, nicht ans Ende', () => {
    // Dieselbe Stelle wie in Klappe – sonst hieße dieselbe Fassung lokal
    // anders als beim Download.
    expect(archive.endfassungImNamen('260802_Teaser_v1_2160p30.mov', false)).toBe(
      '260802_Teaser_v1_Vorschau_2160p30.mov',
    );
  });

  it('kommt auch ohne Endung und ohne Unterstriche zurecht', () => {
    expect(archive.endfassungImNamen('Teaser', false)).toBe('Teaser_Vorschau');
    expect(archive.endfassungImNamen('Teaser_Vorschau', true)).toBe('Teaser');
  });
});

describe('Umbenennen auf den Hausnamen', () => {
  it('gibt der Kopie den Namen, unter dem Klappe die Fassung führt', () => {
    const ordner = path.join(tempDir, 'umbenennen');
    fs.mkdirSync(ordner, { recursive: true });
    const vorher = path.join(ordner, 'Teaser_20260802071200.mov');
    fs.writeFileSync(vorher, 'x');

    const nachher = archive.benenneUm(vorher, '260802_Kunde_Teaser_v3_1080p25.mov');
    expect(path.basename(nachher)).toBe('260802_Kunde_Teaser_v3_1080p25.mov');
    expect(fs.existsSync(nachher)).toBe(true);
    expect(fs.existsSync(vorher)).toBe(false);
  });

  it('lässt die Datei liegen, wenn kein Name bekannt ist', () => {
    const ordner = path.join(tempDir, 'ohne-namen');
    fs.mkdirSync(ordner, { recursive: true });
    const pfad = path.join(ordner, 'Teaser.mov');
    fs.writeFileSync(pfad, 'x');

    // Umbenennen ist Kür: Ohne Namen bleibt es beim Namen des Zwischen-Masters,
    // und der Upload gilt trotzdem als gelungen.
    expect(archive.benenneUm(pfad, '')).toBe(pfad);
    expect(fs.existsSync(pfad)).toBe(true);
  });
});
