/**
 * Electron-Hauptprozess.
 *
 * Hier läuft alles, was Node braucht: Dateien, Schlüsselbund, HTTP und die
 * Resolve-Scripting-API. Der Renderer ist reine Anzeige und kommt an nichts
 * davon heran – Resolve fährt seit Version 19.0.2 mit `sandbox` und
 * `contextIsolation`, und das ist gut so.
 *
 * Jeder IPC-Aufruf antwortet mit `{ ok, data }` bzw. `{ ok: false, error }`.
 * Ausnahmen über die Prozessgrenze zu werfen kostet die Zusatzfelder eines
 * `KlappeError` – und genau die (401 gegen 403!) will das Panel anzeigen.
 */

const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');

const annotation = require('./annotation.js');
const api = require('./api.js');
const auth = require('./auth.js');
const comments = require('./comments.js');
const config = require('./config.js');
const frames = require('./frames.js');
const mapping = require('./mapping.js');
const markers = require('./markers.js');
const overlays = require('./overlays.js');
const presets = require('./presets.js');
const renders = require('./renders.js');
const resolveBridge = require('./resolve.js');
const secrets = require('./secrets.js');
const upload = require('./upload.js');

let mainWindow = null;

/* --------------------------------------------------------------- Fenster */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 860,
    minWidth: 420,
    minHeight: 560,
    useContentSize: true,
    title: 'Klappe',
    backgroundColor: '#1c1c1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.setMenu(null);
  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));

  /**
   * Das Fenster zu schließen beendet das Plugin – mitten in einem Upload wäre
   * das teuer: Die Übertragung stirbt, die Overlay-Spur bliebe ausgeblendet
   * und der Zwischen-Master läge als „wird gerade benutzt" für immer im
   * Renderordner. Also erst fragen, dann sauber abbrechen.
   */
  let schliessenErzwingen = false;

  mainWindow.on('close', (event) => {
    if (schliessenErzwingen || !upload.laeuft()) {
      app.quit();
      return;
    }

    event.preventDefault();

    const wahl = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: ['Weiter hochladen', 'Abbrechen und schließen'],
      defaultId: 0,
      cancelId: 0,
      message: 'Es läuft noch ein Upload nach Klappe.',
      detail:
        'Beim Schließen wird er abgebrochen. Die bereits übertragenen Daten verwirft Klappe; ' +
        'der gerenderte Zwischen-Master bleibt liegen, sodass ein zweiter Anlauf nicht noch ' +
        'einmal rendern muss.',
    });

    if (wahl === 0) return;

    void (async () => {
      await upload.abbrechenUndWarten();
      schliessenErzwingen = true;
      mainWindow.close();
    })();
  });

  // Der Rasterizer für Zeichnungen braucht einen Canvas – den gibt es nur im
  // Renderer. Wir reichen die Striche hinüber und bekommen ein PNG zurück.
  annotation.setRasterizer(async (payload) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      throw new Error('Das Panel-Fenster ist geschlossen.');
    }
    return mainWindow.webContents.executeJavaScript(
      `${annotation.RASTERIZER_SOURCE}(${JSON.stringify(payload)})`,
    );
  });
}

/** Ereignis ans Panel schicken – Fortschritt, Kopplungsstand, Hinweise. */
function emit(type, payload = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('klappe:event', { type, ...payload });
}

/* ------------------------------------------------------------------- IPC */

/**
 * Registriert einen Aufruf und packt Fehler in eine Antwort, die das Panel
 * anzeigen kann – mit Status und Code, damit „neu koppeln" und „das kann nur
 * der Administrator" unterscheidbar bleiben.
 */
function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (error) {
      return {
        ok: false,
        error: error?.message || String(error),
        code: error?.code || '',
        status: error?.status || 0,
      };
    }
  });
}

function registerHandlers() {
  /* -------------------------------------------------- Zustand & Einstellungen */

  handle('klappe:state', async () => {
    const settings = config.read();
    const context = await resolveBridge.context();
    const entry = context.ok ? mapping.get(context.timelineId) : null;

    let user = null;
    let connectionError = '';
    if (settings.serverUrl && secrets.hasToken()) {
      try {
        user = await auth.me();
      } catch (error) {
        connectionError = error.message;
        if (error.status === 401) user = null;
      }
    }

    return {
      settings,
      hasToken: secrets.hasToken(),
      tokenStorage: secrets.storageKind(),
      user,
      connectionError,
      context,
      mapping: entry,
      mappingFile: mapping.file(),
      overlayDir: config.overlayDir(settings),
      clientName: auth.clientName(),
    };
  });

  handle('klappe:config:save', async (patch) => config.update(patch));

  handle('klappe:pickFolder', async (title) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: title || 'Ordner wählen',
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? '' : result.filePaths[0];
  });

  handle('klappe:open', async (url) => {
    await shell.openExternal(url);
    return true;
  });

  /* ------------------------------------------------------------- Kopplung */

  handle('klappe:pair:start', async () => {
    const started = await auth.start();

    // Nicht warten: Das Panel zeigt den Code sofort, die Abholung läuft
    // nebenher und meldet sich per Ereignis.
    auth
      .waitForToken((secondsLeft) => emit('pair:tick', { secondsLeft }))
      .then((result) => emit('pair:done', { name: result.name, user: result.user }))
      .catch((error) => emit('pair:failed', { error: error.message, code: error.code || '' }));

    return started;
  });

  handle('klappe:pair:cancel', async () => {
    auth.cancel();
    return true;
  });

  handle('klappe:disconnect', async () => auth.disconnect());

  /* --------------------------------------------------------------- Resolve */

  handle('klappe:resolve:context', async () => resolveBridge.context());
  handle('klappe:render:presets', async () => {
    const alle = await resolveBridge.renderPresets();
    const settings = config.read();
    return {
      alle,
      ...presets.teile(alle, settings.standardPresetsExtra),
      modus: settings.standardPresetsMode,
      sichtbare: presets.sichtbare(alle, {
        modus: settings.standardPresetsMode,
        erlaubteStandard: settings.renderPresetsStandard,
        extra: settings.standardPresetsExtra,
      }),
    };
  });

  handle('klappe:seek', async (commentFrame) => {
    const context = await resolveBridge.context();
    if (!context.ok) throw new Error(context.reason);

    const entry = mapping.get(context.timelineId);
    const timecode = frames.commentFrameToTimecode(commentFrame, {
      renderIn: mapping.renderIn(entry),
      timelineStart: context.startFrame,
      fps: context.frameRate,
      dropFrame: context.dropFrame,
    });
    if (!timecode) throw new Error('Die Framerate der Timeline ist nicht lesbar.');

    const moved = await resolveBridge.setCurrentTimecode(timecode);
    return { timecode, moved };
  });

  /* ------------------------------------------------------- Ziel und Upload */

  handle('klappe:targets:projects', async () => upload.projects());
  handle('klappe:targets:videos', async (projectId) => upload.videos(projectId));
  handle('klappe:targets:versions', async (videoId) => upload.versions(videoId));
  handle('klappe:targets:createVideo', async (projectId, name, description) =>
    upload.createVideo(projectId, name, description),
  );
  handle('klappe:targets:settings', async () => upload.versionSettings());

  handle('klappe:upload:run', async (options) =>
    upload.run(options, (progress) => emit('upload:progress', progress)),
  );
  handle('klappe:upload:abort', async () => upload.abort());

  handle('klappe:renders:status', async () => ({
    ...renders.status(),
    ordner: upload.renderDir(),
    maxAlterStunden: renders.MAX_ALTER_STUNDEN,
  }));

  handle('klappe:renders:cleanup', async (alles) => renders.aufraeumen({ alles: Boolean(alles) }));
  handle('klappe:version:release', async (versionId) => upload.release(versionId));

  /* --------------------------------------------------------------- Sidecar */

  handle('klappe:mapping:get', async (timelineId) => mapping.get(timelineId));
  handle('klappe:mapping:put', async (timelineId, entry) => mapping.put(timelineId, entry));
  handle('klappe:mapping:remove', async (timelineId) => mapping.remove(timelineId));

  /* ----------------------------------------------------------- Kommentare */

  handle('klappe:comments:list', async (versionId) => {
    const list = await comments.list(versionId);
    return { comments: list, counts: comments.counts(list) };
  });

  handle('klappe:comments:reply', async (versionId, parentId, body) =>
    comments.reply(versionId, parentId, body),
  );

  handle('klappe:comments:create', async (versionId, body, frame) =>
    comments.create(versionId, body, frame),
  );

  handle('klappe:comments:resolve', async (commentId, resolved) =>
    comments.setResolved(commentId, resolved),
  );

  /* --------------------------------------------------------------- Marker */

  handle('klappe:markers:sync', async (versionId) => {
    const settings = config.read();
    const context = await resolveBridge.context();
    if (!context.ok) throw new Error(context.reason);

    const entry = mapping.get(context.timelineId);
    const list = await comments.list(versionId);

    return markers.sync(list, {
      versionId,
      renderIn: mapping.renderIn(entry),
      colorOpen: settings.markerColor,
      colorResolved: settings.markerColorResolved,
      markGeneral: settings.markGeneralComments,
    });
  });

  handle('klappe:markers:clear', async (alsoByColor) => {
    const settings = config.read();
    return markers.clear({
      alsoByColor: Boolean(alsoByColor),
      colorOpen: settings.markerColor,
      colorResolved: settings.markerColorResolved,
    });
  });

  /* ------------------------------------------------------------- Overlays */

  handle('klappe:overlays:sync', async (versionId) => {
    const context = await resolveBridge.context();
    if (!context.ok) throw new Error(context.reason);

    const entry = mapping.get(context.timelineId);
    const [list, version] = await Promise.all([
      comments.list(versionId),
      api.get(`/v1/versions/${versionId}`),
    ]);

    return overlays.sync(list, {
      versionId,
      version,
      renderIn: mapping.renderIn(entry),
      projectName: entry?.projectName || context.projectName,
    });
  });

  handle('klappe:overlays:clear', async (removeFiles) =>
    overlays.clear({ removeFiles: Boolean(removeFiles) }),
  );

  handle('klappe:overlays:visible', async (visible) => overlays.setVisible(Boolean(visible)));

  /* ---------------------------------------------- Alles wieder herunternehmen */

  handle('klappe:cleanupAll', async () => {
    const settings = config.read();
    const overlayResult = await overlays.clear({ removeFiles: false });
    const markerResult = await markers.clear({
      alsoByColor: false,
      colorOpen: settings.markerColor,
      colorResolved: settings.markerColorResolved,
    });
    return { overlays: overlayResult, markers: markerResult };
  });
}

/* ------------------------------------------------------------ Lebenszyklus */

app.whenReady().then(() => {
  // Beim Start läuft nichts von uns – ein Vermerk „wird gerade benutzt" kann
  // also nur von einem Absturz stammen. Ohne das Entsperren wäre die Datei
  // für immer vor dem Aufräumen geschützt.
  renders.entsperren();

  registerHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', async () => {
  await resolveBridge.cleanup();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
