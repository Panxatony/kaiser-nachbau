#!/usr/bin/env python3
"""Render C64 charset/sprite candidates from the extracted PRG files as PNGs."""
import struct, zlib, sys

def png(path, w, h, rgb_rows):
    raw = b''.join(b'\x00' + bytes(row) for row in rgb_rows)
    def chunk(t, d):
        c = t + d
        return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c))
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def charset_png(data, out, cols=32, scale=2):
    n = len(data) // 8
    rows = (n + cols - 1) // cols
    W, H = cols * 8 * scale, rows * 8 * scale
    img = [[0] * (W * 3) for _ in range(H)]
    for ch in range(n):
        cx, cy = (ch % cols) * 8, (ch // cols) * 8
        for y in range(8):
            b = data[ch * 8 + y]
            for x in range(8):
                v = 255 if (b >> (7 - x)) & 1 else 40
                for sy in range(scale):
                    for sx in range(scale):
                        px = (cx + x) * scale + sx
                        py = (cy + y) * scale + sy
                        img[py][px*3] = v; img[py][px*3+1] = v; img[py][px*3+2] = v
    png(out, W, H, img)
    print(out, f'{n} chars, {W}x{H}')

if __name__ == '__main__':
    d = open('extracted/ml_e000.prg','rb').read()[2:]
    charset_png(d, '/tmp/claude-1000/-home-lhuno-Documents-Kaiser/de77645a-9446-4387-a90a-09b78f1de65e/scratchpad/font_e000.png')
    d6 = open('extracted/ml_6000.prg','rb').read()[2:]
    charset_png(d6, '/tmp/claude-1000/-home-lhuno-Documents-Kaiser/de77645a-9446-4387-a90a-09b78f1de65e/scratchpad/gfx_6000.png')
    da = open('extracted/ml_a001.prg','rb').read()[2:]
    charset_png(da, '/tmp/claude-1000/-home-lhuno-Documents-Kaiser/de77645a-9446-4387-a90a-09b78f1de65e/scratchpad/gfx_a001.png')

C64 = [(0,0,0),(255,255,255),(136,57,50),(103,182,189),(139,63,150),(85,160,73),
       (64,49,141),(191,206,114),(139,84,41),(87,66,0),(184,105,98),(80,80,80),
       (120,120,120),(148,224,137),(120,105,196),(159,159,159)]

def hires(bitmap, screen, out, scale=2, colram=None, multi=False, bg=0):
    W,H = 320*scale, 200*scale
    img=[[0]*(W*3) for _ in range(H)]
    for cy in range(25):
        for cx in range(40):
            ci = cy*40+cx
            sc = screen[ci] if ci < len(screen) else 0
            fg, bgc = C64[sc>>4], C64[sc&15]
            c3 = C64[colram[ci]&15] if colram and ci < len(colram) else C64[0]
            base = cy*320 + cx*8
            for y in range(8):
                b = bitmap[base+y] if base+y < len(bitmap) else 0
                if multi:
                    for p in range(4):
                        v = (b >> (6-2*p)) & 3
                        col = [C64[bg], fg, bgc, c3][v]
                        for dx in range(2):
                            px=(cx*8+p*2+dx); py=cy*8+y
                            for sy in range(scale):
                                for sx in range(scale):
                                    X,Y=px*scale+sx,py*scale+sy
                                    img[Y][X*3],img[Y][X*3+1],img[Y][X*3+2]=col
                else:
                    for x in range(8):
                        col = fg if (b>>(7-x))&1 else bgc
                        px,py=cx*8+x, cy*8+y
                        for sy in range(scale):
                            for sx in range(scale):
                                X,Y=px*scale+sx,py*scale+sy
                                img[Y][X*3],img[Y][X*3+1],img[Y][X*3+2]=col
    png(out,W,H,img)
    print(out,W,H)
