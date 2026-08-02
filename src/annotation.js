/**
 * Zeichnungen als PNG.
 *
 * Der Normalweg ist der Server: `GET /v1/comments/:id/annotation.png` liefert
 * ein transparentes PNG im Seitenverhältnis der Fassung – pixelgleich zu dem,
 * was im Browser über dem Bild liegt. Das ist die Quelle der Wahrheit.
 *
 * Der Rückfall ist ein eigener Rasterizer: Die Zeichnung liegt als Striche in
 * relativen Koordinaten am Kommentar und lässt sich daraus jederzeit wieder
 * herstellen. Gebraucht wird er, wenn der Server gerade nicht erreichbar ist,
 * wenn eine ältere Instanz die Route noch nicht kennt – und vor allem, wenn
 * eine PNG-Datei an ihrem gemeinsamen Ablageort fehlt, weil dort eine andere
 * Produktion arbeitet.
 *
 * Gezeichnet wird im Renderer auf einem Canvas: In Electron ist das die
 * kürzeste Strecke zu einem PNG, und der Strich sieht aus wie im Browser
 * (`lineCap`/`lineJoin` rund, Strichstärke als Anteil der Bildhöhe).
 */

const fs = require('node:fs');
const path = require('node:path');

const api = require('./api.js');
const { t } = require('./i18n.js');

/**
 * Wird von main.js eingehängt: eine Funktion, die Striche im Renderer zeichnet
 * und das PNG als Base64 zurückgibt. Ohne Fenster gibt es keinen Canvas –
 * dann bleibt nur der Server.
 */
let rasterizer = null;

function setRasterizer(fn) {
  rasterizer = fn;
}

/** Hat die Zeichnung überhaupt Inhalt? */
function hasStrokes(annotation) {
  return Boolean(annotation && Array.isArray(annotation.strokes) && annotation.strokes.length > 0);
}

/**
 * Zielgröße für das PNG. Der Server rechnet die Höhe aus der Auflösung der
 * Fassung; damit der Rückfall deckungsgleich bleibt, rechnen wir genauso –
 * und ohne bekannte Maße gilt 16:9, wie dort auch.
 */
function targetSize(media, width = 1920) {
  const safeWidth = Math.min(3840, Math.max(64, Math.round(width)));
  const sourceWidth = Number(media?.width);
  const sourceHeight = Number(media?.height);

  if (sourceWidth > 0 && sourceHeight > 0) {
    return { width: safeWidth, height: Math.round((safeWidth * sourceHeight) / sourceWidth) };
  }
  return { width: safeWidth, height: Math.round((safeWidth * 9) / 16) };
}

/** Neben jeder PNG-Datei steht ihr ETag – damit ein Abgleich billig bleibt. */
function etagFile(pngPath) {
  return `${pngPath}.etag`;
}

function readEtag(pngPath) {
  try {
    return fs.readFileSync(etagFile(pngPath), 'utf8').trim();
  } catch {
    return '';
  }
}

/**
 * Holt das PNG vom Server und legt es ab. Kennt der Server das ETag von der
 * letzten Runde, antwortet er mit `304` – dann bleibt die Datei, wie sie ist.
 */
async function fetchFromServer(commentId, pngPath, width) {
  const existing = fs.existsSync(pngPath);
  const etag = existing ? readEtag(pngPath) : '';

  const response = await api.request('GET', `/v1/comments/${commentId}/annotation.png?width=${width}`, {
    expectBinary: true,
    headers: etag ? { 'If-None-Match': etag } : {},
    allowStatus: [304, 404],
  });

  if (response.status === 304 && existing) return { path: pngPath, source: 'zwischenspeicher' };
  if (response.status === 404) {
    throw new api.KlappeError(t('Zu diesem Kommentar gibt es keine Zeichnung mehr.'), {
      status: 404,
    });
  }

  fs.mkdirSync(path.dirname(pngPath), { recursive: true });
  fs.writeFileSync(pngPath, response.data);

  const newEtag = response.headers.etag;
  if (newEtag) fs.writeFileSync(etagFile(pngPath), String(newEtag));

  return { path: pngPath, source: 'server' };
}

/** Zeichnet die Striche selbst und schreibt das PNG. */
async function renderLocally(annotation, pngPath, { width, height }) {
  if (!rasterizer) {
    throw new Error(t('Zum Zeichnen fehlt das Panel-Fenster.'));
  }

  const dataUrl = await rasterizer({ strokes: annotation.strokes, width, height });
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
    throw new Error(t('Der Rasterizer hat kein PNG geliefert.'));
  }

  fs.mkdirSync(path.dirname(pngPath), { recursive: true });
  fs.writeFileSync(pngPath, Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64'));
  // Ein selbst gezeichnetes Bild hat kein ETag des Servers – der alte muss
  // weg, sonst hielte der nächste Abgleich die Datei für aktuell.
  try {
    fs.rmSync(etagFile(pngPath), { force: true });
  } catch {
    /* egal */
  }

  return { path: pngPath, source: 'lokal' };
}

/**
 * Das PNG zu einem Kommentar – vom Server, sonst selbst gezeichnet.
 *
 * Reihenfolge mit Absicht: erst der Server (identischer Look, ETag), dann der
 * eigene Rasterizer. Fällt beides aus, sagt der Fehler, welcher Weg woran
 * gescheitert ist – „keine Zeichnung" wäre die falsche Auskunft.
 */
async function ensurePng(comment, pngPath, media, { width = 1920 } = {}) {
  const size = targetSize(media, width);

  try {
    return await fetchFromServer(comment.id, pngPath, size.width);
  } catch (serverError) {
    if (!hasStrokes(comment.annotation)) throw serverError;
    try {
      return await renderLocally(comment.annotation, pngPath, size);
    } catch (localError) {
      throw new api.KlappeError(
        t('Die Zeichnung ließ sich nicht beschaffen. Server: {server} – eigener Rasterizer: {lokal}', {
          server: serverError.message,
          lokal: localError.message,
        }),
      );
    }
  }
}

/**
 * Der Code, der im Renderer läuft. Steht hier, damit Zeichenregeln und ihre
 * Begründung an einer Stelle stehen und nicht in der UI-Datei verschwinden.
 */
const RASTERIZER_SOURCE = `
(function (payload) {
  const { strokes, width, height } = payload;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  context.clearRect(0, 0, width, height);
  context.lineCap = 'round';
  context.lineJoin = 'round';

  for (const stroke of strokes || []) {
    if (!stroke.points || stroke.points.length === 0) continue;
    context.strokeStyle = stroke.color;
    context.fillStyle = stroke.color;
    // Die Strichstärke ist auf die Bildhöhe normalisiert – so bleibt ein
    // Strich bei jedem Seitenverhältnis gleich dick.
    context.lineWidth = Math.max(1, stroke.width * height);

    if (stroke.points.length === 1) {
      const point = stroke.points[0];
      context.beginPath();
      context.arc(point.x * width, point.y * height, context.lineWidth / 2, 0, Math.PI * 2);
      context.fill();
      continue;
    }

    context.beginPath();
    stroke.points.forEach((point, index) => {
      const x = point.x * width;
      const y = point.y * height;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  }

  return canvas.toDataURL('image/png');
})`;

module.exports = {
  setRasterizer,
  hasStrokes,
  targetSize,
  ensurePng,
  fetchFromServer,
  renderLocally,
  RASTERIZER_SOURCE,
};
