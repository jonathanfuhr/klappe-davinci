/**
 * Frame- und Timecode-Mathematik.
 *
 * Übernommen aus `packages/shared/src/timecode.ts` der Klappe-Instanz, damit
 * beide Seiten dieselbe Zählweise benutzen – ein eigener Nachbau, der um einen
 * Frame danebenliegt, wäre der unangenehmste Fehler in diesem Plugin.
 *
 * Dazu die Umrechnung zwischen den **drei** Zählweisen, die hier
 * aufeinandertreffen:
 *
 * 1. **Klappe-Frame** – 0 ist das erste Bild der hochgeladenen Fassung.
 * 2. **Marker-Frame** – Resolve zählt Marker ab dem Anfang der Timeline,
 *    unabhängig vom Start-Timecode. `AddMarker(0, …)` sitzt auf dem ersten Bild.
 * 3. **Record-Frame** – absolute Position in der Timeline, also inklusive des
 *    Start-Timecodes (üblicherweise 01:00:00:00). Das ist die Zählweise, in
 *    der `AppendToTimeline` Clips platziert.
 *
 * Zwischen 1 und 2 liegt der Render-Anfang: Wurde nur ein In/Out-Bereich
 * ausgespielt, ist Klappe-Frame 0 nicht der Timeline-Anfang, sondern der
 * Mark-In.
 */

const EPSILON = 1e-6;

/** `"30000/1001"`, `"25"` oder `"29.97"` → Bruch. `null` bei Unsinn. */
function parseFrameRate(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const fraction = trimmed.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (fraction) {
    const num = Number(fraction[1]);
    const den = Number(fraction[2]);
    return num > 0 && den > 0 ? { num, den } : null;
  }

  const decimal = Number(trimmed);
  if (!Number.isFinite(decimal) || decimal <= 0) return null;

  // 23.976/29.97/59.94 sind gerundete Schreibweisen der 1000/1001-Raten –
  // genau hier entscheidet sich, ob Drop-Frame richtig gerechnet wird.
  const ntsc = [24, 30, 60, 120].find((base) => Math.abs(decimal - (base * 1000) / 1001) < 0.005);
  if (ntsc) return { num: ntsc * 1000, den: 1001 };

  if (Number.isInteger(decimal)) return { num: decimal, den: 1 };
  return { num: Math.round(decimal * 1000), den: 1000 };
}

function fpsToNumber(fps) {
  return fps.num / fps.den;
}

/** Zählrate des Timecodes: 29,97 zählt in 30er-Schritten, 23,976 in 24ern. */
function nominalFps(fps) {
  return Math.round(fpsToNumber(fps));
}

/** Drop-Frame gibt es nur für die NTSC-Raten 29,97 und 59,94. */
function supportsDropFrame(fps) {
  const nominal = nominalFps(fps);
  if (nominal !== 30 && nominal !== 60) return false;
  return Math.abs(fpsToNumber(fps) - nominal) > 0.001;
}

function dropFramesPerMinute(fps) {
  return Math.round(nominalFps(fps) * 0.066666);
}

function pad(value, width = 2) {
  return String(Math.abs(value)).padStart(width, '0');
}

/** Frame-Index → `HH:MM:SS:FF` bzw. `HH:MM:SS;FF` bei Drop-Frame. */
function framesToTimecode(frames, fps, dropFrame = false) {
  const negative = frames < 0;
  let frameNumber = Math.abs(Math.round(frames));
  const nominal = nominalFps(fps);
  const useDropFrame = dropFrame && supportsDropFrame(fps);

  if (useDropFrame) {
    const drop = dropFramesPerMinute(fps);
    const framesPerMinute = nominal * 60 - drop;
    const framesPer10Minutes = nominal * 600 - 9 * drop;
    const tenMinuteBlocks = Math.floor(frameNumber / framesPer10Minutes);
    const rest = frameNumber % framesPer10Minutes;

    frameNumber += drop * 9 * tenMinuteBlocks;
    if (rest > drop) {
      frameNumber += drop * Math.floor((rest - drop) / framesPerMinute);
    }
  }

  const ff = frameNumber % nominal;
  const ss = Math.floor(frameNumber / nominal) % 60;
  const mm = Math.floor(frameNumber / (nominal * 60)) % 60;
  const hh = Math.floor(frameNumber / (nominal * 3600)) % 24;
  const separator = useDropFrame ? ';' : ':';

  return `${negative ? '-' : ''}${pad(hh)}:${pad(mm)}:${pad(ss)}${separator}${pad(ff)}`;
}

/** `HH:MM:SS:FF`, `HH:MM:SS;FF` oder `MM:SS:FF` → Frame-Index. */
function timecodeToFrames(timecode, fps, dropFrame) {
  const trimmed = String(timecode || '').trim();
  const match = trimmed.match(/^(-)?(?:(\d+):)?(\d{1,2}):(\d{1,2})([:;.])(\d{1,3})$/);
  if (!match) throw new SyntaxError(`Ungültiger Timecode: „${timecode}"`);

  const negative = match[1] === '-';
  const hours = match[2] ? Number(match[2]) : 0;
  const minutes = Number(match[3]);
  const seconds = Number(match[4]);
  const frames = Number(match[6]);
  const nominal = nominalFps(fps);

  if (minutes > 59 || seconds > 59 || frames >= nominal) {
    throw new RangeError(`Timecode außerhalb des gültigen Bereichs: „${timecode}"`);
  }

  const explicitDropFrame = match[5] === ';';
  const useDropFrame = (dropFrame ?? explicitDropFrame) && supportsDropFrame(fps);

  let total = ((hours * 60 + minutes) * 60 + seconds) * nominal + frames;
  if (useDropFrame) {
    const drop = dropFramesPerMinute(fps);
    const totalMinutes = hours * 60 + minutes;
    total -= drop * (totalMinutes - Math.floor(totalMinutes / 10));
  }

  return negative ? -total : total;
}

function framesToSeconds(frames, fps) {
  return (frames * fps.den) / fps.num;
}

function secondsToFrames(seconds, fps) {
  if (!Number.isFinite(seconds)) return 0;
  return Math.max(0, Math.floor((seconds * fps.num) / fps.den + EPSILON));
}

/* ---------------------------------------------- Die drei Zählweisen */

/**
 * Klappe-Frame → Marker-Frame (ab Timeline-Anfang gezählt).
 *
 * `renderIn` ist der Mark-In des Ausspielens, ebenfalls ab Timeline-Anfang.
 * Wurde die ganze Timeline ausgespielt, ist er 0.
 */
function toMarkerFrame(commentFrame, renderIn = 0) {
  return Math.max(0, Math.round(Number(commentFrame) || 0) + (Number(renderIn) || 0));
}

/** Klappe-Frame → absoluter Record-Frame (inklusive Start-Timecode). */
function toRecordFrame(commentFrame, renderIn = 0, timelineStart = 0) {
  return toMarkerFrame(commentFrame, renderIn) + (Number(timelineStart) || 0);
}

/** Marker-Frame → Klappe-Frame. Die Gegenrichtung, für die Kommentarliste. */
function toCommentFrame(markerFrame, renderIn = 0) {
  return Math.max(0, (Number(markerFrame) || 0) - (Number(renderIn) || 0));
}

/**
 * Timecode für `SetCurrentTimecode`. Der Playhead braucht die absolute
 * Position, also mit Start-Timecode – deshalb der Umweg über den
 * Record-Frame.
 */
function commentFrameToTimecode(commentFrame, { renderIn = 0, timelineStart = 0, fps, dropFrame }) {
  const rate = typeof fps === 'string' ? parseFrameRate(fps) : fps;
  if (!rate) return null;
  return framesToTimecode(toRecordFrame(commentFrame, renderIn, timelineStart), rate, dropFrame);
}

module.exports = {
  parseFrameRate,
  fpsToNumber,
  nominalFps,
  supportsDropFrame,
  framesToTimecode,
  timecodeToFrames,
  framesToSeconds,
  secondsToFrames,
  toMarkerFrame,
  toRecordFrame,
  toCommentFrame,
  commentFrameToTimecode,
};
