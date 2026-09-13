#!/usr/bin/env bash
#
# Exportiert den aktuellen Stand in das oeffentliche Repository.
#
#   ./veroeffentlichen.sh ["Nachricht"] [Zielverzeichnis]
#
# Das oeffentliche Repo bekommt **keine Vorgeschichte**: es beginnt mit einem
# einzigen Commit und waechst von da an normal weiter. Die vollstaendige
# Entwicklungsgeschichte bleibt hier und auf dem privaten Server.
#
# Uebertragen wird nur, was `git ls-files` kennt. Damit bleiben von selbst
# draussen: das Diskettenabbild, die entpackten Programmdateien, Zeichensaetze,
# Bilder, Musik, der Ordner daten/ mit Konten und Spielstaenden, das Handbuch
# und BETRIEB.lokal.md mit den eigenen Servern.
#
# Vor jedem Commit laeuft eine Kontrolle. Findet sie Originalmaterial oder die
# eigenen Adressen, bricht das Skript ab, bevor etwas festgeschrieben wird.

set -euo pipefail

NACHRICHT=${1:-}
ZIEL=${2:-"$HOME/Documents/kaiser-nachbau"}
QUELLE=$(git rev-parse --show-toplevel)

# ---------------------------------------------------------------- Kontrolle

# Das Changelog gehoert gepflegt, bevor etwas hinausgeht. Es ist kein Zwang --
# nicht jede Aenderung ist einen Eintrag wert --, aber eine Erinnerung.
if [ -n "$NACHRICHT" ] && ! git -C "$QUELLE" diff HEAD~5..HEAD --name-only 2>/dev/null | grep -q CHANGELOG.md; then
  echo "Hinweis: CHANGELOG.md wurde in den letzten fuenf Commits nicht angefasst."
  echo
fi

if [ -n "$(git -C "$QUELLE" status --porcelain)" ]; then
  echo "Der Arbeitsbaum ist nicht sauber. Erst committen, dann veroeffentlichen."
  git -C "$QUELLE" status --short
  exit 1
fi

# Muster, die im oeffentlichen Repo nichts zu suchen haben. "Panxatony" fehlt
# hier mit Absicht: der Name steht in der LICENSE, und das ist gewollt.
VERBOTEN=(
  'vserver[0-9]'
  'hosting01'
  '100\.76\.'
  'kaiser\.mammutjaeger'
  '@gmx\.de'
  '@vonhof-hunold\.de'
  'KAISER_SMTP_KENNWORT="[^".]{6,}'
)

echo "Quelle: $QUELLE"
echo "Ziel:   $ZIEL"
echo

# ------------------------------------------------------------------ Ausgabe

mkdir -p "$ZIEL"
if [ ! -d "$ZIEL/.git" ]; then
  git -C "$ZIEL" init -q -b main
  echo "Neues Repository in $ZIEL angelegt."
  ERSTER=ja
else
  ERSTER=nein
fi

# Alles ausser .git wegraeumen, damit geloeschte Dateien auch dort verschwinden
find "$ZIEL" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
git -C "$QUELLE" archive HEAD | tar -x -C "$ZIEL"

# ------------------------------------------------------- Kontrolle der Kopie

# Das Skript selbst traegt die Muster im Klartext und wird darum uebergangen.
FEHLER=0
for muster in "${VERBOTEN[@]}"; do
  TREFFER=$(grep -rIlE "$muster" "$ZIEL" --exclude-dir=.git \
            --exclude=veroeffentlichen.sh || true)
  if [ -n "$TREFFER" ]; then
    echo "GEFUNDEN: $muster"
    echo "$TREFFER" | sed "s|$ZIEL/|  |"
    FEHLER=1
  fi
done

FREMD=$(find "$ZIEL" -path "$ZIEL/.git" -prune -o \
  \( -name '*.d64' -o -name '*.prg' -o -name '*.sid' -o -name '*.seq' \
     -o -name '*.bas' -o -path '*/assets/*' -o -path '*/daten/*' \
     -o -name 'BETRIEB.lokal.md' \) -print)
if [ -n "$FREMD" ]; then
  echo "Originalmaterial oder Betriebsdaten in der Kopie:"
  echo "$FREMD" | sed "s|$ZIEL/|  |"
  FEHLER=1
fi

if [ "$FEHLER" = 1 ]; then
  echo
  echo "Abgebrochen. Es wurde nichts festgeschrieben."
  exit 1
fi
echo "Kontrolle bestanden: kein Originalmaterial, keine eigenen Adressen."
echo

# ------------------------------------------------------------------- Commit

git -C "$ZIEL" add -A
if git -C "$ZIEL" diff --cached --quiet; then
  echo "Nichts zu veroeffentlichen, der Stand ist schon dort."
  exit 0
fi

git -C "$ZIEL" status --short | head -20
echo

if [ "$ERSTER" = ja ]; then
  git -C "$ZIEL" commit -q -F - <<'MELDUNG'
Kaiser: ein Nachbau des C64-Spiels von 1984

Bis zu neun Fuersten regieren ab dem Jahr 1700 je ein deutsches
Fuerstentum, planen gleichzeitig ihr Jahr und treffen sich in Diplomatie
und Krieg. Die Regeln folgen dem Original Zeile fuer Zeile, hergeleitet
aus dem entlisteten BASIC des Hauptprogramms.

Vom Original ist hier kein Byte enthalten. Wer die Diskette besitzt,
erzeugt sich Zeichensaetze, Bilder und Musik mit einem Befehl aus der
eigenen Kopie; ohne sie laeuft das Spiel vollstaendig, nur schmucklos.
MELDUNG
else
  git -C "$ZIEL" commit -q -m "${NACHRICHT:-Stand vom $(date +%d.%m.%Y)}"
fi

echo "Festgeschrieben:"
git -C "$ZIEL" log --oneline -1
echo
echo "Zum Hochladen, wenn das GitHub-Repo angelegt ist:"
echo "  git -C $ZIEL remote add github git@github.com:<konto>/kaiser-nachbau.git"
echo "  git -C $ZIEL push -u github main"
