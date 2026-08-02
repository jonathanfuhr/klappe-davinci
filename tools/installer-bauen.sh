#!/usr/bin/env bash
#
# Baut den selbsttragenden Installer: `dist/klappe-installer.sh`.
#
# Das ist `install.sh` mit dem Plugin als gepackter Nutzlast dahinter. Auf
# einem fremden Schnittrechner genügt damit **diese eine Datei** – oben die
# Werte fürs Haus eintragen, ausführen, fertig.
#
# Die Nutzlast steht als Base64 hinter einer Trennlinie. Das kostet ein Drittel
# mehr Platz als rohe Bytes, hat aber einen Grund: So bleibt die Datei reiner
# Text und übersteht das Bearbeiten der Werte oben in jedem Editor. Mit rohen
# Bytes wäre sie beim ersten Speichern kaputt.

set -euo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZIEL="${WURZEL}/dist/klappe-installer.sh"

# Genau das, was im Plugin-Ordner landen soll – Tests, Doku und die Installer
# selbst gehören nicht hinein.
INHALT=(main.js manifest.xml package.json README.md LICENSE src)

for eintrag in "${INHALT[@]}"; do
  if [ ! -e "${WURZEL}/${eintrag}" ]; then
    echo "FEHLER: ${eintrag} fehlt im Repo." >&2
    exit 1
  fi
done

TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

# COPYFILE_DISABLE: Sonst legt das tar von macOS zu jeder Datei ein `._`-Paar
# mit den erweiterten Attributen dazu – im Plugin-Ordner nur Ballast.
COPYFILE_DISABLE=1 tar -czf "${TMP}/nutzlast.tar.gz" -C "${WURZEL}" "${INHALT[@]}"

# Zeilen umbrechen: BSD-base64 (macOS) schreibt sonst alles in **eine** Zeile,
# und eine 120-KB-Zeile bringt manche Editoren ins Stolpern. `-b` ist BSD,
# `-w` ist GNU.
if base64 -b 76 </dev/null >/dev/null 2>&1; then
  UMBRUCH=(base64 -b 76)
elif base64 -w 76 </dev/null >/dev/null 2>&1; then
  UMBRUCH=(base64 -w 76)
else
  UMBRUCH=(base64)
fi

mkdir -p "${WURZEL}/dist"
{
  cat "${WURZEL}/install.sh"
  printf '\n__KLAPPE_NUTZLAST__\n'
  "${UMBRUCH[@]}" < "${TMP}/nutzlast.tar.gz"
} > "${ZIEL}"

chmod +x "${ZIEL}"

GROESSE="$(du -h "${ZIEL}" | cut -f1 | tr -d ' ')"
echo "Gebaut: ${ZIEL} (${GROESSE})"
echo
echo "Auf dem Zielrechner:"
echo "  1. Datei hinüberkopieren"
echo "  2. Oben im Block die Werte fürs Haus eintragen und speichern"
echo "  3. ./klappe-installer.sh"
