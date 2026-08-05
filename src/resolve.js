/**
 * Brücke zur Resolve-Scripting-API.
 *
 * Alles, was hier hineingeht, ist defensiv: Jede Resolve-Methode kann `null`
 * liefern – kein Projekt offen, keine Timeline aktiv, Spur gesperrt. Statt
 * durchzustürzen geben die Funktionen einen erklärenden Grund zurück, den das
 * Panel anzeigen kann.
 *
 * Jeder Aufruf wird `await`et. Mit `GetResolve()` kommen die Werte direkt
 * zurück und `await` tut nichts; sollte Resolve das Objekt einmal über die
 * Promise-Variante liefern, funktioniert derselbe Code weiter.
 */

const path = require('node:path');

const { t } = require('./i18n.js');

const PLUGIN_ID = 'de.klappe.davinci';
const NATIVE_MODULE = path.join(__dirname, '..', 'WorkflowIntegration.node');

let integration = null;
let resolveObj = null;
let initError = null;

/**
 * Lädt `WorkflowIntegration.node`. Das Modul gehört zur installierten
 * Resolve-Version und wird beim Installieren aus der Resolve-Installation
 * kopiert – fehlt es, ist das kein Absturz, sondern eine Installationsfrage.
 */
function loadIntegration() {
  if (integration) return integration;
  try {
    // eslint-disable-next-line import/no-dynamic-require
    integration = require(NATIVE_MODULE);
    return integration;
  } catch (error) {
    initError = new Error(
      t(
        'WorkflowIntegration.node fehlt oder passt nicht zu dieser Resolve-Version. Bitte install.sh (macOS) bzw. install.ps1 (Windows) noch einmal laufen lassen – das Modul wird dabei aus der lokalen Resolve-Installation kopiert. ({grund})',
        { grund: error.message },
      ),
    );
    return null;
  }
}

/** Das Resolve-Objekt, einmal geholt und gemerkt. `null`, wenn es nicht geht. */
async function getResolve() {
  if (resolveObj) return resolveObj;

  const module = loadIntegration();
  if (!module) return null;

  try {
    const ready = await module.Initialize(PLUGIN_ID);
    if (!ready) {
      initError = new Error(
        t(
          'Resolve hat die Verbindung zum Plugin abgelehnt. Läuft DaVinci Resolve Studio? Workflow-Panels gibt es in der kostenlosen Fassung nicht.',
        ),
      );
      return null;
    }
    resolveObj = await module.GetResolve();
    if (!resolveObj) {
      initError = new Error(t('Resolve liefert kein Projekt-Objekt zurück.'));
      return null;
    }
    initError = null;
    return resolveObj;
  } catch (error) {
    initError = new Error(t('Verbindung zu Resolve fehlgeschlagen: {grund}', { grund: error.message }));
    return null;
  }
}

/** Beim Beenden aufräumen – sonst hält Resolve die Verbindung offen. */
async function cleanup() {
  try {
    if (integration) await integration.CleanUp();
  } catch {
    /* beim Beenden ist ein Fehler hier folgenlos */
  }
  resolveObj = null;
}

function lastError() {
  return initError ? initError.message : '';
}

async function getProject() {
  const resolve = await getResolve();
  if (!resolve) return null;
  const manager = await resolve.GetProjectManager();
  if (!manager) return null;
  return (await manager.GetCurrentProject()) || null;
}

async function getTimeline() {
  const project = await getProject();
  if (!project) return null;
  return (await project.GetCurrentTimeline()) || null;
}

async function getMediaPool() {
  const project = await getProject();
  if (!project) return null;
  return (await project.GetMediaPool()) || null;
}

/**
 * Framerate der Timeline als Zahl. Resolve gibt sie als Zeichenkette
 * („25.0", „23.976") – die NTSC-Raten sind gerundete Schreibweisen, deshalb
 * rechnen wir sie in frames.js wieder auf den exakten Bruch zurück.
 */
async function timelineFrameRate(timeline, project) {
  const fromTimeline = timeline ? await timeline.GetSetting('timelineFrameRate') : null;
  if (fromTimeline) return String(fromTimeline);
  const fromProject = project ? await project.GetSetting('timelineFrameRate') : null;
  return fromProject ? String(fromProject) : '';
}

async function timelineDropFrame(timeline) {
  if (!timeline) return false;
  const value = await timeline.GetSetting('timelineDropFrameTimecode');
  return value === '1' || value === 1 || value === true;
}

/**
 * Der Zustand, den das Panel oben anzeigt: Was ist offen, welche Timeline ist
 * aktiv, wo fängt sie an, und ist ein In/Out gesetzt?
 *
 * `markIn`/`markOut` sind hier **relativ zum Timeline-Anfang** normalisiert –
 * genau die Zählweise, in der auch Kommentar-Frames und Marker gerechnet
 * werden. Resolve liefert sie je nach Version absolut; siehe unten.
 */
async function context() {
  const resolve = await getResolve();
  if (!resolve) {
    return { ok: false, reason: lastError() || t('Keine Verbindung zu Resolve.') };
  }

  const manager = await resolve.GetProjectManager();
  const project = manager ? await manager.GetCurrentProject() : null;
  if (!project) {
    return { ok: false, reason: t('In Resolve ist kein Projekt geöffnet.') };
  }

  const projectName = await project.GetName();
  const timeline = await project.GetCurrentTimeline();
  if (!timeline) {
    return {
      ok: false,
      reason: t('In Resolve ist keine Timeline aktiv.'),
      projectName,
    };
  }

  const startFrame = Number(await timeline.GetStartFrame()) || 0;
  const endFrame = Number(await timeline.GetEndFrame()) || 0;
  const frameRate = await timelineFrameRate(timeline, project);
  const dropFrame = await timelineDropFrame(timeline);

  // In/Out zweimal: **relativ** zum Timeline-Anfang für die Frame-Mathematik
  // (Marker zählen so) und **absolut** für `SetRenderSettings`, das wie
  // `GetStartFrame()` in absoluten Timeline-Frames rechnet. Die beiden
  // Zählweisen zu verwechseln kostet genau eine Stunde Versatz.
  let markIn = null;
  let markOut = null;
  let markInAbsolute = null;
  let markOutAbsolute = null;
  try {
    const marks = await timeline.GetMarkInOut();
    if (marks && marks.video && Number.isFinite(Number(marks.video.in))) {
      markIn = toRelativeFrame(Number(marks.video.in), startFrame);
      markOut = toRelativeFrame(Number(marks.video.out), startFrame);
      markInAbsolute = markIn + startFrame;
      markOutAbsolute = markOut + startFrame;
    }
  } catch {
    // GetMarkInOut gibt es erst ab Resolve 18.5. Ohne die Methode gilt
    // „ganze Timeline" – das ist auch Resolves eigenes Standardverhalten.
  }

  const masse = await ausgabeAufloesung(project);

  return {
    ok: true,
    projectName,
    timelineName: await timeline.GetName(),
    timelineId: await timeline.GetUniqueId(),
    width: masse.width,
    height: masse.height,
    startFrame,
    endFrame,
    frameCount: Math.max(0, endFrame - startFrame),
    frameRate,
    dropFrame,
    markIn,
    markOut,
    markInAbsolute,
    markOutAbsolute,
    currentTimecode: await timeline.GetCurrentTimecode(),
  };
}

/**
 * Wie groß ist das Bild, das herauskommt? Für den Dateinamen (`1080p25`).
 *
 * Resolve kennt zwei Maße: die Auflösung, in der geschnitten wird, und die
 * Ausgabe-Auflösung unter *Image Scaling*. Wo beide gesetzt sind, gilt die
 * zweite – deshalb wird sie zuerst gefragt.
 *
 * Was hier **nicht** hineinragt: Ein Render-Preset kann eine eigene Auflösung
 * mitbringen und die Ausgabe skalieren. Das steht in keiner Projekteinstellung
 * und ist über die Scripting-API nicht abzufragen. Deshalb wird der Name nach
 * dem Upload gegen den Download-Namen aus Klappe gehalten (der stammt aus der
 * fertig verarbeiteten Datei) und ein Unterschied gemeldet, statt ihn zu
 * verschweigen.
 */
async function ausgabeAufloesung(project) {
  const paare = [
    ['timelineOutputResolutionWidth', 'timelineOutputResolutionHeight'],
    ['timelineResolutionWidth', 'timelineResolutionHeight'],
  ];

  for (const [breiteSchluessel, hoeheSchluessel] of paare) {
    try {
      const breite = Number(await project.GetSetting(breiteSchluessel));
      const hoehe = Number(await project.GetSetting(hoeheSchluessel));
      if (Number.isFinite(breite) && Number.isFinite(hoehe) && breite > 0 && hoehe > 0) {
        return { width: breite, height: hoehe };
      }
    } catch {
      /* Kennt diese Fassung die Einstellung nicht, fragen wir die nächste. */
    }
  }

  return { width: null, height: null };
}

/**
 * Resolve zählt Marker und Mark-In/Out nicht überall gleich: Marker sitzen auf
 * Frames **ab Timeline-Anfang** (0 = erstes Bild), `GetMarkInOut()` liefert je
 * nach Version absolute Frames (also inklusive des Start-Timecodes).
 *
 * Eine Timeline beginnt üblicherweise bei 01:00:00:00, also weit oberhalb
 * jedes plausiblen relativen Wertes – daran lassen sich die beiden Fälle
 * auseinanderhalten. Bei einer Timeline ab 00:00:00:00 sind sie ohnehin
 * identisch.
 */
function toRelativeFrame(value, startFrame) {
  if (!Number.isFinite(value)) return null;
  if (startFrame > 0 && value >= startFrame) return value - startFrame;
  return value;
}

/* ------------------------------------------------------------------ Marker */

/**
 * Alle Marker der aktuellen Timeline als Liste.
 * Resolve gibt ein Objekt `{ frame: { color, duration, note, name, customData } }`.
 */
async function getMarkers(timeline) {
  const target = timeline || (await getTimeline());
  if (!target) return [];
  const markers = await target.GetMarkers();
  if (!markers) return [];
  return Object.entries(markers).map(([frame, marker]) => ({
    frame: Number(frame),
    color: marker.color,
    name: marker.name,
    note: marker.note,
    duration: Number(marker.duration) || 1,
    customData: marker.customData || '',
  }));
}

async function addMarker(timeline, { frame, color, name, note, duration = 1, customData = '' }) {
  const target = timeline || (await getTimeline());
  if (!target) return false;
  return Boolean(await target.AddMarker(frame, color, name, note, duration, customData));
}

async function deleteMarkerAtFrame(timeline, frame) {
  const target = timeline || (await getTimeline());
  if (!target) return false;
  return Boolean(await target.DeleteMarkerAtFrame(frame));
}

/* ------------------------------------------------------------------ Rendern */

/**
 * Die Preset-Liste, wie sie im Deliver-Reiter steht – System- und eigene
 * Presets. `GetRenderPresetList()` gibt es seit Resolve 18; ältere Fassungen
 * kennen nur `GetRenderPresets()`, das ein Objekt liefert.
 */
async function renderPresets() {
  const project = await getProject();
  if (!project) return [];

  if (typeof project.GetRenderPresetList === 'function') {
    const list = await project.GetRenderPresetList();
    if (Array.isArray(list)) return list.map(String);
  }

  const legacy = await project.GetRenderPresets();
  if (!legacy) return [];
  return Object.values(legacy).map(String);
}

/**
 * Rendert die aktuelle Timeline in einen Zielordner und wartet, bis Resolve
 * fertig ist. Gibt den Auftragsstatus zurück; die entstandene Datei sucht der
 * Aufrufer im Zielordner (Resolve hängt je nach Preset eine Endung an).
 */
async function renderTimeline({ preset, targetDir, clipName, markIn, markOut, onProgress }) {
  const project = await getProject();
  if (!project) throw new Error(t('In Resolve ist kein Projekt geöffnet.'));

  const timeline = await project.GetCurrentTimeline();
  if (!timeline) throw new Error(t('In Resolve ist keine Timeline aktiv.'));

  if (!(await project.LoadRenderPreset(preset))) {
    throw new Error(t('Das Render-Preset „{preset}" ließ sich nicht laden.', { preset }));
  }

  const settings = {
    TargetDir: targetDir,
    CustomName: clipName,
    // Ein Auftrag, eine Datei: „Single clip" ist die Voraussetzung dafür, dass
    // am Ende genau ein Master im Zielordner liegt.
    ExportVideo: true,
    ExportAudio: true,
  };

  // Render-Range: Resolves eigenes Verhalten übernehmen – In/Out, wenn gesetzt,
  // sonst die ganze Timeline.
  if (Number.isFinite(markIn) && Number.isFinite(markOut) && markOut > markIn) {
    settings.SelectAllFrames = false;
    settings.MarkIn = markIn;
    settings.MarkOut = markOut;
  } else {
    settings.SelectAllFrames = true;
  }

  if (!(await project.SetRenderSettings(settings))) {
    throw new Error(t('Die Render-Einstellungen ließen sich nicht setzen.'));
  }

  const jobId = await project.AddRenderJob();
  if (!jobId) throw new Error(t('Resolve hat keinen Render-Auftrag angelegt.'));

  if (!(await project.StartRendering(jobId))) {
    await project.DeleteRenderJob(jobId);
    throw new Error(t('Resolve hat das Rendern nicht gestartet.'));
  }

  // Auf das Ende warten. Resolve meldet den Fortschritt am Auftrag; wir fragen
  // im Sekundentakt nach – öfter bringt nichts und kostet nur Aufrufe.
  let status = null;
  for (;;) {
    await new Promise((done) => setTimeout(done, 1000));
    status = await project.GetRenderJobStatus(jobId);
    const state = status ? String(status.JobStatus || '') : '';
    if (onProgress && status) onProgress(Number(status.CompletionPercentage) || 0, state);
    if (state === 'Complete' || state === 'Failed' || state === 'Cancelled') break;
    if (!state && !(await project.IsRenderingInProgress())) break;
  }

  const state = status ? String(status.JobStatus || '') : '';
  await project.DeleteRenderJob(jobId);

  if (state !== 'Complete') {
    throw new Error(
      state === 'Cancelled'
        ? t('Das Rendern wurde in Resolve abgebrochen.')
        : t('Das Rendern ist fehlgeschlagen ({stand}).', {
            stand: state || t('unbekannter Status'),
          }),
    );
  }

  return { jobId, status: state };
}

/* ------------------------------------------------------- Spuren und Clips */

const VIDEO = 'video';

async function trackNames(timeline) {
  const target = timeline || (await getTimeline());
  if (!target) return [];
  const count = Number(await target.GetTrackCount(VIDEO)) || 0;
  const names = [];
  for (let index = 1; index <= count; index += 1) {
    names.push({ index, name: String((await target.GetTrackName(VIDEO, index)) || '') });
  }
  return names;
}

/** Findet die Spur mit diesem Namen – oder `null`. */
async function findTrack(timeline, name) {
  const names = await trackNames(timeline);
  return names.find((track) => track.name === name) || null;
}

/**
 * Sorgt für eine oberste Videospur mit diesem Namen. Gibt es sie schon, wird
 * sie benutzt; sonst wird eine neue angelegt – neue Videospuren landen bei
 * Resolve immer oben.
 */
async function ensureTopTrack(timeline, name) {
  const target = timeline || (await getTimeline());
  if (!target) return null;

  const existing = await findTrack(target, name);
  if (existing) return existing;

  if (!(await target.AddTrack(VIDEO))) return null;

  const index = Number(await target.GetTrackCount(VIDEO)) || 0;
  if (index <= 0) return null;
  await target.SetTrackName(VIDEO, index, name);
  return { index, name };
}

async function setTrackLock(timeline, index, locked) {
  const target = timeline || (await getTimeline());
  if (!target) return false;
  return Boolean(await target.SetTrackLock(VIDEO, index, locked));
}

async function setTrackEnable(timeline, index, enabled) {
  const target = timeline || (await getTimeline());
  if (!target) return false;
  return Boolean(await target.SetTrackEnable(VIDEO, index, enabled));
}

/**
 * Ist die Spur gerade eingeschaltet? `null`, wenn diese Resolve-Fassung die
 * Frage nicht beantwortet – dann muss der Aufrufer ohne die Antwort auskommen,
 * statt sich eine auszudenken.
 */
async function getTrackEnable(timeline, index) {
  const target = timeline || (await getTimeline());
  if (!target) return null;
  try {
    const wert = await target.GetTrackEnable(VIDEO, index);
    return typeof wert === 'boolean' ? wert : null;
  } catch {
    return null;
  }
}

async function itemsInTrack(timeline, index) {
  const target = timeline || (await getTimeline());
  if (!target) return [];
  const items = await target.GetItemListInTrack(VIDEO, index);
  return Array.isArray(items) ? items : [];
}

async function deleteTrack(timeline, index) {
  const target = timeline || (await getTimeline());
  if (!target) return false;
  return Boolean(await target.DeleteTrack(VIDEO, index));
}

async function deleteClips(timeline, items) {
  const target = timeline || (await getTimeline());
  if (!target || !items.length) return false;
  return Boolean(await target.DeleteClips(items, false));
}

/** Setzt den Playhead. Timecode als `HH:MM:SS:FF` bzw. `HH:MM:SS;FF`. */
async function setCurrentTimecode(timecode) {
  const timeline = await getTimeline();
  if (!timeline) return false;
  return Boolean(await timeline.SetCurrentTimecode(timecode));
}

module.exports = {
  PLUGIN_ID,
  getResolve,
  getProject,
  getTimeline,
  getMediaPool,
  cleanup,
  lastError,
  context,
  toRelativeFrame,
  getMarkers,
  addMarker,
  deleteMarkerAtFrame,
  renderPresets,
  renderTimeline,
  trackNames,
  findTrack,
  ensureTopTrack,
  setTrackLock,
  setTrackEnable,
  getTrackEnable,
  itemsInTrack,
  deleteTrack,
  deleteClips,
  setCurrentTimecode,
};
