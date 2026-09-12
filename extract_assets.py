#!/usr/bin/env python3
"""
Erzeugt die Grafik-Assets fuer kaiser-online aus den Original-C64-Dateien.

Ausgabe (in kaiser-online/client/assets/):
  title.png        320x200  Titelbildschirm (Multicolor-Bitmap aus ml_6000.prg)
  outro.png        320x200  Abspann/Thronsaal (Multicolor-Bitmap aus karte_57be.prg)
  charset.png      128x128  alle 256 Zeichen aus ml_e000.prg (16x16 Raster)
  charset_map.png  128x128  nur der Karten-Zeichensatz ($E400) nach Screencode

Belege fuer die Offsets/Farben stehen in GRAFIK.md.
"""
import os, struct, zlib

BASE = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.join(BASE, 'extracted')
OUT  = os.path.join(BASE, 'kaiser-online', 'client', 'assets')

# C64-Farbpalette (Pepto)
C64 = [(0, 0, 0), (255, 255, 255), (136, 57, 50), (103, 182, 189),
       (139, 63, 150), (85, 160, 73), (64, 49, 141), (191, 206, 114),
       (139, 84, 41), (87, 66, 0), (184, 105, 98), (80, 80, 80),
       (120, 120, 120), (148, 224, 137), (120, 105, 196), (159, 159, 159)]


def _png(path, w, h, rows, alpha=False):
    """rows = Liste von Byte-Listen (RGB bzw. RGBA, je Zeile w*3 bzw. w*4)."""
    raw = b''.join(b'\x00' + bytes(r) for r in rows)

    def chunk(t, d):
        c = t + d
        return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c))

    ctype = 6 if alpha else 2
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n'
                + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, ctype, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(raw, 9))
                + chunk(b'IEND', b''))


def load_prg(name):
    """PRG einlesen -> (Ladeadresse, Daten ohne Ladeadresse)."""
    d = open(os.path.join(SRC, name), 'rb').read()
    return d[0] | (d[1] << 8), d[2:]


def multicolor_bitmap(bitmap, screen_byte, color_byte, bg):
    """C64-Multicolor-Bitmap 160x200 -> 320x200 RGB-Zeilen.

    Bitpaare: 00 = Hintergrund ($D021), 01 = Screen-RAM High-Nibble,
              10 = Screen-RAM Low-Nibble, 11 = Farb-RAM.
    Hier sind Screen- und Farb-RAM jeweils flaechendeckend konstant
    (das Original fuellt sie per Routine, siehe GRAFIK.md).
    """
    fg = C64[(screen_byte >> 4) & 15]
    bc = C64[screen_byte & 15]
    c3 = C64[color_byte & 15]
    b0 = C64[bg & 15]
    pal = (b0, fg, bc, c3)
    rows = []
    for cy in range(25):
        band = [[0] * (320 * 3) for _ in range(8)]
        for cx in range(40):
            base = cy * 320 + cx * 8
            for y in range(8):
                b = bitmap[base + y] if base + y < len(bitmap) else 0
                line = band[y]
                for p in range(4):
                    col = pal[(b >> (6 - 2 * p)) & 3]
                    px = cx * 8 + p * 2
                    for dx in range(2):
                        o = (px + dx) * 3
                        line[o], line[o + 1], line[o + 2] = col
        rows.extend(band)
    return rows


def charset_sheet(data, path, cols=16):
    """8x8-Zeichen als cols-spaltiges Raster, weiss auf transparent (RGBA)."""
    n = len(data) // 8
    rws = (n + cols - 1) // cols
    w, h = cols * 8, rws * 8
    img = [[0] * (w * 4) for _ in range(h)]
    for ch in range(n):
        ox, oy = (ch % cols) * 8, (ch // cols) * 8
        for y in range(8):
            b = data[ch * 8 + y]
            line = img[oy + y]
            for x in range(8):
                if (b >> (7 - x)) & 1:
                    o = (ox + x) * 4
                    line[o] = line[o + 1] = line[o + 2] = line[o + 3] = 255
    _png(path, w, h, img, alpha=True)
    return w, h, n


def main():
    os.makedirs(OUT, exist_ok=True)

    # --- Titelbildschirm -------------------------------------------------
    # ml_6000.prg: $6000..$7F3F = Bitmap (8000 Bytes).
    # Screen-RAM ($5C00) und Farb-RAM werden von "neue merkmale" ueber
    # SYSm,30,7,6,7,16 konstant gefuellt: D020=7, D021=6, Farb-RAM=7,
    # Screen-RAM=$10.
    _, ml6000 = load_prg('ml_6000.prg')
    rows = multicolor_bitmap(ml6000[0:8000], screen_byte=0x10, color_byte=7, bg=6)
    _png(os.path.join(OUT, 'title.png'), 320, 200, rows)
    print('title.png   320x200')

    # --- Abspann / Thronsaal ---------------------------------------------
    # karte_57be.prg: $6000..$7F3F = Bitmap (Offset 2114..10113).
    # "- ewiges leben" ruft SYS32649,0,7,0,42 -> D020=0, D021=7,
    # Farb-RAM=0, Screen-RAM=$2A.
    la, karte = load_prg('karte_57be.prg')
    off = 0x6000 - la
    rows = multicolor_bitmap(karte[off:off + 8000], screen_byte=0x2A, color_byte=0, bg=7)
    _png(os.path.join(OUT, 'outro.png'), 320, 200, rows)
    print('outro.png   320x200')

    # --- Zeichensaetze ----------------------------------------------------
    # ml_e000.prg ist 2047 Bytes lang (letztes Byte fehlt) -> auf 2048 padden.
    #
    # ml_e000.prg enthaelt zwei Saetze zu je 128 Zeichen:
    #
    #   $E000..$E3FF  fetter Satz. Zeichen 0 bis 95 sind Schrift, 96 bis 127
    #                 die Grafiken: Zaun, Baeume, Haeuser, Kirche, Muehle,
    #                 Geldsack. Daraus baut die Maschinenroutine $A3AA zur
    #                 Laufzeit den Kartenzeichensatz bei $E800, indem sie jedes
    #                 Zeichen waagerecht und senkrecht verdoppelt: aus einem
    #                 Zeichen werden vier, zusammen eine Kachel von 16 mal 16
    #                 Pixeln. Die Reichskarte besteht aus diesen Kacheln.
    #
    #   $E400..$E7FF  duenner Satz, den das Schlachtfeld benutzt (Kommando 24),
    #                 dort im Multicolor-Modus.
    _, chars = load_prg('ml_e000.prg')
    chars = chars + bytes(2048 - len(chars))
    w, h, n = charset_sheet(chars, os.path.join(OUT, 'charset.png'))
    print('charset.png %dx%d (%d Zeichen der ganzen Datei)' % (w, h, n))
    w, h, n = charset_sheet(chars[0:1024], os.path.join(OUT, 'charset_karte.png'))
    print('charset_karte.png %dx%d (%d Zeichen, fetter Satz $E000)' % (w, h, n))
    w, h, n = charset_sheet(chars[1024:2048], os.path.join(OUT, 'charset_map.png'))
    print('charset_map.png %dx%d (%d Zeichen, duenner Satz $E400, Schlachtfeld)' % (w, h, n))


if __name__ == '__main__':
    main()
