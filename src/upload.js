/**
 * Ausspielen und Hochladen.
 *
 * Der Ablauf ist bewusst geradlinig: Resolve rendert **einmal** einen Master
 * in einen Zwischenordner, das Plugin lädt genau diese Datei hoch, und ob
 * daraus ORIGINAL, REMUX oder TRANSCODE wird, entscheidet Klappe. Der
 * Schnittrechner rechnet nichts doppelt.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const api = require('./api.js');
const archive = require('./archive.js');
const config = require('./config.js');
const { t } = require('./i18n.js');
const mapping = require('./mapping.js');
const overlays = require('./overlays.js');
const renders = require('./renders.js');
const resolve = require('./resolve.js');
const tus = require('./tus.js');

/** Läuft gerade ein Upload? Dann steht hier sein Abbruch-Schalter. */
let running = null;
/** Wird aufgelöst, sobald der laufende Vorgang aufgeräumt hat. */
let fertigGemeldet = null;

/* ------------------------------------------------------------- Zielauswahl */

async function projects() {
  const data = await api.get('/v1/projects');
  return Array.isArray(data) ? data : [];
}

async function videos(projectId) {
  const data = await api.get(`/v1/projects/${projectId}/videos`);
  return Array.isArray(data) ? data : [];
}

async function versions(videoId) {
  const data = await api.get(`/v1/videos/${videoId}/versions`);
  return Array.isArray(data) ? data : [];
}

/**
 * Neues Projekt anlegen. `customer` ist nicht bloß Zierde: Der Kunde geht in
 * die Download-Dateinamen ein (`260802_Kunde_Teaser_v1_1080p25.mov`) und damit
 * auch in den Namen, unter dem die Zweitablage im Projektordner landet.
 */
async function createProject(name, customer) {
  return api.post('/v1/projects', {
    name,
    ...(customer ? { customer } : {}),
  });
}

async function createVideo(projectId, name, description) {
  return api.post(`/v1/projects/${projectId}/videos`, {
    name,
    ...(description ? { description } : {}),
  });
}

/**
 * Der Katalog der KI-Arten und der globale Schalter (Server-Phase 24).
 *
 * Ist die Kennzeichnung im Workspace abgeschaltet, gehört die Auswahl gar nicht
 * in den Dialog – dieselbe Regel wie bei den internen Fassungen: erfragen statt
 * raten. Ein Gastzugang darf die Route nicht.
 */
async function aiKinds() {
  try {
    const data = await api.get('/v1/ai-kinds');
    return {
      enabled: Boolean(data?.enabled),
      kinds: Array.isArray(data?.kinds) ? data.kinds : [],
    };
  } catch (error) {
    if (error.status === 403 || error.status === 404) return { enabled: false, kinds: [] };
    throw error;
  }
}

/**
 * Endfassungs-Haken setzen.
 *
 * Beim Anlegen der Upload-Sitzung geht das nicht – `isFinal` gehört an die
 * Fassung, und die entsteht erst, wenn die Datei vollständig da ist. Also
 * hinterher.
 */
async function markiereFassung(versionId, { isFinal }) {
  return api.patch(`/v1/versions/${versionId}`, { isFinal: Boolean(isFinal) });
}

/**
 * KI-Kennzeichnung setzen. Sie hängt am **Video**, nicht an der Fassung –
 * sie gilt also für alle Fassungen, auch die schon vorhandenen. Das gehört im
 * Dialog dazugesagt.
 */
async function markiereVideo(videoId, { aiContent, aiKindIds }) {
  return api.patch(`/v1/videos/${videoId}`, {
    aiContent: Boolean(aiContent),
    aiKindIds: Array.isArray(aiKindIds) ? aiKindIds : [],
  });
}

/**
 * Die Vorgabe des Hauses für interne Fassungen (Phase 28) – abfragen statt
 * raten.
 *
 * Ein Gastzugang darf die Route nicht (sie ist fürs Team); dann verhalten wir
 * uns wie „gibt es hier nicht".
 */
async function serverVersionSettings() {
  try {
    const data = await api.get('/v1/settings/fassungen');
    return {
      internalEnabled: Boolean(data?.internalEnabled),
      internalByDefault: Boolean(data?.internalByDefault),
    };
  } catch (error) {
    if (error.status === 403 || error.status === 404) {
      return { internalEnabled: false, internalByDefault: false };
    }
    throw error;
  }
}

/**
 * Wird diese Fassung intern hochgeladen – und darf jemand das entscheiden?
 *
 * Zwei Regeln, in dieser Reihenfolge:
 *
 * 1. **Kennt der Server die interne Runde nicht, geht alles extern.** Der
 *    Schalter dafür sitzt im Server; ein Plugin, das trotzdem `internal: true`
 *    schickt, bekommt zu Recht eine Absage.
 * 2. Sonst entscheidet `internalMode`: `immer` lädt ohne Rückfrage intern hoch
 *    (die Vorgabe – so geht nichts zum Kunden, bevor jemand daraufgeschaut
 *    hat), `wahl` legt einen Haken in den Dialog.
 *
 * Rein rechnend, damit die Regel prüfbar bleibt und nicht in der Oberfläche
 * nachgebaut werden muss.
 */
function internalEntscheidung({ mode, internalEnabled, internalByDefault }) {
  if (!internalEnabled) {
    return { immerIntern: false, zeigeHaken: false, vorbelegt: false };
  }
  if (mode === 'wahl') {
    return { immerIntern: false, zeigeHaken: true, vorbelegt: Boolean(internalByDefault) };
  }
  return { immerIntern: true, zeigeHaken: false, vorbelegt: true };
}

/** Was das Panel für den Upload-Dialog wissen muss. */
async function versionSettings() {
  const vomServer = await serverVersionSettings();
  const { internalMode } = config.read();
  return {
    ...vomServer,
    mode: internalMode,
    ...internalEntscheidung({ mode: internalMode, ...vomServer }),
  };
}

/* ----------------------------------------------------------------- Rendern */

/** Ordner für den Zwischen-Master; bei Bedarf angelegt. */
function renderDir() {
  const configured = config.read().renderDir;
  const base = configured || path.join(os.tmpdir(), 'klappe-davinci');
  fs.mkdirSync(base, { recursive: true });
  return base;
}

/** Aus „Teaser Kampagne" wird „Teaser_Kampagne" – Resolve mag keine Sonderzeichen im Namen. */
function safeName(value) {
  return (
    String(value || 'Fassung')
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'Fassung'
  );
}

/**
 * Welche Datei hat Resolve gerade geschrieben? Wir kennen den Namen ohne
 * Endung – die hängt am Preset. Also: alles im Ordner, was so anfängt, und
 * davon die größte.
 */
function findRendered(dir, clipName) {
  const candidates = fs
    .readdirSync(dir)
    .filter((entry) => entry.startsWith(clipName))
    .map((entry) => {
      const full = path.join(dir, entry);
      try {
        const stat = fs.statSync(full);
        return stat.isFile() ? { path: full, size: stat.size } : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.size - a.size);

  return candidates[0] || null;
}

/* ------------------------------------------------------------ Der Vorgang */

/**
 * Rendert die aktuelle Timeline und lädt sie als Fassung hoch.
 *
 * `target` beschreibt, wohin: `{ projectId, videoId, versionNumber, replace,
 * internal, label }`. `versionNumber` darf fehlen – dann zählt Klappe selbst
 * weiter.
 */
async function run(options, onProgress = () => {}) {
  if (running) throw new api.KlappeError(t('Es läuft bereits ein Upload.'));

  const signal = { aborted: false };
  running = signal;

  // Wer auf das Ende warten will (das Schließen des Panels), braucht etwas
  // zum Abwarten – sonst bliebe der Zwischen-Master als „wird gerade benutzt"
  // stehen und die Overlay-Spur ausgeblendet.
  let fertigAufloesen = () => {};
  const fertig = new Promise((aufloesen) => {
    fertigAufloesen = aufloesen;
  });
  fertigGemeldet = fertig;

  const context = await resolve.context();
  if (!context.ok) {
    running = null;
    throw new api.KlappeError(context.reason);
  }

  const dir = renderDir();
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const clipName = `${safeName(options.clipName || context.timelineName)}_${stamp}`;

  // Ob die Fassung intern entsteht, entscheidet **hier** – nicht die
  // Oberfläche. Der Haken im Dialog ist ein Vorschlag; die Regel steht in
  // `internalEntscheidung` und gilt auch, wenn das Panel etwas anderes schickt.
  const entscheidung = await versionSettings();
  const internal = entscheidung.immerIntern
    ? true
    : entscheidung.zeigeHaken && Boolean(options.internal);

  let rendered = null;
  let session = null;
  let erfolgreich = false;
  /** Läuft die Zweitablage? Das Versprechen scheitert nie – es liefert `{ ok }`. */
  let kopie = null;
  /** Zustand der Overlay-Spur vor dem Rendern – danach wird er wiederhergestellt. */
  let overlaySpur = null;

  // Reste früherer Läufe wegräumen, bevor der nächste Master entsteht: Genau
  // hier ist der Moment, in dem der Platz gebraucht wird.
  const aufgeraeumt = renders.aufraeumen();
  if (aufgeraeumt.geloescht > 0) {
    onProgress({
      phase: 'render',
      percent: 0,
      text: t('{anzahl} alte Zwischendatei(en) weggeräumt ({platz} frei).', {
        anzahl: aufgeraeumt.geloescht,
        platz: formatBytes(aufgeraeumt.bytes),
      }),
    });
  }

  try {
    /* 0. Zeichnungen ausblenden ----------------------------------------- */
    // Die Overlay-Spur bleibt nach dem Einfügen sichtbar – sonst sähe man die
    // Zeichnungen nicht. Genau deshalb muss sie **hier** aus: Ein Kringel im
    // Master ist der Fehler, den niemand vor dem Kunden bemerkt.
    try {
      const ausgeblendet = await overlays.setVisible(false);
      if (ausgeblendet.found) {
        overlaySpur = ausgeblendet;
        onProgress({
          phase: 'render',
          percent: 0,
          text: t('Spur „{spur}" ausgeblendet – die Zeichnungen kommen nicht in den Master.', {
            spur: ausgeblendet.track,
          }),
        });
      }
    } catch {
      // Keine Timeline, keine Spur, keine Zeichnungen – dann ist auch nichts
      // auszublenden. Das darf den Upload nicht aufhalten.
    }

    /* 1. Rendern -------------------------------------------------------- */
    onProgress({ phase: 'render', percent: 0, text: t('Resolve rendert …') });

    // Resolves eigenes Verhalten ist die Vorgabe: In/Out, wenn gesetzt, sonst
    // die ganze Timeline. `wholeTimeline: true` erzwingt die ganze Timeline
    // auch dann, wenn jemand ein In/Out hat stehen lassen.
    const useRange =
      options.wholeTimeline !== true &&
      Number.isFinite(context.markIn) &&
      Number.isFinite(context.markOut) &&
      context.markOut > context.markIn;

    try {
      await resolve.renderTimeline({
        preset: options.preset,
        targetDir: dir,
        clipName,
        // Render-Einstellungen rechnen absolut (wie `GetStartFrame()`), die
        // Marker-Mathematik relativ – deshalb hier die absoluten Werte.
        markIn: useRange ? context.markInAbsolute : undefined,
        markOut: useRange ? context.markOutAbsolute : undefined,
        onProgress: (percent) =>
          onProgress({
            phase: 'render',
            percent,
            text: t('Resolve rendert … {prozent} %', { prozent: percent }),
          }),
      });
    } catch (fehler) {
      // Bei einem Abbruch hinterlässt Resolve ein angefangenes Bruchstück.
      // Das ist wertlos – aber bei UHD zweistellig groß, und niemand sieht in
      // diesen Ordner. Also gleich weg, nicht erst in 24 Stunden.
      const bruchstueck = findRendered(dir, clipName);
      if (bruchstueck) {
        try {
          fs.rmSync(bruchstueck.path, { force: true });
        } catch {
          /* Dann eben beim nächsten Lauf. */
        }
      }
      throw fehler;
    }

    rendered = findRendered(dir, clipName);
    if (!rendered) {
      throw new api.KlappeError(
        t('Im Zwischenordner liegt keine gerenderte Datei ({ordner}). Schreibt das Preset vielleicht woandershin?', {
          ordner: dir,
        }),
      );
    }
    // Ab jetzt steht die Datei im Buch: Auch wenn Resolve gleich abstürzt,
    // weiß der nächste Lauf, dass hier etwas liegt.
    renders.merken(rendered.path, { timeline: context.timelineName });

    /* 2. Sitzung eröffnen ----------------------------------------------- */
    onProgress({ phase: 'upload', percent: 0, text: t('Upload wird angemeldet …') });

    session = await tus.createVersionSession(options.videoId, {
      filename: path.basename(rendered.path),
      sizeBytes: rendered.size,
      label: options.label || '',
      fileDate: options.fileDate || '',
      versionNumber: Number.isFinite(options.versionNumber) ? options.versionNumber : undefined,
      internal,
      replace: Boolean(options.replace),
    });

    /* 2b. Zweitablage anstoßen – **gleichzeitig** mit dem Upload.
       Ein UHD-Master über ein Netzlaufwerk zu kopieren dauert so lange wie das
       Hochladen; nacheinander wäre der Schnittplatz doppelt so lange belegt. */
    if (options.archiveDir) {
      const zielname = archive.freierName(options.archiveDir, path.basename(rendered.path));
      kopie = archive
        .kopiere(rendered.path, zielname, {
          signal,
          onProgress: (uebertragen, gesamt) => {
            const percent = gesamt > 0 ? Math.floor((uebertragen / gesamt) * 100) : 0;
            onProgress({
              phase: 'kopie',
              percent,
              text: t('Zweitablage … {prozent} % ({gesendet} von {gesamt})', {
                prozent: percent,
                gesendet: formatBytes(uebertragen),
                gesamt: formatBytes(gesamt),
              }),
            });
          },
        })
        .then((ergebnis) => ({ ok: true, ...ergebnis }))
        .catch((fehler) => ({ ok: false, reason: fehler.message }));
    }

    /* 3. Übertragen ------------------------------------------------------ */
    const startedAt = Date.now();
    const { versionId } = await tus.uploadFile({
      location: session.location,
      filePath: rendered.path,
      sizeBytes: rendered.size,
      signal,
      onProgress: (sent, total) => {
        const percent = total > 0 ? Math.floor((sent / total) * 100) : 0;
        const seconds = (Date.now() - startedAt) / 1000;
        const perSecond = seconds > 0 ? sent / seconds : 0;
        onProgress({
          phase: 'upload',
          percent,
          sent,
          total,
          text: t('Hochladen … {prozent} % ({gesendet} von {gesamt}{tempo})', {
            prozent: percent,
            gesendet: formatBytes(sent),
            gesamt: formatBytes(total),
            tempo: perSecond > 0 ? `, ${formatBytes(perSecond)}/s` : '',
          }),
        });
      },
    });

    if (!versionId) {
      throw new api.KlappeError(
        t(
          'Der Server hat keine Fassungs-ID gemeldet. Die Datei ist übertragen – bitte im Browser nachsehen.',
        ),
      );
    }

    /* 4. Auf die Verarbeitung warten ------------------------------------ */
    onProgress({ phase: 'verify', percent: 0, text: t('Klappe verarbeitet die Fassung …') });
    let version = await waitForVersion(versionId, signal, (percent) =>
      onProgress({
        phase: 'verify',
        percent,
        text: t('Klappe verarbeitet die Fassung … {prozent} %', { prozent: percent }),
      }),
    );

    /* 4b. Nachträge an Fassung und Video --------------------------------
       Beides geht erst, wenn die Fassung existiert. Und beides ist Beiwerk:
       Scheitert es, ist die Fassung trotzdem oben – das gehört als Warnung
       gemeldet, nicht als gescheiterter Upload. */
    const nachtraege = [];

    if (options.isFinal) {
      try {
        // Die Antwort ist die aktualisierte Fassung – und mit ihr der neue
        // `downloadFilename`. Genau darauf wird gleich die Zweitablage
        // umbenannt.
        version = await markiereFassung(version.id, { isFinal: true });
        // Nachsehen statt annehmen: Ein `200` heißt nur, dass die Anfrage
        // durchging. Ob der Haken sitzt, steht in der Antwort – und daran
        // hängt auch der Dateiname der Zweitablage.
        if (!version?.isFinal) {
          nachtraege.push(
            t('Der Endfassungs-Haken hat nicht gegriffen – die Fassung gilt weiter als Vorschau.'),
          );
        }
      } catch (fehler) {
        nachtraege.push(t('Endfassungs-Haken nicht gesetzt: {grund}', { grund: fehler.message }));
      }
    }

    if (options.aiContent !== undefined) {
      try {
        await markiereVideo(options.videoId, {
          aiContent: options.aiContent,
          aiKindIds: options.aiKindIds,
        });
      } catch (fehler) {
        nachtraege.push(t('KI-Kennzeichnung nicht gesetzt: {grund}', { grund: fehler.message }));
      }
    }

    /* 4c. Auf die Zweitablage warten und ihr den Hausnamen geben ---------- */
    let ablage = null;
    if (kopie) {
      onProgress({ phase: 'kopie', percent: 100, text: t('Zweitablage wird abgeschlossen …') });
      ablage = await kopie;
      kopie = null;
      if (ablage.ok) {
        // Erst **jetzt** steht der Name fest: Ohne den Endfassungs-Haken hängt
        // Klappe ein `_Vorschau` an, mit ihm nicht. Vor dem Nachtrag umbenannt
        // trüge die Kopie den falschen Namen.
        ablage.path = archive.benenneUm(ablage.path, version.downloadFilename);
      }
    }

    /* 5. Sidecar schreiben ---------------------------------------------- */
    const entry = mapping.put(context.timelineId, {
      timelineName: context.timelineName,
      resolveProject: context.projectName,
      projectId: options.projectId || '',
      projectName: options.projectName || '',
      videoId: options.videoId,
      videoName: options.videoName || '',
      versionId: version.id,
      versionNumber: version.versionNumber,
      wholeTimeline: !useRange,
      renderIn: useRange ? context.markIn : 0,
      renderOut: useRange ? context.markOut : null,
      timelineStart: context.startFrame,
      frameRate: context.frameRate,
      dropFrame: context.dropFrame,
    });

    erfolgreich = true;
    return {
      version,
      entry,
      ablage,
      nachtraege,
      webUrl: version.webUrl ? `${api.baseUrl()}${version.webUrl}` : '',
      file: { path: rendered.path, size: rendered.size },
    };
  } catch (error) {
    // Eine angefangene Sitzung wegräumen, wenn wir sie nicht fortsetzen
    // wollen – ein Abbruch durch den Benutzer ist gemeint, ein Netzfehler
    // nicht: Da hilft ein zweiter Anlauf am selben Offset.
    if (session && signal.aborted) await tus.abortSession(session.location);
    throw error;
  } finally {
    running = null;

    // Erst die Kopie zu Ende bringen, dann darf die Quelle verschwinden – sonst
    // läse sie gleich aus einer Datei, die es nicht mehr gibt. Das Versprechen
    // scheitert nie, `await` ist hier also gefahrlos.
    if (kopie) {
      try {
        await kopie;
      } catch {
        /* kann nicht vorkommen, kostet aber nichts */
      }
    }

    // Die Spur wieder so hinterlassen, wie sie war – auch nach einem Abbruch.
    // (Das Auflösen von `fertig` steht am Ende dieses Blocks.)
    // Kennt diese Resolve-Fassung `GetTrackEnable` nicht, blenden wir sie
    // wieder ein: sichtbar ist der Zustand, in dem das Panel sie anlegt.
    if (overlaySpur) {
      try {
        await overlays.setVisible(overlaySpur.previous === null ? true : overlaySpur.previous);
      } catch {
        /* Wenn die Timeline inzwischen weg ist, gibt es nichts einzublenden */
      }
    }

    if (rendered) {
      if (erfolgreich && options.keepRendered !== true) {
        // Angekommen und verarbeitet – der Zwischen-Master hat seinen Zweck.
        renders.erledigt(rendered.path);
      } else {
        // Gescheitert oder abgebrochen: Die Datei **bleibt**. Sie war
        // vielleicht eine Stunde Rendern, und ein zweiter Anlauf soll sie
        // benutzen können, statt noch einmal zu rechnen. Weggeräumt wird sie
        // vom nächsten Lauf (nach 24 Stunden) oder von Hand in den
        // Einstellungen.
        renders.freigeben(rendered.path);
      }
    }

    fertigGemeldet = null;
    fertigAufloesen();
  }
}

/** Läuft gerade ein Upload? */
function laeuft() {
  return Boolean(running);
}

/** Bricht den laufenden Upload ab. */
function abort() {
  if (running) running.aborted = true;
  return Boolean(running);
}

/**
 * Abbrechen **und warten**, bis aufgeräumt ist.
 *
 * Beim Schließen des Panels ist das der Unterschied zwischen „sauber beendet"
 * und „Overlay-Spur bleibt ausgeblendet, Zwischen-Master gilt für immer als in
 * Arbeit". Die Schleife merkt den Abbruch erst an der nächsten Blockgrenze,
 * deshalb die Wartezeit – aber mit Deckel: Ein hängender Server darf das
 * Schließen nicht verhindern.
 */
async function abbrechenUndWarten(maxMs = 10_000) {
  if (!running) return false;
  running.aborted = true;

  const warten = fertigGemeldet || Promise.resolve();
  await Promise.race([warten, new Promise((weiter) => setTimeout(weiter, maxMs))]);
  return true;
}

/**
 * Auf `READY` warten. Danach steht die `webUrl` – und der Erfolgsdialog kann
 * „Im Browser öffnen" anbieten, ohne Routen zu raten.
 */
async function waitForVersion(versionId, signal, onProgress) {
  const deadline = Date.now() + 60 * 60 * 1000;

  for (;;) {
    const version = await api.get(`/v1/versions/${versionId}`);

    if (version.status === 'READY') return version;
    if (version.status === 'FAILED') {
      throw new api.KlappeError(
        t('Klappe konnte die Fassung nicht verarbeiten: {grund}', {
          grund: version.processingError || t('kein Grund genannt'),
        }),
        { code: 'verarbeitung' },
      );
    }

    if (onProgress) onProgress(Number(version.progress) || 0);

    if (signal && signal.aborted) return version;
    if (Date.now() > deadline) return version;

    await new Promise((done) => setTimeout(done, 2000));
  }
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Number(bytes) || 0;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

module.exports = {
  renderDir,
  projects,
  videos,
  versions,
  createProject,
  createVideo,
  versionSettings,
  serverVersionSettings,
  aiKinds,
  markiereFassung,
  markiereVideo,
  internalEntscheidung,
  run,
  laeuft,
  abort,
  abbrechenUndWarten,
  waitForVersion,
  formatBytes,
  safeName,
  findRendered,
};
