import { describe, expect, it } from 'vitest';

import presets from '../src/presets.js';
import upload from '../src/upload.js';

/** So heißen die Presets in einer echten Resolve-21-Installation. */
const AUS_RESOLVE = [
  'H.264 Master',
  'ProRes 422 HQ',
  'YouTube - 1080p',
  'Vimeo - 2160p',
  'IMF - Netflix',
  'VR 180/360 - Meta Quest VR',
  'HyperDeck',
  '_THD Master', // eigenes Preset
  '_THD Master Subtitle', // eigenes Preset
];

describe('Standard und Eigene auseinanderhalten', () => {
  it('erkennt die mitgelieferten Presets – mit Bindestrich, wie Resolve sie schreibt', () => {
    // Der Bindestrich ist der ganze Punkt: „YouTube 1080p" gibt es in
    // Resolve 21 nicht, es heißt „YouTube - 1080p". Wer das falsch abschreibt,
    // sortiert die halbe Liste als eigenes Preset ein.
    expect(presets.istStandard('YouTube - 1080p')).toBe(true);
    expect(presets.istStandard('IMF - Netflix')).toBe(true);
    expect(presets.istStandard('VR 180/360 - Meta Quest VR')).toBe(true);
    expect(presets.istStandard('HyperDeck')).toBe(true);
    expect(presets.istStandard('h.264 master')).toBe(true); // Schreibweise egal
    expect(presets.istStandard('_THD Master')).toBe(false);
  });

  it('kennt auch die alten Schreibweisen ohne Bindestrich', () => {
    expect(presets.istStandard('YouTube 1080p')).toBe(true);
  });

  it('hält ein eigenes Preset für eigen, auch wenn es wie ein Standard anfängt', () => {
    // Genau deshalb wird exakt verglichen und nicht auf Präfixe: Bei der
    // Vorgabe „keine" würde ein falsch einsortiertes eigenes Preset aus dem
    // Dialog verschwinden – und niemand wüsste warum.
    expect(presets.istStandard('YouTube - Hausformat')).toBe(false);
    expect(presets.istStandard('IMF - Kunde XY')).toBe(false);
  });

  it('nimmt Nachträge aus den Einstellungen an', () => {
    expect(presets.istStandard('Neues Resolve Preset')).toBe(false);
    expect(presets.istStandard('Neues Resolve Preset', ['Neues Resolve Preset'])).toBe(true);
  });

  it('teilt die Liste für die Einstellungen', () => {
    const { standard, eigene } = presets.teile(AUS_RESOLVE);
    expect(eigene).toEqual(['_THD Master', '_THD Master Subtitle']);
    expect(standard).toHaveLength(7);
  });
});

describe('Welche Presets im Upload-Dialog stehen', () => {
  it('zeigt ab Werk nur die eigenen', () => {
    expect(presets.sichtbare(AUS_RESOLVE)).toEqual(['_THD Master', '_THD Master Subtitle']);
  });

  it('nimmt bei „auswahl" die genannten mitgelieferten dazu', () => {
    expect(
      presets.sichtbare(AUS_RESOLVE, {
        modus: 'auswahl',
        erlaubteStandard: ['H.264 Master', 'ProRes 422 HQ'],
      }),
    ).toEqual(['H.264 Master', 'ProRes 422 HQ', '_THD Master', '_THD Master Subtitle']);
  });

  it('zeigt bei „alle" alles', () => {
    expect(presets.sichtbare(AUS_RESOLVE, { modus: 'alle' })).toEqual(AUS_RESOLVE);
  });

  it('fällt auf die volle Liste zurück, statt ein leeres Menü zu zeigen', () => {
    // Ein Haus ohne eigene Presets stünde sonst vor einer leeren Auswahl und
    // könnte gar nicht mehr ausspielen.
    const nurStandard = ['H.264 Master', 'YouTube - 1080p'];
    expect(presets.sichtbare(nurStandard, { modus: 'keine' })).toEqual(nurStandard);
    expect(
      presets.sichtbare(nurStandard, { modus: 'auswahl', erlaubteStandard: ['Gibt es nicht'] }),
    ).toEqual(nurStandard);
  });
});

describe('Intern oder extern', () => {
  const regel = upload.internalEntscheidung;

  it('lädt immer extern, wenn der Server die interne Runde nicht kennt', () => {
    // Der Schalter sitzt im Server; ein Plugin, das trotzdem intern schickt,
    // bekommt zu Recht eine Absage.
    expect(regel({ mode: 'immer', internalEnabled: false, internalByDefault: true })).toEqual({
      immerIntern: false,
      zeigeHaken: false,
      vorbelegt: false,
    });
  });

  it('lädt in der Vorgabe immer intern, ohne Haken', () => {
    expect(regel({ mode: 'immer', internalEnabled: true, internalByDefault: false })).toEqual({
      immerIntern: true,
      zeigeHaken: false,
      vorbelegt: true,
    });
  });

  it('zeigt im Modus „wahl" den Haken, vorbelegt wie der Server es will', () => {
    expect(regel({ mode: 'wahl', internalEnabled: true, internalByDefault: true })).toEqual({
      immerIntern: false,
      zeigeHaken: true,
      vorbelegt: true,
    });
    expect(regel({ mode: 'wahl', internalEnabled: true, internalByDefault: false })).toEqual({
      immerIntern: false,
      zeigeHaken: true,
      vorbelegt: false,
    });
  });
});
