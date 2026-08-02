/**
 * Das Panel.
 *
 * Reine Anzeige: Alles, was Node braucht, läuft im Hauptprozess und ist über
 * `window.klappe` erreichbar. Hier steht nur, was jemand sieht und anklickt.
 */

const el = (id) => document.getElementById(id);

/** Resolves Markerfarben, in Resolves Reihenfolge. */
const MARKER_FARBEN = [
  'Blue',
  'Cyan',
  'Green',
  'Yellow',
  'Red',
  'Pink',
  'Purple',
  'Fuchsia',
  'Rose',
  'Lavender',
  'Sky',
  'Mint',
  'Lemon',
  'Sand',
  'Cocoa',
  'Cream',
];

const zustand = {
  settings: null,
  context: null,
  mapping: null,
  user: null,
  hasToken: false,
  kommentare: [],
  zahlen: { open: 0, resolved: 0, total: 0 },
  fassungseinstellungen: { internalEnabled: false, internalByDefault: false },
  /** Ist die Overlay-Spur gerade sichtbar? Nach dem Einfügen ja. */
  overlaysSichtbar: true,
  /** Presets aus Resolve, schon in Standard und Eigene geteilt. */
  presets: { alle: [], standard: [], eigene: [], sichtbare: [] },
  laueftUpload: false,
};

/* ---------------------------------------------------------------- Helfer */

function status(text, art = '') {
  const zeile = el('statuszeile');
  zeile.textContent = text || '';
  zeile.className = `status ${art}`;
}

/**
 * Ruft den Hauptprozess und packt die Antwort aus. Fehler landen in der
 * Statuszeile – und wenn der Token nicht mehr gilt, gleich mit dem Hinweis,
 * was jetzt zu tun ist.
 */
async function aufruf(versprechen, { still = false } = {}) {
  try {
    const antwort = await versprechen;
    if (antwort && antwort.ok) return antwort.data;

    const meldung = antwort?.error || 'Unbekannter Fehler.';
    if (!still) status(meldung, 'fehler');
    if (antwort?.status === 401) {
      zustand.hasToken = false;
      zeichneKopf();
    }
    return null;
  } catch (fehler) {
    if (!still) status(fehler.message, 'fehler');
    return null;
  }
}

function textKnoten(tag, klasse, text) {
  const knoten = document.createElement(tag);
  if (klasse) knoten.className = klasse;
  if (text !== undefined) knoten.textContent = text;
  return knoten;
}

function option(wert, beschriftung, daten = {}) {
  const knoten = document.createElement('option');
  knoten.value = wert;
  knoten.textContent = beschriftung;
  for (const [name, inhalt] of Object.entries(daten)) knoten.dataset[name] = inhalt;
  return knoten;
}

function zeitpunkt(iso) {
  if (!iso) return '';
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return '';
  return datum.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* -------------------------------------------- Auswahllisten (Projekt/Video) */

/**
 * Projekt-, Video- und Fassungslisten füllen. Zwei Stellen im Panel brauchen
 * dieselben Listen – der Upload-Dialog und das Zuordnen –, deshalb stehen sie
 * hier einmal und nicht zweimal.
 */
async function fuelleProjekte(feld, vorauswahl) {
  const projekte = await aufruf(window.klappe.projects());
  if (!projekte) return null;

  feld.textContent = '';
  for (const projekt of projekte) {
    feld.appendChild(
      option(projekt.id, projekt.customer ? `${projekt.name} (${projekt.customer})` : projekt.name, {
        name: projekt.name,
      }),
    );
  }
  if (vorauswahl && [...feld.options].some((eintrag) => eintrag.value === vorauswahl)) {
    feld.value = vorauswahl;
  }
  return projekte;
}

async function fuelleVideos(feld, projectId, { mitNeu = false, vorauswahl = '' } = {}) {
  const videos = projectId ? await aufruf(window.klappe.videos(projectId), { still: true }) : [];

  feld.textContent = '';
  if (mitNeu) feld.appendChild(option('__neu__', '➕ Neues Video anlegen'));
  for (const video of videos || []) {
    feld.appendChild(option(video.id, video.name, { name: video.name }));
  }
  if (vorauswahl && [...feld.options].some((eintrag) => eintrag.value === vorauswahl)) {
    feld.value = vorauswahl;
  }
  return videos || [];
}

async function fuelleFassungen(feld, videoId, { neuText = '', vorauswahl = '' } = {}) {
  const gueltig = videoId && videoId !== '__neu__';
  const fassungen = gueltig
    ? await aufruf(window.klappe.versions(videoId), { still: true })
    : [];

  feld.textContent = '';
  if (neuText) feld.appendChild(option('neu', neuText));
  for (const fassung of fassungen || []) {
    feld.appendChild(
      option(
        String(fassung.versionNumber),
        `Fassung ${fassung.versionNumber}${fassung.label ? ` – ${fassung.label}` : ''}${
          fassung.internal ? ' (intern)' : ''
        }`,
        { id: fassung.id },
      ),
    );
  }
  if (vorauswahl && [...feld.options].some((eintrag) => eintrag.value === vorauswahl)) {
    feld.value = vorauswahl;
  }
  return fassungen || [];
}

/* -------------------------------------------------------------- Zeichnen */

function zeichneKopf() {
  const ampel = el('verbindung');
  const konto = el('konto');

  if (!zustand.settings?.serverUrl) {
    ampel.className = 'ampel';
    konto.textContent = 'keine Adresse eingetragen';
    return;
  }
  if (!zustand.hasToken) {
    ampel.className = 'ampel';
    konto.textContent = 'nicht verbunden';
    return;
  }
  if (!zustand.user) {
    ampel.className = 'ampel gestoert';
    konto.textContent = 'Verbindung gestört';
    return;
  }

  ampel.className = 'ampel verbunden';
  konto.textContent = `${zustand.user.name} · ${zustand.user.role === 'GUEST' ? 'Gast' : 'Team'}`;
}

function zeichneKontext() {
  const ziel = el('kontext-text');
  ziel.textContent = '';
  const context = zustand.context;

  if (!context || !context.ok) {
    ziel.textContent = context?.reason || 'Resolve ist nicht erreichbar.';
    return;
  }

  const teile = [];
  if (Number.isFinite(context.markIn) && Number.isFinite(context.markOut)) {
    teile.push(`In/Out gesetzt (${context.markIn}–${context.markOut})`);
  } else {
    teile.push('ganze Timeline');
  }
  if (context.frameRate) teile.push(`${context.frameRate} fps`);

  ziel.appendChild(textKnoten('strong', '', `${context.projectName} · ${context.timelineName}`));
  ziel.appendChild(document.createTextNode(` — ${teile.join(' · ')}`));
}

function zeichneZuordnung() {
  const karte = el('zuordnung');
  karte.textContent = '';

  if (!zustand.context?.ok) {
    karte.appendChild(textKnoten('p', 'klein', 'Ohne offene Timeline gibt es nichts zuzuordnen.'));
    return;
  }

  const knoepfe = textKnoten('div', 'werkzeuge');

  if (!zustand.mapping?.versionId) {
    karte.appendChild(
      textKnoten(
        'p',
        'klein',
        'Diese Timeline ist noch keiner Fassung zugeordnet. Nach dem Hochladen aus dem Panel steht sie hier von selbst – wer von Hand exportiert und im Browser hochgeladen hat, verknüpft sie hier.',
      ),
    );
    const zuordnen = textKnoten('button', 'wichtig', 'Fassung zuordnen …');
    zuordnen.addEventListener('click', () => oeffneZuordnen());
    knoepfe.appendChild(zuordnen);
    karte.appendChild(knoepfe);
    return;
  }

  const eintrag = zustand.mapping;
  const zeile = textKnoten('div', '');
  zeile.appendChild(textKnoten('strong', '', eintrag.videoName || 'Video'));
  zeile.appendChild(
    document.createTextNode(
      ` · Fassung ${eintrag.versionNumber ?? '?'}${
        eintrag.wholeTimeline ? '' : ` · Render-Anfang Frame ${eintrag.renderIn}`
      }`,
    ),
  );
  karte.appendChild(zeile);
  karte.appendChild(
    textKnoten('p', 'klein', `zuletzt am ${zeitpunkt(eintrag.updatedAt) || 'unbekannt'}`),
  );

  const aendern = textKnoten('button', '', 'Ändern …');
  aendern.addEventListener('click', () => oeffneZuordnen());

  const loesen = textKnoten('button', 'leise', 'Zuordnung lösen');
  loesen.addEventListener('click', async () => {
    if (!window.confirm('Die Zuordnung dieser Timeline entfernen?')) return;
    const weg = await aufruf(window.klappe.mappingRemove(zustand.context.timelineId));
    if (weg !== null) {
      status('Zuordnung gelöst.', 'gut');
      await ladeZustand();
    }
  });

  knoepfe.appendChild(aendern);
  knoepfe.appendChild(loesen);
  karte.appendChild(knoepfe);
}

function passtZumFilter(kommentar) {
  const filter = document.querySelector('input[name="filter"]:checked').value;
  if (filter === 'alle') return true;
  return !kommentar.resolvedAt;
}

function zeichneKommentare() {
  const liste = el('kommentarliste');
  liste.textContent = '';

  const sichtbar = zustand.kommentare.filter(passtZumFilter);
  el('kommentar-zahl').textContent = `${zustand.zahlen.open} offen · ${zustand.zahlen.total} gesamt`;

  if (sichtbar.length === 0) {
    liste.appendChild(
      textKnoten(
        'li',
        'klein',
        zustand.mapping?.versionId
          ? 'Keine Kommentare in dieser Auswahl.'
          : 'Erst eine Fassung zuordnen, dann stehen die Kommentare hier.',
      ),
    );
    return;
  }

  for (const kommentar of sichtbar) liste.appendChild(zeichneEinenKommentar(kommentar));
}

function zeichneEinenKommentar(kommentar) {
  const eintrag = textKnoten('li', `kommentar${kommentar.resolvedAt ? ' erledigt' : ''}`);

  const kopf = textKnoten('div', 'kommentar-kopf');
  kopf.appendChild(textKnoten('span', 'autor', kommentar.author?.name || 'Unbekannt'));

  if (Number.isFinite(kommentar.frame)) {
    const sprung = textKnoten('button', 'tc', kommentar.timecode || `Frame ${kommentar.frame}`);
    sprung.title = 'Playhead auf diese Stelle setzen';
    sprung.addEventListener('click', async () => {
      const ergebnis = await aufruf(window.klappe.seek(kommentar.frame));
      if (ergebnis) status(`Playhead auf ${ergebnis.timecode}`, 'gut');
    });
    kopf.appendChild(sprung);
  } else {
    kopf.appendChild(textKnoten('span', 'klein', 'allgemein'));
  }

  kopf.appendChild(textKnoten('span', 'zeit', zeitpunkt(kommentar.createdAt)));
  eintrag.appendChild(kopf);

  eintrag.appendChild(textKnoten('div', 'rumpf', kommentar.body || ''));

  if (kommentar.annotation?.strokes?.length) {
    eintrag.appendChild(textKnoten('div', 'zeichnung', '✎ mit Zeichnung'));
  }

  if (kommentar.replies?.length) {
    const antworten = textKnoten('div', 'antworten');
    for (const antwort of kommentar.replies) {
      const zeile = textKnoten('div', 'antwort');
      zeile.appendChild(textKnoten('span', 'autor', `${antwort.author?.name || 'Unbekannt'}: `));
      zeile.appendChild(document.createTextNode(antwort.body || ''));
      antworten.appendChild(zeile);
    }
    eintrag.appendChild(antworten);
  }

  eintrag.appendChild(zeichneAntwortfeld(kommentar));
  return eintrag;
}

function zeichneAntwortfeld(kommentar) {
  const feld = textKnoten('div', 'antwortfeld');
  const eingabe = document.createElement('textarea');
  eingabe.placeholder = 'Antworten …';
  feld.appendChild(eingabe);

  const knoepfe = textKnoten('div', 'werkzeuge');
  const senden = textKnoten('button', '', 'Antworten');
  senden.addEventListener('click', async () => {
    const text = eingabe.value.trim();
    if (!text) return;
    senden.disabled = true;
    const antwort = await aufruf(window.klappe.reply(zustand.mapping.versionId, kommentar.id, text));
    senden.disabled = false;
    if (antwort) {
      eingabe.value = '';
      status('Antwort ist in Klappe.', 'gut');
      await ladeKommentare();
    }
  });

  const erledigt = textKnoten(
    'button',
    'leise',
    kommentar.resolvedAt ? 'Wieder öffnen' : 'Erledigt',
  );
  erledigt.addEventListener('click', async () => {
    erledigt.disabled = true;
    const ergebnis = await aufruf(window.klappe.setResolved(kommentar.id, !kommentar.resolvedAt));
    erledigt.disabled = false;
    if (ergebnis !== null) await ladeKommentare();
  });

  knoepfe.appendChild(senden);
  knoepfe.appendChild(erledigt);
  feld.appendChild(knoepfe);
  return feld;
}

/* ------------------------------------------------------------- Zuordnen */

/**
 * Zuordnen ist ein eigener Vorgang, kein halber Upload.
 *
 * Der übliche Fall: Jemand hat aus Resolve exportiert und die Datei im Browser
 * hochgeladen. Dann gibt es die Fassung längst, und der Timeline fehlt nur die
 * Verknüpfung – ohne die weiß das Panel nicht, wessen Kommentare es holen soll.
 */
async function oeffneZuordnen() {
  if (!zustand.hasToken) {
    status('Erst verbinden (Einstellungen).', 'fehler');
    return;
  }
  if (!zustand.context?.ok) {
    status(zustand.context?.reason || 'Resolve ist nicht erreichbar.', 'fehler');
    return;
  }

  el('zuordnen-form').classList.remove('versteckt');
  status('Ziel wählen und übernehmen.');

  const vorher = zustand.mapping || {};
  await fuelleProjekte(el('zu-projekt'), vorher.projectId);
  await fuelleVideos(el('zu-video'), el('zu-projekt').value, { vorauswahl: vorher.videoId });
  await fuelleFassungen(el('zu-fassung'), el('zu-video').value, {
    vorauswahl: vorher.versionNumber !== undefined ? String(vorher.versionNumber) : '',
  });

  el('zu-renderin').value = String(vorher.wholeTimeline === false ? vorher.renderIn || 0 : 0);
}

function schliesseZuordnen() {
  el('zuordnen-form').classList.add('versteckt');
}

async function uebernehmeZuordnung() {
  const context = zustand.context;
  if (!context?.ok) return;

  const fassung = el('zu-fassung').selectedOptions[0];
  if (!fassung || !fassung.dataset.id) {
    status('Zu diesem Video gibt es noch keine Fassung, die sich zuordnen ließe.', 'fehler');
    return;
  }

  const renderIn = Math.max(0, Math.round(Number(el('zu-renderin').value) || 0));

  const eintrag = await aufruf(
    window.klappe.mappingPut(context.timelineId, {
      timelineName: context.timelineName,
      resolveProject: context.projectName,
      projectId: el('zu-projekt').value,
      projectName: el('zu-projekt').selectedOptions[0]?.dataset.name || '',
      videoId: el('zu-video').value,
      videoName: el('zu-video').selectedOptions[0]?.dataset.name || '',
      versionId: fassung.dataset.id,
      versionNumber: Number(fassung.value),
      wholeTimeline: renderIn === 0,
      renderIn,
      renderOut: null,
      timelineStart: context.startFrame,
      frameRate: context.frameRate,
      dropFrame: context.dropFrame,
    }),
  );

  if (!eintrag) return;
  schliesseZuordnen();
  status(
    `Zugeordnet: ${eintrag.videoName || 'Video'}, Fassung ${eintrag.versionNumber}${
      renderIn > 0 ? ` (Render-Anfang Frame ${renderIn})` : ''
    }.`,
    'gut',
  );
  await ladeZustand();
}

/** Den Render-Anfang aus dem gesetzten In/Out übernehmen. */
function renderAnfangAusInOut() {
  const context = zustand.context;
  if (!context?.ok || !Number.isFinite(context.markIn)) {
    status('In der Timeline ist kein In/Out gesetzt.', 'fehler');
    return;
  }
  el('zu-renderin').value = String(context.markIn);
  status(`Render-Anfang auf Frame ${context.markIn} gesetzt.`);
}

/* --------------------------------------------------------------- Aktionen */

async function ladeZustand() {
  const daten = await aufruf(window.klappe.state());
  if (!daten) return;

  zustand.settings = daten.settings;
  zustand.context = daten.context;
  zustand.mapping = daten.mapping;
  zustand.user = daten.user;
  zustand.hasToken = daten.hasToken;

  zeichneKopf();
  zeichneKontext();
  zeichneZuordnung();
  fuelleEinstellungen(daten);

  if (daten.connectionError) status(daten.connectionError, 'fehler');

  if (zustand.mapping?.versionId) await ladeKommentare();
  else zeichneKommentare();
}

async function ladeKommentare() {
  if (!zustand.mapping?.versionId) {
    zustand.kommentare = [];
    zustand.zahlen = { open: 0, resolved: 0, total: 0 };
    zeichneKommentare();
    return;
  }

  const daten = await aufruf(window.klappe.comments(zustand.mapping.versionId));
  if (!daten) return;

  zustand.kommentare = daten.comments;
  zustand.zahlen = daten.counts;
  zeichneKommentare();
}

function wechsleAnsicht(name) {
  for (const knopf of document.querySelectorAll('.reiter button')) {
    knopf.classList.toggle('aktiv', knopf.dataset.ansicht === name);
  }
  for (const ansicht of document.querySelectorAll('.ansicht')) {
    ansicht.classList.toggle('versteckt', ansicht.id !== `ansicht-${name}`);
  }
  if (name === 'hochladen') void ladeHochladen();
  if (name === 'einstellungen') {
    void ladePresetAuswahl();
    void ladeRenderReste();
  }
}

/* ------------------------------------------------------------- Hochladen */

let projekteGeladen = false;

/** Presets aus Resolve holen; die Filterung nach Standard/Eigen macht der Hauptprozess. */
async function ladePresets() {
  const daten = await aufruf(window.klappe.renderPresets(), { still: true });
  if (daten && Array.isArray(daten.alle) && daten.alle.length > 0) zustand.presets = daten;
  return zustand.presets;
}

async function ladeHochladen() {
  if (!zustand.hasToken) {
    status('Erst verbinden (Einstellungen).', 'fehler');
    return;
  }

  const liste = (await ladePresets()).sichtbare;
  if (liste.length > 0) {
    const feld = el('preset');
    // Was gerade gewählt ist, gewinnt vor der Vorgabe: Wer im Dialog etwas
    // umstellt, will nicht bei jedem Reiterwechsel zurückgesetzt werden.
    const vorher = feld.value || zustand.settings?.defaultPreset || '';
    feld.textContent = '';
    for (const name of liste) feld.appendChild(option(name, name));
    if (vorher && [...feld.options].some((eintrag) => eintrag.value === vorher)) {
      feld.value = vorher;
    }
  }

  const einstellungen = await aufruf(window.klappe.versionSettings(), { still: true });
  if (einstellungen) {
    zustand.fassungseinstellungen = einstellungen;
    zeichneInternZeile(einstellungen);
  }

  if (projekteGeladen) return;
  const projekte = await fuelleProjekte(el('ziel-projekt'), zustand.mapping?.projectId);
  if (!projekte) return;
  projekteGeladen = true;

  await ladeVideosFuerUpload(el('ziel-projekt').value);
}

/**
 * Der Haken – oder sein Fehlen. Entschieden wird die Sache im Hauptprozess;
 * hier steht nur, was jemand davon sieht.
 */
function zeichneInternZeile(einstellungen) {
  el('intern-zeile').classList.toggle('versteckt', !einstellungen.zeigeHaken);
  el('ziel-intern').checked = Boolean(einstellungen.vorbelegt);

  const hinweis = el('intern-hinweis');
  hinweis.classList.toggle('versteckt', einstellungen.zeigeHaken);

  if (einstellungen.immerIntern) {
    hinweis.textContent =
      'Diese Fassung wird intern hochgeladen. Der Kunde sieht sie erst, wenn sie jemand aus dem Team freigibt.';
  } else if (!einstellungen.internalEnabled) {
    hinweis.textContent =
      'Diese Instanz fährt keine interne Runde – die Fassung ist sofort für alle sichtbar.';
  } else {
    hinweis.textContent = '';
  }
}

async function ladeVideosFuerUpload(projectId) {
  await fuelleVideos(el('ziel-video'), projectId, {
    mitNeu: true,
    vorauswahl: zustand.mapping?.videoId,
  });
  await ladeFassungenFuerUpload();
}

async function ladeFassungenFuerUpload() {
  const videoId = el('ziel-video').value;
  el('neues-video').classList.toggle('versteckt', videoId !== '__neu__');
  await fuelleFassungen(el('ziel-fassung'), videoId, {
    neuText: 'Neue Fassung (Nummer zählt Klappe weiter)',
  });
  zeigeErsetzenWarnung();
}

function zeigeErsetzenWarnung() {
  el('ersetzen-warnung').classList.toggle('versteckt', el('ziel-fassung').value === 'neu');
}

/** Das Ziel, wie es im Upload-Formular steht. */
async function ermittleZiel() {
  const projectId = el('ziel-projekt').value;
  const projectName = el('ziel-projekt').selectedOptions[0]?.dataset.name || '';
  let videoId = el('ziel-video').value;
  let videoName = el('ziel-video').selectedOptions[0]?.dataset.name || '';

  if (videoId === '__neu__') {
    const name = el('neues-video-name').value.trim();
    if (!name) {
      status('Der Name des neuen Videos fehlt.', 'fehler');
      return null;
    }
    const video = await aufruf(window.klappe.createVideo(projectId, name));
    if (!video) return null;
    videoId = video.id;
    videoName = video.name;
    projekteGeladen = false;
  }

  const fassungswahl = el('ziel-fassung').value;
  const ersetzen = fassungswahl !== 'neu';

  return {
    projectId,
    projectName,
    videoId,
    videoName,
    versionNumber: ersetzen ? Number(fassungswahl) : undefined,
    replace: ersetzen,
    internal: zustand.fassungseinstellungen.internalEnabled && el('ziel-intern').checked,
    label: el('ziel-label').value.trim(),
    preset: el('preset').value,
    wholeTimeline: el('bereich').value === 'ganz',
  };
}

async function starteUpload() {
  if (zustand.laueftUpload) return;
  const ziel = await ermittleZiel();
  if (!ziel) return;
  if (!ziel.preset) {
    status('Es ist kein Render-Preset gewählt.', 'fehler');
    return;
  }

  if (ziel.replace) {
    const sicher = window.confirm(
      `Fassung ${ziel.versionNumber} wirklich ersetzen?\n\n` +
        'Die Kommentare dieser Fassung verschwinden mit ihr – sie hängen an Frames ' +
        'eines Ausspielens, das es dann nicht mehr gibt.',
    );
    if (!sicher) return;
  }

  zustand.laueftUpload = true;
  el('hochladen-start').disabled = true;
  el('hochladen-abbruch').classList.remove('versteckt');
  el('fortschritt').classList.remove('versteckt');
  el('upload-ergebnis').classList.add('versteckt');
  status('');

  const ergebnis = await aufruf(window.klappe.uploadRun(ziel));

  zustand.laueftUpload = false;
  el('hochladen-start').disabled = false;
  el('hochladen-abbruch').classList.add('versteckt');

  if (!ergebnis) return;
  zeigeUploadErgebnis(ergebnis);
  await ladeZustand();
}

function zeigeUploadErgebnis(ergebnis) {
  const karte = el('upload-ergebnis');
  karte.textContent = '';
  karte.classList.remove('versteckt');

  const fassung = ergebnis.version;
  karte.appendChild(
    textKnoten(
      'div',
      '',
      `Fassung ${fassung.versionNumber} ist da (${
        fassung.status === 'READY' ? 'fertig verarbeitet' : fassung.status
      }).`,
    ),
  );

  // Bei einer internen Fassung ist der Link allein irreführend: Wer ihn
  // weitergibt, ohne freizugeben, schickt den Kunden auf eine Seite, auf der
  // die Fassung für ihn nicht existiert. Das gehört neben den Link, nicht in
  // eine Fußnote.
  if (fassung.internal) {
    const warnung = textKnoten(
      'div',
      'warnung',
      'Diese Fassung ist intern – der Kunde sieht sie noch nicht. Bitte reviewen und freigeben, damit er sie bekommt.',
    );
    karte.appendChild(warnung);
  }

  const knoepfe = textKnoten('div', 'werkzeuge');

  if (ergebnis.webUrl) {
    const oeffnen = textKnoten('button', 'wichtig', 'Im Browser öffnen');
    oeffnen.addEventListener('click', () => window.klappe.openExternal(ergebnis.webUrl));
    knoepfe.appendChild(oeffnen);
  }

  if (fassung.internal) {
    const freigeben = textKnoten('button', 'wichtig', 'Reviewen und freigeben');
    freigeben.title = 'Macht die interne Fassung für den Kunden sichtbar';
    freigeben.addEventListener('click', async () => {
      const sicher = window.confirm(
        `Fassung ${fassung.versionNumber} freigeben?\n\n` +
          'Danach sieht sie jeder, der über einen Freigabe-Link Zugang zum Video hat – auch der Kunde.',
      );
      if (!sicher) return;
      freigeben.disabled = true;
      const ergebnisFreigabe = await aufruf(window.klappe.releaseVersion(fassung.id));
      if (ergebnisFreigabe) {
        status('Fassung ist freigegeben – der Kunde sieht sie jetzt.', 'gut');
        freigeben.textContent = 'Freigegeben';
        karte.querySelector('.warnung')?.remove();
      } else {
        freigeben.disabled = false;
      }
    });
    knoepfe.appendChild(freigeben);
  }

  const marker = textKnoten('button', '', 'Marker setzen');
  marker.addEventListener('click', () => {
    wechsleAnsicht('kommentare');
    void setzeMarker();
  });
  knoepfe.appendChild(marker);

  karte.appendChild(knoepfe);
  status('Upload fertig.', 'gut');
}

/* ------------------------------------------------------- Marker & Overlays */

/**
 * Ergebnis einer Timeline-Aktion anzeigen. `zeilen` sind kurze Sätze,
 * `probleme` je ein Eintrag mit `reason` – die stehen ausführlich da, weil
 * Resolve bei abgelehnten Clips selbst nicht sagt, welcher Wert ihm nicht passt.
 */
function zeigeTimelineErgebnis(titel, zeilen, probleme = []) {
  const karte = el('timeline-ergebnis');
  karte.textContent = '';
  karte.classList.remove('versteckt');

  karte.appendChild(textKnoten('strong', '', titel));
  for (const zeile of zeilen) karte.appendChild(textKnoten('div', 'klein', zeile));

  if (probleme.length > 0) {
    const liste = textKnoten('div', 'antworten');
    for (const problem of probleme) {
      liste.appendChild(textKnoten('div', 'klein', `• ${problem.reason}`));
    }
    karte.appendChild(liste);
  }
}

function versteckeTimelineErgebnis() {
  el('timeline-ergebnis').classList.add('versteckt');
}

async function setzeMarker() {
  if (!zustand.mapping?.versionId) {
    status('Erst eine Fassung zuordnen.', 'fehler');
    return;
  }
  status('Marker werden gesetzt …');
  versteckeTimelineErgebnis();
  const ergebnis = await aufruf(window.klappe.syncMarkers(zustand.mapping.versionId));
  if (!ergebnis) return;

  const teile = [
    `${ergebnis.added} neu`,
    `${ergebnis.replaced} geändert`,
    `${ergebnis.removed} entfernt`,
    `${ergebnis.unchanged} unverändert`,
  ];
  if (ergebnis.outOfRange > 0) {
    teile.push(`${ergebnis.outOfRange} hinter dem Timeline-Ende (nicht gesetzt)`);
  }
  status(`Marker: ${teile.join(', ')}.`, ergebnis.outOfRange > 0 ? 'fehler' : 'gut');
}

async function setzeOverlays() {
  if (!zustand.mapping?.versionId) {
    status('Erst eine Fassung zuordnen.', 'fehler');
    return;
  }
  status('Zeichnungen werden geholt und eingefügt …');
  versteckeTimelineErgebnis();
  const ergebnis = await aufruf(window.klappe.syncOverlays(zustand.mapping.versionId));
  if (!ergebnis) return;

  const laenge = ergebnis.frames > 0 ? ` je ${ergebnis.frames} Frame(s)` : '';
  const kurz = `${ergebnis.inserted} von ${ergebnis.drawings} Zeichnungen auf der Spur „${ergebnis.track}"${laenge}.`;
  status(
    ergebnis.failed.length > 0 ? `${kurz} ${ergebnis.failed.length} nicht möglich.` : kurz,
    ergebnis.failed.length > 0 ? 'fehler' : 'gut',
  );

  // Nach dem Einfügen ist die Spur sichtbar – sonst sähe man nichts.
  zustand.overlaysSichtbar = true;
  zeichneSichtbarkeitsknopf();

  if (ergebnis.failed.length > 0) {
    zeigeTimelineErgebnis(
      'Zeichnungen einfügen',
      [kurz, `Spur ${ergebnis.trackIndex} · ${ergebnis.failed.length} abgelehnt:`],
      ergebnis.failed,
    );
  }
}

function zeichneSichtbarkeitsknopf() {
  el('overlays-sichtbar').textContent = zustand.overlaysSichtbar
    ? 'Zeichnungen ausblenden'
    : 'Zeichnungen einblenden';
}

/**
 * Zeichnungen von Hand ein- oder ausblenden.
 *
 * Beim Ausspielen über das Panel geschieht das von selbst. Dieser Knopf ist
 * für den Export über Resolves Deliver-Seite – dort weiß das Plugin nichts
 * davon, und ein Kringel im Master fällt erst beim Kunden auf.
 */
async function schalteOverlays() {
  const ziel = !zustand.overlaysSichtbar;
  const ergebnis = await aufruf(window.klappe.setOverlaysVisible(ziel));
  if (!ergebnis) return;

  if (!ergebnis.found) {
    status('In dieser Timeline gibt es keine Klappe-Spur.', 'fehler');
    return;
  }

  zustand.overlaysSichtbar = ergebnis.visible;
  zeichneSichtbarkeitsknopf();
  status(
    ergebnis.visible
      ? `Spur „${ergebnis.track}" ist wieder sichtbar.`
      : `Spur „${ergebnis.track}" ist ausgeblendet – jetzt kann von Hand exportiert werden.`,
    'gut',
  );
}

async function raeumeAuf() {
  const sicher = window.confirm(
    'Alle Klappe-Marker und Klappe-Overlays aus dieser Timeline entfernen?\n\n' +
      'Fremdes Material auf der Spur bleibt unangetastet.',
  );
  if (!sicher) return;

  status('Wird aufgeräumt …');
  const ergebnis = await aufruf(window.klappe.cleanupAll());
  if (!ergebnis) return;
  status(
    `${ergebnis.markers.removed} Marker und ${ergebnis.overlays.removed} Overlay-Clips entfernt${
      ergebnis.overlays.trackDeleted ? ', Spur gelöscht' : ''
    }.`,
    'gut',
  );
}

/* ---------------------------------------------------------- Einstellungen */

function fuelleFarben(feld, wert) {
  if (feld.options.length === 0) {
    for (const farbe of MARKER_FARBEN) feld.appendChild(option(farbe, farbe));
  }
  feld.value = wert;
}

/**
 * Die Preset-Auswahl. Resolve bringt mehrere Dutzend mit – hier wird
 * angehakt, was im Upload-Dialog stehen soll.
 */
async function ladePresetAuswahl(neuEinlesen = false) {
  const liste = el('preset-liste');
  const hinweis = el('preset-hinweis');

  if (zustand.presets.alle.length === 0 || neuEinlesen) await ladePresets();
  const { standard, eigene } = zustand.presets;

  if (standard.length === 0 && eigene.length === 0) {
    liste.textContent = '';
    hinweis.textContent =
      'Resolve liefert gerade keine Presets – dafür muss ein Projekt geöffnet sein.';
    return;
  }

  const modus = zustand.settings?.standardPresetsMode || 'keine';
  const gewaehlt = new Set(zustand.settings?.renderPresetsStandard || []);

  const sichtbareStandard =
    modus === 'alle' ? standard.length : modus === 'keine' ? 0 : gewaehlt.size;
  hinweis.textContent = `${eigene.length} eigene Presets (immer dabei) · ${sichtbareStandard} von ${standard.length} mitgelieferten.`;

  liste.textContent = '';

  if (eigene.length > 0) {
    liste.appendChild(textKnoten('div', 'gruppentitel', 'Eigene Presets (immer dabei)'));
    for (const name of eigene) {
      liste.appendChild(textKnoten('div', 'festeintrag', `✓ ${name}`));
    }
  }

  if (standard.length > 0) {
    liste.appendChild(textKnoten('div', 'gruppentitel', 'Mitgelieferte Presets von Resolve'));
    for (const name of standard) {
      const zeile = document.createElement('label');
      const haken = document.createElement('input');
      haken.type = 'checkbox';
      haken.value = name;
      haken.checked = modus === 'alle' || (modus === 'auswahl' && gewaehlt.has(name));
      zeile.appendChild(haken);
      zeile.appendChild(document.createTextNode(name));
      liste.appendChild(zeile);
    }
  }

  zeichnePresetVorgabe();
}

/**
 * Das vorgewählte Preset. Zur Wahl steht, was auch im Upload-Dialog steht –
 * eins vorzuwählen, das dort gar nicht auftaucht, wäre eine Falle.
 */
function zeichnePresetVorgabe() {
  const feld = el('preset-vorgabe');
  const vorgabe = zustand.settings?.defaultPreset || '';

  feld.textContent = '';
  feld.appendChild(option('', '— das erste der Liste —'));
  for (const name of zustand.presets.sichtbare) feld.appendChild(option(name, name));

  if (vorgabe && [...feld.options].some((eintrag) => eintrag.value === vorgabe)) {
    feld.value = vorgabe;
  } else if (vorgabe) {
    // Das gemerkte Preset gibt es nicht mehr oder es ist gerade ausgeblendet.
    // Das gehört gesagt, nicht stillschweigend auf „erstes" gedreht.
    feld.appendChild(option(vorgabe, `${vorgabe} (nicht in der Liste)`));
    feld.value = vorgabe;
  }
}

function setzeAllePresets(angehakt) {
  for (const haken of el('preset-liste').querySelectorAll('input[type="checkbox"]')) {
    haken.checked = angehakt;
  }
}

async function speicherePresets() {
  const haken = [...el('preset-liste').querySelectorAll('input[type="checkbox"]')];
  const gewaehlt = haken.filter((eintrag) => eintrag.checked).map((eintrag) => eintrag.value);

  // Der Modus wird aus den Haken abgelesen, statt ihn zusätzlich abzufragen.
  // „Alles angehakt" heißt bewusst `alle` und nicht „genau diese Liste": Sonst
  // stünde die Liste von heute fest, und ein Preset aus einer künftigen
  // Resolve-Fassung tauchte nie auf.
  let modus = 'auswahl';
  if (gewaehlt.length === 0) modus = 'keine';
  else if (gewaehlt.length === haken.length) modus = 'alle';

  const gespeichert = await aufruf(
    window.klappe.saveConfig({
      standardPresetsMode: modus,
      renderPresetsStandard: modus === 'auswahl' ? gewaehlt : [],
      defaultPreset: el('preset-vorgabe').value,
    }),
  );
  if (!gespeichert) return;

  zustand.settings = gespeichert;
  await ladePresetAuswahl();
  // Die Auswahl im Upload-Dialog gleich mitziehen, sonst steht dort noch die
  // alte Liste, bis jemand den Reiter wechselt.
  el('preset').textContent = '';
  await ladeHochladen();

  const meldung = {
    keine: 'Nur eigene Presets im Upload-Dialog.',
    alle: 'Alle Presets im Upload-Dialog.',
    auswahl: `${gewaehlt.length} mitgelieferte Presets dazu (eigene sind immer dabei).`,
  };
  const vorgabe = gespeichert.defaultPreset ? ` Vorgewählt: ${gespeichert.defaultPreset}.` : '';
  status(`${meldung[modus]}${vorgabe}`, 'gut');
}

function fuelleEinstellungen(daten) {
  const s = daten.settings;
  el('server-url').value = s.serverUrl;
  el('overlay-pfad').value = s.overlayPath;
  el('mapping-pfad').value = s.mappingPath;
  el('render-pfad').value = s.renderDir;
  el('overlay-frames').value = s.overlayFrames;
  el('intern-modus').value = s.internalMode;
  el('allgemeine-marker').checked = Boolean(s.markGeneralComments);
  fuelleFarben(el('farbe-offen'), s.markerColor);
  fuelleFarben(el('farbe-erledigt'), s.markerColorResolved);

  el('trennen').classList.toggle('versteckt', !daten.hasToken);
  el('verbinden').classList.toggle('versteckt', daten.hasToken);

  el('token-ablage').textContent = daten.hasToken
    ? `Zugang liegt ${
        daten.tokenStorage === 'schluesselbund' ? 'im Schlüsselbund' : 'in einer Datei mit engen Rechten'
      } · Gerätename: ${daten.clientName}`
    : '';

  el('pfad-hinweis').textContent = `Zuordnung: ${daten.mappingFile} · Zeichnungen: ${daten.overlayDir}`;
}

/** Bytes so schreiben, wie man sie am Schnittplatz liest. */
function bytes(wert) {
  const einheiten = ['B', 'KB', 'MB', 'GB', 'TB'];
  let zahl = Number(wert) || 0;
  let stufe = 0;
  while (zahl >= 1024 && stufe < einheiten.length - 1) {
    zahl /= 1024;
    stufe += 1;
  }
  return `${zahl.toFixed(zahl >= 10 || stufe === 0 ? 0 : 1)} ${einheiten[stufe]}`;
}

/**
 * Was liegt im Zwischenordner? Nach einem abgebrochenen Upload bleibt der
 * gerenderte Master absichtlich liegen – dann soll aber auch jemand davon
 * erfahren, statt es erst zu merken, wenn die Platte voll ist.
 */
async function ladeRenderReste() {
  const stand = await aufruf(window.klappe.rendersStatus(), { still: true });
  const hinweis = el('renders-hinweis');
  const liste = el('renders-liste');

  if (!stand) {
    hinweis.textContent = 'Der Zwischenordner ließ sich nicht prüfen.';
    return;
  }

  if (stand.anzahl === 0) {
    hinweis.textContent = `${stand.ordner} — nichts liegen geblieben.`;
    liste.classList.add('versteckt');
    liste.textContent = '';
    return;
  }

  hinweis.textContent =
    `${stand.ordner} — ${stand.anzahl} Datei(en), ${bytes(stand.bytes)}. ` +
    `Reste älter als ${stand.maxAlterStunden} Stunden verschwinden beim nächsten Upload von selbst.`;

  liste.textContent = '';
  liste.classList.remove('versteckt');
  for (const eintrag of stand.dateien) {
    const name = eintrag.pfad.split('/').pop();
    liste.appendChild(
      textKnoten(
        'div',
        'festeintrag',
        `${eintrag.inArbeit ? '⏳' : '•'} ${name} — ${bytes(eintrag.bytes)}${
          eintrag.timeline ? ` (${eintrag.timeline})` : ''
        }`,
      ),
    );
  }
}

async function speicherePfade() {
  const gespeichert = await aufruf(
    window.klappe.saveConfig({
      overlayPath: el('overlay-pfad').value.trim(),
      mappingPath: el('mapping-pfad').value.trim(),
      renderDir: el('render-pfad').value.trim(),
      overlayFrames: Number(el('overlay-frames').value) || 1,
      markerColor: el('farbe-offen').value,
      markerColorResolved: el('farbe-erledigt').value,
      markGeneralComments: el('allgemeine-marker').checked,
    }),
  );
  if (gespeichert) {
    status('Einstellungen gespeichert.', 'gut');
    await ladeZustand();
  }
}

async function starteKopplung() {
  const adresse = el('server-url').value.trim();
  if (!adresse) {
    status('Erst die Adresse der Klappe-Instanz eintragen.', 'fehler');
    return;
  }
  await aufruf(window.klappe.saveConfig({ serverUrl: adresse }));

  const kopplung = await aufruf(window.klappe.pairStart());
  if (!kopplung) return;

  el('kopplung').classList.remove('versteckt');
  el('benutzercode').textContent = kopplung.userCode;
  el('kopplung-status').textContent = `Gilt ${Math.round(
    kopplung.expiresInSeconds / 60,
  )} Minuten. Gerätename: ${kopplung.clientName}`;
  el('kopplung-browser').onclick = () =>
    window.klappe.openExternal(kopplung.verificationUrlComplete || kopplung.verificationUrl);

  // Direkt aufmachen: Wer am Schnittplatz sitzt, hat den Browser danebenstehen.
  await window.klappe.openExternal(kopplung.verificationUrlComplete || kopplung.verificationUrl);
  status('Im Browser bestätigen – das Panel wartet.');
}

/* ------------------------------------------------------------ Verdrahtung */

function verdrahte() {
  for (const knopf of document.querySelectorAll('.reiter button')) {
    knopf.addEventListener('click', () => wechsleAnsicht(knopf.dataset.ansicht));
  }

  el('kontext-neu').addEventListener('click', ladeZustand);
  el('kommentare-neu').addEventListener('click', ladeKommentare);
  el('marker-setzen').addEventListener('click', setzeMarker);
  el('overlays-setzen').addEventListener('click', setzeOverlays);
  el('overlays-sichtbar').addEventListener('click', schalteOverlays);
  el('alles-weg').addEventListener('click', raeumeAuf);

  for (const feld of document.querySelectorAll('input[name="filter"]')) {
    feld.addEventListener('change', zeichneKommentare);
  }

  // Zuordnen
  el('zu-projekt').addEventListener('change', async (event) => {
    await fuelleVideos(el('zu-video'), event.target.value);
    await fuelleFassungen(el('zu-fassung'), el('zu-video').value);
  });
  el('zu-video').addEventListener('change', (event) =>
    fuelleFassungen(el('zu-fassung'), event.target.value),
  );
  el('zu-uebernehmen').addEventListener('click', uebernehmeZuordnung);
  el('zu-aus-inout').addEventListener('click', renderAnfangAusInOut);
  el('zu-abbrechen').addEventListener('click', schliesseZuordnen);

  // Hochladen
  el('ziel-projekt').addEventListener('change', (event) =>
    ladeVideosFuerUpload(event.target.value),
  );
  el('ziel-video').addEventListener('change', ladeFassungenFuerUpload);
  el('ziel-fassung').addEventListener('change', zeigeErsetzenWarnung);
  el('hochladen-start').addEventListener('click', starteUpload);
  el('hochladen-abbruch').addEventListener('click', async () => {
    await window.klappe.uploadAbort();
    status('Abbruch angefordert – der angefangene Upload lässt sich später fortsetzen.');
  });

  // Einstellungen
  el('server-speichern').addEventListener('click', async () => {
    const gespeichert = await aufruf(
      window.klappe.saveConfig({ serverUrl: el('server-url').value.trim() }),
    );
    if (gespeichert) {
      status('Adresse gespeichert.', 'gut');
      await ladeZustand();
    }
  });

  el('verbinden').addEventListener('click', starteKopplung);
  el('kopplung-abbruch').addEventListener('click', async () => {
    await window.klappe.pairCancel();
    el('kopplung').classList.add('versteckt');
    status('Kopplung abgebrochen.');
  });

  el('trennen').addEventListener('click', async () => {
    if (!window.confirm('Verbindung zu Klappe trennen?')) return;
    const ergebnis = await aufruf(window.klappe.disconnect());
    if (ergebnis) {
      status(
        ergebnis.serverSide
          ? 'Getrennt – das Gerät ist auch in Klappe entfernt.'
          : 'Lokal getrennt. In Klappe steht das Gerät ggf. noch unter „Mein Konto → Verbundene Geräte".',
        'gut',
      );
      await ladeZustand();
    }
  });

  el('intern-speichern').addEventListener('click', async () => {
    const gespeichert = await aufruf(
      window.klappe.saveConfig({ internalMode: el('intern-modus').value }),
    );
    if (!gespeichert) return;
    zustand.settings = gespeichert;
    await ladeHochladen();
    status(
      gespeichert.internalMode === 'immer'
        ? 'Fassungen werden ab jetzt immer intern hochgeladen.'
        : 'Der Haken im Upload-Dialog entscheidet ab jetzt je Fassung.',
      'gut',
    );
  });

  el('presets-speichern').addEventListener('click', speicherePresets);
  el('presets-alle').addEventListener('click', () => setzeAllePresets(true));
  el('presets-keine').addEventListener('click', () => setzeAllePresets(false));
  el('presets-neu').addEventListener('click', () => ladePresetAuswahl(true));

  el('pfade-speichern').addEventListener('click', speicherePfade);

  el('renders-pruefen').addEventListener('click', ladeRenderReste);
  el('renders-aufraeumen').addEventListener('click', async () => {
    const sicher = window.confirm(
      'Alle liegen gebliebenen Zwischen-Master löschen?\n\n' +
        'Was gerade hochgeladen wird, bleibt unangetastet. Die Dateien in Klappe sind davon nicht betroffen – das hier ist nur der Renderordner.',
    );
    if (!sicher) return;

    const ergebnis = await aufruf(window.klappe.rendersCleanup(true));
    if (!ergebnis) return;
    status(
      ergebnis.geloescht > 0
        ? `${ergebnis.geloescht} Datei(en) gelöscht, ${bytes(ergebnis.bytes)} frei.`
        : 'Nichts zu löschen.',
      'gut',
    );
    await ladeRenderReste();
  });

  for (const knopf of document.querySelectorAll('button[data-pfad]')) {
    knopf.addEventListener('click', async (event) => {
      event.preventDefault();
      const pfad = await aufruf(window.klappe.pickFolder('Ordner wählen'));
      if (!pfad) return;
      const feld = {
        overlayPath: 'overlay-pfad',
        mappingPath: 'mapping-pfad',
        renderDir: 'render-pfad',
      }[knopf.dataset.pfad];
      el(feld).value = pfad;
    });
  }

  window.klappe.onEvent((ereignis) => {
    if (ereignis.type === 'upload:progress') {
      el('balken-fuellung').style.width = `${ereignis.percent || 0}%`;
      el('fortschritt-text').textContent = ereignis.text || '';
    }
    if (ereignis.type === 'pair:tick') {
      el('kopplung-status').textContent = `Warte auf Bestätigung … noch ${ereignis.secondsLeft} s`;
    }
    if (ereignis.type === 'pair:done') {
      el('kopplung').classList.add('versteckt');
      status(`Verbunden als ${ereignis.user?.name || ereignis.name}.`, 'gut');
      void ladeZustand();
    }
    if (ereignis.type === 'pair:failed') {
      el('kopplung').classList.add('versteckt');
      status(ereignis.error, 'fehler');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  verdrahte();
  void ladeZustand();
});
