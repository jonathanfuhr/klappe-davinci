#!/usr/bin/env bash
#
# Installiert das Klappe-Panel in DaVinci Resolve Studio (macOS).
#
# Drei Dinge passieren hier:
#   1. Der Plugin-Ordner wandert nach „Workflow Integration Plugins".
#   2. `WorkflowIntegration.node` wird aus der **lokalen** Resolve-Installation
#      kopiert. Das Modul gehört zur installierten Resolve-Version und darf
#      deshalb nicht im Repo liegen – nach einem Resolve-Update dieses Skript
#      einfach noch einmal laufen lassen.
#   3. Die Vorgaben aus dem Block unten landen in
#      `~/.klappe-davinci/vorgaben.json`, damit an einem neuen Schnittplatz
#      niemand Serveradresse und Ablagepfade von Hand eintippen muss.

set -euo pipefail

# ══════════════════════════════════════════════════════════════════════════
#  Hier eintragen, was an diesem Schnittplatz gelten soll.
#  Alles leer lassen ist erlaubt – dann fragt das Panel danach.
# ══════════════════════════════════════════════════════════════════════════

# Adresse der Klappe-Instanz, z. B. "klappe.example.de"
SERVER=""

# Gemeinsame Ablagen auf dem Medien-Server. Leer = Ordner im Benutzerverzeichnis.
ABLAGE_ZEICHNUNGEN=""     # die Overlay-PNGs
ABLAGE_ZUORDNUNG=""       # klappe-mapping.json (Timeline ↔ Fassung)

# Zwischenordner fürs Rendern. Leer = Temp-Ordner des Systems.
# Bei UHD-Mastern lohnt ein Pfad auf der schnellen Arbeitsplatte.
RENDER_ORDNER=""

# Interne Fassungen:
#   immer – jede Fassung entsteht intern und wird nach dem Review freigegeben
#   wahl  – ein Haken im Upload-Dialog entscheidet je Fassung
# Kennt der Server die interne Runde nicht, wird ohnehin immer extern geladen.
INTERN_MODUS="immer"

# Was von den **mitgelieferten** Resolve-Presets im Upload-Dialog stehen soll:
#   keine   – nur eure eigenen Presets (Vorgabe; Resolve bringt drei Dutzend mit)
#   auswahl – zusätzlich die unter STANDARD_PRESETS genannten
#   alle    – alles, was Resolve kennt
# Eigene Presets sind davon nie betroffen: Die sind immer dabei, auch die, die
# ein Kollege morgen anlegt. Nachträglich ist alles in den Einstellungen änderbar.
MITGELIEFERTE_PRESETS="keine"

# Nur für MITGELIEFERTE_PRESETS="auswahl". Schreibweise genau wie in Resolve,
# also mit Bindestrich: "YouTube - 1080p".
STANDARD_PRESETS=(
  # "H.264 Master"
  # "ProRes 422 HQ"
)

# Welches Preset im Upload-Dialog vorgewählt ist. Leer = das erste der Liste.
VORGEWAEHLTES_PRESET=""

# Namen, die zusätzlich als mitgeliefertes Preset gelten sollen – für alles,
# was eine neuere Resolve-Fassung dazulegt und das Plugin noch nicht kennt.
STANDARD_PRESETS_EXTRA=()

# Tastenkürzel für Workspace → Workflow Integrations → Klappe.
# Leer = nichts anfassen. Beispiel: "@0" für Cmd+0 (auf dem Mac frei).
# Schreibweise: @ = Cmd, ~ = Alt, ^ = Ctrl, $ = Shift.
# ACHTUNG: Das ist der macOS-Weg über NSUserKeyEquivalents. Resolve ist eine
# Qt-Anwendung – ob das Menü darauf hört, ist nicht garantiert. Der sichere
# Weg steht am Ende dieses Skripts.
TASTENKUERZEL=""

# Schon vorhandene eigene Einstellungen (`config.json`) löschen, damit die
# Vorgaben von oben greifen? Der Zugangstoken bleibt davon unberührt.
EIGENE_EINSTELLUNGEN_ZURUECKSETZEN="nein"

# ══════════════════════════════════════════════════════════════════════════
#  Ab hier nichts mehr eintragen.
# ══════════════════════════════════════════════════════════════════════════

PLUGIN_ID="de.klappe.davinci"
SELBST="${BASH_SOURCE[0]}"

# Dieses Skript kann zweierlei sein:
#
#   1. Das install.sh aus dem Repo – dann liegt das Plugin daneben.
#   2. Ein selbsttragender Installer – dann hängt das Plugin als gepackte
#      Nutzlast hinter der letzten Zeile und wird hier ausgepackt. So genügt
#      **diese eine Datei** auf einem fremden Schnittrechner.
#
# Die Marke steht absichtlich zerteilt: So gilt diese Zeile hier nicht selbst
# als Trennlinie zur Nutzlast.
MARKE='__KLAPPE_NUTZ''LAST__'

if grep -q "^${MARKE}\$" "${SELBST}" 2>/dev/null; then
  AUSPACKEN="$(mktemp -d)"
  trap 'rm -rf "${AUSPACKEN}"' EXIT

  # macOS bringt BSD-base64 mit; --decode gibt es erst in neueren Fassungen.
  if base64 --decode </dev/null >/dev/null 2>&1; then
    ENTSCHLUESSELN=(base64 --decode)
  else
    ENTSCHLUESSELN=(base64 -D)
  fi

  sed -n "/^${MARKE}\$/,\$p" "${SELBST}" | tail -n +2 | "${ENTSCHLUESSELN[@]}" |
    tar -xzf - -C "${AUSPACKEN}"

  QUELLE="${AUSPACKEN}"
  HERKUNFT="mitgeliefert"
else
  QUELLE="$(cd "$(dirname "${SELBST}")" && pwd)"
  HERKUNFT="Ordner daneben"
fi

ZIEL="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/${PLUGIN_ID}"
BEISPIELE="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Workflow Integrations/Examples"
EINSTELLUNGEN="${HOME}/.klappe-davinci"

echo "Klappe-Panel für DaVinci Resolve"
echo "  Quelle: ${QUELLE} (${HERKUNFT})"
echo "  Ziel:   ${ZIEL}"
echo

if [ ! -d "/Applications/DaVinci Resolve" ]; then
  echo "FEHLER: DaVinci Resolve ist unter /Applications nicht zu finden." >&2
  exit 1
fi

# --------------------------------------------------- Das native Modul suchen
NODE_MODUL=""
for kandidat in "${BEISPIELE}/SamplePlugin/WorkflowIntegration.node" \
                "${BEISPIELE}/SamplePromisePlugin/WorkflowIntegration.node" \
                "${BEISPIELE}/CompatibleSamplePlugin/WorkflowIntegration.node"; do
  if [ -f "${kandidat}" ]; then
    NODE_MODUL="${kandidat}"
    break
  fi
done

if [ -z "${NODE_MODUL}" ]; then
  echo "FEHLER: WorkflowIntegration.node ist in der Resolve-Installation nicht zu finden." >&2
  echo "        Erwartet unter: ${BEISPIELE}/SamplePlugin/" >&2
  echo "        Ohne dieses Modul kann das Panel nicht mit Resolve sprechen." >&2
  exit 1
fi

echo "Natives Modul gefunden: ${NODE_MODUL}"

# ------------------------------------------------------------- Kopieren
# Der Ordner unter /Library gehört root, ist aber je nach Installation für
# alle schreibbar. Erst ohne sudo versuchen – wer nicht danach gefragt wird,
# muss auch kein Passwort eintippen.
if mkdir -p "${ZIEL}" 2>/dev/null; then
  SUDO=""
else
  echo "Für den Zielordner werden Administratorrechte gebraucht."
  SUDO="sudo"
  ${SUDO} mkdir -p "${ZIEL}"
fi

# `--delete-excluded` zusätzlich zu `--delete`: Ohne das bleiben ausgeschlossene
# Dateien im Zielordner stehen, wenn sie einmal dorthin geraten sind.
${SUDO} rsync -a --delete --delete-excluded \
  --exclude '.git' \
  --exclude '.github' \
  --exclude '.claude' \
  --exclude '.DS_Store' \
  --exclude 'node_modules' \
  --exclude 'package-lock.json' \
  --exclude 'test' \
  --exclude 'docs' \
  --exclude 'install.sh' \
  --exclude 'install.ps1' \
  --exclude '.gitignore' \
  "${QUELLE}/" "${ZIEL}/"

${SUDO} cp "${NODE_MODUL}" "${ZIEL}/WorkflowIntegration.node"
${SUDO} chmod -R a+rX "${ZIEL}"

# ------------------------------------------------------------- Vorgaben
# JSON von Hand schreiben statt eine Sprache dafür vorauszusetzen: Auf einem
# frischen Schnittrechner ist weder node noch python garantiert da.
json_text() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

json_liste() {
  local ausgabe="" erstes=1 eintrag
  for eintrag in "$@"; do
    if [ ${erstes} -eq 1 ]; then erstes=0; else ausgabe="${ausgabe}, "; fi
    ausgabe="${ausgabe}\"$(json_text "${eintrag}")\""
  done
  printf '[%s]' "${ausgabe}"
}

mkdir -p "${EINSTELLUNGEN}"

if [ "${EIGENE_EINSTELLUNGEN_ZURUECKSETZEN}" = "ja" ] && [ -f "${EINSTELLUNGEN}/config.json" ]; then
  rm -f "${EINSTELLUNGEN}/config.json"
  echo "Eigene Einstellungen zurückgesetzt (der Zugang bleibt bestehen)."
fi

cat > "${EINSTELLUNGEN}/vorgaben.json" <<VORGABEN
{
  "serverUrl": "$(json_text "${SERVER}")",
  "overlayPath": "$(json_text "${ABLAGE_ZEICHNUNGEN}")",
  "mappingPath": "$(json_text "${ABLAGE_ZUORDNUNG}")",
  "renderDir": "$(json_text "${RENDER_ORDNER}")",
  "internalMode": "$(json_text "${INTERN_MODUS}")",
  "standardPresetsMode": "$(json_text "${MITGELIEFERTE_PRESETS}")",
  "defaultPreset": "$(json_text "${VORGEWAEHLTES_PRESET}")",
  "renderPresetsStandard": $(json_liste ${STANDARD_PRESETS[@]+"${STANDARD_PRESETS[@]}"}),
  "standardPresetsExtra": $(json_liste ${STANDARD_PRESETS_EXTRA[@]+"${STANDARD_PRESETS_EXTRA[@]}"})
}
VORGABEN

chmod 600 "${EINSTELLUNGEN}/vorgaben.json"
echo "Vorgaben geschrieben: ${EINSTELLUNGEN}/vorgaben.json"

if [ -f "${EINSTELLUNGEN}/config.json" ]; then
  echo
  echo "HINWEIS: Es gibt schon eigene Einstellungen (${EINSTELLUNGEN}/config.json)."
  echo "         Die gewinnen gegen die Vorgaben oben – so überschreibt der"
  echo "         Installer nie, was jemand im Panel eingestellt hat."
  echo "         Sollen die Vorgaben greifen: oben EIGENE_EINSTELLUNGEN_ZURUECKSETZEN=\"ja\""
  echo "         setzen und noch einmal laufen lassen."
fi

# ---------------------------------------------------------- Tastenkürzel
if [ -n "${TASTENKUERZEL}" ]; then
  echo
  defaults write com.blackmagic-design.DaVinciResolve NSUserKeyEquivalents \
    -dict-add "Klappe" "${TASTENKUERZEL}"
  echo "Tastenkürzel ${TASTENKUERZEL} für den Menüeintrag Klappe eingetragen."
  echo "Greift erst nach einem Neustart von Resolve – und nur, wenn Resolves"
  echo "Menü auf den macOS-Weg hört. Wenn nicht, siehe unten."
fi

echo
echo "Fertig."
echo "DaVinci Resolve Studio neu starten, dann:"
echo "  Workspace → Workflow Integrations → Klappe"
echo
echo "Tastenkürzel von Hand (der sichere Weg):"
echo "  DaVinci Resolve → Keyboard Customization → nach Klappe suchen"
echo "  → Kürzel zuweisen (Cmd+0 ist auf dem Mac frei) → Save"

# Hier ist Schluss. Was danach kommt, ist die gepackte Nutzlast des
# selbsttragenden Installers – ohne dieses `exit` würde bash versuchen, sie
# als Befehle zu lesen.
exit 0
