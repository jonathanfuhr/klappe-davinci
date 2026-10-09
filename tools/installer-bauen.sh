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
#
# Zwei Dinge passieren zusätzlich, damit niemand sie von Hand machen muss:
#
#   1. **Der Werteblock wird übernommen.** Liegt am Ablageort schon ein
#      Installer, wird genau das, was zwischen den Marken `>>> KLAPPE-WERTE >>>`
#      steht, in die neue Datei gehoben. Serveradresse, Ablagepfade und das
#      vorgewählte Preset überleben damit jede neue Fassung des Plugins – ohne
#      sie wäre jeder Neubau ein Zurücksetzen auf Werkseinstellungen.
#   2. **Die Datei landet im Tauschordner.** Dort holen die Schnittplätze sie
#      ab. Ist das Laufwerk nicht da, wird trotzdem gebaut und gesagt, dass die
#      Kopie fehlt – ein nicht gemountetes Netzlaufwerk ist kein Baufehler.
#
# Beides lässt sich übersteuern:
#   KLAPPE_INSTALLER_ZIEL=/pfad/datei.sh   anderer Ablageort ("" = nicht kopieren)
#   KLAPPE_WERTE_AUS=/pfad/alt.sh          Werteblock aus dieser Datei nehmen
#   KLAPPE_WERTE_AUS=-                     Werteblock des Repos nehmen

set -euo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZIEL="${WURZEL}/dist/klappe-installer.sh"

# Wo die Schnittplätze ihn abholen.
ABLAGE="${KLAPPE_INSTALLER_ZIEL-/Volumes/03_Tauschordner/_IT/klappe-davinci-installer.sh}"

MARKE_AUF='# >>> KLAPPE-WERTE >>>'
MARKE_ZU='# <<< KLAPPE-WERTE <<<'

# Den Werteblock aus einer Datei herausschneiden – ohne die Marken selbst.
werte_lesen() {
  awk -v auf="${MARKE_AUF}" -v zu="${MARKE_ZU}" '
    $0 == zu { drin = 0 }
    drin     { print }
    $0 == auf { drin = 1 }
  ' "$1"
}

# Dasselbe für Dateien, die die Marken noch nicht kennen – gebaut aus einer
# Fassung von vor dieser Änderung. Genau einmal gebraucht: Danach trägt die
# Datei am Ablageort die Marken selbst.
#
# Verankert an den beiden Überschriften und **nicht** an den Balkenzeilen: Die
# bestehen aus Mehrbyte-Zeichen, und daran scheitert ein byte-orientiertes awk
# (`═+` bezieht das Plus auf das letzte Byte). Die Überschriften sind reines
# ASCII und eindeutig.
werte_lesen_alt() {
  local von bis
  von="$(grep -n 'Alles leer lassen ist erlaubt' "$1" | head -1 | cut -d: -f1)"
  bis="$(grep -n 'Ab hier nichts mehr eintragen' "$1" | head -1 | cut -d: -f1)"
  [ -n "${von}" ] && [ -n "${bis}" ] || return 0

  # +2 und -2: Zwischen Überschrift und Werten steht je eine Balkenzeile.
  [ "$((von + 2))" -le "$((bis - 2))" ] || return 0
  sed -n "$((von + 2)),$((bis - 2))p" "$1"
}

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

# ---------------------------------------------------- Werteblock übernehmen

# Woher die Werte kommen: ausdrücklich genannt, sonst aus der Datei am
# Ablageort, sonst aus dem Repo.
WERTE_QUELLE=""
if [ -n "${KLAPPE_WERTE_AUS-}" ]; then
  [ "${KLAPPE_WERTE_AUS}" != "-" ] && WERTE_QUELLE="${KLAPPE_WERTE_AUS}"
elif [ -n "${ABLAGE}" ] && [ -f "${ABLAGE}" ]; then
  WERTE_QUELLE="${ABLAGE}"
fi

KOPF="${WURZEL}/install.sh"
if [ -n "${WERTE_QUELLE}" ]; then
  if [ ! -f "${WERTE_QUELLE}" ]; then
    echo "FEHLER: ${WERTE_QUELLE} gibt es nicht." >&2
    exit 1
  fi

  werte_lesen "${WERTE_QUELLE}" > "${TMP}/werte"
  if [ ! -s "${TMP}/werte" ]; then
    werte_lesen_alt "${WERTE_QUELLE}" > "${TMP}/werte"
    if [ -s "${TMP}/werte" ]; then
      echo "Hinweis: ${WERTE_QUELLE} kennt die Marken noch nicht –"
      echo "         der Block wurde über die Balkenzeilen gelesen."
    else
      # Weder Marken noch Balken: Lieber abbrechen als die Werte des Hauses
      # stillschweigend auf Werkseinstellung zurücksetzen.
      echo "FEHLER: In ${WERTE_QUELLE} ist kein Werteblock zu finden." >&2
      echo "        Werte von Hand übernehmen oder KLAPPE_WERTE_AUS=- setzen." >&2
      exit 1
    fi
  fi

  # Grobe Gegenprobe: Ohne eine Zuweisung ist das kein Werteblock, sondern
  # irgendein Stück Datei – und das würde den Installer unbrauchbar machen.
  if ! grep -qE '^[A-Z_]+=' "${TMP}/werte"; then
    echo "FEHLER: Der gelesene Block aus ${WERTE_QUELLE} enthält keine Werte." >&2
    exit 1
  fi

  # Den Block im Kopf austauschen. `awk` statt `sed`, weil die Werte Pfade mit
  # Schrägstrichen und Umlaute enthalten – daran scheitert jede sed-Ersetzung.
  awk -v auf="${MARKE_AUF}" -v zu="${MARKE_ZU}" -v datei="${TMP}/werte" '
    $0 == auf { print; while ((getline zeile < datei) > 0) print zeile; drin = 1; next }
    $0 == zu  { drin = 0 }
    !drin     { print }
  ' "${WURZEL}/install.sh" > "${TMP}/install.sh"
  KOPF="${TMP}/install.sh"
fi

mkdir -p "${WURZEL}/dist"
{
  cat "${KOPF}"
  printf '\n__KLAPPE_NUTZLAST__\n'
  "${UMBRUCH[@]}" < "${TMP}/nutzlast.tar.gz"
} > "${ZIEL}"

chmod +x "${ZIEL}"

# Nachsehen statt annehmen: Ist der Werteblock wirklich angekommen?
if [ -n "${WERTE_QUELLE}" ]; then
  if ! diff -q <(werte_lesen "${ZIEL}") "${TMP}/werte" >/dev/null; then
    echo "FEHLER: Der übernommene Werteblock stimmt nicht mit der Quelle überein." >&2
    exit 1
  fi
fi

# Und: lässt sich die gebaute Datei überhaupt noch lesen?
bash -n "${ZIEL}" || {
  echo "FEHLER: Die gebaute Datei ist kein gültiges Shell-Skript." >&2
  exit 1
}

GROESSE="$(du -h "${ZIEL}" | cut -f1 | tr -d ' ')"
echo "Gebaut: ${ZIEL} (${GROESSE})"
if [ -n "${WERTE_QUELLE}" ]; then
  echo "Werte übernommen aus: ${WERTE_QUELLE}"
  echo "  Server: $(grep -m1 '^SERVER=' "${ZIEL}" | cut -d'"' -f2)"
  echo "  Preset: $(grep -m1 '^VORGEWAEHLTES_PRESET=' "${ZIEL}" | cut -d'"' -f2)"
else
  echo "Werte: aus dem Repo (Werkseinstellung)"
fi

# ------------------------------------------------------------- Ablegen

# Die .app zum Doppelklicken – für die Kollegen der einfachere Weg. Sie
# bekommt **denselben** Installer hineingelegt, damit es nicht zwei Fassungen
# gibt, die auseinanderlaufen können.
APP=""
if [ "${KLAPPE_APP-ja}" = "ja" ]; then
  if "${WURZEL}/tools/app-bauen.sh" "${ZIEL}"; then
    APP="${WURZEL}/dist/Klappe-Panel installieren.app"
  else
    echo "WARNUNG: Die .app ließ sich nicht bauen – die .sh steht trotzdem." >&2
  fi
fi

if [ -z "${ABLAGE}" ]; then
  echo "Ablage: übersprungen (KLAPPE_INSTALLER_ZIEL ist leer)"
elif [ -d "$(dirname "${ABLAGE}")" ]; then
  cp "${ZIEL}" "${ABLAGE}"
  chmod +x "${ABLAGE}" 2>/dev/null || true
  echo "Abgelegt: ${ABLAGE}"

  if [ -n "${APP}" ]; then
    APP_ABLAGE="$(dirname "${ABLAGE}")/$(basename "${APP}")"
    rm -rf "${APP_ABLAGE}"
    # `ditto` und nicht `cp -R`: Bei einem App-Bundle gehören die Rechte dazu,
    # und daran hängt, ob macOS es noch startet.
    #
    # `--noextattr --norsrc`, weil die SMB-Freigabe keine erweiterten Attribute
    # annimmt – `ditto` bricht dort sonst mit „Permission denied" auf seinen
    # eigenen `.BC.T_*`-Hilfsdateien ab. Für das Siegel ist das gleichgültig:
    # Es steckt im Programm selbst und in `_CodeSignature`, nicht in xattrs.
    # Gegengeprüft wird es gleich darunter.
    ditto --noextattr --norsrc "${APP}" "${APP_ABLAGE}"

    # Lesen und starten darf jeder: Auf der Freigabe liegt die App für die
    # anderen Schnittplätze, nicht für den, der sie gebaut hat.
    chmod -R a+rX "${APP_ABLAGE}" 2>/dev/null || true
    # Ein Quarantäne-Merkmal würde beim Kollegen „nicht geöffnet werden,
    # weil der Entwickler nicht verifiziert ist" ergeben. Über die Freigabe
    # kommt normalerweise keins mit – falls doch, kommt es hier weg.
    xattr -dr com.apple.quarantine "${APP_ABLAGE}" 2>/dev/null || true
    if codesign --verify --deep "${APP_ABLAGE}" >/dev/null 2>&1; then
      echo "Abgelegt: ${APP_ABLAGE}"
    else
      echo "Abgelegt: ${APP_ABLAGE} (WARNUNG: Siegel prüft dort nicht durch)"
    fi
  fi
else
  echo "Ablage: $(dirname "${ABLAGE}") ist nicht da – Laufwerk nicht gemountet?"
  echo "        Die gebauten Dateien liegen in dist/ und können von Hand hinüber."
fi
