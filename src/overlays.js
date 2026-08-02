/**
 * Zeichnungen als Overlay-Spur.
 *
 * Zu vielen Kommentaren gehört ein Kringel um die Stelle, die gemeint ist.
 * Der landet als transparentes PNG auf einer eigenen, obersten Videospur
 * „KLAPPE" – genau auf dem Bild, zu dem der Kommentar gehört.
 *
 * Die Spur ist **reine Anzeige**: Nach dem Einfügen wird sie gesperrt und
 * abgeschaltet, damit sie niemand versehentlich verschiebt und vor allem
 * nichts davon in einem Master landet. (Der „Auto Track Selector" ließe sich
 * ebenfalls abschalten, ist aber per API nicht erreichbar – siehe README.)
 */

const fs = require('node:fs');
const path = require('node:path');

const annotation = require('./annotation.js');
const config = require('./config.js');
const frames = require('./frames.js');
const resolve = require('./resolve.js');

/** Overlay-Dateien heißen nach ihrer Kommentar-ID – daran erkennen wir sie wieder. */
const FILE_PATTERN = /^[0-9a-f-]{16,}\.png$/i;

/** Aus einem Projektnamen einen brauchbaren Ordnernamen machen. */
function slug(value) {
  return (
    String(value || 'Projekt')
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'Projekt'
  );
}

/**
 * `<Ablage>/<Projekt>/<VersionId>/<CommentId>.png`.
 *
 * Nach Projekt und Fassung getrennt, damit ein Blick in den Ordner reicht, um
 * zu wissen, wozu die Bilder gehören – und damit sich eine abgeschlossene
 * Produktion in einem Rutsch löschen lässt.
 */
function pngPath(projectName, versionId, commentId, settings = config.read()) {
  return path.join(config.overlayDir(settings), slug(projectName), versionId, `${commentId}.png`);
}

/** Die Kommentare, zu denen es überhaupt etwas zu zeichnen gibt. */
function withDrawings(comments) {
  const list = [];
  for (const comment of comments) {
    if (!Number.isFinite(comment.frame)) continue;
    if (!annotation.hasStrokes(comment.annotation)) continue;
    list.push(comment);
  }
  // Antworten erben keinen Frame und tragen keine Zeichnung – sie kommen hier
  // bewusst nicht vor.
  return list.sort((a, b) => a.frame - b.frame);
}

/* ------------------------------------------------------------- Media Pool */

async function findBin(mediaPool, name) {
  const root = await mediaPool.GetRootFolder();
  if (!root) return null;
  const folders = (await root.GetSubFolderList()) || [];
  for (const folder of folders) {
    if ((await folder.GetName()) === name) return folder;
  }
  return null;
}

async function ensureBin(mediaPool, name) {
  const existing = await findBin(mediaPool, name);
  if (existing) return existing;
  const root = await mediaPool.GetRootFolder();
  if (!root) return null;
  return (await mediaPool.AddSubFolder(root, name)) || null;
}

/** Dateipfad eines Media-Pool-Eintrags – die verlässlichste Kennung, die es gibt. */
async function itemFilePath(item) {
  try {
    const value = await item.GetClipProperty('File Path');
    return String(value || '');
  } catch {
    return '';
  }
}

/**
 * Importiert die PNGs in den Bin und gibt eine Zuordnung Pfad → MediaPoolItem
 * zurück. Was schon drin ist, wird wiederverwendet: Ein zweiter Import
 * derselben Datei legt in Resolve einen zweiten Eintrag an.
 */
async function importPngs(mediaPool, bin, paths) {
  const known = new Map();
  const clips = (await bin.GetClipList()) || [];
  for (const clip of clips) {
    const file = await itemFilePath(clip);
    if (file) known.set(file, clip);
  }

  const missing = paths.filter((file) => !known.has(file));
  if (missing.length > 0) {
    await mediaPool.SetCurrentFolder(bin);
    const imported = (await mediaPool.ImportMedia(missing)) || [];
    for (const clip of imported) {
      const file = await itemFilePath(clip);
      if (file) known.set(file, clip);
    }
  }

  return known;
}

/* ------------------------------------------------------------------- Spur */

/** Unsere Overlay-Clips auf der Spur – erkannt am Dateipfad, nicht am Namen. */
async function ownClipsInTrack(timeline, trackIndex, overlayRoot) {
  const items = await resolve.itemsInTrack(timeline, trackIndex);
  const mine = [];
  const foreign = [];

  for (const item of items) {
    let file = '';
    try {
      const poolItem = await item.GetMediaPoolItem();
      if (poolItem) file = await itemFilePath(poolItem);
    } catch {
      /* Ohne Pool-Eintrag bleibt nur der Name */
    }

    const name = String((await item.GetName()) || '');
    const isOurs = file
      ? file.startsWith(overlayRoot)
      : FILE_PATTERN.test(name);

    if (isOurs) mine.push(item);
    else foreign.push(item);
  }

  return { mine, foreign };
}

/* ------------------------------------------------------------ Der Abgleich */

/**
 * Setzt die Zeichnungen als Overlays in die Timeline.
 *
 * Gebaut wird jedes Mal neu: erst die eigenen Clips von der Spur nehmen, dann
 * einfügen, was jetzt gilt. Das ist ein paar Sekunden teurer als ein Diff –
 * dafür kann eine Spur nicht schleichend auseinanderlaufen.
 */
async function sync(comments, { versionId, version, renderIn = 0, projectName }) {
  const settings = config.read();
  const timeline = await resolve.getTimeline();
  if (!timeline) throw new Error('In Resolve ist keine Timeline aktiv.');

  const mediaPool = await resolve.getMediaPool();
  if (!mediaPool) throw new Error('Der Media Pool ist nicht erreichbar.');

  const timelineStart = Number(await timeline.GetStartFrame()) || 0;
  const timelineEnd = Number(await timeline.GetEndFrame()) || 0;

  const drawings = withDrawings(comments);
  const failed = [];
  const files = [];

  /* 1. PNGs beschaffen – vom Server, sonst selbst gezeichnet. */
  for (const comment of drawings) {
    const target = pngPath(projectName, versionId, comment.id, settings);
    try {
      await annotation.ensurePng(comment, target, version?.media, { width: 1920 });
      files.push({ comment, file: target });
    } catch (error) {
      failed.push({ id: comment.id, reason: error.message });
    }
  }

  /* 2. Spur bereitstellen und zum Bearbeiten freigeben. */
  const track = await resolve.ensureTopTrack(timeline, settings.overlayTrackName);
  if (!track) throw new Error(`Die Spur „${settings.overlayTrackName}" ließ sich nicht anlegen.`);

  await resolve.setTrackLock(timeline, track.index, false);
  await resolve.setTrackEnable(timeline, track.index, true);

  /* 3. Alte Klappe-Clips herunternehmen. */
  const overlayRoot = config.overlayDir(settings);
  const { mine } = await ownClipsInTrack(timeline, track.index, overlayRoot);
  if (mine.length > 0) await resolve.deleteClips(timeline, mine);

  /* 4. In den Bin importieren. */
  const bin = await ensureBin(mediaPool, settings.overlayBinName);
  if (!bin) throw new Error(`Der Bin „${settings.overlayBinName}" ließ sich nicht anlegen.`);
  const poolItems = await importPngs(
    mediaPool,
    bin,
    files.map((entry) => entry.file),
  );

  /* 5. Einfügen. */
  const wunschdauer = Math.max(1, Number(settings.overlayFrames) || 1);
  const auftraege = [];

  for (const entry of files) {
    const poolItem = poolItems.get(entry.file);
    if (!poolItem) {
      failed.push({ id: entry.comment.id, reason: 'Der Import in den Media Pool schlug fehl.' });
      continue;
    }

    const recordFrame = frames.toRecordFrame(entry.comment.frame, renderIn, timelineStart);
    if (recordFrame < timelineStart || recordFrame >= timelineEnd) {
      failed.push({
        id: entry.comment.id,
        reason: `Frame ${recordFrame} liegt außerhalb der Timeline (${timelineStart}–${timelineEnd}).`,
      });
      continue;
    }

    // Ein Standbild hat in Resolve eine feste Länge (Projekteinstellung
    // „Standard still duration", ab Werk fünf Sekunden). Länger als das
    // Standbild geht nicht.
    const verfuegbar = await clipFrames(poolItem);
    const dauer = verfuegbar > 0 ? Math.min(wunschdauer, verfuegbar) : wunschdauer;

    auftraege.push({
      comment: entry.comment,
      poolItem,
      verfuegbar,
      dauer,
      recordFrame,
      trackIndex: track.index,
    });
  }

  const inserted = [];
  let konvention = null;
  let gemesseneDauer = 0;

  try {
    for (const auftrag of auftraege) {
      const ergebnis = await fuegeClipEin(mediaPool, timeline, auftrag, konvention);

      if (ergebnis.items.length > 0) {
        konvention = ergebnis.konvention;
        gemesseneDauer = ergebnis.dauer || gemesseneDauer;
        inserted.push(...ergebnis.items);
        for (const item of ergebnis.items) {
          try {
            await item.SetClipColor(settings.markerColor);
          } catch {
            /* Farbe ist Kür, nicht Pflicht */
          }
        }
        continue;
      }

      // Fehl geht hier nur ein einzelner Clip – der Rest wird trotzdem
      // gesetzt. Und die Meldung nennt die Werte, mit denen es versucht
      // wurde: Bei „Invalid items“ sagt Resolve selbst nicht, welcher davon
      // ihm nicht passt.
      failed.push({
        id: auftrag.comment.id,
        reason: `${ergebnis.reason} (Frame ${auftrag.recordFrame}, Spur ${track.index}, Länge ${auftrag.dauer} von ${
          auftrag.verfuegbar || '?'
        }, Timeline ${timelineStart}–${timelineEnd})`,
      });
    }
  } finally {
    /*
     * 6. Spur sperren – aber **sichtbar lassen**.
     *
     * Eine abgeschaltete Spur zeigt die Zeichnung nicht, und genau dafür ist
     * sie da. Gesperrt wird sie trotzdem, damit beim Schneiden nichts daran
     * verrutscht. Damit sie nicht versehentlich in einem Master landet:
     * Vor dem Ausspielen aus dem Panel wird sie automatisch abgeschaltet
     * (siehe upload.js), und für Exporte von Hand gibt es im Panel den
     * Schalter „Zeichnungen ausblenden".
     */
    await resolve.setTrackLock(timeline, track.index, true);
  }

  return {
    track: track.name,
    trackIndex: track.index,
    inserted: inserted.length,
    drawings: drawings.length,
    frames: gemesseneDauer,
    konvention: konvention === null ? '' : KONVENTIONEN[konvention].name,
    failed,
  };
}

/**
 * Wie Resolve den Bildbereich eines Clips liest, ist nicht eindeutig
 * dokumentiert – und für ein Standbild von genau einem Frame macht es den
 * Unterschied zwischen „ein Bild" und „abgelehnt".
 *
 * Deshalb wird die Zählweise **einmal ausprobiert und dann gemerkt**: Der
 * erste Clip entscheidet, mit welcher Variante der Rest eingefügt wird.
 */
const KONVENTIONEN = [
  { name: 'endFrame exklusiv', bereich: (dauer) => ({ startFrame: 0, endFrame: dauer }) },
  {
    name: 'endFrame einschließlich',
    bereich: (dauer) => ({ startFrame: 0, endFrame: Math.max(0, dauer - 1) }),
  },
  // Ohne Bereich nimmt Resolve die volle Standbild-Länge aus den
  // Projekteinstellungen (ab Werk fünf Sekunden). Das ist der Notnagel: eine
  // zu lange Zeichnung ist immer noch besser als gar keine.
  { name: 'ohne Bildbereich', bereich: () => ({}) },
];

/** Wie lang ist der eingefügte Clip wirklich geworden? */
async function itemDauer(item) {
  try {
    const wert = Number(await item.GetDuration());
    return Number.isFinite(wert) && wert > 0 ? wert : 0;
  } catch {
    return 0;
  }
}

/**
 * Einen Clip einfügen. `gelernt` ist die Zählweise, die beim ersten Clip
 * gegriffen hat – danach wird nicht mehr probiert.
 */
async function fuegeClipEin(mediaPool, timeline, auftrag, gelernt) {
  const kandidaten =
    gelernt === null ? KONVENTIONEN.map((k, index) => index) : [gelernt];

  const gruende = [];
  /** Eingefügt, aber mit falscher Länge – der Notnagel, falls nichts passt. */
  let notnagel = null;

  for (const index of kandidaten) {
    const info = {
      mediaPoolItem: auftrag.poolItem,
      ...KONVENTIONEN[index].bereich(auftrag.dauer),
      recordFrame: auftrag.recordFrame,
      trackIndex: auftrag.trackIndex,
    };

    let items = [];
    try {
      const ergebnis = await mediaPool.AppendToTimeline([info]);
      items = Array.isArray(ergebnis) ? ergebnis.filter(Boolean) : [];
    } catch (fehler) {
      gruende.push(`${KONVENTIONEN[index].name}: ${fehler?.message || String(fehler)}`);
      continue;
    }

    if (items.length === 0) {
      gruende.push(`${KONVENTIONEN[index].name}: nichts eingefügt`);
      continue;
    }

    const dauer = await itemDauer(items[0]);

    // Passt die Länge, ist die Zählweise gefunden. Passt sie nicht, wird der
    // Clip wieder heruntergenommen und die nächste Variante versucht – sonst
    // stünde am Ende ein Fünf-Sekunden-Standbild da, wo ein Bild gemeint war.
    if (gelernt !== null || dauer === auftrag.dauer || dauer === 0) {
      return { items, konvention: index, dauer, reason: '' };
    }

    gruende.push(`${KONVENTIONEN[index].name}: ergab ${dauer} statt ${auftrag.dauer} Frames`);
    if (!notnagel) notnagel = { index, info };
    await resolve.deleteClips(timeline, items);
  }

  // Keine Variante traf die Wunschlänge – dann lieber zu lang als gar nicht.
  if (notnagel) {
    try {
      const ergebnis = await mediaPool.AppendToTimeline([notnagel.info]);
      const items = Array.isArray(ergebnis) ? ergebnis.filter(Boolean) : [];
      if (items.length > 0) {
        return {
          items,
          konvention: notnagel.index,
          dauer: await itemDauer(items[0]),
          reason: '',
        };
      }
    } catch {
      /* dann eben mit dem Fehler unten heraus */
    }
  }

  return { items: [], konvention: null, dauer: 0, reason: gruende.join(' · ') };
}

/**
 * Zeichnungen ein- oder ausblenden.
 *
 * Vor einem Export von Hand (Deliver-Seite, nicht über das Panel) muss die
 * Spur aus – sonst brennt der Kringel in den Master. Das Panel macht das vor
 * seinem eigenen Rendern selbst; dieser Schalter ist für alle anderen Fälle.
 */
async function setVisible(visible) {
  const settings = config.read();
  const timeline = await resolve.getTimeline();
  if (!timeline) throw new Error('In Resolve ist keine Timeline aktiv.');

  const track = await resolve.findTrack(timeline, settings.overlayTrackName);
  if (!track) return { track: '', visible: null, previous: null, found: false };

  const previous = await resolve.getTrackEnable(timeline, track.index);
  await resolve.setTrackEnable(timeline, track.index, Boolean(visible));

  return {
    track: track.name,
    trackIndex: track.index,
    visible: Boolean(visible),
    previous,
    found: true,
  };
}

/** Wie viele Bilder hat dieser Media-Pool-Eintrag? `0`, wenn Resolve schweigt. */
async function clipFrames(poolItem) {
  for (const name of ['Frames', 'Duration']) {
    try {
      const wert = Number(await poolItem.GetClipProperty(name));
      if (Number.isFinite(wert) && wert > 0) return wert;
    } catch {
      /* nächste Eigenschaft versuchen */
    }
  }
  return 0;
}

/**
 * Overlays entfernen.
 *
 * Liegt fremdes Material auf der Spur, bleibt die Spur stehen und nur unsere
 * Clips verschwinden – eine Spur zu löschen, auf der jemand gearbeitet hat,
 * wäre der teuerste denkbare Fehler.
 */
async function clear({ removeFiles = false } = {}) {
  const settings = config.read();
  const timeline = await resolve.getTimeline();
  if (!timeline) throw new Error('In Resolve ist keine Timeline aktiv.');

  const track = await resolve.findTrack(timeline, settings.overlayTrackName);
  if (!track) return { removed: 0, trackDeleted: false, binDeleted: false };

  // Nur entsperren – nicht einschalten: Ob die Spur gerade sichtbar ist, hat
  // jemand entschieden, und Aufräumen ist kein Grund, das umzuwerfen.
  await resolve.setTrackLock(timeline, track.index, false);

  const overlayRoot = config.overlayDir(settings);
  const { mine, foreign } = await ownClipsInTrack(timeline, track.index, overlayRoot);
  if (mine.length > 0) await resolve.deleteClips(timeline, mine);

  let trackDeleted = false;
  if (foreign.length === 0) {
    trackDeleted = await resolve.deleteTrack(timeline, track.index);
  } else {
    // Fremdes Material bleibt – und zwar sichtbar. Wir haben die Spur nur zum
    // Aufräumen entsperrt und dürfen sie nicht ausgeschaltet zurücklassen.
    await resolve.setTrackLock(timeline, track.index, true);
  }

  // Bin aufräumen: nur unsere Einträge, und den Bin selbst nur, wenn er
  // dadurch leer wird.
  let binDeleted = false;
  const mediaPool = await resolve.getMediaPool();
  if (mediaPool) {
    const bin = await findBin(mediaPool, settings.overlayBinName);
    if (bin) {
      const clips = (await bin.GetClipList()) || [];
      const ours = [];
      for (const clip of clips) {
        const file = await itemFilePath(clip);
        if (file && file.startsWith(overlayRoot)) ours.push(clip);
      }
      if (ours.length > 0) await mediaPool.DeleteClips(ours);
      if (ours.length === clips.length) {
        binDeleted = Boolean(await mediaPool.DeleteFolders([bin]));
      }
    }
  }

  if (removeFiles) {
    try {
      fs.rmSync(overlayRoot, { recursive: true, force: true });
    } catch {
      /* Dateien liegen zu lassen ist harmlos */
    }
  }

  return { removed: mine.length, trackDeleted, binDeleted, foreign: foreign.length };
}

module.exports = { slug, pngPath, withDrawings, sync, clear, setVisible, FILE_PATTERN };
