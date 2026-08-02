import { describe, expect, it } from 'vitest';

import frames from '../src/frames.js';

describe('Framerate lesen', () => {
  it('erkennt Brüche, Ganzzahlen und die gerundeten NTSC-Schreibweisen', () => {
    expect(frames.parseFrameRate('30000/1001')).toEqual({ num: 30000, den: 1001 });
    expect(frames.parseFrameRate('25')).toEqual({ num: 25, den: 1 });
    expect(frames.parseFrameRate('25.0')).toEqual({ num: 25, den: 1 });
    // Genau hier entscheidet sich, ob Drop-Frame stimmt: 29.97 ist 30000/1001.
    expect(frames.parseFrameRate('29.97')).toEqual({ num: 30000, den: 1001 });
    expect(frames.parseFrameRate('23.976')).toEqual({ num: 24000, den: 1001 });
  });

  it('gibt bei Unsinn null zurück statt zu raten', () => {
    expect(frames.parseFrameRate('')).toBeNull();
    expect(frames.parseFrameRate(null)).toBeNull();
    expect(frames.parseFrameRate('keine Zahl')).toBeNull();
    expect(frames.parseFrameRate('-25')).toBeNull();
  });
});

describe('Timecode', () => {
  const pal = { num: 25, den: 1 };
  const ntsc = { num: 30000, den: 1001 };

  it('rechnet 25p ohne Drop-Frame', () => {
    expect(frames.framesToTimecode(0, pal)).toBe('00:00:00:00');
    expect(frames.framesToTimecode(24, pal)).toBe('00:00:00:24');
    expect(frames.framesToTimecode(25, pal)).toBe('00:00:01:00');
    // Der übliche Timeline-Anfang 01:00:00:00
    expect(frames.framesToTimecode(90000, pal)).toBe('01:00:00:00');
  });

  it('rechnet Drop-Frame mit Semikolon und übersprungenen Nummern', () => {
    expect(frames.framesToTimecode(0, ntsc, true)).toBe('00:00:00;00');
    // Nach genau einer Minute springt die Zählung um zwei Frames weiter.
    expect(frames.framesToTimecode(1800, ntsc, true)).toBe('00:01:00;02');
    // Bei jeder zehnten Minute wird nicht gesprungen.
    expect(frames.framesToTimecode(17982, ntsc, true)).toBe('00:10:00;00');
  });

  it('kommt aus dem Timecode wieder beim Frame heraus', () => {
    for (const frame of [0, 1, 999, 90000, 123456]) {
      const timecode = frames.framesToTimecode(frame, pal);
      expect(frames.timecodeToFrames(timecode, pal)).toBe(frame);
    }
    for (const frame of [0, 1799, 1800, 17982, 108000]) {
      const timecode = frames.framesToTimecode(frame, ntsc, true);
      expect(frames.timecodeToFrames(timecode, ntsc, true)).toBe(frame);
    }
  });

  it('weist unlesbare Timecodes ab, statt still zu raten', () => {
    expect(() => frames.timecodeToFrames('Unsinn', pal)).toThrow(SyntaxError);
    expect(() => frames.timecodeToFrames('00:00:00:25', pal)).toThrow(RangeError);
  });
});

describe('Die drei Zählweisen', () => {
  it('legt den Klappe-Frame ohne Render-Offset direkt auf den Timeline-Anfang', () => {
    expect(frames.toMarkerFrame(0)).toBe(0);
    expect(frames.toMarkerFrame(812)).toBe(812);
  });

  it('schiebt um den Render-Anfang, wenn nur ein In/Out ausgespielt wurde', () => {
    // Ausgespielt ab Timeline-Frame 500: Klappe-Frame 0 ist dort.
    expect(frames.toMarkerFrame(0, 500)).toBe(500);
    expect(frames.toMarkerFrame(812, 500)).toBe(1312);
    expect(frames.toCommentFrame(1312, 500)).toBe(812);
  });

  it('nimmt für den Record-Frame zusätzlich den Start-Timecode dazu', () => {
    // Marker zählen ab Timeline-Anfang, Clips absolut – das ist der Unterschied,
    // an dem Overlays sonst um genau eine Stunde danebenliegen.
    expect(frames.toMarkerFrame(812, 500)).toBe(1312);
    expect(frames.toRecordFrame(812, 500, 90000)).toBe(91312);
  });

  it('macht aus einem Kommentar-Frame den Timecode für den Playhead', () => {
    expect(
      frames.commentFrameToTimecode(25, { renderIn: 0, timelineStart: 90000, fps: '25' }),
    ).toBe('01:00:01:00');

    expect(
      frames.commentFrameToTimecode(25, { renderIn: 50, timelineStart: 90000, fps: '25' }),
    ).toBe('01:00:03:00');

    expect(frames.commentFrameToTimecode(25, { fps: 'Unsinn' })).toBeNull();
  });
});
