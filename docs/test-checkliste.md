# Test-Checkliste

Was sich ohne laufendes Resolve und ohne Server prüfen lässt, steht in
`npm test`. Alles andere steht hier – zum Durchgehen bei der Validierung auf
macOS und später auf Windows.

Grundregel für alle Durchgänge: **gegen ein Testprojekt arbeiten, nicht gegen
eine laufende Produktion.** Ein Ersetzen löscht Kommentare.

---

## Phase 0 – Grundgerüst

- [ ] `./install.sh` läuft ohne Fehler durch und meldet, welches
      `WorkflowIntegration.node` es genommen hat
- [ ] `./tools/installer-bauen.sh` baut `dist/klappe-installer.sh`
- [ ] Der gebaute Installer läuft auf einem Rechner **ohne** das Repo durch und
      meldet als Quelle „mitgeliefert"
- [ ] Werteblock im gebauten Installer ändern, speichern, ausführen → die Werte
      stehen in `~/.klappe-davinci/vorgaben.json`, die Nutzlast ist noch heil
- [ ] Eine Serveradresse ohne `https://` im Werteblock funktioniert trotzdem
- [ ] Nach dem Resolve-Neustart steht **Workspace → Workflow Integrations →
      Klappe** im Menü
- [ ] Das Panel öffnet sich und zeigt oben Projekt- und Timeline-Namen
- [ ] Ohne offenes Projekt steht dort „In Resolve ist kein Projekt geöffnet."
      statt einer Fehlermeldung
- [ ] Ohne aktive Timeline steht „In Resolve ist keine Timeline aktiv."
- [ ] Serveradresse lässt sich speichern und steht nach dem Neustart noch da
- [ ] Eine falsche Adresse ergibt eine verständliche Meldung („… ist nicht
      auffindbar"), keinen Absturz

## Phase 1 – Gerätekopplung

- [ ] **Verbinden** zeigt einen Benutzercode und öffnet den Browser
- [ ] Nach dem Bestätigen im Browser meldet das Panel „Verbunden als …"
- [ ] Der Kontoname steht oben rechts
- [ ] Nach einem Resolve-Neustart ist die Verbindung noch da (Token im
      Schlüsselbund)
- [ ] **Abbrechen** während der Kopplung beendet das Nachfragen
- [ ] Kopplung zehn Minuten liegen lassen → „Die Kopplung ist abgelaufen"
- [ ] Gerät in Klappe trennen (*Mein Konto → Verbundene Geräte*) → die nächste
      Aktion im Panel meldet „Der Zugang gilt nicht mehr … Bitte neu koppeln."
- [ ] Externen API-Zugriff serverseitig abschalten → Meldung nennt den
      Administrator und schickt **nicht** in eine Kopplungsschleife
- [ ] **Verbindung trennen** löscht den Token und entfernt das Gerät auch in
      Klappe

## Phase 2 – Upload

- [ ] Die Preset-Liste enthält System- **und** eigene Presets
- [ ] Die Einstellungen trennen **Eigene Presets** (ohne Haken, immer dabei) von
      den **mitgelieferten** (mit Haken)
- [ ] Die mitgelieferten sind als solche erkannt – auch die mit Bindestrich
      („YouTube - 1080p", „IMF - Netflix", „VR 180/360 - Meta Quest VR",
      „HyperDeck", „Presentations", „Tencent - MP4")
- [ ] Ab Werk (frische Installation) stehen im Upload-Dialog **nur die eigenen**
- [ ] Ein eigenes Preset abhaken ist gar nicht möglich – es steht im
      Upload-Dialog auch dann, wenn kein mitgeliefertes angehakt ist
- [ ] „Alle" / „Keine" / einzelne Haken wirken und überstehen einen Neustart
- [ ] Ein neu in Resolve angelegtes eigenes Preset taucht nach „Aus Resolve neu
      einlesen" auf und ist sofort im Upload-Dialog
- [ ] **Vorgewählt im Upload-Dialog**: gesetztes Preset ist beim Öffnen gewählt;
      leer nimmt das erste
- [ ] Ein vorgewähltes Preset, das es nicht mehr gibt, steht mit dem Zusatz
      „(nicht in der Liste)" da statt still zu verschwinden
- [ ] Eine vorhandene Preset-Auswahl aus einer älteren Fassung des Plugins geht
      beim Update **nicht** verloren (wird zu Modus „auswahl")
- [ ] Vorgaben aus dem Installer greifen an einem Schnittplatz **ohne**
      `config.json`; mit vorhandener `config.json` gewinnt diese
- [ ] `EIGENE_EINSTELLUNGEN_ZURUECKSETZEN="ja"` setzt zurück, der Zugang bleibt
- [ ] Upload einer kurzen Timeline in ein Testvideo läuft durch, Fortschritt
      zählt hoch
- [ ] **Im Browser öffnen** landet auf genau dieser Fassung
- [ ] Mit gesetztem In/Out wird nur der Bereich ausgespielt; die Zuordnung
      merkt sich den Render-Anfang
- [ ] „Immer die ganze Timeline" ignoriert ein gesetztes In/Out
- [ ] **Neues Video anlegen** funktioniert und wird gleich zum Ziel
- [ ] **Neues Projekt anlegen** funktioniert; die Videoauswahl steht dabei fest
      auf „neu", und beides entsteht in einem Durchgang
- [ ] Der eingetragene **Kunde** taucht im Download-Dateinamen der Fassung auf
- [ ] Neues Projekt ohne Namen → Meldung statt Start
- [ ] Nach dem Anlegen steht das neue Projekt beim nächsten Öffnen des
      Upload-Reiters in der Liste
- [ ] Beim **Zuordnen** (Kommentare-Reiter) gibt es **kein** „Neues Projekt" –
      dort wird eine vorhandene Fassung verknüpft
- [ ] **Fassung ersetzen** fragt vorher nach und behält die Nummer
- [ ] Belegte Nummer ohne Ersetzen → verständliche Meldung statt `409`
- [ ] Netzwerk mitten im Upload trennen (WLAN aus) → nach dem Wiederverbinden
      geht es an derselben Stelle weiter, nicht von vorn
- [ ] **Abbrechen** hält an (ein neuer Anlauf beginnt eine neue Sitzung, muss
      aber nicht noch einmal rendern)
- [ ] Mit `internalMode: immer` (Vorgabe) gibt es **keinen Haken**, sondern den
      Hinweis, dass intern hochgeladen wird
- [ ] Der Erfolgsdialog zeigt bei einer internen Fassung die Warnung „der Kunde
      sieht sie noch nicht" **neben** dem Link
- [ ] **Link kopieren** legt die Adresse in die Zwischenablage; der Knopf meldet
      kurz „Kopiert", die Statuszeile nennt bei einer internen Fassung den
      Vorbehalt („die Kollegen sehen sie, der Kunde noch nicht")
- [ ] Die kopierte Adresse im Browser einfügen → landet auf genau dieser Fassung
- [ ] Im Panel gibt es **nirgends** einen Freigeben-Knopf – freigegeben wird in
      Klappe, nachdem jemand den Film angesehen hat
- [ ] Mit `internalMode: wahl` erscheint der Haken, vorbelegt nach
      `internalByDefault` des Servers
- [ ] Interne Runde im Server abschalten → weder Haken noch interne Fassung,
      der Hinweis nennt den Grund
- [ ] Mit einem Gast-Token ist der Haken nicht da
- [ ] **Endfassung** angehakt → die Fassung trägt den Haken in Klappe, und der
      Download-Dateiname hat **kein** `_Vorschau`
- [ ] Ohne den Haken steht `_Vorschau` im Dateinamen – auch in der Zweitablage
- [ ] **KI-Inhalte kennzeichnen** erscheint nur, wenn die Kennzeichnung im
      Workspace eingeschaltet ist; die Arten stehen zur Auswahl
- [ ] Nach dem Upload trägt das **Video** (nicht nur die Fassung) den Haken und
      die gewählten Arten
- [ ] Scheitert einer der beiden Nachträge, gilt der Upload trotzdem als
      gelungen und die Warnung steht im Ergebnis
- [ ] Der Zwischen-Master ist nach dem Upload aus dem Renderordner verschwunden

### Zusätzlich lokal ablegen

- [ ] Haken aus → keine Kopie, alles wie bisher
- [ ] Haken an ohne Ordner → Meldung statt Start
- [ ] Haken an mit Ordner: Die Kopie läuft **gleichzeitig** mit dem Upload
      (zweite Zeile unter dem Fortschrittsbalken zählt mit)
- [ ] Nach dem Upload liegt die Datei dort unter **genau dem Namen, unter dem
      der Kunde sie herunterlädt** (`JJMMTT_Kunde_Projekt_Video_vN_1080p25.mov`),
      nicht unter dem Zwischennamen
- [ ] Mit Endfassungs-Haken fehlt das `_Vorschau` auch in der Zweitablage –
      umbenannt wird **nach** dem Setzen des Hakens
- [ ] Zielordner mit gleichnamiger Datei → die Kopie bekommt `-2`, das
      vorhandene bleibt unangetastet
- [ ] Upload mittendrin abbrechen → im Zielordner liegt **kein** Bruchstück
- [ ] Netzlaufwerk nicht gemountet → der Upload läuft trotzdem durch, die
      gescheiterte Kopie steht als Warnung im Ergebnis
- [ ] Vorgabe aus den Einstellungen belegt den Haken vor; eine Änderung im
      Upload-Dialog wandert **nicht** in die Einstellungen zurück

### Zwischenordner und Abbrüche

- [ ] Render in Resolve abbrechen → das Fragment ist **sofort** weg
- [ ] Upload abbrechen → die gerenderte Datei **bleibt** liegen und steht in den
      Einstellungen unter *Zwischenordner*
- [ ] Zweiter Upload danach: Die alte Datei wird erst nach 24 Stunden
      weggeräumt, vorher stört sie nicht
- [ ] **Reste löschen** in den Einstellungen räumt sofort auf und nennt den
      freigewordenen Platz
- [ ] Während eines laufenden Uploads „Reste löschen" drücken → die Datei, die
      gerade übertragen wird, bleibt unangetastet
- [ ] **Panel während eines Uploads schließen** → Rückfrage erscheint;
      „Weiter hochladen" schließt nicht, „Abbrechen und schließen" beendet
      sauber (Overlay-Spur ist danach wieder sichtbar)
- [ ] Resolve während eines Uploads hart beenden → beim nächsten Start steht
      die Datei in den Einstellungen und lässt sich löschen

## Phase 3 – Marker

- [ ] **Marker setzen** legt für jeden kommentierten Frame genau einen Marker an
- [ ] Der Marker sitzt **frame-genau** – Playhead auf den Marker, Timecode mit
      der Anzeige in Klappe vergleichen
- [ ] Mehrere Kommentare auf demselben Frame landen in einem Marker, Antworten
      mit `↳` eingerückt
- [ ] Erledigte Kommentare sind Rose, offene Pink; gemischte Frames Pink
- [ ] Allgemeine Kommentare sitzen auf dem ersten Bild mit dem Vermerk
      „(Allgemein)"; abgeschaltet erscheinen sie gar nicht
- [ ] Zweiter Durchlauf ohne Änderungen: alles „unverändert", nichts flackert
- [ ] Kommentar in Klappe ändern → Marker wird ersetzt
- [ ] Kommentar in Klappe löschen → Marker verschwindet
- [ ] Nur ein In/Out-Bereich ausgespielt: Marker liegen um den Render-Anfang
      verschoben richtig
- [ ] Timeline kürzen, dann synchronisieren → Meldung „hinter dem Timeline-Ende"
      statt eines stillen Verlusts
- [ ] Projekt auf einem zweiten Rechner öffnen → **Aufräumen** entfernt auch
      die Marker des ersten Rechners
- [ ] Eigene Schnittnotizen (fremde Marker) bleiben unangetastet

## Phase 4 – Zeichnungen

- [ ] **Zeichnungen einfügen** legt die Spur `KLAPPE` ganz oben an
- [ ] Die Zeichnung liegt deckungsgleich über dem Bild, wie im Browser
- [ ] Die Spur ist danach **gesperrt, aber sichtbar**
- [ ] Standdauer ist **ein Frame** (nicht die volle Standbild-Länge von 5 s);
      in den Einstellungen änderbar, geänderter Wert wirkt beim nächsten Lauf
- [ ] **Zeichnungen ausblenden** schaltet die Spur ab, der Knopf heißt danach
      „Zeichnungen einblenden"
- [ ] **Rendern und hochladen** blendet die Spur vorher selbst aus: Im
      ausgespielten Master ist **keine** Zeichnung zu sehen
- [ ] Nach dem Upload ist die Spur wieder sichtbar – auch nach einem Abbruch
- [ ] Zweiter Durchlauf überträgt nichts noch einmal (ETag) und lässt keine
      Dubletten zurück
- [ ] PNG-Datei am Ablageort löschen → wird beim nächsten Durchlauf neu geholt
- [ ] Server abschalten und PNG löschen → die Zeichnung wird **lokal**
      gezeichnet und sieht gleich aus
- [ ] Fremden Clip auf die `KLAPPE`-Spur legen → **Aufräumen** entfernt nur
      unsere Clips, die Spur bleibt stehen
- [ ] Ohne fremdes Material verschwindet die Spur beim Aufräumen ganz, der Bin
      „Klappe" ebenfalls

## Zuordnung von Hand

- [ ] *Kommentare → Fassung zuordnen* öffnet die Auswahl **ohne** in den
      Upload-Dialog zu wechseln
- [ ] Projekt → Video → Fassung durchklicken, übernehmen: Die Kommentare dieser
      Fassung stehen danach in der Liste
- [ ] Eine von Hand exportierte und im Browser hochgeladene Fassung lässt sich
      so verknüpfen
- [ ] Render-Anfang ≠ 0 eintragen → Marker und Playhead-Sprung sitzen um genau
      diesen Betrag verschoben richtig
- [ ] **In/Out übernehmen** trägt den Mark-In der Timeline ein
- [ ] **Ändern** zeigt die bestehende Zuordnung vorausgewählt
- [ ] **Zuordnung lösen** entfernt sie; die Kommentarliste ist danach leer

## Phase 5 – Kommentar-Panel

- [ ] Die Liste zeigt Autor, Timecode, Text, Antworten und Erledigt-Status
- [ ] Filter „offene/alle" wirkt
- [ ] Klick auf den Timecode setzt den Playhead **frame-genau** (auch mit
      Render-Offset und bei Drop-Frame-Material)
- [ ] Eine Antwort aus dem Panel steht in der Web-App im richtigen Thread und
      unter dem richtigen Namen
- [ ] **Erledigt** und **Wieder öffnen** wirken auf beiden Seiten
- [ ] **Neu laden** holt Änderungen aus dem Browser

## Sprache

- [ ] Ohne Kopplung und mit englischem System ist das Panel **englisch**
- [ ] Mit deutschem System, aber ohne Kopplung, ist es deutsch
      (Systemsprache schlägt den Rückfall)
- [ ] Nach der Kopplung folgt es der Sprache des Klappe-Kontos – im Konto
      umstellen, im Panel *Aktualisieren*, Sprache springt um
- [ ] Ohne eigene Wahl im Konto gilt die Vorgabe der Instanz
- [ ] Die Auswahl *Deutsch* / *English* in den Einstellungen überstimmt alles
      und wirkt sofort, ohne Neustart
- [ ] Unter der Auswahl steht, **woher** die Sprache gerade kommt
- [ ] Umschalten und zurück: Es bleiben keine halb übersetzten Stellen stehen
      (das feste HTML wird gegen das Original übersetzt, nicht gegen den schon
      übersetzten Text)
- [ ] Datum und Uhrzeit an den Kommentaren folgen der Sprache
- [ ] Fehlermeldungen vom Server kommen in der Sprache des Kontos – die
      übersetzt das Plugin nicht noch einmal

## Phase 6 – Feinschliff

- [ ] Alle Fehlermeldungen sind deutsch und sagen, was zu tun ist
- [ ] `401` und `403` sind unterscheidbar formuliert
- [ ] Der Token taucht in keiner Ausgabe auf
- [ ] Nach einem Resolve-Update: `./install.sh` erneut, Panel läuft weiter

---

## Windows (später)

- [ ] `install.ps1` als Administrator kopiert nach
      `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\`
- [ ] Das Panel erscheint im Menü und öffnet sich
- [ ] Der Token liegt über DPAPI verschlüsselt
- [ ] Pfade mit Rückstrichen und Laufwerksbuchstaben funktionieren (Ablage der
      Zeichnungen auf einem Netzlaufwerk)
- [ ] Rendern, Hochladen, Marker, Overlays je einmal durch
