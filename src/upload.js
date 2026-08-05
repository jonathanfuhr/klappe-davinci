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
const dateiname = require('./dateiname.js');
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

/** Ein Datum als `JJJJ-MM-TT`, in Ortszeit – nicht UTC: Ein Upload um 23:30 gehört zu heute. */
function alsIsoDatum(datum) {
  const zwei = (wert) => String(wert).padStart(2, '0');
  return `${datum.getFullYear()}-${zwei(datum.getMonth() + 1)}-${zwei(datum.getDate())}`;
}

/**
 * Welche Datei hat Resolve gerade geschrieben?
 *
 * Jeder Lauf rendert in einen **eigenen** Unterordner, deshalb ist die Antwort
 * einfach: die größte Datei darin. Früher wurde nach dem Namensanfang gesucht;
 * seit der Master seinen richtigen Namen trägt, wäre das zweimal riskant –
 * zwei Läufe am selben Tag hießen gleich, und ob Resolve den `CustomName`
 * unverändert übernimmt, wissen wir nicht sicher. Ein Ordner je Lauf beantwortet
 * beides, ohne etwas anzunehmen.
 */
function findRendered(dir) {
  const candidates = fs
    .readdirSync(dir)
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

  // Weder hoch noch hierher: Dann entstünde ein Master, den gleich darauf
  // niemand mehr hat. Das ist kein Vorgang, das ist ein Missverständnis.
  if (options.upload === false && !options.archiveDir) {
    throw new api.KlappeError(
      t('Ohne Upload und ohne lokale Ablage bliebe vom Rendern nichts übrig.'),
    );
  }

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

  // Ein eigener Unterordner je Lauf: Der Master trägt jetzt seinen richtigen
  // Namen, und der ist – anders als der alte Zeitstempel – nicht eindeutig.
  const jetzt = new Date();
  const stamp = jetzt.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const dir = path.join(renderDir(), stamp);
  fs.mkdirSync(dir, { recursive: true });

  // Der Name entsteht **hier und vor dem Rendern**: Resolve schreibt die Datei
  // gleich richtig, und von dort geht sie unverändert beide Wege. Nichts daran
  // hängt an einer Antwort des Servers – der Timeline-Name ist ein Arbeitsname
  // und hat im Projektordner des Kunden nichts zu suchen.
  const nummerImNamen = Number.isFinite(options.versionNumber)
    ? options.versionNumber
    : options.nextVersionNumber;
  const clipName = dateiname.basisName({
    datum: dateiname.dateiDatum(jetzt),
    kunde: options.customer || null,
    projektName: options.projectName || context.projectName,
    videoName: options.videoName || context.timelineName,
    nummer: nummerImNamen,
    istEndfassung: Boolean(options.isFinal),
    aufloesung: dateiname.aufloesung(context.width, context.height, context.frameRate),
  });

  // Ob die Fassung intern entsteht, entscheidet **hier** – nicht die
  // Oberfläche. Der Haken im Dialog ist ein Vorschlag; die Regel steht in
  // `internalEntscheidung` und gilt auch, wenn das Panel etwas anderes schickt.
  const laedtHoch = options.upload !== false;
  const entscheidung = laedtHoch ? await versionSettings() : { immerIntern: false, zeigeHaken: false };
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
      const bruchstueck = findRendered(dir);
      if (bruchstueck) {
        try {
          fs.rmSync(bruchstueck.path, { force: true });
        } catch {
          /* Dann eben beim nächsten Lauf. */
        }
      }
      throw fehler;
    }

    rendered = findRendered(dir);
    if (!rendered) {
      throw new api.KlappeError(
        t('Im Zwischenordner liegt keine gerenderte Datei ({ordner}). Schreibt das Preset vielleicht woandershin?', {
          ordner: dir,
        }),
      );
    }
    // Ab jetzt steht die Datei im Buch: Auch wenn Resolve gleich abstürzt,
    // weiß der nächste Lauf, dass hier etwas liegt.
    renders.merken(rendered.path, { timeline: context.timelineName, eigenerOrdner: true });

    /* 2. Sitzung eröffnen ----------------------------------------------- */
    if (laedtHoch) {
      onProgress({ phase: 'upload', percent: 0, text: t('Upload wird angemeldet …') });

      session = await tus.createVersionSession(options.videoId, {
        filename: path.basename(rendered.path),
        sizeBytes: rendered.size,
        label: options.label || '',
        // Ohne Angabe sucht sich der Server ein Datum – mit Angabe steht in
        // beiden Namen dasselbe, und zwar der Tag des Ausspielens.
        fileDate: options.fileDate || alsIsoDatum(jetzt),
        versionNumber: Number.isFinite(options.versionNumber) ? options.versionNumber : undefined,
        internal,
        replace: Boolean(options.replace),
      });
    }

    /* 2b. Zweitablage anstoßen – **gleichzeitig** mit dem Upload.
       Ein UHD-Master über ein Netzlaufwerk zu kopieren dauert so lange wie das
       Hochladen; nacheinander wäre der Schnittplatz doppelt so lange belegt. */
    if (options.archiveDir) {
      // Der Name steht seit dem Rendern fest – hier wird nur noch kopiert.
      // Ein belegter Name bekommt eine Nummer; überschrieben wird nie.
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
    /* Ab hier gilt: Ohne Upload gibt es keine Fassung – und ohne Fassung
       nichts nachzutragen, nichts zu verknüpfen und nichts zu verlinken. Der
       Master ist dann trotzdem entstanden und liegt in der Zweitablage. */
    const nachtraege = [];
    let version = null;
    let entry = null;

    if (laedtHoch) {
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

      /* 4. Auf die Verarbeitung warten ---------------------------------- */
      onProgress({ phase: 'verify', percent: 0, text: t('Klappe verarbeitet die Fassung …') });
      version = await waitForVersion(versionId, signal, (percent) =>
        onProgress({
          phase: 'verify',
          percent,
          text: t('Klappe verarbeitet die Fassung … {prozent} %', { prozent: percent }),
        }),
      );

      /* 4b. Nachträge an Fassung und Video ------------------------------
         Beides geht erst, wenn die Fassung existiert. Und beides ist Beiwerk:
         Scheitert es, ist die Fassung trotzdem oben – das gehört als Warnung
         gemeldet, nicht als gescheiterter Upload. */
      if (options.isFinal) {
        try {
          version = await markiereFassung(version.id, { isFinal: true });
          // Nachsehen statt annehmen: Ein `200` heißt nur, dass die Anfrage
          // durchging. Betroffen ist nur die Fassung in Klappe – die Datei
          // trägt den Haken ohnehin schon im Namen.
          if (!version?.isFinal) {
            nachtraege.push(
              t('Der Endfassungs-Haken hat in Klappe nicht gegriffen – die Fassung gilt dort weiter als Vorschau.'),
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

      /* 4c. Den Namen gegenhalten ---------------------------------------
         Klappe baut seinen Download-Namen aus der **fertig verarbeiteten**
         Datei – da steht die tatsächliche Auflösung drin, und die Nummer ist
         die vergebene. Weicht er von unserem ab, hat entweder das Preset
         skaliert oder jemand war schneller mit der nächsten Fassung. Beides
         ist keine Panne, aber es gehört gesagt: Sonst liegt im Projektordner
         eine Datei, die anders heißt als der Download beim Kunden. */
      const hier = path.basename(rendered.path);
      if (version?.downloadFilename && version.downloadFilename !== hier) {
        nachtraege.push(
          t('In Klappe heißt der Download „{dort}" – die Datei hier heißt „{hier}".', {
            dort: version.downloadFilename,
            hier,
          }),
        );
      }
    }

    /* 4d. Auf die Zweitablage warten ------------------------------------ */
    let ablage = null;
    if (kopie) {
      onProgress({ phase: 'kopie', percent: 100, text: t('Zweitablage wird abgeschlossen …') });
      ablage = await kopie;
      kopie = null;
    }

    /* 5. Sidecar schreiben ---------------------------------------------- */
    // Verknüpft wird eine Timeline mit einer **Fassung**. Ohne Upload gibt es
    // keine, und ein Eintrag ins Leere wäre schlimmer als keiner.
    if (version) {
      entry = mapping.put(context.timelineId, {
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
    }

    erfolgreich = true;
    return {
      version,
      entry,
      ablage,
      nachtraege,
      webUrl: version?.webUrl ? `${api.baseUrl()}${version.webUrl}` : '',
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

    // Kein Master entstanden? Dann bleibt ein leerer Lauf-Ordner zurück –
    // der gehört weg, sonst füllt sich der Zwischenordner mit Nichts.
    if (!rendered) {
      try {
        fs.rmdirSync(dir);
      } catch {
        /* Nicht leer oder schon weg – beides in Ordnung. */
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
  findRendered,
};
