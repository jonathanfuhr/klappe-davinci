/**
 * Englischer Katalog.
 *
 * **Links steht der deutsche Satz aus dem Code, rechts die Übersetzung.** Wer
 * einen Satz im Code ändert, muss den Schlüssel hier mitziehen – sonst bleibt
 * die Stelle auf Deutsch stehen. Genau das prüft `test/i18n.test.js`: Jeder
 * `t()`-Aufruf im Quelltext muss hier einen Eintrag haben, und die Platzhalter
 * müssen auf beiden Seiten dieselben sein.
 *
 * Was in beiden Sprachen gleich heißt (`Video`, `Team`), steht hier trotzdem
 * – mit sich selbst als Übersetzung. Ohne den Eintrag käme zwar dasselbe
 * heraus (ein fehlender Schlüssel gibt den deutschen Satz zurück), aber dann
 * wäre „geprüft und gleich" nicht von „übersehen" zu unterscheiden. Genau
 * diese Unterscheidung ist der Sinn der Vollständigkeitsprüfung im Test.
 *
 * Eine weitere Sprache: diese Datei kopieren, übersetzen, in `KATALOGE`
 * (i18n.js) eintragen.
 */

module.exports = {
  /* ------------------------------------------------------ Kopf und Kontext */
  Verbindung: 'Connection',
  'keine Adresse eingetragen': 'no address configured',
  'nicht verbunden': 'not connected',
  'Verbindung gestört': 'connection trouble',
  Gast: 'Guest',
  Team: 'Team',
  'Resolve wird abgefragt …': 'Asking Resolve …',
  'Resolve ist nicht erreichbar.': 'Resolve cannot be reached.',
  'In/Out gesetzt ({von}–{bis})': 'In/out set ({von}–{bis})',
  'ganze Timeline': 'whole timeline',
  '{rate} fps': '{rate} fps',
  Aktualisieren: 'Refresh',
  'Projekt und Timeline neu einlesen': 'Read project and timeline again',

  /* ---------------------------------------------------------------- Reiter */
  Kommentare: 'Comments',
  Hochladen: 'Upload',
  Einstellungen: 'Settings',

  /* ------------------------------------------------------------- Zuordnung */
  'Ohne offene Timeline gibt es nichts zuzuordnen.':
    'Without an open timeline there is nothing to link.',
  'Diese Timeline ist noch keiner Fassung zugeordnet. Nach dem Hochladen aus dem Panel steht sie hier von selbst – wer von Hand exportiert und im Browser hochgeladen hat, verknüpft sie hier.':
    'This timeline is not linked to a version yet. After uploading from the panel it appears here by itself – if you exported by hand and uploaded in the browser, link it here.',
  'Fassung zuordnen …': 'Link a version …',
  'Ändern …': 'Change …',
  'Zuordnung lösen': 'Remove link',
  'Die Zuordnung dieser Timeline entfernen?': 'Remove the link for this timeline?',
  'Zuordnung gelöst.': 'Link removed.',
  'Fassung {nummer}': 'Version {nummer}',
  'Render-Anfang Frame {frame}': 'render start at frame {frame}',
  'zuletzt am {zeitpunkt}': 'last on {zeitpunkt}',
  unbekannt: 'unknown',
  Projekt: 'Project',
  Fassung: 'Version',
  'Render-Anfang in der Timeline (Frame)': 'Render start within the timeline (frame)',
  '0 heißt: Das erste Bild der Fassung ist das erste Bild der Timeline. Wurde nur ein Bereich ausgespielt, steht hier dessen erster Frame – ab Timeline-Anfang gezählt. Der Knopf daneben übernimmt das gesetzte In/Out.':
    '0 means: the first frame of the version is the first frame of the timeline. If only a range was rendered, enter its first frame – counted from the start of the timeline. The button next to it takes the in/out you have set.',
  'In/Out übernehmen': 'Take in/out',
  Übernehmen: 'Apply',
  Abbrechen: 'Cancel',
  'Ziel wählen und übernehmen.': 'Choose a target and apply.',
  'Zu diesem Video gibt es noch keine Fassung, die sich zuordnen ließe.':
    'This video has no version yet that could be linked.',
  'Zugeordnet: {video}, Fassung {nummer}{bereich}.': 'Linked: {video}, version {nummer}{bereich}.',
  'In der Timeline ist kein In/Out gesetzt.': 'No in/out is set in the timeline.',
  'Render-Anfang auf Frame {frame} gesetzt.': 'Render start set to frame {frame}.',

  /* ------------------------------------------------------ Kommentarliste */
  'Marker setzen': 'Set markers',
  'Zeichnungen einfügen': 'Insert drawings',
  'Zeichnungen ausblenden': 'Hide drawings',
  'Zeichnungen einblenden': 'Show drawings',
  'Vor einem Export von Hand ausblenden – beim Ausspielen über dieses Panel passiert das automatisch':
    'Hide before exporting by hand – when rendering through this panel it happens automatically',
  'Aufräumen': 'Clean up',
  offene: 'open',
  alle: 'all',
  'Neu laden': 'Reload',
  '{offen} offen · {gesamt} gesamt': '{offen} open · {gesamt} in total',
  'Keine Kommentare in dieser Auswahl.': 'No comments in this selection.',
  'Erst eine Fassung zuordnen, dann stehen die Kommentare hier.':
    'Link a version first, then the comments appear here.',
  Unbekannt: 'Unknown',
  'Frame {frame}': 'Frame {frame}',
  'Playhead auf diese Stelle setzen': 'Move the playhead here',
  'Playhead auf {timecode}': 'Playhead at {timecode}',
  allgemein: 'general',
  Allgemein: 'General',
  '✎ mit Zeichnung': '✎ with drawing',
  'Antworten …': 'Reply …',
  Antworten: 'Reply',
  'Antwort ist in Klappe.': 'Reply is in Klappe.',
  Erledigt: 'Resolve',
  'Wieder öffnen': 'Reopen',
  'Erst eine Fassung zuordnen.': 'Link a version first.',
  'Marker werden gesetzt …': 'Setting markers …',
  '{anzahl} neu': '{anzahl} new',
  '{anzahl} geändert': '{anzahl} changed',
  '{anzahl} entfernt': '{anzahl} removed',
  '{anzahl} unverändert': '{anzahl} unchanged',
  '{anzahl} hinter dem Timeline-Ende (nicht gesetzt)':
    '{anzahl} beyond the end of the timeline (not set)',
  'Marker: {liste}.': 'Markers: {liste}.',
  'Zeichnungen werden geholt und eingefügt …': 'Fetching and inserting drawings …',
  ' je {frames} Frame(s)': ', {frames} frame(s) each',
  '{eingefuegt} von {gesamt} Zeichnungen auf der Spur „{spur}"{laenge}.':
    '{eingefuegt} of {gesamt} drawings on track “{spur}”{laenge}.',
  '{anzahl} nicht möglich.': '{anzahl} not possible.',
  'Spur {spur} · {anzahl} Hinweis(e):': 'Track {spur} · {anzahl} note(s):',
  'Die Zeichnungen sind {ist} statt {soll} Frames lang: Die Bilder lagen schon im Bin und tragen die Länge von damals. Einmal „Aufräumen" drücken und neu einfügen – dann werden sie neu importiert.':
    'The drawings are {ist} instead of {soll} frames long: the images were already in the bin and carry the length from back then. Press “Clean up” once and insert again – then they are imported afresh.',
  '{gefunden} Marker in der Timeline, {kennung} mit Klappe-Kennung.':
    '{gefunden} markers in the timeline, {kennung} carrying the Klappe tag.',
  '{anzahl} über die Farbe erkannt – diese Resolve-Fassung gibt die Kennung nicht zurück.':
    '{anzahl} recognised by colour – this version of Resolve does not return the tag.',
  'Nicht löschbar bei Frame: {frames}': 'Could not be deleted at frame: {frames}',
  'In dieser Timeline gibt es keine Klappe-Spur.': 'There is no Klappe track in this timeline.',
  'Spur „{spur}" ist wieder sichtbar.': 'Track “{spur}” is visible again.',
  'Spur „{spur}" ist ausgeblendet – jetzt kann von Hand exportiert werden.':
    'Track “{spur}” is hidden – you can now export by hand.',
  'Alle Klappe-Marker und Klappe-Overlays aus dieser Timeline entfernen?':
    'Remove all Klappe markers and Klappe overlays from this timeline?',
  'Fremdes Material auf der Spur bleibt unangetastet.':
    'Other material on the track stays untouched.',
  'Wird aufgeräumt …': 'Cleaning up …',
  '{marker} Marker und {clips} Overlay-Clips entfernt{spur}.':
    '{marker} markers and {clips} overlay clips removed{spur}.',
  ', Spur gelöscht': ', track deleted',

  /* ---------------------------------------------------------- Hochladen */
  'Render-Preset': 'Render preset',
  Bereich: 'Range',
  'Wie in Resolve (In/Out, sonst ganze Timeline)':
    'As in Resolve (in/out if set, otherwise the whole timeline)',
  'Immer die ganze Timeline': 'Always the whole timeline',
  Video: 'Video',
  'Neues Projekt anlegen': 'Create a new project',
  'Name des neuen Projekts': 'Name of the new project',
  'z. B. Kampagne Frühjahr': 'e.g. Spring campaign',
  'Kunde (optional)': 'Client (optional)',
  'steht im Download-Dateinamen': 'appears in the download file name',
  'Der Name des neuen Projekts fehlt.': 'The name of the new project is missing.',
  'Neues Video anlegen': 'Create a new video',
  'Name des neuen Videos': 'Name of the new video',
  'z. B. Teaser 30s': 'e.g. Teaser 30s',
  'Neue Fassung (Nummer zählt Klappe weiter)': 'New version (Klappe counts on)',
  intern: 'internal',
  'Beschriftung (optional)': 'Label (optional)',
  Endfassung: 'Final version',
  'KI-Inhalte kennzeichnen (Art. 50 EU AI Act)':
    'Mark AI content (Art. 50 EU AI Act)',
  'Gilt für das ganze Video, also auch für die schon vorhandenen Fassungen.':
    'Applies to the whole video, including the versions already there.',
  'Endfassungs-Haken nicht gesetzt: {grund}': 'Final-version flag not set: {grund}',
  'Der Endfassungs-Haken hat in Klappe nicht gegriffen – die Fassung gilt dort weiter als Vorschau.':
    'The final-version flag did not take in Klappe – the version still counts as a preview there.',
  'Plugin {version}, installiert am {zeitpunkt}': 'Plugin {version}, installed on {zeitpunkt}',
  'KI-Kennzeichnung nicht gesetzt: {grund}': 'AI marking not set: {grund}',
  'z. B. Farbkorrektur': 'e.g. Colour grade',
  'Als interne Fassung hochladen (erst nach Freigabe für Gäste sichtbar)':
    'Upload as an internal version (visible to guests only after release)',
  'Diese Fassung wird intern hochgeladen. Der Kunde sieht sie erst, wenn sie jemand aus dem Team freigibt.':
    'This version is uploaded internally. The client will not see it until someone from the team releases it.',
  'Diese Instanz fährt keine interne Runde – die Fassung ist sofort für alle sichtbar.':
    'This instance does not run an internal round – the version is visible to everyone right away.',
  'Beim Ersetzen verschwinden die Kommentare der alten Fassung mit ihr – sie hängen an Frames eines Ausspielens, das es dann nicht mehr gibt.':
    'When replacing, the comments of the old version disappear with it – they hang on frames of a render that no longer exists.',
  'Rendern und hochladen': 'Render and upload',
  'Neuen Rendervorgang starten': 'Start another render',
  'Master zusätzlich lokal ablegen': 'Also store the master locally',
  'Ordner wählen …': 'Choose a folder …',
  'z. B. der Projektordner auf dem Server': 'e.g. the project folder on the server',
  'Gerendert wird trotzdem nur einmal, in den Zwischenordner. Von dort geht die Datei zwei Wege gleichzeitig: hoch nach Klappe und hierher. Am Ende wird sie auf den Namen umbenannt, unter dem Klappe die Fassung führt.':
    'It is still rendered only once, into the scratch folder. From there the file takes two routes at the same time: up to Klappe and over here. At the end it is renamed to the name under which Klappe lists the version.',
  'Für die lokale Ablage fehlt der Ordner.': 'The folder for the local copy is missing.',
  'Ordner für die Zweitablage': 'Folder for the local copy',
  'Zweitablage … {prozent} % ({gesendet} von {gesamt})':
    'Local copy … {prozent} % ({gesendet} of {gesamt})',
  'Zweitablage wird abgeschlossen …': 'Finishing the local copy …',
  'Zweitablage: {pfad}': 'Local copy: {pfad}',
  'Die Zweitablage ist fehlgeschlagen: {grund}': 'The local copy failed: {grund}',
  'Die Kopie wurde abgebrochen.': 'The copy was cancelled.',
  'Im Zielordner sind zu viele gleichnamige Dateien.':
    'There are too many files with the same name in the target folder.',
  'Zweitablage – Vorgabe im Upload-Dialog (leer = keine Kopie)':
    'Local copy – default in the upload dialog (empty = no copy)',
  'Der Name des neuen Videos fehlt.': 'The name of the new video is missing.',
  'Es ist kein Render-Preset gewählt.': 'No render preset is selected.',
  'Fassung {nummer} wirklich ersetzen?': 'Really replace version {nummer}?',
  'Die Kommentare dieser Fassung verschwinden mit ihr – sie hängen an Frames eines Ausspielens, das es dann nicht mehr gibt.':
    'The comments of this version disappear with it – they hang on frames of a render that no longer exists.',
  'Abbruch angefordert – der angefangene Upload lässt sich später fortsetzen.':
    'Cancellation requested – the rendered file stays, so a second attempt need not render again.',
  'Fassung {nummer} ist da ({stand}).': 'Version {nummer} has arrived ({stand}).',
  'fertig verarbeitet': 'fully processed',
  'Diese Fassung ist intern – der Kunde sieht sie noch nicht. Erst ansehen oder den Link an die Kollegen geben; freigegeben wird sie danach in Klappe.':
    'This version is internal – the client cannot see it yet. Watch it or send the link to your colleagues first; releasing it happens afterwards, in Klappe.',
  'Im Browser öffnen': 'Open in browser',
  'Link kopieren': 'Copy link',
  Kopiert: 'Copied',
  'Link kopiert.': 'Link copied.',
  'Link kopiert – die Kollegen sehen die Fassung, der Kunde noch nicht.':
    'Link copied – your colleagues can see the version, the client cannot yet.',
  'Upload fertig.': 'Upload finished.',

  /* --------------------------------------------------------- Einstellungen */
  Sprache: 'Language',
  Automatisch: 'Automatic',
  'aus dieser Einstellung': 'from this setting',
  'aus deinem Klappe-Konto': 'from your Klappe account',
  'aus der Vorgabe der Instanz': 'from the default of the instance',
  'aus der Systemsprache dieses Rechners': 'from the system language of this machine',
  'Rückfall, solange nichts bekannt ist': 'fallback while nothing else is known',
  'Sprache umgestellt.': 'Language changed.',
  'Adresse der Klappe-Instanz': 'Address of the Klappe instance',
  Speichern: 'Save',
  Verbinden: 'Connect',
  'Verbindung trennen': 'Disconnect',
  'Diesen Code im Browser bestätigen:': 'Confirm this code in the browser:',
  'Gilt {minuten} Minuten. Gerätename: {name}': 'Valid for {minuten} minutes. Device name: {name}',
  'Warte auf Bestätigung … noch {sekunden} s': 'Waiting for confirmation … {sekunden} s left',
  'Im Browser bestätigen – das Panel wartet.': 'Confirm in the browser – the panel is waiting.',
  'Verbunden als {name}.': 'Connected as {name}.',
  'Kopplung abgebrochen.': 'Pairing cancelled.',
  'Adresse gespeichert.': 'Address saved.',
  'Erst die Adresse der Klappe-Instanz eintragen.':
    'Enter the address of the Klappe instance first.',
  'Verbindung zu Klappe trennen?': 'Disconnect from Klappe?',
  'Getrennt – das Gerät ist auch in Klappe entfernt.':
    'Disconnected – the device is removed in Klappe as well.',
  'Lokal getrennt. In Klappe steht das Gerät ggf. noch unter „Mein Konto → Verbundene Geräte".':
    'Disconnected locally. In Klappe the device may still be listed under “My account → Connected devices”.',
  'Zugang liegt {ort} · Gerätename: {name}': 'Access is stored {ort} · device name: {name}',
  'im Schlüsselbund': 'in the keychain',
  'in einer Datei mit engen Rechten': 'in a file with tight permissions',
  'Interne Fassungen': 'Internal versions',
  'Immer intern hochladen – Freigabe nach dem Review':
    'Always upload internally – release after review',
  'Je Upload entscheiden (Haken im Dialog)': 'Decide per upload (checkbox in the dialog)',
  'Kennt der Server die interne Runde nicht, wird ohnehin immer extern hochgeladen.':
    'If the server does not know the internal round, everything is uploaded externally anyway.',
  'Fassungen werden ab jetzt immer intern hochgeladen.':
    'Versions are now always uploaded internally.',
  'Der Haken im Upload-Dialog entscheidet ab jetzt je Fassung.':
    'The checkbox in the upload dialog now decides per version.',
  'Render-Presets im Upload-Dialog': 'Render presets in the upload dialog',
  Alle: 'All',
  Keine: 'None',
  'Aus Resolve neu einlesen': 'Read again from Resolve',
  'Eigene Presets sind immer dabei und stehen ohne Haken in der Liste – wer sich eins anlegt, will es benutzen.':
    'Your own presets are always included and appear without a checkbox – whoever creates one wants to use it.',
  'Vorgewählt im Upload-Dialog': 'Preselected in the upload dialog',
  'das erste der Liste': 'the first in the list',
  'nicht in der Liste': 'not in the list',
  'Resolve liefert gerade keine Presets – dafür muss ein Projekt geöffnet sein.':
    'Resolve is not returning any presets – a project needs to be open for that.',
  '{eigene} eigene Presets (immer dabei) · {sichtbar} von {gesamt} mitgelieferten.':
    '{eigene} own presets (always included) · {sichtbar} of {gesamt} bundled ones.',
  'Eigene Presets (immer dabei)': 'Own presets (always included)',
  'Mitgelieferte Presets von Resolve': 'Presets bundled with Resolve',
  'Nur eigene Presets im Upload-Dialog.': 'Only your own presets in the upload dialog.',
  'Alle Presets im Upload-Dialog.': 'All presets in the upload dialog.',
  '{anzahl} mitgelieferte Presets dazu (eigene sind immer dabei).':
    '{anzahl} bundled presets added (your own are always included).',
  'Vorgewählt: {preset}.': 'Preselected: {preset}.',
  'Markerfarbe – offene Kommentare': 'Marker colour – open comments',
  'Markerfarbe – erledigte Kommentare': 'Marker colour – resolved comments',
  'Allgemeine Kommentare als Marker auf dem ersten Bild':
    'General comments as a marker on the first frame',
  'Standdauer der Zeichnungen (Frames)': 'Duration of the drawings (frames)',
  'Ablage der Zeichnungen (leer = Benutzerordner)':
    'Where drawings are stored (empty = user folder)',
  'Ablage der Zuordnung (leer = Benutzerordner)': 'Where the link is stored (empty = user folder)',
  'Zwischenordner fürs Rendern (leer = Systemtemp)':
    'Scratch folder for rendering (empty = system temp)',
  'gemeinsamer Ordner': 'shared folder',
  'schnelle Arbeitsplatte': 'fast working disk',
  'Ordner wählen': 'Choose a folder',
  'Einstellungen gespeichert.': 'Settings saved.',
  'Zuordnung: {zuordnung} · Zeichnungen: {zeichnungen}':
    'Link: {zuordnung} · drawings: {zeichnungen}',
  'Zwischenordner fürs Rendern': 'Scratch folder for rendering',
  'wird geprüft …': 'checking …',
  Nachsehen: 'Check',
  'Reste löschen': 'Delete leftovers',
  'Der Zwischenordner ließ sich nicht prüfen.': 'The scratch folder could not be checked.',
  '{ordner} — nichts liegen geblieben.': '{ordner} — nothing left behind.',
  '{ordner} — {anzahl} Datei(en), {platz}. Reste älter als {stunden} Stunden verschwinden beim nächsten Upload von selbst.':
    '{ordner} — {anzahl} file(s), {platz}. Leftovers older than {stunden} hours disappear by themselves on the next upload.',
  'Alle liegen gebliebenen Zwischen-Master löschen?': 'Delete all leftover scratch masters?',
  'Was gerade hochgeladen wird, bleibt unangetastet. Die Dateien in Klappe sind davon nicht betroffen – das hier ist nur der Renderordner.':
    'Whatever is being uploaded right now stays untouched. The files in Klappe are not affected – this is only the render folder.',
  '{anzahl} Datei(en) gelöscht, {platz} frei.': '{anzahl} file(s) deleted, {platz} freed.',
  'Nichts zu löschen.': 'Nothing to delete.',

  /* ------------------------------------------------------ Fehler und Wege */
  'Unbekannter Fehler.': 'Unknown error.',
  'Erst verbinden (Einstellungen).': 'Connect first (Settings).',
  'Es ist noch keine Klappe-Adresse eingetragen (Einstellungen).':
    'No Klappe address has been entered yet (Settings).',
  'Die Anfrage hat zu lange gedauert.': 'The request took too long.',
  'Die Adresse „{adresse}" ergibt keine gültige URL.': '“{adresse}” is not a valid URL.',
  'dem Server': 'the server',
  '„{host}" ist nicht auffindbar. Stimmt die Adresse in den Einstellungen?':
    '“{host}” cannot be found. Is the address in the settings correct?',
  '{host} nimmt keine Verbindung an. Läuft die Klappe-Instanz?':
    '{host} refuses the connection. Is the Klappe instance running?',
  'Die Verbindung zu {host} ist abgerissen.': 'The connection to {host} broke off.',
  'Das Zertifikat von {host} lässt sich nicht prüfen. Bei einer Anlage mit eigenem Zertifikat muss es auf diesem Rechner als vertrauenswürdig eingetragen sein.':
    'The certificate of {host} cannot be verified. For an instance with its own certificate it has to be trusted on this machine.',
  'Verbindung zu {host} fehlgeschlagen: {grund}': 'Connection to {host} failed: {grund}',
  'Der Zugang gilt nicht mehr – das Gerät wurde getrennt oder das Konto deaktiviert. Bitte neu koppeln.':
    'The access is no longer valid – the device was disconnected or the account deactivated. Please pair again.',
  'Der externe API-Zugriff ist auf dem Server abgeschaltet. Das kann nur ein Administrator ändern (Einstellungen → API-Zugriff).':
    'External API access is switched off on the server. Only an administrator can change that (Settings → API access).',
  'Nicht gefunden – oder für dieses Konto nicht sichtbar.':
    'Not found – or not visible to this account.',
  'Zu viele Anfragen. Klappe bittet um {sekunden} Sekunden Pause.':
    'Too many requests. Klappe asks for a pause of {sekunden} seconds.',
  'Der Server meldet einen Fehler ({status}) bei {stelle}.':
    'The server reports an error ({status}) at {stelle}.',
  'Die Anfrage an {pfad} schlug fehl ({status}).': 'The request to {pfad} failed ({status}).',

  /* ---------------------------------------------------------- Kopplung */
  'DaVinci Resolve auf {rechner}': 'DaVinci Resolve on {rechner}',
  'Der Server hat keine Kopplung angelegt.': 'The server did not create a pairing.',
  'Es läuft keine Kopplung.': 'No pairing is running.',
  'Die Kopplung wurde abgebrochen.': 'The pairing was cancelled.',
  'Die Kopplung ist abgelaufen – sie gilt zehn Minuten. Bitte noch einmal starten.':
    'The pairing has expired – it is valid for ten minutes. Please start again.',
  'Die Kopplung wurde abgelehnt – oder der externe API-Zugriff ist auf dem Server abgeschaltet.':
    'The pairing was rejected – or external API access is switched off on the server.',
  'Die Kopplung ist abgelaufen oder unbekannt. Bitte noch einmal starten.':
    'The pairing has expired or is unknown. Please start again.',

  /* ------------------------------------------------------------- Resolve */
  'Keine Verbindung zu Resolve.': 'No connection to Resolve.',
  'In Resolve ist kein Projekt geöffnet.': 'No project is open in Resolve.',
  'In Resolve ist keine Timeline aktiv.': 'No timeline is active in Resolve.',
  'Resolve liefert kein Projekt-Objekt zurück.': 'Resolve does not return a project object.',
  'Verbindung zu Resolve fehlgeschlagen: {grund}': 'Connection to Resolve failed: {grund}',
  'WorkflowIntegration.node fehlt oder passt nicht zu dieser Resolve-Version. Bitte install.sh (macOS) bzw. install.ps1 (Windows) noch einmal laufen lassen – das Modul wird dabei aus der lokalen Resolve-Installation kopiert. ({grund})':
    'WorkflowIntegration.node is missing or does not match this version of Resolve. Please run install.sh (macOS) or install.ps1 (Windows) again – it copies the module from the local Resolve installation. ({grund})',
  'Resolve hat die Verbindung zum Plugin abgelehnt. Läuft DaVinci Resolve Studio? Workflow-Panels gibt es in der kostenlosen Fassung nicht.':
    'Resolve refused the connection to the plugin. Is DaVinci Resolve Studio running? Workflow panels do not exist in the free edition.',
  'Das Render-Preset „{preset}" ließ sich nicht laden.':
    'The render preset “{preset}” could not be loaded.',
  'Die Render-Einstellungen ließen sich nicht setzen.': 'The render settings could not be set.',
  'Resolve hat keinen Render-Auftrag angelegt.': 'Resolve did not create a render job.',
  'Resolve hat das Rendern nicht gestartet.': 'Resolve did not start rendering.',
  'Das Rendern wurde in Resolve abgebrochen.': 'Rendering was cancelled in Resolve.',
  'Das Rendern ist fehlgeschlagen ({stand}).': 'Rendering failed ({stand}).',
  'unbekannter Status': 'unknown status',
  'Die Framerate der Timeline ist nicht lesbar.': 'The frame rate of the timeline cannot be read.',
  'Das Panel-Fenster ist geschlossen.': 'The panel window is closed.',

  /* -------------------------------------------------------------- Upload */
  'Es läuft bereits ein Upload.': 'An upload is already running.',
  '{anzahl} alte Zwischendatei(en) weggeräumt ({platz} frei).':
    '{anzahl} old scratch file(s) cleared away ({platz} freed).',
  'Spur „{spur}" ausgeblendet – die Zeichnungen kommen nicht in den Master.':
    'Track “{spur}” hidden – the drawings will not end up in the master.',
  'Resolve rendert …': 'Resolve is rendering …',
  'Resolve rendert … {prozent} %': 'Resolve is rendering … {prozent} %',
  'Im Zwischenordner liegt keine gerenderte Datei ({ordner}). Schreibt das Preset vielleicht woandershin?':
    'There is no rendered file in the scratch folder ({ordner}). Does the preset perhaps write somewhere else?',
  'Upload wird angemeldet …': 'Announcing the upload …',
  'Hochladen … {prozent} % ({gesendet} von {gesamt}{tempo})':
    'Uploading … {prozent} % ({gesendet} of {gesamt}{tempo})',
  'Der Server hat keine Fassungs-ID gemeldet. Die Datei ist übertragen – bitte im Browser nachsehen.':
    'The server did not report a version id. The file has been transferred – please check in the browser.',
  'Klappe verarbeitet die Fassung …': 'Klappe is processing the version …',
  'Klappe verarbeitet die Fassung … {prozent} %': 'Klappe is processing the version … {prozent} %',
  'Klappe konnte die Fassung nicht verarbeiten: {grund}':
    'Klappe could not process the version: {grund}',
  'kein Grund genannt': 'no reason given',
  'Die Fassungsnummer {nummer} ist schon vergeben. Zum Überschreiben „Fassung ersetzen" wählen.':
    'Version number {nummer} is already taken. Choose “replace version” to overwrite it.',
  'Der Server hat den Upload abgelehnt.': 'The server rejected the upload.',
  'Der Server hat keine Upload-Adresse genannt.': 'The server did not name an upload address.',
  'Die Upload-Sitzung gibt es nicht mehr – sie wurde abgebrochen oder ist abgelaufen.':
    'The upload session no longer exists – it was cancelled or has expired.',
  'Der Upload wurde abgebrochen.': 'The upload was cancelled.',
  'Es läuft noch ein Upload nach Klappe.': 'An upload to Klappe is still running.',
  'Beim Schließen wird er abgebrochen. Die bereits übertragenen Daten verwirft Klappe; der gerenderte Zwischen-Master bleibt liegen, sodass ein zweiter Anlauf nicht noch einmal rendern muss.':
    'Closing will cancel it. Klappe discards the data transferred so far; the rendered scratch master stays, so a second attempt need not render again.',
  'Weiter hochladen': 'Keep uploading',
  'Abbrechen und schließen': 'Cancel and close',

  /* ---------------------------------------------------- Zeichnungen */
  'Zu diesem Kommentar gibt es keine Zeichnung mehr.':
    'There is no drawing for this comment any more.',
  'Zum Zeichnen fehlt das Panel-Fenster.': 'The panel window is needed for drawing.',
  'Der Rasterizer hat kein PNG geliefert.': 'The rasteriser did not return a PNG.',
  'Die Zeichnung ließ sich nicht beschaffen. Server: {server} – eigener Rasterizer: {lokal}':
    'The drawing could not be obtained. Server: {server} – own rasteriser: {lokal}',
  'Der Media Pool ist nicht erreichbar.': 'The media pool cannot be reached.',
  'Die Spur „{spur}" ließ sich nicht anlegen.': 'Track “{spur}” could not be created.',
  'Der Bin „{bin}" ließ sich nicht anlegen.': 'Bin “{bin}” could not be created.',
  'Der Import in den Media Pool schlug fehl.': 'The import into the media pool failed.',
  'Frame {frame} liegt außerhalb der Timeline ({von}–{bis}).':
    'Frame {frame} lies outside the timeline ({von}–{bis}).',
  '{variante}: nichts eingefügt': '{variante}: nothing inserted',
  '{variante}: ergab {ist} statt {soll} Frames': '{variante}: gave {ist} instead of {soll} frames',
};
