import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import upload from '../src/upload.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'klappe-test-'));

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('Dateinamen fürs Rendern', () => {
  it('macht aus Timeline-Namen etwas, das Resolve verträgt', () => {
    expect(upload.safeName('Teaser 30s – Schnittfassung')).toBe('Teaser_30s_Schnittfassung');
    expect(upload.safeName('')).toBe('Fassung');
    expect(upload.safeName('///')).toBe('Fassung');
  });
});

describe('Die gerenderte Datei finden', () => {
  it('nimmt die größte Datei mit passendem Anfang – die Endung hängt am Preset', () => {
    fs.writeFileSync(path.join(tempDir, 'Teaser_20260802.mov'), Buffer.alloc(2048));
    fs.writeFileSync(path.join(tempDir, 'Teaser_20260802.mov.tmp'), Buffer.alloc(10));
    fs.writeFileSync(path.join(tempDir, 'Anderes.mov'), Buffer.alloc(9999));

    const gefunden = upload.findRendered(tempDir, 'Teaser_20260802');
    expect(path.basename(gefunden.path)).toBe('Teaser_20260802.mov');
    expect(gefunden.size).toBe(2048);
  });

  it('gibt null zurück, wenn nichts da ist – der Aufrufer sagt dann, wo gesucht wurde', () => {
    expect(upload.findRendered(tempDir, 'GibtEsNicht')).toBeNull();
  });
});

describe('Größenangaben', () => {
  it('schreibt Bytes so, wie man sie am Schnittplatz liest', () => {
    expect(upload.formatBytes(0)).toBe('0 B');
    expect(upload.formatBytes(1024)).toBe('1.0 KB');
    expect(upload.formatBytes(42 * 1024 * 1024 * 1024)).toBe('42 GB');
  });
});
