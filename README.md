# Klappe für DaVinci Resolve

Ein Workflow-Integration-Panel, das drei Wege zwischen Schnittplatz und
[Klappe](https://github.com/jonathanfuhr/klappe) öffnet:

1. **Ausspielen und hochladen** – Resolve rendert einmal, das Panel lädt den
   Master als neue Fassung hoch (oder ersetzt eine vorhandene).
2. **Kommentare als Marker** – die Anmerkungen aus Klappe landen frame-genau in
   der Timeline, Zeichnungen zusätzlich als Overlay-Spur.
3. **Antworten aus Resolve** – die Kommentarliste im Panel schreibt direkt
   zurück, unter dem Namen des gekoppelten Kontos.

---

## Voraussetzungen

- **DaVinci Resolve Studio.** Workflow-Panels gibt es in der kostenlosen
  Fassung nicht – das ist eine Grenze von Resolve, keine Entscheidung dieses
  Plugins. Entwickelt und geprüft unter macOS mit Resolve 21; Windows ist
  vorbereitet, aber noch nicht validiert.
- **Eine Klappe-Instanz ab Version 1.3** mit eingeschaltetem externem Zugriff:
  *Einstellungen → API-Zugriff → Externen API-Zugriff erlauben*. Ab Werk steht
  der Schalter auf **aus**; solange er das tut, endet jede Anfrage mit `403`
  und auch das Verbinden schlägt fehl.
- **Ein Konto auf dieser Instanz.** Team oder Gast – ein Gast-Token trägt genau
  die Freigaben dieses Gastes und darf zum Beispiel keine internen Fassungen
  hochladen.

Für die Entwicklung zusätzlich Node ≥ 22 (nur für die Unit-Tests; das Panel
selbst läuft in dem Electron, das Resolve mitbringt).

---

## Installation

Oben in `install.sh` (bzw. `install.ps1`) steht ein Block, in den man vor dem
ersten Lauf einträgt, was an diesem Schnittplatz gelten soll – Serveradresse,
Ablagepfade, Renderordner, Umgang mit internen Fassungen, Preset-Auswahl und
vorgewähltes Preset. Alles darf leer bleiben; dann fragt das Panel danach.

Aus dem Repo heraus:

```bash
./install.sh
```

### Eine Datei für andere Rechner (macOS)

Für Schnittplätze, auf denen das Repo nichts zu suchen hat, gibt es einen
**selbsttragenden Installer**: eine einzige Datei mit dem Plugin als gepackter
Nutzlast dahinter.

```bash
./tools/installer-bauen.sh
```

Ergebnis: `dist/klappe-installer.sh` (~120 KB). Auf dem Zielrechner
hinüberkopieren, oben im Werteblock eintragen, was dort gelten soll,
**speichern** und ausführen – mehr braucht es nicht.

> Die Nutzlast steht als Base64 hinter einer Trennlinie, nicht als rohe Bytes.
> Das kostet ein Drittel mehr Platz, hält die Datei aber reinen Text: So
> übersteht sie das Bearbeiten des Werteblocks in jedem Editor. Unterhalb der
> Zeile `__KLAPPE_NUTZLAST__` gehört nichts geändert.

Für Windows gibt es das noch nicht – dort braucht `install.ps1` weiterhin den
Ordner daneben.

### Vorgaben und eigene Einstellungen

Die Vorgaben landen in `~/.klappe-davinci/vorgaben.json`. Sie sind die
**untere** Schicht: Was jemand später im Panel einstellt (`config.json`)
gewinnt, der Installer überschreibt also nie eine getroffene Entscheidung. Wer
das doch will, setzt `EIGENE_EINSTELLUNGEN_ZURUECKSETZEN="ja"` – der
Zugangstoken bleibt davon unberührt.

Das Skript kopiert den Plugin-Ordner nach
`/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/de.klappe.davinci`
(dafür fragt es nach dem Administrator-Passwort) und holt `WorkflowIntegration.node`
aus der lokalen Resolve-Installation dazu.

Unter Windows in einer PowerShell **als Administrator**:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Danach Resolve neu starten: **Workspace → Workflow Integrations → Klappe**.

**Tastenkürzel:** *DaVinci Resolve → Keyboard Customization*, nach „Klappe"
suchen, Kürzel zuweisen (auf dem Mac ist Cmd+0 frei), *Save*. Das ist der
verlässliche Weg. `install.sh` kann alternativ über `TASTENKUERZEL="@0"` den
macOS-Weg (`NSUserKeyEquivalents`) eintragen – ob Resolves Qt-Menü darauf
hört, ist allerdings nicht garantiert, deshalb ist es ab Werk aus.

> **`WorkflowIntegration.node` ist an die Resolve-Version gebunden.**
> Das Modul liegt bewusst nicht im Repo, sondern wird beim Installieren aus
> `…/Developer/Workflow Integrations/Examples/SamplePlugin/` kopiert. Nach
> einem Resolve-Update `install.sh` einfach noch einmal laufen lassen –
> sonst kann das Panel Resolve unter Umständen nicht mehr erreichen.

---

## Verbinden

Kein Passwortfeld. Das Panel meldet eine **Gerätekopplung** an, zeigt einen
kurzen Code, und ein angemeldeter Mensch bestätigt ihn im Browser unter
`/geraet`. Erst dann entsteht der Token.

1. *Einstellungen* → Adresse der Instanz eintragen → **Verbinden**
2. Das Panel öffnet den Browser mit dem Code, dort bestätigen
3. Fertig – der Token übersteht einen Resolve-Neustart

Der Token liegt verschlüsselt im **Schlüsselbund** (macOS) bzw. über DPAPI
(Windows); wo das nicht geht, in einer Datei mit engen Rechten. Er steht nie in
der `config.json`, nie in einem Log, und der `Authorization`-Header wird in
Debug-Ausgaben nicht mitgeschrieben.

Trennen geht von beiden Seiten: im Panel unter *Verbindung trennen*, in Klappe
unter *Mein Konto → Verbundene Geräte*, oder workspace-weit durch den
Administrator.

---

## Bedienung

### Hochladen

Preset wählen, Ziel wählen, **Rendern und hochladen**.

Resolve bringt drei Dutzend Presets mit („YouTube - 1080p", „IMF - Netflix",
„VR 180/360 - Meta Quest VR" …). Ab Werk stehen sie **nicht** im Dialog: Dort
sind nur die **eigenen** Presets, weil ein Haus mit seinen eigenen rendert. In
den Einstellungen lässt sich das jederzeit ändern – einzelne mitgelieferte
anhaken, alle oder keine. **Eigene Presets sind immer dabei**; wer sich eins
anlegt, will es benutzen, und der Kollege, der morgen eins anlegt, soll es
nicht erst freischalten müssen.

Welches Preset **vorgewählt** ist, steht ebenfalls in den Einstellungen (und im
Installer). Leer heißt: das erste der Liste.

> Erkannt werden die mitgelieferten an einer festen Namensliste in
> `src/presets.js`, und zwar **exakt** – kein Präfixvergleich. Ein eigenes
> Preset „YouTube - Hausformat" darf nicht als mitgeliefert gelten und damit
> aus dem Dialog fallen. Was eine neue Resolve-Fassung dazulegt, trägt man in
> `standardPresetsExtra` nach; bis dahin gilt es als eigenes und ist sichtbar –
> die harmlosere Richtung.

Resolve rendert in einen Zwischenordner, das Panel überträgt die Datei per tus
(blockweise, nach einem Verbindungsabbruch geht es an derselben Stelle weiter)
und wartet, bis Klappe sie verarbeitet hat. Danach steht „Im Browser öffnen"
bereit – die Adresse kommt als `webUrl` vom Server, sie wird nicht geraten.

- **Bereich:** ab Werk wie in Resolve – In/Out, wenn gesetzt, sonst die ganze
  Timeline. Der verwendete Bereich wandert in die Zuordnung; er ist der
  Frame-Offset für Marker und Overlays.
- **Fassung ersetzen:** ein Schritt. Die alte Fassung derselben Nummer weicht
  beim Abschluss in einer Transaktion. **Achtung:** Ihre Kommentare
  verschwinden mit ihr – sie hängen an Frames eines Ausspielens, das es dann
  nicht mehr gibt. Das Panel fragt vorher nach.

### Zusätzlich lokal ablegen

Im Upload-Dialog gibt es den Haken **Master zusätzlich lokal ablegen** und
darunter einen Ordner – typischerweise der Projektordner auf dem Medien-Server.

Gerendert wird trotzdem **einmal**, in den Zwischenordner. Von dort geht die
Datei zwei Wege **gleichzeitig**: hoch nach Klappe und hinüber in die Ablage.
Nacheinander wäre der Schnittplatz doppelt so lange belegt – ein UHD-Master
über ein Netzlaufwerk zu kopieren dauert etwa so lange wie das Hochladen.

Am Ende wird die Kopie auf den Namen umbenannt, unter dem Klappe die Fassung
führt (`260802_Kunde_Teaser_v3_1080p25.mov`) – der Name des Zwischen-Masters
hat im Projektordner nichts zu suchen. Er steht aber erst fest, wenn die
Fassung verarbeitet ist; deshalb erst kopieren, dann umbenennen.

Zwei Regeln, weil in diesem Ordner fremde Arbeit liegt: **nichts
überschreiben** (ein belegter Name bekommt `-2`, `-3`, …) und **kein
Bruchstück hinterlassen** – bricht die Kopie ab, wird die halbe Datei
weggeräumt. Eine gescheiterte Kopie lässt den Upload unberührt; sie steht als
Warnung im Erfolgsdialog.

Der Pfad in den Einstellungen (und im Installer) ist die **Vorgabe**: Steht
dort einer, ist der Haken im Dialog vorbelegt. Was im Dialog geändert wird,
gilt für diesen einen Upload und wandert nicht zurück in die Einstellungen.

### Der Zwischenordner

Resolve rendert erst eine Datei, dann wird sie übertragen. Ein UHD-Master ist
schnell 40 GB groß und entsteht in einem Ordner, den niemand ansieht – deshalb
führt das Plugin **Buch** über jede Datei, die es dort anlegt
(`~/.klappe-davinci/renders.json`), und räumt nur auf, was darin steht. Nach
Namensmuster zu löschen wäre der Weg, an dessen Ende in einem gemeinsamen
Arbeitsverzeichnis fremdes Material fehlt.

| Lage | Was passiert |
| --- | --- |
| Upload fertig | Die Datei wird sofort gelöscht. |
| Render bricht ab | Resolves Fragment wird sofort gelöscht – es ist wertlos. |
| Upload scheitert oder wird abgebrochen | Die Datei **bleibt**: Sie war vielleicht eine Stunde Rendern, und ein zweiter Anlauf soll sie benutzen können. |
| Resolve oder das Panel stürzt ab | Die Datei bleibt und wird beim nächsten Start wieder zum Aufräumen freigegeben. |

Liegen gebliebene Dateien verschwinden **beim nächsten Upload**, sobald sie
älter als 24 Stunden sind. In den Einstellungen steht unter *Zwischenordner*,
was gerade dort liegt und wie viel Platz es belegt; **Reste löschen** räumt
sofort auf und fasst dabei nie an, was gerade übertragen wird.

### Panel schließen während eines Uploads

Das Fenster zu schließen beendet das Plugin. Läuft dabei ein Upload, fragt das
Panel vorher nach und bricht auf Wunsch **sauber** ab: Die Overlay-Spur wird
wieder eingeblendet und der Zwischen-Master ordentlich vermerkt, statt als
„wird gerade benutzt" liegen zu bleiben. Die schon übertragenen Bytes verwirft
Klappe – ein neuer Anlauf beginnt eine neue Sitzung, muss aber nicht noch
einmal rendern.

Stirbt der Prozess hart (Resolve-Absturz), kann die Overlay-Spur ausgeblendet
zurückbleiben. Dann hilft **Zeichnungen einblenden** im Panel.

### Interne Fassungen

Ab Werk lädt das Panel **immer intern** hoch: So geht nichts zum Kunden, bevor
jemand daraufgeschaut hat. Der Erfolgsdialog sagt das auch – neben dem Link
steht „Diese Fassung ist intern – der Kunde sieht sie noch nicht" und der
Knopf **Reviewen und freigeben**.

Der Erfolgsdialog ist nach dieser Reihenfolge gebaut: **Link fürs Review
kopieren** ist bei einer internen Fassung der betonte Knopf – der geht an die
Kollegen, solange der Kunde die Fassung noch nicht sieht. **Reviewen und
freigeben** steht daneben, aber leiser: Es ist der Schritt *danach*, und zwei
gleich laute Knöpfe laden zum Falschen ein. Bei einer nicht-internen Fassung
ist „Im Browser öffnen" wieder der betonte.

Zwei Dinge können das ändern:

- **Der Server.** Ist die interne Runde dort abgeschaltet
  (`GET /v1/settings/fassungen` → `internalEnabled: false`), wird immer extern
  hochgeladen; der Server würde `internal: true` ohnehin abweisen.
- **`internalMode`.** In den Einstellungen (oder gleich im Installer) auf
  `wahl` gestellt, entscheidet ein Haken im Upload-Dialog je Fassung –
  vorbelegt nach `internalByDefault` des Servers.

Entschieden wird die Sache im Hauptprozess, nicht in der Oberfläche: Der Haken
ist ein Vorschlag, die Regel steht in `internalEntscheidung()` und gilt auch,
wenn das Panel etwas anderes schickt.

### Marker

**Marker setzen** holt die Kommentare der zugeordneten Fassung und legt sie in
die Timeline:

- **Ein Marker je Frame.** Resolve lässt nicht mehr zu; mehrere Kommentare und
  ihre Antworten stehen deshalb untereinander in einem Marker, Antworten mit
  `↳` eingerückt.
- **Farbe:** Pink für offene, Rose für erledigte Kommentare. Frames, auf denen
  offene und erledigte gemischt liegen, gelten als offen. Beides ist in den
  Einstellungen änderbar – Grün, Blau, Orange und Beige sind im Haus belegt.
- **Wiedererkannt wird über `customData`**, nicht über die Farbe: Sie wandert im
  Resolve-Projekt mit und ist auch auf einem anderen Rechner lesbar. Ein
  zweiter Durchlauf ergänzt Neues, ersetzt Geändertes und entfernt, was in
  Klappe gelöscht wurde.
- Allgemeine Kommentare (ohne Frame) landen mit dem Vermerk „Allgemein" auf dem
  ersten Bild; abschaltbar.

### Zeichnungen

**Zeichnungen einfügen** holt zu jedem Kommentar mit Anmerkung ein
transparentes PNG (`GET /v1/comments/:id/annotation.png`, mit `ETag` – ein
zweiter Durchlauf überträgt nichts noch einmal) und legt es auf eine oberste
Videospur namens `KLAPPE`. Die Spur wird danach **gesperrt, bleibt aber
sichtbar** – abgeschaltet sähe man die Zeichnung ja nicht, und genau dafür ist
sie da.

Die Standdauer ist **ein Frame** – genau wie im Browser, wo die Zeichnung zu
genau diesem Bild gehört. In den Einstellungen lässt sie sich verlängern.

> **Damit kein Kringel im Master landet:** Vor dem Ausspielen über *Rendern und
> hochladen* schaltet das Panel die Spur selbst ab und danach wieder ein. Wer
> über Resolves **Deliver-Seite von Hand** exportiert, drückt vorher
> **Zeichnungen ausblenden** – dort weiß das Plugin nichts von dem Export, und
> ein eingebrannter Kringel fällt erst beim Kunden auf.

Fehlt eine PNG-Datei am gemeinsamen Ablageort (andere Produktion, anderer
Pfad), wird sie aus den Vektordaten des Kommentars **lokal neu gezeichnet** –
dieselben Regeln wie im Browser, also derselbe Strich.

### Kommentar-Panel

Liste mit Autor, Timecode, Text, Antworten und Erledigt-Status, Filter
„offene/alle". Ein Klick auf den Timecode setzt den Playhead – mit dem
Render-Offset verrechnet, also frame-genau. Das Antwortfeld schreibt direkt
nach Klappe.

### Aufräumen

**Aufräumen** nimmt alle Klappe-Marker und alle Klappe-Overlays wieder heraus –
auch solche, die ein anderer Rechner gesetzt hat. Liegt fremdes Material auf
der `KLAPPE`-Spur, bleibt die Spur stehen und nur unsere Clips verschwinden.

---

## Zuordnung Timeline ↔ Fassung

Die Zuordnung ist bewusst locker: Timelines werden versioniert, ein Video hat
mehrere, und nicht jeder Export ist eine Fassung. Das Plugin **schlägt deshalb
nur vor, der Mensch bestätigt immer.**

Gemerkt wird sie in `klappe-mapping.json` – am konfigurierten gemeinsamen Ort
(Medien-Server) oder in `~/.klappe-davinci/`. Ein Eintrag hält die Timeline-ID
(`GetUniqueId()`, wandert mit dem Projekt), das Ziel in Klappe, den
Render-Bereich und den Timeline-Startframe.

Nach einem Upload aus dem Panel steht sie von selbst da. Wer **von Hand
exportiert und im Browser hochgeladen** hat, verknüpft sie über *Kommentare →
Fassung zuordnen*: Projekt, Video, Fassung – und den **Render-Anfang**, falls
nicht ab dem ersten Bild der Timeline exportiert wurde. Der Knopf *In/Out
übernehmen* holt ihn aus dem gesetzten In/Out. Das ist ein eigener Vorgang und
startet keinen Upload; **Zuordnung lösen** nimmt sie wieder zurück.

> **Warum der Render-Anfang wichtig ist:** Klappe zählt ab dem ersten Bild der
> hochgeladenen Datei. Wurde ab Timeline-Frame 500 exportiert, ist
> Klappe-Frame 0 genau dort – ohne diese Angabe säßen alle Marker um 500
> Frames daneben.

---

## Einstellungen

`~/.klappe-davinci/config.json` (der Token steht dort **nicht**):

| Feld | Bedeutung |
| --- | --- |
| `serverUrl` | Adresse der Klappe-Instanz |
| `language` | `auto` (Vorgabe), `de` oder `en` |
| `internalMode` | `immer` (Vorgabe) oder `wahl` |
| `standardPresetsMode` | `keine` (Vorgabe), `auswahl` oder `alle` – für die **mitgelieferten** Presets |
| `renderPresetsStandard` | die Auswahl bei `auswahl` |
| `defaultPreset` | vorgewähltes Preset im Upload-Dialog; leer = das erste |
| `standardPresetsExtra` | Namen, die zusätzlich als mitgeliefertes Preset gelten |
| `markerColor` / `markerColorResolved` | Markerfarben offen / erledigt |
| `markGeneralComments` | Allgemeine Kommentare als Marker auf Frame 0 |
| `overlayFrames` | Standdauer der Zeichnungen in Frames (Vorgabe 1) |
| `overlayTrackName` / `overlayBinName` | Namen von Spur und Bin |
| `overlayPath` | Ablage der PNGs; leer = `~/.klappe-davinci/overlays` |
| `mappingPath` | Ablage der Zuordnung; leer = `~/.klappe-davinci` |
| `renderDir` | Zwischenordner fürs Rendern; leer = Systemtemp |
| `archiveDir` | Vorgabe für die zusätzliche lokale Ablage; leer = Haken aus |

---

## Sprache

Das Panel spricht Deutsch und Englisch. Welche Sprache gilt, entscheidet diese
Kette – die erste Stufe, die eine Antwort hat, gewinnt:

1. **Die Einstellung im Panel**, wenn sie nicht auf *Automatisch* steht.
2. **Die eigene Wahl im Klappe-Konto** (`UserDto.locale`). Wer sich die Web-App
   auf Englisch gestellt hat, will das Plugin nicht auf Deutsch.
3. **Die Vorgabe der Instanz** (`GET /v1/branding` → `defaultLocale`).
4. **Die Systemsprache des Rechners.**
5. **Englisch.** Nicht Deutsch: Vor der Kopplung weiß das Plugin nicht, wer
   davorsitzt, und wer kein Deutsch kann, findet in einer deutschen Oberfläche
   nicht einmal die Einstellung, um sie umzustellen.

In den Einstellungen steht neben der Auswahl, **woher** die Sprache gerade
kommt – sonst wäre *Automatisch* eine Black Box.

### Eine Sprache hinzufügen

**Der deutsche Satz ist der Schlüssel** – dasselbe Verfahren wie in der
Klappe-API (`apps/api/src/i18n/api-messages.ts`). Im Code steht überall ein
lesbarer Satz, kein Kürzel wie `upload.error.offset`; übersetzt wird erst beim
Anzeigen. Fehlt ein Eintrag, geht Deutsch hinaus – nie ein leerer Knopf.

1. `src/locales/en.js` kopieren, etwa nach `fr.js`, und übersetzen.
2. In `src/i18n.js` eine Zeile in `KATALOGE` ergänzen und das Kürzel in
   `LOCALES` und `LOCALE_NAMES` eintragen.
3. In `src/ui/index.html` eine `<option>` zur Sprachwahl.

`npm test` prüft dabei mit: Jeder `t()`-Aufruf im Quelltext muss einen Eintrag
haben, die Platzhalter müssen auf beiden Seiten dieselben sein, und ein Satz,
den es im Code nicht mehr gibt, darf nicht im Katalog stehen bleiben.

Das feste HTML braucht **keine** Markierungen: Weil der deutsche Satz der
Schlüssel ist, geht das Panel beim Start einmal durch die Textknoten,
`placeholder` und `title` und tauscht, was im Katalog steht.

Nicht übersetzt sind die Installer – die laufen einmal beim Einrichten und
richten sich an den, der das Haus verwaltet.

## Bekannte Grenzen

- **Resolve Free wird nicht unterstützt** – Workflow-Panels sind Studio-only.
- **Der „Auto Track Selector" ist per API nicht steuerbar.** Spur-Lock und
  Spur-Disable setzt das Plugin selbst (`SetTrackLock`, `SetTrackEnable`); ob
  die Auswahl dem Playhead folgt, bleibt Handarbeit.
- **Ein Marker je Frame** – siehe oben, das ist eine Grenze von Resolve.
- **`?since=` erkennt keine Löschungen.** Für Marker und Overlays wird deshalb
  immer die volle Kommentarliste geholt und verglichen.
- **Ein Gastzugang darf `internal` nicht setzen** (`403`); der Haken erscheint
  dann gar nicht erst.
- **Windows ist ungetestet.** Die Test-Checkliste steht in
  [`docs/test-checkliste.md`](docs/test-checkliste.md).

---

## Entwicklung

```bash
npm install
npm test
```

Getestet wird, was ohne laufendes Resolve prüfbar ist: Frame- und
Timecode-Mathematik, die Gruppierung der Kommentare zu Markern, der
Abgleichsplan, die Ablagepfade. Alles, was Resolve oder den Server anfasst,
gehört in die Test-Checkliste.

```
src/
├── main.js        Electron-Hauptprozess, IPC
├── preload.js     die Brücke ins Panel
├── resolve.js     Brücke zur Resolve-Scripting-API
├── api.js         HTTP-Client (401/403/404/429 nach den „Regeln des Hauses")
├── auth.js        Gerätekopplung
├── secrets.js     Token im Schlüsselbund
├── config.js      Einstellungen
├── frames.js      Frame- und Timecode-Mathematik
├── mapping.js     Sidecar Timeline ↔ Fassung
├── tus.js         Upload-Protokoll
├── upload.js      Rendern und Hochladen
├── comments.js    Kommentare lesen und schreiben
├── markers.js     Kommentare ↔ Marker
├── annotation.js  Zeichnung als PNG (Server, sonst selbst)
├── overlays.js    Overlay-Spur
└── ui/            das Panel (HTML/CSS/JS ohne Framework)
```

## Lizenz

AGPL-3.0-only, wie Klappe selbst.
