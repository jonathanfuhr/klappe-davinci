import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import upload from '../src/upload.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'klappe-test-'));

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('Die gerenderte Datei finden', () => {
  it('nimmt die größte Datei im Lauf-Ordner – die Endung hängt am Preset', () => {
    // Jeder Lauf hat seinen eigenen Ordner, deshalb wird nicht mehr nach dem
    // Namensanfang gesucht: Der Master heißt jetzt wie die Fassung, und zwei
    // Läufe am selben Tag hießen damit gleich.
    fs.writeFileSync(path.join(tempDir, '260802_Kunde_Kampagne_Teaser_v3_1080p25.mov'), Buffer.alloc(2048));
    fs.writeFileSync(path.join(tempDir, '260802_Kunde_Kampagne_Teaser_v3_1080p25.mov.tmp'), Buffer.alloc(10));

    const gefunden = upload.findRendered(tempDir);
    expect(path.basename(gefunden.path)).toBe('260802_Kunde_Kampagne_Teaser_v3_1080p25.mov');
    expect(gefunden.size).toBe(2048);
  });

  it('gibt null zurück, wenn nichts da ist – der Aufrufer sagt dann, wo gesucht wurde', () => {
    const leer = path.join(tempDir, 'leer');
    fs.mkdirSync(leer, { recursive: true });
    expect(upload.findRendered(leer)).toBeNull();
  });
});

describe('Größenangaben', () => {
  it('schreibt Bytes so, wie man sie am Schnittplatz liest', () => {
    expect(upload.formatBytes(0)).toBe('0 B');
    expect(upload.formatBytes(1024)).toBe('1.0 KB');
    expect(upload.formatBytes(42 * 1024 * 1024 * 1024)).toBe('42 GB');
  });
});
