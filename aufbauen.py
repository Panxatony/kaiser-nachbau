#!/usr/bin/env python3
"""
aufbauen.py -- macht aus einer eigenen kaiser.d64 ein spielbares kaiser-online.

    python3 aufbauen.py kaiser.d64

Das Repository enthaelt kein Originalmaterial. Wer die Diskette besitzt, legt
ihr Abbild daneben und laesst dieses Skript laufen; es erledigt in einem Zug,
was sonst vier Aufrufe waeren:

  1. Diskettenabbild entpacken                 -> extracted/
  2. BASIC des Hauptprogramms entlisten        -> extracted/main_game.bas
  3. Zeichensaetze und Bilder umwandeln        -> kaiser-online/client/assets/
  4. beide Musikstuecke als PSID herausschneiden -> musik/ und assets/

Danach ist das Spiel vollstaendig: Titelbild, Zeichensaetze, Schlachtfeld,
Reichskarte, Kornspeicher und Musik. Ohne diesen Schritt laeuft es auch, dann
aber mit Schriftzug statt Titelbild, mit einem Hinweis statt des Schlachtfelds
und ohne Ton.

Was die einzelnen Schritte tun und woher jedes Byte stammt, steht in GRAFIK.md
und MUSIK.md. Nichts davon ist verborgen, und nichts davon wird verteilt.
"""
import os, shutil, subprocess, sys

BASIS = os.path.dirname(os.path.abspath(__file__))
EXTRACTED = os.path.join(BASIS, 'extracted')
ASSETS = os.path.join(BASIS, 'kaiser-online', 'client', 'assets')
MUSIK = os.path.join(BASIS, 'musik')

# Was am Ende dastehen muss, damit der Client nichts vermisst.
ERWARTET = [
    os.path.join(ASSETS, 'charset.png'),
    os.path.join(ASSETS, 'charset_karte.png'),
    os.path.join(ASSETS, 'charset_map.png'),
    os.path.join(ASSETS, 'title.png'),
    os.path.join(ASSETS, 'outro.png'),
    os.path.join(ASSETS, 'kaiser_titel.sid'),
    os.path.join(ASSETS, 'kaiser_abspann.sid'),
]


def schritt(nummer, was, befehl, ausgabe=None):
    """Fuehrt einen Schritt aus und bricht bei Fehlern mit Klartext ab."""
    print(f'\n[{nummer}/4] {was}')
    print('     ' + ' '.join(befehl))
    if ausgabe:
        with open(ausgabe, 'wb') as f:
            e = subprocess.run(befehl, cwd=BASIS, stdout=f)
    else:
        e = subprocess.run(befehl, cwd=BASIS, stdout=subprocess.PIPE, text=True)
        for zeile in (e.stdout or '').splitlines()[-6:]:
            print('     ' + zeile)
    if e.returncode != 0:
        print(f'\nSchritt {nummer} ist fehlgeschlagen.')
        sys.exit(1)


def main(abbild):
    if not os.path.exists(abbild):
        print(f'Das Diskettenabbild {abbild} gibt es nicht.')
        print('Aufruf: python3 aufbauen.py /pfad/zu/kaiser.d64')
        return 1

    python = sys.executable or 'python3'

    schritt(1, 'Diskettenabbild entpacken',
            [python, 'd64extract.py', abbild, 'extracted'])
    schritt(2, 'BASIC entlisten',
            [python, 'basic_detok.py', os.path.join('extracted', 'main_game_0801.prg')],
            ausgabe=os.path.join(EXTRACTED, 'main_game.bas'))
    schritt(3, 'Zeichensaetze und Bilder umwandeln',
            [python, 'extract_assets.py'])
    schritt(4, 'Musik herausschneiden',
            [python, 'extract_sid.py'])

    # extract_sid.py schreibt nach musik/; der Client laedt aus assets/.
    os.makedirs(ASSETS, exist_ok=True)
    for stueck in ('kaiser_titel.sid', 'kaiser_abspann.sid'):
        quelle = os.path.join(MUSIK, stueck)
        if os.path.exists(quelle):
            shutil.copy2(quelle, os.path.join(ASSETS, stueck))
            print(f'     kopiert: musik/{stueck} -> client/assets/{stueck}')

    fehlt = [p for p in ERWARTET if not os.path.exists(p)]
    print()
    if fehlt:
        print('Es fehlt noch:')
        for p in fehlt:
            print('  ' + os.path.relpath(p, BASIS))
        return 1

    print('Fertig. Vorhanden sind jetzt:')
    for p in ERWARTET:
        print('  %-46s %8d Bytes' % (os.path.relpath(p, BASIS), os.path.getsize(p)))
    print()
    print('Weiter mit:  cd kaiser-online && npm install && npm start')
    return 0


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(__doc__.strip())
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
