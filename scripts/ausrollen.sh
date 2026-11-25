#!/usr/bin/env bash
#
# Rollt den Spielserver aus -- und kann den Ordner `daten` nicht mitschicken.
#
#   KAISER_ZIEL=<rechner> ./scripts/ausrollen.sh [--pakete] [--ja]
#
# Am 11.09.2026 ist genau das einmal schiefgegangen: der tar-Befehl wurde von
# Hand getippt, `daten` ging mit, sechs Proberunden landeten in der Lobby und
# die Ruhmeshalle war voll mit Namen aus Simulationen. Darum dieses Skript.
# Es uebertraegt eine feste Liste, nicht alles, was gerade herumliegt.
#
# Vorher zeigt es die laufenden Partien. Eine Regelaenderung gehoert nicht
# klammheimlich in eine Runde, die jemand seit sechzig Jahren spielt.
#
# Umgebung:
#   KAISER_ZIEL   Rechner, wie ihn ssh kennt (oder als erstes Argument)
#   KAISER_PFAD   Verzeichnis dort, Vorgabe /opt/kaiser
#   KAISER_UNIT   systemd-Unit, Vorgabe kaiser

set -euo pipefail

PAKETE=nein
JA=nein
ZIEL=${KAISER_ZIEL:-}

for arg in "$@"; do
  case "$arg" in
    --pakete) PAKETE=ja ;;
    --ja)     JA=ja ;;
    -*)       echo "Unbekannter Schalter: $arg" >&2; exit 2 ;;
    *)        ZIEL=$arg ;;
  esac
done

if [ -z "$ZIEL" ]; then
  echo "Kein Ziel. KAISER_ZIEL=<rechner> setzen oder als Argument angeben." >&2
  exit 2
fi

PFAD=${KAISER_PFAD:-/opt/kaiser}
UNIT=${KAISER_UNIT:-kaiser}
WURZEL=$(git rev-parse --show-toplevel)/kaiser-online
cd "$WURZEL"

# Genau das geht hinaus, nichts sonst.
DATEIEN=(server client package.json)
if [ "$PAKETE" = ja ]; then
  DATEIEN+=(package-lock.json)
fi

echo "Ziel:     $ZIEL:$PFAD   (Unit $UNIT)"
echo "Dateien:  ${DATEIEN[*]}"
echo

# ------------------------------------------------- erst die Tests, dann reden

PROTOKOLL=$(mktemp)
trap 'rm -f "$PROTOKOLL"' EXIT
echo "Tests:"
if npm test >"$PROTOKOLL" 2>&1; then
  grep -E '^. (tests|pass|fail) ' "$PROTOKOLL" | sed 's/^/  /'
else
  echo "  FEHLGESCHLAGEN -- es wird nichts ausgerollt." >&2
  tail -30 "$PROTOKOLL" >&2
  exit 1
fi
echo

# ------------------------------------------------------- laufende Partien

echo "Laufende Partien auf $ZIEL:"
ssh "$ZIEL" "ls -1 $PFAD/daten/spiele/ 2>/dev/null | sed 's/^/  /'" || true
echo
echo "Beeinflusst diese Aenderung eine Regel, die in einer dieser Runden gilt?"
echo "Dann erst fragen, nicht ausrollen."
echo

if [ "$JA" != ja ]; then
  if [ ! -t 0 ]; then
    echo "Nicht am Terminal. Mit --ja bestaetigen." >&2
    exit 1
  fi
  read -r -p "Ausrollen? [j/N] " ANTWORT
  case "$ANTWORT" in j|J|ja|Ja) ;; *) echo "Abgebrochen."; exit 0 ;; esac
  echo
fi

# ------------------------------------------------------------------ Uebertragen

tar czf - "${DATEIEN[@]}" | ssh "$ZIEL" "cd $PFAD && tar xzf -"
echo "Uebertragen."

if [ "$PAKETE" = ja ]; then
  ssh "$ZIEL" "cd $PFAD && npm install --omit=dev"
fi

ssh "$ZIEL" "sudo systemctl restart $UNIT"

# ---------------------------------------------------------------- Nachkontrolle

sleep 2
echo
echo "Dienst:   $(ssh "$ZIEL" "systemctl is-active $UNIT")"
echo "Partien danach:"
ssh "$ZIEL" "ls -1 $PFAD/daten/spiele/ 2>/dev/null | sed 's/^/  /'" || true
echo
echo "Steht in der Ruhmeshalle ein Name aus einer Simulation, ist er beim"
echo "Ausrollen hereingekommen:"
echo "  ssh $ZIEL 'cat $PFAD/daten/ruhmeshalle.json'"
