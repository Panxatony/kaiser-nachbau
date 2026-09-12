#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract_sid.py -- schneidet die beiden SID-Musikstuecke aus den Originaldateien
des C64-Spiels "Kaiser" (CCD Wiesbaden / Ariolasoft, 1984) heraus und
schreibt sie als
PSID-Dateien (Version 2).

Grundlage ist das Disassemblat der beiden Abspielroutinen; siehe MUSIK.md.

  Titelmusik   : extracted/ml_6000.prg     Bereich $8000-$840F
                 Init $81BA, Play (IRQ) $802F
  Abspannmusik : extracted/karte_57be.prg  Bereich $8000-$95FE
                 Init $81BD, Play (IRQ) $8032

Beide Play-Routinen sind urspruenglich IRQ-Handler und enden mit
"JMP $03D4" (Weiterreichen an die Jiffy-Uhr im Lader bei $033C).
Fuer eine PSID-Datei muss die Play-Routine mit RTS enden, deshalb wird
jedes "JMP $03D4" durch "RTS NOP NOP" ersetzt (gleiche Laenge, 3 Bytes).
"""

import os
import struct
import sys

BASIS = os.path.dirname(os.path.abspath(__file__))
QUELLE = os.path.join(BASIS, "extracted")
ZIEL = os.path.join(BASIS, "musik")

# Der IRQ-Ruecksprung, der durch RTS ersetzt werden muss
JMP_JIFFY = bytes([0x4C, 0xD4, 0x03])
RTS_NOP_NOP = bytes([0x60, 0xEA, 0xEA])


def prg_laden(name):
    """Liest eine .prg-Datei und liefert (ladeadresse, speicherbytes)."""
    with open(os.path.join(QUELLE, name), "rb") as f:
        roh = f.read()
    return roh[0] | (roh[1] << 8), roh[2:]


def ausschnitt(ladeadresse, speicher, von, bis):
    """Liefert den Speicherbereich von..bis (beide einschliesslich)."""
    a = von - ladeadresse
    b = bis - ladeadresse + 1
    if a < 0 or b > len(speicher):
        raise ValueError("Bereich $%04X-$%04X liegt nicht in der Datei" % (von, bis))
    return bytearray(speicher[a:b])


def irq_rueckspruenge_ersetzen(daten, basis, stellen):
    """Ersetzt an den angegebenen Adressen JMP $03D4 durch RTS."""
    for adresse in stellen:
        i = adresse - basis
        if bytes(daten[i:i + 3]) != JMP_JIFFY:
            raise ValueError("Bei $%04X steht kein JMP $03D4, sondern %s"
                             % (adresse, bytes(daten[i:i + 3]).hex()))
        daten[i:i + 3] = RTS_NOP_NOP
    return daten


def psid_bauen(ladeadresse, daten, init, play, name, autor, jahr, geschwindigkeit=1):
    """Baut eine PSID-Datei Version 2.

    loadAddress im Kopf ist 0; die tatsaechliche Ladeadresse steht dann
    als erste zwei Bytes (little endian) im Datenteil -- so machen es
    praktisch alle PSID-Dateien.
    """
    kopf = bytearray()
    kopf += b"PSID"                       # magicID
    kopf += struct.pack(">H", 2)          # version
    kopf += struct.pack(">H", 0x7C)       # dataOffset
    kopf += struct.pack(">H", 0)          # loadAddress (0 = im Datenteil)
    kopf += struct.pack(">H", init)       # initAddress
    kopf += struct.pack(">H", play)       # playAddress
    kopf += struct.pack(">H", 1)          # songs
    kopf += struct.pack(">H", 1)          # startSong
    kopf += struct.pack(">I", geschwindigkeit)  # speed (Bit 0 = 1 -> CIA-Timer)
    for text in (name, autor, jahr):
        roh = text.encode("latin-1")[:31]
        kopf += roh + b"\x00" * (32 - len(roh))
    # PAL (Bits 2-3 = 01), SID-Modell 6581 (Bits 4-5 = 01)
    kopf += struct.pack(">H", (1 << 2) | (1 << 4))  # flags
    kopf += bytes([0])                    # startPage
    kopf += bytes([0])                    # pageLength
    kopf += bytes([0])                    # secondSIDAddress
    kopf += bytes([0])                    # thirdSIDAddress
    assert len(kopf) == 0x7C, len(kopf)
    return bytes(kopf) + struct.pack("<H", ladeadresse) + bytes(daten)


def kopf_pruefen(pfad):
    """Liest den PSID-Kopf zurueck und gibt die Felder aus."""
    with open(pfad, "rb") as f:
        b = f.read()
    magic = b[0:4].decode("latin-1")
    version, offset, lade, init, play, lieder, start = struct.unpack(">7H", b[4:18])
    tempo = struct.unpack(">I", b[18:22])[0]
    name = b[22:54].split(b"\x00")[0].decode("latin-1")
    autor = b[54:86].split(b"\x00")[0].decode("latin-1")
    jahr = b[86:118].split(b"\x00")[0].decode("latin-1")
    flags, seite, seitenlaenge = struct.unpack(">HBB", b[118:122])
    echte_lade = lade if lade else (b[offset] | (b[offset + 1] << 8))
    nutzdaten = len(b) - offset - (0 if lade else 2)
    print("  Datei          : %s (%d Bytes)" % (os.path.basename(pfad), len(b)))
    print("  magicID        : %s" % magic)
    print("  version        : %d" % version)
    print("  dataOffset     : $%04X" % offset)
    print("  loadAddress    : $%04X (tatsaechlich $%04X)" % (lade, echte_lade))
    print("  initAddress    : $%04X" % init)
    print("  playAddress    : $%04X" % play)
    print("  songs/startSong: %d / %d" % (lieder, start))
    print("  speed          : %d (%s)" % (tempo, "CIA-Timer" if tempo & 1 else "Raster 50 Hz"))
    print("  name           : %s" % name)
    print("  author         : %s" % autor)
    print("  released       : %s" % jahr)
    print("  flags          : $%04X (Takt=%s, SID=%s)"
          % (flags, ("unbekannt", "PAL", "NTSC", "beide")[(flags >> 2) & 3],
             ("unbekannt", "6581", "8580", "beide")[(flags >> 4) & 3]))
    print("  startPage/Len  : %d / %d" % (seite, seitenlaenge))
    print("  Nutzdaten      : %d Bytes ($%04X-$%04X)"
          % (nutzdaten, echte_lade, echte_lade + nutzdaten - 1))
    if magic != "PSID" or version != 2 or offset != 0x7C:
        raise ValueError("Kopf fehlerhaft")


def main():
    os.makedirs(ZIEL, exist_ok=True)
    ergebnisse = []

    # ---- Titelmusik -------------------------------------------------
    lade, speicher = prg_laden("ml_6000.prg")
    daten = ausschnitt(lade, speicher, 0x8000, 0x840F)
    daten = irq_rueckspruenge_ersetzen(daten, 0x8000, [0x8044, 0x806D])
    pfad = os.path.join(ZIEL, "kaiser_titel.sid")
    with open(pfad, "wb") as f:
        f.write(psid_bauen(0x8000, daten, 0x81BA, 0x802F,
                           "Kaiser", "CCD Wiesbaden", "1984 Ariolasoft"))
    ergebnisse.append(pfad)

    # ---- Abspannmusik -----------------------------------------------
    lade, speicher = prg_laden("karte_57be.prg")
    daten = ausschnitt(lade, speicher, 0x8000, 0x95FE)
    daten = irq_rueckspruenge_ersetzen(daten, 0x8000, [0x8047, 0x8070, 0x81A5])
    pfad = os.path.join(ZIEL, "kaiser_abspann.sid")
    with open(pfad, "wb") as f:
        f.write(psid_bauen(0x8000, daten, 0x81BD, 0x8032,
                           "Kaiser (Abspann)", "CCD Wiesbaden", "1984 Ariolasoft"))
    ergebnisse.append(pfad)

    print("Erzeugte Dateien:\n")
    for p in ergebnisse:
        kopf_pruefen(p)
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
