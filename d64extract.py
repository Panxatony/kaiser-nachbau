#!/usr/bin/env python3
"""Extract all files from a C64 D64 disk image (35 tracks, 683 sectors)."""
import sys, os

SECTORS = [0]+[21]*17+[19]*7+[18]*6+[17]*5  # tracks 1..35
TRACK_OFFSET = [0]
for t in range(1, 36):
    TRACK_OFFSET.append(TRACK_OFFSET[-1] + SECTORS[t] * 256)

def offset(track, sector):
    return TRACK_OFFSET[track - 1] + sector * 256

def petscii_to_ascii(b):
    out = ''
    for c in b:
        if c == 0xA0 or c == 0: break
        if 0xC1 <= c <= 0xDA: out += chr(c - 0x80)
        elif 0x41 <= c <= 0x5A: out += chr(c + 0x20)
        elif 0x20 <= c < 0x7F: out += chr(c)
        else: out += '\\x%02x' % c
    return out

TYPES = {0: 'DEL', 1: 'SEQ', 2: 'PRG', 3: 'USR', 4: 'REL'}

# Die Dateinamen auf der Diskette sind bei den kursierenden Abbildern reine
# Deko: die Cracker haben ihre Grussbotschaft ins Inhaltsverzeichnis
# geschrieben ("- ewiges leben", "  28.07.1985  "), und die eigentlichen
# Programmteile tragen keinen sprechenden Namen mehr. Verlaesslich ist dagegen
# die Ladeadresse in den ersten zwei Bytes jeder PRG-Datei. Danach vergeben wir
# einen zweiten, gleichbleibenden Namen, damit die folgenden Werkzeuge ihre
# Dateien finden -- unabhaengig davon, welches Abbild jemand besitzt.
KANON = {
    0x033c: 'loader_033c.prg',    # Lader mit der Jiffy-Uhr bei $03D4
    0x57be: 'karte_57be.prg',     # Reichskarte, Abspannbild und Abspannmusik
    0x6000: 'ml_6000.prg',        # Titelbild und Titelmusik
    0xa001: 'ml_a001.prg',        # Maschinenroutinen des Hauptprogramms
    0xc000: 'ml_c000.prg',        # Sprites, darunter der Kornspeicher
    0xe000: 'ml_e000.prg',        # beide Zeichensaetze, $E000 und $E400
}
# Bei $0801 liegen mehrere BASIC-Dateien; das Hauptprogramm ist die groesste.
KANON_0801 = 'main_game_0801.prg'

def main(path, outdir):
    d = open(path, 'rb').read()
    bam = d[offset(18, 0):offset(18, 0) + 256]
    print('Disk name:', petscii_to_ascii(bam[0x90:0xA0]), ' ID:', petscii_to_ascii(bam[0xA2:0xA4]))
    t, s = bam[0], bam[1]
    entries = []
    seen = set()
    while t != 0 and (t, s) not in seen:
        seen.add((t, s))
        blk = d[offset(t, s):offset(t, s) + 256]
        for i in range(8):
            e = blk[2 + i * 32: 2 + i * 32 + 30]
            ftype = e[0]
            if ftype == 0: continue
            name = petscii_to_ascii(e[3:19])
            entries.append((ftype, e[1], e[2], name, e[28] | (e[29] << 8)))
        t, s = blk[0], blk[1]
    os.makedirs(outdir, exist_ok=True)
    kanonisch = {}          # Zielname -> (Groesse, Quellname)
    for ftype, ft, fs, name, blocks in entries:
        tname = TYPES.get(ftype & 7, '???')
        locked = '<' if ftype & 0x40 else ''
        closed = '' if ftype & 0x80 else '*'
        data = bytearray()
        t, s = ft, fs
        seen = set()
        while t != 0 and (t, s) not in seen and 1 <= t <= 35:
            seen.add((t, s))
            blk = d[offset(t, s):offset(t, s) + 256]
            nt, ns = blk[0], blk[1]
            if nt == 0:
                data += blk[2:ns + 1]
            else:
                data += blk[2:]
            t, s = nt, ns
        safe = name.replace('/', '_').replace(' ', '_') or 'unnamed'
        fn = os.path.join(outdir, f'{safe}.{tname.lower()}')
        open(fn, 'wb').write(data)
        load = f' load=${data[0] | (data[1] << 8):04x}' if tname == 'PRG' and len(data) >= 2 else ''
        print(f'{blocks:4d}  "{name:16s}" {closed}{tname}{locked}  {len(data):6d} bytes  T{ft}/S{fs}{load} -> {fn}')

        # Zweitname nach Ladeadresse, siehe KANON
        if tname == 'PRG' and len(data) >= 2:
            adresse = data[0] | (data[1] << 8)
            ziel = KANON.get(adresse)
            if adresse == 0x0801:
                # Nur die groesste $0801-Datei ist das Hauptprogramm.
                bisher = kanonisch.get(KANON_0801)
                if bisher is None or len(data) > bisher[0]:
                    ziel = KANON_0801
                else:
                    ziel = None
            if ziel:
                open(os.path.join(outdir, ziel), 'wb').write(data)
                kanonisch[ziel] = (len(data), name)

    if kanonisch:
        print()
        print('Nach Ladeadresse benannt:')
        for ziel in sorted(kanonisch):
            groesse, quelle = kanonisch[ziel]
            print(f'  {ziel:22s} {groesse:6d} bytes   (auf der Diskette: "{quelle.strip()}")')
    fehlt = [z for z in list(KANON.values()) + [KANON_0801] if z not in kanonisch]
    if fehlt:
        print()
        print('FEHLT: ' + ', '.join(fehlt))
        print('Dieses Diskettenabbild passt nicht zu den Werkzeugen.')
        return 1
    return 0

if __name__ == '__main__':
    sys.exit(main(sys.argv[1], sys.argv[2]) or 0)
