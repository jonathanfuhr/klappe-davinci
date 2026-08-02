<#
    Installiert das Klappe-Panel in DaVinci Resolve Studio (Windows).

    Wie unter macOS passieren drei Dinge: Der Plugin-Ordner wandert in die
    „Workflow Integration Plugins", `WorkflowIntegration.node` wird aus der
    lokalen Resolve-Installation kopiert (das Modul gehört zur installierten
    Resolve-Version und liegt deshalb nicht im Repo), und die Vorgaben aus dem
    Block unten landen in `%USERPROFILE%\.klappe-davinci\vorgaben.json`.

    In einer PowerShell **als Administrator** ausführen:
        powershell -ExecutionPolicy Bypass -File .\install.ps1
#>

$ErrorActionPreference = 'Stop'

# ══════════════════════════════════════════════════════════════════════════
#  Hier eintragen, was an diesem Schnittplatz gelten soll.
#  Alles leer lassen ist erlaubt – dann fragt das Panel danach.
# ══════════════════════════════════════════════════════════════════════════

# Adresse der Klappe-Instanz, z. B. "klappe.example.de"
$Server = ''

# Gemeinsame Ablagen auf dem Medien-Server. Leer = Ordner im Benutzerverzeichnis.
$AblageZeichnungen = ''    # die Overlay-PNGs
$AblageZuordnung   = ''    # klappe-mapping.json (Timeline <-> Fassung)

# Zwischenordner fürs Rendern. Leer = Temp-Ordner des Systems.
$RenderOrdner = ''

# Interne Fassungen: 'immer' oder 'wahl'.
$InternModus = 'immer'

# Was von den **mitgelieferten** Resolve-Presets im Upload-Dialog stehen soll:
#   'keine'   – nur eure eigenen Presets (Vorgabe)
#   'auswahl' – zusätzlich die unter $StandardPresets genannten
#   'alle'    – alles, was Resolve kennt
# Eigene Presets sind davon nie betroffen.
$MitgeliefertePresets = 'keine'

# Nur für 'auswahl'. Schreibweise genau wie in Resolve, also mit Bindestrich.
$StandardPresets = @(
  # 'H.264 Master'
)

# Welches Preset im Upload-Dialog vorgewählt ist. Leer = das erste der Liste.
$VorgewaehltesPreset = ''

# Namen, die zusätzlich als mitgeliefertes Preset gelten sollen.
$StandardPresetsExtra = @()

# Schon vorhandene eigene Einstellungen (config.json) löschen, damit die
# Vorgaben greifen? Der Zugangstoken bleibt davon unberührt.
$EigeneEinstellungenZuruecksetzen = $false

# ══════════════════════════════════════════════════════════════════════════
#  Ab hier nichts mehr eintragen.
# ══════════════════════════════════════════════════════════════════════════

$PluginId      = 'de.klappe.davinci'
$Quelle        = Split-Path -Parent $MyInvocation.MyCommand.Path
$Ziel          = Join-Path $env:PROGRAMDATA "Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\$PluginId"
$Beispiele     = Join-Path $env:PROGRAMDATA "Blackmagic Design\DaVinci Resolve\Support\Developer\Workflow Integrations\Examples"
$Einstellungen = Join-Path $env:USERPROFILE '.klappe-davinci'

Write-Host "Klappe-Panel für DaVinci Resolve"
Write-Host "  Quelle: $Quelle"
Write-Host "  Ziel:   $Ziel"
Write-Host ""

# --------------------------------------------------- Das native Modul suchen
$NodeModul = $null
foreach ($name in @('SamplePlugin', 'SamplePromisePlugin', 'CompatibleSamplePlugin')) {
    $kandidat = Join-Path $Beispiele "$name\WorkflowIntegration.node"
    if (Test-Path $kandidat) { $NodeModul = $kandidat; break }
}

if (-not $NodeModul) {
    Write-Error "WorkflowIntegration.node ist in der Resolve-Installation nicht zu finden (erwartet unter $Beispiele). Ohne dieses Modul kann das Panel nicht mit Resolve sprechen."
    exit 1
}

Write-Host "Natives Modul gefunden: $NodeModul"

# ------------------------------------------------------------- Kopieren
if (Test-Path $Ziel) { Remove-Item -Recurse -Force $Ziel }
New-Item -ItemType Directory -Force -Path $Ziel | Out-Null

Copy-Item -Path (Join-Path $Quelle 'main.js')      -Destination $Ziel
Copy-Item -Path (Join-Path $Quelle 'manifest.xml') -Destination $Ziel
Copy-Item -Path (Join-Path $Quelle 'package.json') -Destination $Ziel
Copy-Item -Path (Join-Path $Quelle 'src')          -Destination $Ziel -Recurse

foreach ($ausnahme in @('.git', '.github', '.claude', 'node_modules', 'test', 'docs')) {
    $pfad = Join-Path $Ziel $ausnahme
    if (Test-Path $pfad) { Remove-Item -Recurse -Force $pfad }
}

Copy-Item -Path $NodeModul -Destination (Join-Path $Ziel 'WorkflowIntegration.node')

# ------------------------------------------------------------- Vorgaben
New-Item -ItemType Directory -Force -Path $Einstellungen | Out-Null

$ConfigDatei = Join-Path $Einstellungen 'config.json'
if ($EigeneEinstellungenZuruecksetzen -and (Test-Path $ConfigDatei)) {
    Remove-Item -Force $ConfigDatei
    Write-Host "Eigene Einstellungen zurückgesetzt (der Zugang bleibt bestehen)."
}

# ConvertTo-Json übernimmt das Escapen – auch für Pfade mit Rückstrichen.
$Vorgaben = [ordered]@{
    serverUrl             = $Server
    overlayPath           = $AblageZeichnungen
    mappingPath           = $AblageZuordnung
    renderDir             = $RenderOrdner
    internalMode          = $InternModus
    standardPresetsMode   = $MitgeliefertePresets
    defaultPreset         = $VorgewaehltesPreset
    renderPresetsStandard = @($StandardPresets)
    standardPresetsExtra  = @($StandardPresetsExtra)
}

$VorgabenDatei = Join-Path $Einstellungen 'vorgaben.json'
$Vorgaben | ConvertTo-Json -Depth 5 | Set-Content -Path $VorgabenDatei -Encoding UTF8
Write-Host "Vorgaben geschrieben: $VorgabenDatei"

if (Test-Path $ConfigDatei) {
    Write-Host ""
    Write-Host "HINWEIS: Es gibt schon eigene Einstellungen ($ConfigDatei)."
    Write-Host "         Die gewinnen gegen die Vorgaben oben – so überschreibt der"
    Write-Host "         Installer nie, was jemand im Panel eingestellt hat."
    Write-Host "         Sollen die Vorgaben greifen: oben"
    Write-Host "         `$EigeneEinstellungenZuruecksetzen = `$true setzen."
}

Write-Host ""
Write-Host "Fertig."
Write-Host "DaVinci Resolve Studio neu starten, dann:"
Write-Host "  Workspace -> Workflow Integrations -> Klappe"
Write-Host ""
Write-Host "Tastenkürzel: DaVinci Resolve -> Keyboard Customization -> nach Klappe"
Write-Host "suchen -> Kürzel zuweisen -> Save"
