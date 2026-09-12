// Darstellung mit den originalen C64-Zeichensaetzen aus ml_e000.prg.
//
// Die Datei enthaelt zwei Saetze zu je 128 Zeichen:
//   assets/charset.png     alle 256 Zeichen der Datei (Textsatz und Kartensatz)
//   assets/charset_map.png nur der Kartensatz, Index = Screencode 0..127
//
// Auf dem C64 liegt der jeweils aktive Satz bei $F000, eine invertierte Kopie
// bei $F400. Deshalb sind die Zeichen der zweiten Kriegspartei um 128 erhoeht:
// gleiches Bild, aber in Inversschrift.

export const FARBEN = [
  '#000000', '#ffffff', '#883932', '#67b6bd', '#8b3f96', '#55a049',
  '#40318d', '#bfce72', '#8b5429', '#574200', '#b86962', '#505050',
  '#787878', '#94e089', '#7869c4', '#9f9f9f'
];

const blaetter = new Map();     // Pfad -> Image
const eingefaerbte = new Map(); // Pfad|Farbe -> Canvas

export function zeichensatzLaden(pfad = 'assets/charset_map.png') {
  if (blaetter.has(pfad)) return Promise.resolve(blaetter.get(pfad));
  return new Promise((fertig, fehler) => {
    const b = new Image();
    b.onload = () => { blaetter.set(pfad, b); fertig(b); };
    b.onerror = () => fehler(new Error('Zeichensatz fehlt: ' + pfad));
    b.src = pfad;
  });
}

/** Liefert eine eingefaerbte Kopie eines Zeichensatzes. */
function eingefaerbt(pfad, farbe) {
  const schluessel = pfad + '|' + farbe;
  if (eingefaerbte.has(schluessel)) return eingefaerbte.get(schluessel);
  const blatt = blaetter.get(pfad);
  const c = document.createElement('canvas');
  c.width = blatt.width; c.height = blatt.height;
  const k = c.getContext('2d');
  k.drawImage(blatt, 0, 0);
  k.globalCompositeOperation = 'source-in';
  k.fillStyle = farbe;
  k.fillRect(0, 0, c.width, c.height);
  eingefaerbte.set(schluessel, c);
  return c;
}

/**
 * Zeichnet ein einzelnes Zeichen.
 * code 0..127 wird normal gezeichnet, 128..255 als Inversschrift des Zeichens
 * code-128: die Zelle wird gefuellt und die Form ausgespart.
 */
export function zeichen(ctx, code, x, y, groesse = 8, farbe = '#ffffff',
                        pfad = 'assets/charset_map.png', hoehe = groesse) {
  const blatt = blaetter.get(pfad);
  if (!blatt) return;
  const proZeile = blatt.width / 8;
  const invers = code >= 128;
  const g = invers ? code - 128 : code;
  const sx = (g % proZeile) * 8, sy = Math.floor(g / proZeile) * 8;

  if (!invers) {
    ctx.drawImage(eingefaerbt(pfad, farbe), sx, sy, 8, 8, x, y, groesse, hoehe);
    return;
  }
  // Inversschrift ueber eine Zwischenflaeche, damit die Aussparung sauber wird
  const h = inversFlaeche(groesse);
  const hk = h.getContext('2d');
  hk.globalCompositeOperation = 'source-over';
  hk.fillStyle = farbe;
  hk.fillRect(0, 0, groesse, groesse);
  hk.globalCompositeOperation = 'destination-out';
  hk.drawImage(blatt, sx, sy, 8, 8, 0, 0, groesse, groesse);
  ctx.drawImage(h, x, y);
  hk.globalCompositeOperation = 'source-over';
  hk.clearRect(0, 0, groesse, groesse);
}

let flaeche = null;
function inversFlaeche(groesse) {
  if (!flaeche || flaeche.width !== groesse) {
    flaeche = document.createElement('canvas');
    flaeche.width = groesse; flaeche.height = groesse;
  }
  return flaeche;
}

// ------------------------------------------------- Multicolor-Textmodus
//
// Das Schlachtfeld laeuft im Multicolor-Textmodus (Kommando 24 setzt
// $D016 = $D8). Ein Zeichen ist dort nicht 8 Pixel breit, sondern 4 doppelt
// breite, und je zwei Bits waehlen eine von vier Farben:
//
//   00  Hintergrund $D021, in der Schlacht schwarz
//   01  $D022, dort 7 gelb
//   10  $D023, dort 5 gruen
//   11  die Farbe der Zelle im Farb-RAM
//
// Hires gezeichnet zerfallen die Figuren in Schraffur, deshalb dieser Weg.

const bitmuster = new Map();     // Pfad -> Uint8Array, ein Byte je Zeichenzeile

/** Liest die Bitmuster eines Zeichensatzes einmalig aus dem Bild. */
function muster(pfad) {
  if (bitmuster.has(pfad)) return bitmuster.get(pfad);
  const blatt = blaetter.get(pfad);
  if (!blatt) return null;
  const c = document.createElement('canvas');
  c.width = blatt.width; c.height = blatt.height;
  const k = c.getContext('2d', { willReadFrequently: true });
  k.drawImage(blatt, 0, 0);
  const d = k.getImageData(0, 0, c.width, c.height).data;
  const proZeile = blatt.width / 8;
  const zeichenzahl = proZeile * (blatt.height / 8);
  const m = new Uint8Array(zeichenzahl * 8);
  for (let g = 0; g < zeichenzahl; g++) {
    const sx = (g % proZeile) * 8, sy = Math.floor(g / proZeile) * 8;
    for (let z = 0; z < 8; z++) {
      let b = 0;
      for (let x = 0; x < 8; x++) {
        if (d[((sy + z) * c.width + sx + x) * 4 + 3] > 128) b |= 128 >> x;
      }
      m[g * 8 + z] = b;
    }
  }
  bitmuster.set(pfad, m);
  return m;
}

/**
 * Zeichnet ein Zeichen im Multicolor-Textmodus.
 * @param {Array} farben [00, 01, 10, 11]; null heisst nicht zeichnen
 */
export function zeichenBunt(ctx, code, x, y, groesse, farben, pfad = 'assets/charset_map.png') {
  const m = muster(pfad);
  if (!m) return;
  if ((code + 1) * 8 > m.length) return;
  const breit = groesse / 4;
  const hoch = groesse / 8;
  for (let z = 0; z < 8; z++) {
    const b = m[code * 8 + z];
    for (let p = 0; p < 4; p++) {
      const f = farben[(b >> (6 - 2 * p)) & 3];
      if (!f) continue;
      ctx.fillStyle = f;
      ctx.fillRect(x + p * breit, y + z * hoch, breit, hoch);
    }
  }
}

/** PETSCII-Grossschrift zu Screencode des Textsatzes. */
export function screencode(z) {
  const c = z.charCodeAt(0);
  if (c >= 64 && c <= 95) return c - 64;
  if (c >= 97 && c <= 122) return c - 96;
  if (c >= 32 && c <= 63) return c;
  const umlaute = { 'Ä': 27, 'Ö': 28, 'Ü': 29, 'ä': 27, 'ö': 28, 'ü': 29, 'ß': 30 };
  if (umlaute[z] != null) return umlaute[z];
  return 32;
}

/** Schreibt eine Zeile Text mit dem Textsatz. */
export function text(ctx, s, x, y, groesse = 8, farbe = '#ffffff') {
  for (let i = 0; i < s.length; i++) {
    zeichen(ctx, screencode(s[i]), x + i * groesse, y, groesse, farbe, 'assets/charset.png');
  }
}
