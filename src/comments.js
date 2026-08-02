/**
 * Kommentare lesen und schreiben.
 *
 * Gelesen wird bewusst die **volle** Liste: `?since=` liefert zwar nur die
 * Gespräche, in denen sich etwas getan hat, kennt aber keine Löschungen – ein
 * gelöschter Kommentar taucht nirgends mehr auf. Für Marker und Overlays, die
 * wieder verschwinden sollen, ist der Abgleich über die ganze Liste der
 * verlässlichere Weg. `since` bleibt für die Anzeige nutzbar (siehe `neuSeit`).
 */

const api = require('./api.js');

/** Alle Wurzelkommentare einer Fassung, mit ihren Antworten. */
async function list(versionId) {
  const data = await api.get(`/v1/versions/${versionId}/comments`);
  return Array.isArray(data) ? data : [];
}

/**
 * Nur die Gespräche, in denen sich seit diesem Zeitpunkt etwas getan hat –
 * für ein „3 neue Kommentare"-Abzeichen, nicht für den Marker-Abgleich.
 */
async function since(versionId, isoDate) {
  const data = await api.get(
    `/v1/versions/${versionId}/comments?since=${encodeURIComponent(isoDate)}`,
  );
  return Array.isArray(data) ? data : [];
}

/**
 * Der jüngste Zeitstempel einer Antwort. Den nehmen wir als nächstes `since`
 * – nicht die Uhr des Schnittrechners: Die geht selten so wie die des Servers.
 */
function latestTimestamp(comments) {
  let latest = '';
  const visit = (comment) => {
    for (const value of [comment.updatedAt, comment.createdAt, comment.editedAt]) {
      if (value && value > latest) latest = value;
    }
    for (const reply of comment.replies || []) visit(reply);
  };
  for (const comment of comments) visit(comment);
  return latest;
}

/** Antworten. Erscheint unter dem Namen des gekoppelten Kontos. */
async function reply(versionId, parentId, body) {
  return api.post(`/v1/versions/${versionId}/comments`, { body, parentId });
}

/** Neuer Kommentar auf einem Frame – aus Resolve heraus. */
async function create(versionId, body, frame) {
  const payload = { body };
  if (Number.isFinite(frame)) payload.frame = Math.max(0, Math.round(frame));
  return api.post(`/v1/versions/${versionId}/comments`, payload);
}

/** Erledigt setzen oder wieder öffnen. */
async function setResolved(commentId, resolved) {
  if (resolved) return api.post(`/v1/comments/${commentId}/resolve`, undefined);
  return api.del(`/v1/comments/${commentId}/resolve`);
}

/** Zählt Wurzelkommentare und Antworten – für die Kopfzeile der Liste. */
function counts(comments) {
  let open = 0;
  let resolved = 0;
  for (const comment of comments) {
    if (comment.resolvedAt) resolved += 1;
    else open += 1;
  }
  return { open, resolved, total: comments.length };
}

module.exports = { list, since, latestTimestamp, reply, create, setResolved, counts };
