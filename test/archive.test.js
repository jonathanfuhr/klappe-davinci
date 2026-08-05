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
