#!/usr/bin/env bash
#
# Baut `dist/Klappe-Panel installieren.app` – den Installer zum Doppelklicken.
#
# Warum überhaupt eine .app: Ein `.sh` auf einem Netzlaufwerk ist für Kollegen
# drei Hürden – Terminal öffnen, Pfad hintippen, vielleicht noch `chmod +x`.
# Eine .app ist ein Doppelklick, ein Dialog, fertig.
#
# Darin steckt **genau derselbe** selbsttragende Installer, der auch als .sh
# gebaut wird: dieselbe Nutzlast, derselbe Werteblock. Zwei Wege zum gleichen
# Ergebnis, nicht zwei Installer, die auseinanderlaufen können.
#
# Gebaut wird über `osacompile`, nicht als handgeklöppeltes Bundle: Dann kommt
# der ausführbare Stub von Apple, die App startet auf jedem Mac ohne Rechte-
# gefummel, und die Dialoge sind die des Systems.

set -euo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALLER="${1:-${WURZEL}/dist/klappe-installer.sh}"
APP="${WURZEL}/dist/Klappe-Panel installieren.app"

if [ ! -f "${INSTALLER}" ]; then
  echo "FEHLER: ${INSTALLER} gibt es nicht – erst tools/installer-bauen.sh laufen lassen." >&2
  exit 1
fi

if ! command -v osacompile >/dev/null 2>&1; then
  echo "FEHLER: osacompile fehlt (gehört zu macOS)." >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

# ---------------------------------------------------------- Der Applescript
#
# Drei Schritte, und der erste ist der wichtigste: **vorher zeigen, was
# installiert wird.** Ein Installer, der auf Doppelklick losläuft, ist ein
# Installer, bei dem niemand merkt, dass er die falsche Datei erwischt hat.
#
# Die Werte liest `--werte` aus dem eingebetteten Skript – also aus derselben
# Quelle, die gleich auch installiert. Sie hier zweitens zu hinterlegen wäre
# die Gelegenheit, dass Dialog und Wirklichkeit auseinanderfallen.
cat > "${TMP}/main.applescript" <<'APPLESCRIPT'
on run
	set hier to POSIX path of (path to me)
	set skript to hier & "Contents/Resources/klappe-installer.sh"

	try
		set werte to do shell script "/bin/bash " & quoted form of skript & " --werte"
	on error fehler
		display alert "Der Installer in dieser App ist nicht lesbar." message fehler as critical
		return
	end try

	display dialog "Das Klappe-Panel für DaVinci Resolve wird installiert." & return & return & werte & return & return & "Für den Plugin-Ordner fragt macOS gleich nach dem Administrator-Passwort." with title "Klappe-Panel installieren" buttons {"Abbrechen", "Installieren"} default button "Installieren" with icon note

	try
		set ausgabe to do shell script "/bin/bash " & quoted form of skript & " 2>&1"
	on error fehler
		display alert "Die Installation ist fehlgeschlagen." message fehler as critical
		return
	end try

	display alert "Das Klappe-Panel ist installiert." message "DaVinci Resolve Studio neu starten, dann:" & return & "Workspace → Workflow Integrations → Klappe" & return & return & "Vollständige Ausgabe:" & return & ausgabe
end run
APPLESCRIPT

rm -rf "${APP}"
mkdir -p "${WURZEL}/dist"
osacompile -o "${APP}" "${TMP}/main.applescript"

# Der Installer wandert in die App – ausführbar, damit der Weg über
# `/bin/bash <pfad>` nicht der einzige bleibt.
cp "${INSTALLER}" "${APP}/Contents/Resources/klappe-installer.sh"
chmod +x "${APP}/Contents/Resources/klappe-installer.sh"

# Ein eigener Name im Finder und in „Über diese App". Die Kennung ist eine
# eigene (…installer), nicht die des Plugins: Es sind zwei verschiedene Dinge.
/usr/libexec/PlistBuddy -c 'Add :CFBundleName string "Klappe-Panel installieren"' \
  "${APP}/Contents/Info.plist" >/dev/null 2>&1 ||
  /usr/libexec/PlistBuddy -c 'Set :CFBundleName "Klappe-Panel installieren"' \
    "${APP}/Contents/Info.plist" >/dev/null

/usr/libexec/PlistBuddy -c 'Add :CFBundleIdentifier string "de.klappe.davinci.installer"' \
  "${APP}/Contents/Info.plist" >/dev/null 2>&1 ||
  /usr/libexec/PlistBuddy -c 'Set :CFBundleIdentifier "de.klappe.davinci.installer"' \
    "${APP}/Contents/Info.plist" >/dev/null

# Neu unterschreiben – **nach** dem Hineinlegen des Installers.
#
# `osacompile` signiert das Bundle am Ende selbst (ad hoc). Jede Datei, die
# danach hineinkommt, steht nicht im Siegel, und macOS hält die App dann für
# beschädigt und startet sie gar nicht. Das ist genau der Fehler, der beim
# Kollegen auftritt und nicht beim Bauen.
if command -v codesign >/dev/null 2>&1; then
  codesign --force --deep --sign - "${APP}" >/dev/null 2>&1 || {
    echo "WARNUNG: Neu unterschreiben ist fehlgeschlagen – die App startet" >&2
    echo "         vielleicht nicht. codesign-Ausgabe:" >&2
    codesign --force --deep --sign - "${APP}" || true
  }
  codesign --verify --deep "${APP}" >/dev/null 2>&1 ||
    echo "WARNUNG: Das Siegel der App prüft nicht durch." >&2
else
  echo "WARNUNG: codesign fehlt – die App ist unsigniert." >&2
fi

# Nachsehen statt annehmen: Ist die eingebettete Datei heil, und sagt sie
# dieselben Werte wie die Quelle?
if ! diff -q <("/bin/bash" "${APP}/Contents/Resources/klappe-installer.sh" --werte) \
             <("/bin/bash" "${INSTALLER}" --werte) >/dev/null; then
  echo "FEHLER: Die Werte in der App stimmen nicht mit ${INSTALLER} überein." >&2
  exit 1
fi

GROESSE="$(du -sh "${APP}" | cut -f1 | tr -d ' ')"
echo "Gebaut: ${APP} (${GROESSE})"
