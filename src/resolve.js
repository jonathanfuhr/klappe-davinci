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

const frames = require('./frames.js');
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

  // In/Out dreimal: **relativ** zum Timeline-Anfang für die Frame-Mathematik
  // (Marker zählen so), **absolut** als einer der Kandidaten für den
  // Render-Bereich – und **roh**, also genau so, wie Resolve es gemeldet hat.
  //
  // Die rohen Zahlen sind neu und der eigentliche Punkt: Welche Zählweise
  // `SetRenderSettings` für MarkIn/MarkOut erwartet, steht nirgends. Vorher
  // wurde hier auf absolut umgerechnet und das für sicher gehalten – bei einer
  // Timeline ab 01:00:00:00 lag der Wert damit eine Stunde daneben, Resolve
  // verwarf ihn stillschweigend und spielte die ganze Timeline aus.
  let markIn = null;
  let markOut = null;
  let markInAbsolute = null;
  let markOutAbsolute = null;
  // Die **rohen** Zahlen kommen mit: Für `SetRenderSettings` ist nicht
  // dokumentiert, in welcher Zählweise es MarkIn/MarkOut erwartet, und die
  // unveränderte Antwort von `GetMarkInOut()` ist der beste erste Versuch.
  let markInRaw = null;
  let markOutRaw = null;
  // Warum es keinen Bereich gibt, ist eine Auskunft wert: „nicht gesetzt" und
  // „diese Resolve-Fassung kennt die Methode nicht" sehen im Panel sonst
  // gleich aus – nämlich wie „die ganze Timeline wird ausgespielt".
  let markInOutQuelle = 'keine-methode';
  try {
    const marks = await timeline.GetMarkInOut();
    markInOutQuelle = 'nicht-gesetzt';
    if (marks && marks.video && Number.isFinite(Number(marks.video.in))) {
      markInRaw = Number(marks.video.in);
      markOutRaw = Number(marks.video.out);
      markIn = toRelativeFrame(markInRaw, startFrame);
      markOut = toRelativeFrame(markOutRaw, startFrame);
      markInAbsolute = markIn + startFrame;
      markOutAbsolute = markOut + startFrame;
      markInOutQuelle = 'gesetzt';
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
    markInRaw,
    markOutRaw,
    markInOutQuelle,
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
/**
 * Welchen Bereich hat Resolve dem Auftrag wirklich mitgegeben?
 *
 * `GetRenderJobList()` liefert die Aufträge als Wörterbücher; welche Schlüssel
 * darin stehen, ist nicht dokumentiert. Deshalb wird defensiv gesucht und
 * `null` zurückgegeben, wenn nichts Verwertbares dabei ist – dann lässt sich
 * eben nichts nachprüfen, und das ist eine Auskunft für sich.
 */
async function auftragsBereich(project, jobId) {
  try {
    const auftraege = await project.GetRenderJobList();
    if (!Array.isArray(auftraege) || auftraege.length === 0) return null;

    const treffer =
      auftraege.find(
        (auftrag) => String(auftrag?.JobId ?? auftrag?.jobId ?? auftrag?.id ?? '') === String(jobId),
      ) || auftraege[auftraege.length - 1];

    const von = Number(treffer?.MarkIn);
    const bis = Number(treffer?.MarkOut);
    if (!Number.isFinite(von) || !Number.isFinite(bis)) return null;
    return { von, bis };
  } catch {
    return null;
  }
}

/**
 * Welche Zählweise `SetRenderSettings` für MarkIn/MarkOut erwartet, hat sich
 * einmal herausgestellt – dann gilt sie für diese Sitzung.
 */
let gemerkteBereichsart = null;

/**
 * Einen Render-Auftrag anlegen und nachsehen, ob der Bereich angekommen ist.
 *
 * Das ist der Kern der Sache: `AddRenderJob()` liefert eine ID, auch wenn
 * Resolve MarkIn/MarkOut verworfen hat – ein Rückgabewert allein beweist hier
 * nichts. Gefragt wird deshalb der Auftrag selbst.
 */
async function auftragMitBereich(project, basis, kandidat) {
  const gesetzt = await project.SetRenderSettings({
    ...basis,
    SelectAllFrames: false,
    MarkIn: kandidat.von,
    MarkOut: kandidat.bis,
  });
  if (!gesetzt) return { ok: false, grund: t('Resolve hat die Einstellungen abgelehnt.') };

  const jobId = await project.AddRenderJob();
  if (!jobId) return { ok: false, grund: t('Resolve hat keinen Auftrag angelegt.') };

  const gemeldet = await auftragsBereich(project, jobId);
  if (!gemeldet) {
    // Diese Resolve-Fassung nennt den Bereich nicht. Weiterrechnen mit dem
    // ersten Kandidaten ist besser als gar nicht auszuspielen – aber es steht
    // hinterher als „ungeprüft" im Ergebnis.
    return { ok: true, jobId, geprueft: false };
  }
  if (gemeldet.von === kandidat.von && gemeldet.bis === kandidat.bis) {
    return { ok: true, jobId, geprueft: true };
  }

  await project.DeleteRenderJob(jobId);
  return {
    ok: false,
    grund: t('Resolve meldet {von}–{bis} statt {sollVon}–{sollBis}.', {
      von: gemeldet.von,
      bis: gemeldet.bis,
      sollVon: kandidat.von,
      sollBis: kandidat.bis,
    }),
  };
}

/**
 * Alle Timelines des offenen Projekts – für den Stapel-Export.
 *
 * `GetMarkInOut()` lässt sich an **jeder** Timeline fragen, nicht nur an der
 * aktiven. Das ist der Grund, warum ein Stapel überhaupt sinnvoll ist: Jede
 * Timeline bringt ihren eigenen Bereich mit, und man muss nicht zehnmal
 * umschalten, um zu sehen, was ausgespielt würde.
 */
async function timelines() {
  const project = await getProject();
  if (!project) return { ok: false, reason: t('In Resolve ist kein Projekt geöffnet.') };

  const anzahl = Number(await project.GetTimelineCount()) || 0;
  const aktuell = await project.GetCurrentTimeline();
  const aktuellId = aktuell ? await aktuell.GetUniqueId() : '';

  const liste = [];
  for (let index = 1; index <= anzahl; index += 1) {
    const timeline = await project.GetTimelineByIndex(index);
    if (!timeline) continue;

    const startFrame = Number(await timeline.GetStartFrame()) || 0;
    const endFrame = Number(await timeline.GetEndFrame()) || 0;

    let markIn = null;
    let markOut = null;
    try {
      const marks = await timeline.GetMarkInOut();
      if (marks && marks.video && Number.isFinite(Number(marks.video.in))) {
        markIn = toRelativeFrame(Number(marks.video.in), startFrame);
        markOut = toRelativeFrame(Number(marks.video.out), startFrame);
      }
    } catch {
      /* Kennt diese Fassung die Methode nicht, gilt die ganze Timeline. */
    }

    liste.push({
      index,
      name: await timeline.GetName(),
      id: await timeline.GetUniqueId(),
      startFrame,
      endFrame,
      frameCount: Math.max(0, endFrame - startFrame),
      markIn,
      markOut,
    });
  }

  return { ok: true, projectName: await project.GetName(), aktuellId, timelines: liste };
}

/**
 * Eine Timeline zur aktiven machen – der Schritt, auf dem der Stapel beruht.
 *
 * Gesucht wird über die eindeutige ID und nicht über den Namen: In einem
 * Projekt dürfen zwei Timelines gleich heißen, und dann wäre der Stapel ein
 * Glücksspiel.
 */
async function aktiviereTimeline(id) {
  const project = await getProject();
  if (!project) throw new Error(t('In Resolve ist kein Projekt geöffnet.'));

  const anzahl = Number(await project.GetTimelineCount()) || 0;
  for (let index = 1; index <= anzahl; index += 1) {
    const timeline = await project.GetTimelineByIndex(index);
    if (!timeline) continue;
    if (String(await timeline.GetUniqueId()) !== String(id)) continue;
    return Boolean(await project.SetCurrentTimeline(timeline));
  }
  return false;
}

/**
 * Was sagt Resolve wirklich über den Bereich?
 *
 * Zwei Anläufe haben den In/Out-Export nicht zum Laufen gebracht, und ohne
 * Resolve kann ich nur Vermutungen anstellen. Also sammelt das Panel die
 * Fakten selbst ein – ohne zu rendern:
 *
 * 1. Was `GetMarkInOut()` **wörtlich** zurückgibt, samt Typ. Daran hängt
 *    alles: Kommt hier nichts an, ist jede weitere Umrechnung sinnlos.
 * 2. Die Grenzen der Timeline, damit die Zahlen einzuordnen sind.
 * 3. Für jeden Kandidaten: einen Render-Auftrag anlegen, ihn **vollständig**
 *    zurücklesen und wieder löschen. Der Auftrag ist die einzige Stelle, an
 *    der Resolve verrät, was es von den Einstellungen übernommen hat.
 *
 * Angelegt und gleich wieder gelöscht wird nur in der Warteschlange –
 * gerendert wird nichts.
 *
 * Der Bericht bleibt **deutsch und unübersetzt**: Er ist zum Kopieren und
 * Weitergeben gedacht, nicht zum Lesen im Alltag – wie die Installer, die auch
 * deutsch bleiben. Die handlungsfähige Zusammenfassung daraus steht im Panel.
 */
async function bereichsDiagnose({ preset } = {}) {
  const bericht = { zeilen: [], auftragsSchluessel: [], versuche: [] };
  const sag = (text) => bericht.zeilen.push(text);

  const project = await getProject();
  if (!project) return { ok: false, reason: t('In Resolve ist kein Projekt geöffnet.') };
  const timeline = await project.GetCurrentTimeline();
  if (!timeline) return { ok: false, reason: t('In Resolve ist keine Timeline aktiv.') };

  sag(`Projekt: ${await project.GetName()}`);
  sag(`Timeline: ${await timeline.GetName()}`);

  const startFrame = Number(await timeline.GetStartFrame()) || 0;
  const endFrame = Number(await timeline.GetEndFrame()) || 0;
  sag(`GetStartFrame(): ${startFrame}`);
  sag(`GetEndFrame(): ${endFrame}`);
  sag(`Länge: ${Math.max(0, endFrame - startFrame)} Frames`);

  // Wörtlich, nicht gedeutet: Der Typ gehört dazu, weil die Brücke zu Resolve
  // ein Wörterbuch auch als etwas anderes als ein einfaches Objekt liefern
  // könnte – und dann greift `marks.video` ins Leere.
  let marks = null;
  try {
    marks = await timeline.GetMarkInOut();
    sag(`GetMarkInOut() Typ: ${Object.prototype.toString.call(marks)}`);
    sag(`GetMarkInOut() wörtlich: ${JSON.stringify(marks)}`);
    sag(`GetMarkInOut() Schlüssel: ${marks && typeof marks === 'object' ? Object.keys(marks).join(', ') || '(keine)' : '(kein Objekt)'}`);
  } catch (fehler) {
    sag(`GetMarkInOut() wirft: ${fehler.message}`);
  }

  const rohVon = Number(marks?.video?.in);
  const rohBis = Number(marks?.video?.out);
  if (!Number.isFinite(rohVon) || !Number.isFinite(rohBis)) {
    sag('→ Kein brauchbares In/Out. Damit kann das Plugin keinen Bereich setzen.');
    return { ok: true, ...bericht };
  }

  const relativVon = toRelativeFrame(rohVon, startFrame);
  const relativBis = toRelativeFrame(rohBis, startFrame);
  sag(`Gelesen: roh ${rohVon}–${rohBis}, relativ ${relativVon}–${relativBis}`);

  if (!preset) {
    sag('→ Ohne Render-Preset lässt sich der Rest nicht prüfen.');
    return { ok: true, ...bericht };
  }
  if (!(await project.LoadRenderPreset(preset))) {
    sag(`→ Preset „${preset}" ließ sich nicht laden.`);
    return { ok: true, ...bericht };
  }
  sag(`Preset geladen: ${preset}`);

  const kandidaten = frames.renderBereichKandidaten({
    rohVon,
    rohBis,
    relativVon,
    relativBis,
    startFrame,
  });

  // Erst die Nullmessung: ein Auftrag **nur** aus dem Preset, ohne dass wir
  // etwas setzen. Meldet der schon die ganze Timeline, trägt das Preset selbst
  // „Entire Timeline" – dann kämpft unser `SelectAllFrames: false` gegen die
  // gespeicherte Einstellung, und das wäre die Erklärung für alles.
  kandidaten.unshift({ art: 'nur Preset', von: null, bis: null });

  for (const kandidat of kandidaten) {
    const nullmessung = kandidat.von === null;
    const versuch = {
      art: kandidat.art,
      gesetzt: nullmessung ? '(nichts)' : `${kandidat.von}–${kandidat.bis}`,
    };
    let jobId = null;
    try {
      versuch.settingsOk = nullmessung
        ? true
        : Boolean(
            await project.SetRenderSettings({
              SelectAllFrames: false,
              MarkIn: kandidat.von,
              MarkOut: kandidat.bis,
            }),
          );
      jobId = await project.AddRenderJob();
      versuch.jobId = jobId || '(keiner)';

      const auftraege = await project.GetRenderJobList();
      const auftrag = Array.isArray(auftraege) ? auftraege[auftraege.length - 1] : null;
      if (auftrag && typeof auftrag === 'object') {
        if (bericht.auftragsSchluessel.length === 0) {
          bericht.auftragsSchluessel = Object.keys(auftrag);
        }
        versuch.gemeldet = `${auftrag.MarkIn ?? '(fehlt)'}–${auftrag.MarkOut ?? '(fehlt)'}`;
        // Wie der Auftrag selbst über den Bereich denkt – der Schlüsselname ist
        // nicht dokumentiert, deshalb werden mehrere Schreibweisen abgefragt.
        versuch.alleFrames = String(
          auftrag.SelectAllFrames ?? auftrag.IsSelectAllFrames ?? '(fehlt)',
        );
      } else {
        versuch.gemeldet = '(kein Auftrag zurückgelesen)';
      }
    } catch (fehler) {
      versuch.fehler = fehler.message;
    } finally {
      if (jobId) {
        try {
          await project.DeleteRenderJob(jobId);
        } catch {
          /* Dann bleibt der Auftrag in der Warteschlange stehen – harmlos. */
        }
      }
    }
    bericht.versuche.push(versuch);
  }

  return { ok: true, ...bericht };
}

/**
 * Timeline ausspielen.
 *
 * `bereich` ist `{ kandidaten: [{ art, von, bis }] }` – die möglichen
 * Zählweisen für MarkIn/MarkOut, in der Reihenfolge, in der sie probiert
 * werden sollen (siehe `frames.renderBereichKandidaten`). Fehlt `bereich`,
 * wird die ganze Timeline ausgespielt.
 */
async function renderTimeline({ preset, targetDir, clipName, bereich, onProgress }) {
  const project = await getProject();
  if (!project) throw new Error(t('In Resolve ist kein Projekt geöffnet.'));

  const timeline = await project.GetCurrentTimeline();
  if (!timeline) throw new Error(t('In Resolve ist keine Timeline aktiv.'));

  if (!(await project.LoadRenderPreset(preset))) {
    throw new Error(t('Das Render-Preset „{preset}" ließ sich nicht laden.', { preset }));
  }

  const basis = {
    TargetDir: targetDir,
    CustomName: clipName,
    // Ein Auftrag, eine Datei: „Single clip" ist die Voraussetzung dafür, dass
    // am Ende genau ein Master im Zielordner liegt.
    ExportVideo: true,
    ExportAudio: true,
  };

  let jobId = null;
  let benutzterBereich = null;

  if (bereich && bereich.kandidaten && bereich.kandidaten.length > 0) {
    // Was sich schon einmal bewährt hat, zuerst – der Rest bleibt als Rückfall
    // stehen, falls jemand die Resolve-Fassung wechselt.
    const kandidaten = [...bereich.kandidaten].sort((a, b) =>
      a.art === gemerkteBereichsart ? -1 : b.art === gemerkteBereichsart ? 1 : 0,
    );

    const gescheitert = [];
    for (const kandidat of kandidaten) {
      const versuch = await auftragMitBereich(project, basis, kandidat);
      if (versuch.ok) {
        jobId = versuch.jobId;
        benutzterBereich = { ...kandidat, geprueft: versuch.geprueft };
        gemerkteBereichsart = kandidat.art;
        break;
      }
      gescheitert.push(`${kandidat.von}–${kandidat.bis}: ${versuch.grund}`);
    }

    if (!jobId) {
      // Lieber gar nicht ausspielen als die ganze Timeline: Ein Master, der
      // fünf Minuten statt dreißig Sekunden lang ist, fällt erst auf, wenn er
      // als Fassung in Klappe steht.
      throw new Error(
        t('Der In/Out-Bereich ließ sich nicht setzen – es wurde nichts ausgespielt. {details}', {
          details: gescheitert.join(' · '),
        }),
      );
    }
  } else {
    if (!(await project.SetRenderSettings({ ...basis, SelectAllFrames: true }))) {
      throw new Error(t('Die Render-Einstellungen ließen sich nicht setzen.'));
    }
    jobId = await project.AddRenderJob();
    if (!jobId) throw new Error(t('Resolve hat keinen Render-Auftrag angelegt.'));
  }

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

  return { jobId, status: state, bereich: benutzterBereich };
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
  bereichsDiagnose,
  timelines,
  aktiviereTimeline,
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
