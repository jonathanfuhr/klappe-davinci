/**
 * Die Brücke zwischen Panel und Hauptprozess.
 *
 * Der Renderer bekommt genau diese Liste – keinen `require`, kein `fs`, keinen
 * Token. Jede Funktion ist ein benannter Aufruf; was hier nicht steht, kann
 * die Oberfläche nicht auslösen.
 */

const { contextBridge, ipcRenderer } = require('electron/renderer');

const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('klappe', {
  // Zustand & Einstellungen
  state: () => call('klappe:state'),
  saveConfig: (patch) => call('klappe:config:save', patch),
  pickFolder: (title) => call('klappe:pickFolder', title),
  openExternal: (url) => call('klappe:open', url),
  copyText: (text) => call('klappe:clipboard', text),

  // Kopplung
  pairStart: () => call('klappe:pair:start'),
  pairCancel: () => call('klappe:pair:cancel'),
  disconnect: () => call('klappe:disconnect'),

  // Resolve
  context: () => call('klappe:resolve:context'),
  renderPresets: () => call('klappe:render:presets'),
  seek: (commentFrame) => call('klappe:seek', commentFrame),

  // Ziel & Upload
  projects: () => call('klappe:targets:projects'),
  videos: (projectId) => call('klappe:targets:videos', projectId),
  versions: (videoId) => call('klappe:targets:versions', videoId),
  createVideo: (projectId, name, description) =>
    call('klappe:targets:createVideo', projectId, name, description),
  versionSettings: () => call('klappe:targets:settings'),
  uploadRun: (options) => call('klappe:upload:run', options),
  uploadAbort: () => call('klappe:upload:abort'),
  rendersStatus: () => call('klappe:renders:status'),
  rendersCleanup: (alles) => call('klappe:renders:cleanup', alles),

  // Sidecar
  mappingGet: (timelineId) => call('klappe:mapping:get', timelineId),
  mappingPut: (timelineId, entry) => call('klappe:mapping:put', timelineId, entry),
  mappingRemove: (timelineId) => call('klappe:mapping:remove', timelineId),

  // Kommentare
  comments: (versionId) => call('klappe:comments:list', versionId),
  reply: (versionId, parentId, body) => call('klappe:comments:reply', versionId, parentId, body),
  createComment: (versionId, body, frame) =>
    call('klappe:comments:create', versionId, body, frame),
  setResolved: (commentId, resolved) => call('klappe:comments:resolve', commentId, resolved),

  // Timeline
  syncMarkers: (versionId) => call('klappe:markers:sync', versionId),
  clearMarkers: (alsoByColor) => call('klappe:markers:clear', alsoByColor),
  syncOverlays: (versionId) => call('klappe:overlays:sync', versionId),
  clearOverlays: (removeFiles) => call('klappe:overlays:clear', removeFiles),
  setOverlaysVisible: (visible) => call('klappe:overlays:visible', visible),
  cleanupAll: () => call('klappe:cleanupAll'),

  // Ereignisse aus dem Hauptprozess (Fortschritt, Kopplungsstand)
  onEvent: (listener) => {
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on('klappe:event', wrapped);
    return () => ipcRenderer.removeListener('klappe:event', wrapped);
  },
});
