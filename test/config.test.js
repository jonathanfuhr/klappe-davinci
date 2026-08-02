import { describe, expect, it } from 'vitest';

import config from '../src/config.js';

describe('Serveradresse begradigen', () => {
  it('ergänzt HTTPS, wenn kein Schema dasteht', () => {
    // Genau der Fall aus dem Installer: Dort tippt jemand den Hostnamen in den
    // Werteblock, und ohne Schema scheitert später jede einzelne Anfrage.
    expect(config.normalizeServerUrl('klappe.example.de')).toBe('https://klappe.example.de');
  });

  it('lässt ein ausdrückliches http:// stehen', () => {
    // Wer eine Anlage ohne Verschlüsselung betreibt, schreibt das ausdrücklich
    // hin – das ist eine Entscheidung, keine Nachlässigkeit.
    expect(config.normalizeServerUrl('http://klappe.intern')).toBe('http://klappe.intern');
  });

  it('wirft Schrägstriche am Ende weg', () => {
    expect(config.normalizeServerUrl('https://klappe.example.de/')).toBe(
      'https://klappe.example.de',
    );
    expect(config.normalizeServerUrl('  klappe.example.de//  ')).toBe('https://klappe.example.de');
  });

  it('macht aus nichts nichts', () => {
    expect(config.normalizeServerUrl('')).toBe('');
    expect(config.normalizeServerUrl(null)).toBe('');
  });
});
