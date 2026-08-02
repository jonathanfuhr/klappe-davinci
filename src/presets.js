/**
 * Render-Presets sortieren.
 *
 * Resolve bringt mehrere Dutzend Presets mit; im Haus benutzt man drei – und
 * die drei sind fast immer **eigene**. Deshalb wird unterschieden:
 *
 * - **Eigene Presets** sind immer sichtbar. Wer sich eins anlegt, will es
 *   benutzen; es erst in den Einstellungen freischalten zu müssen, wäre eine
 *   Zumutung – vor allem für den Kollegen, der es nicht angelegt hat.
 * - **Standard-Presets** lassen sich einzeln abschalten. Sie sind der Grund,
 *   warum die Liste unbedienbar ist.
 *
 * Erkannt wird an einer festen Namensliste, und zwar **genau** (ohne Präfixe):
 * Ein eigenes Preset namens „YouTube Hausformat" darf nicht versehentlich als
 * Standard gelten und damit abschaltbar werden. Was Resolve künftig dazulegt,
 * trägt man in `standardPresetsExtra` nach.
 */

/**
 * Die mitgelieferten Presets von DaVinci Resolve.
 *
 * Abgeschrieben aus Resolve 21 – **mit den Bindestrichen**: Es heißt
 * „YouTube - 1080p", nicht „YouTube 1080p". Wer das falsch hinschreibt,
 * sortiert die halbe Liste als eigenes Preset ein. Die Schreibweisen ohne
 * Bindestrich stehen für ältere Resolve-Fassungen weiter mit drin.
 *
 * Ergänzungen gehören in die Einstellungen (`standardPresetsExtra`), nicht
 * hierher – diese Liste ist der Stand bei Auslieferung, nicht die Wahrheit
 * über jede Installation.
 */
const STANDARD_PRESETS = [
  // Resolve 21
  'HyperDeck',
  'Presentations',
  'YouTube - 720p',
  'YouTube - 1080p',
  'YouTube - 1440p',
  'YouTube - 2160p',
  'Vimeo - 720p',
  'Vimeo - 1080p',
  'Vimeo - 2160p',
  'TikTok - 720p',
  'TikTok - 1080p',
  'Dropbox - 720p',
  'Dropbox - 1080p',
  'Dropbox - 2160p',
  'Replay - 720p',
  'Replay - 1080p',
  'Replay - 2160p',
  'IMF - Generic',
  'IMF - 20th Century Fox',
  'IMF - Netflix',
  'IMF - Sony Pictures',
  'IMF - iQIYI',
  'IMF - HDR Vivid',
  'FCP - Final Cut Pro 7',
  'FCP - Final Cut Pro X',
  'Tencent - IMF',
  'Tencent - MOV',
  'Tencent - MP4',
  'VR 180/360 - Meta Quest VR',
  'VR 180/360 - YouTube VR',
  'Premiere XML',
  'AVID AAF',
  'Pro Tools',
  'Audio Only',
  'H.264 Master',
  'H.265 Master',
  'H.264 SD',
  'ProRes Master',
  'ProRes 422 HQ',
  'Custom',
  'Custom Export',
  'DCP',
  'Dolby Vision',
  // Ältere Schreibweisen (Resolve 17–19)
  'YouTube 720p',
  'YouTube 1080p',
  'YouTube 2160p',
  'Vimeo 720p',
  'Vimeo 1080p',
  'Vimeo 2160p',
  'Twitter 720p',
  'Twitter 1080p',
  'TikTok 1080p',
  'IMF Generic',
  'IMF Netflix',
  'IMF TR-01',
  'Final Cut Pro 7 XML',
  'Final Cut Pro X XML',
];

const normal = (name) => String(name || '').trim().toLowerCase();

/** Ist das ein mitgeliefertes Preset von Resolve? */
function istStandard(name, extra = []) {
  const gesucht = normal(name);
  if (!gesucht) return false;
  return (
    STANDARD_PRESETS.some((eintrag) => normal(eintrag) === gesucht) ||
    extra.some((eintrag) => normal(eintrag) === gesucht)
  );
}

/** Die Liste aus Resolve in Standard und Eigene teilen – für die Einstellungen. */
function teile(alle, extra = []) {
  const standard = [];
  const eigene = [];
  for (const name of alle || []) {
    if (istStandard(name, extra)) standard.push(name);
    else eigene.push(name);
  }
  return { standard, eigene };
}

/** Die drei Zustände, die die Liste der mitgelieferten Presets haben kann. */
const MODI = ['keine', 'auswahl', 'alle'];

/**
 * Welche Presets im Upload-Dialog stehen.
 *
 * `modus` bezieht sich **nur** auf die mitgelieferten Presets:
 *
 * - `keine` (Vorgabe) – im Dialog stehen nur die eigenen. Das ist der Alltag:
 *   Ein Haus rendert mit seinen eigenen Presets, und die drei Dutzend von
 *   Resolve stehen nur im Weg.
 * - `auswahl` – zusätzlich die in `erlaubteStandard` genannten.
 * - `alle` – alles, was Resolve kennt.
 *
 * **Eigene Presets gehen immer mit**, in jedem Modus.
 */
function sichtbare(alle, { modus = 'keine', erlaubteStandard = [], extra = [] } = {}) {
  const liste = alle || [];
  if (modus === 'alle') return [...liste];

  const erlaubt = new Set(modus === 'auswahl' ? erlaubteStandard.map(normal) : []);
  const gefiltert = liste.filter((name) => !istStandard(name, extra) || erlaubt.has(normal(name)));

  // Notbremse: Gibt es keine eigenen Presets (oder heißen sie nach einem
  // Resolve-Update anders), stünde hier ein leeres Aufklappmenü und niemand
  // könnte mehr ausspielen. Dann lieber die volle Liste als gar keine.
  return gefiltert.length > 0 ? gefiltert : [...liste];
}

module.exports = { STANDARD_PRESETS, MODI, istStandard, teile, sichtbare };
