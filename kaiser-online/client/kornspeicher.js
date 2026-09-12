// Der Kornspeicher aus Bild 1 des Originals.
//
// Im Original sind das zwei Sprites uebereinander, die Bloecke 16 und 17 der
// Sprite-Bank bei $C000. Beide sind mehrfarbig, in der Breite und in der Hoehe
// gedehnt, also 12 mal 42 Sprite-Punkte, die auf dem Bild 48 mal 84 Pixel
// einnehmen. Aus den Sprite-Daten gelesen sieht ein Block so aus:
//
//   Block 16, Zeile 0 bis 4   ein Dach, das sich von 4 auf 12 Punkte oeffnet
//   Block 16, Zeile 5 bis 20  Rand, zehn Punkte Fuellung, Rand
//   Block 17, Zeile 0 bis 16  dasselbe
//   Block 17, Zeile 17, 18    der Boden, durchgehend
//   Block 17, Zeile 19, 20    leer
//
// Das ergibt genau 33 fuellbare Zeilen, und genau damit rechnet das Original:
//
//   485 a=ABS(p(c)*.8/no):IFa>1THENa=1
//   486 a=33-INT(a*33):SYSm,12,a
//
// p(c) ist die Kornreserve, no das noetige Korn. Der Speicher zeigt also nicht
// den ganzen Vorrat, sondern vier Fuenftel davon, gemessen am Jahresbedarf.
// Genau das schreibt auch das Handbuch: "Seine Fuellhoehe repraesentiert nicht
// Ihre gesamten Reserven, sondern nur 80 Prozent davon."
//
// Wir zeichnen die Form nach, statt die Sprite-Daten mitzuliefern. Farben wie
// im Original: schwarzer Umriss, gelbe Fuellung.

export const BREITE = 12;          // Sprite-Punkte
export const ZEILEN = 42;          // 21 je Block
export const FUELLZEILEN = 33;

const SCHWARZ = '#000000';
const GELB = '#bfce72';            // C64-Farbe 7

/**
 * Fuellstand nach BASIC-Zeile 485 und 486.
 * Liefert die Zahl der leeren Zeilen von oben, 0 bis 33.
 */
export function leereZeilen(korn, bedarf) {
  let a = Math.abs((korn * 0.8) / Math.max(1, bedarf));
  if (a > 1) a = 1;
  return FUELLZEILEN - Math.trunc(a * FUELLZEILEN);
}

/**
 * Malt den Speicher in einen Canvas.
 * @param {HTMLCanvasElement} c
 * @param {number} korn    Kornreserve
 * @param {number} bedarf  noetiges Korn
 * @param {number} punkt   Kantenlaenge eines Sprite-Punktes in Pixeln
 */
export function kornspeicherMalen(c, korn, bedarf, punkt = 4) {
  const leer = leereZeilen(korn, bedarf);
  c.width = BREITE * punkt;
  c.height = ZEILEN * punkt;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);

  const balken = (spalte, zeile, breite, farbe) => {
    ctx.fillStyle = farbe;
    ctx.fillRect(spalte * punkt, zeile * punkt, breite * punkt, punkt);
  };

  // Das Dach, Block 16 Zeile 0 bis 4
  for (let z = 0; z < 5; z++) balken(4 - z, z, 4 + 2 * z, SCHWARZ);

  // Der Rumpf: 33 Zeilen, jede mit Rand links und rechts
  for (let i = 0; i < FUELLZEILEN; i++) {
    const z = 5 + i;
    balken(0, z, 1, SCHWARZ);
    balken(1, z, 10, i < leer ? SCHWARZ : GELB);
    balken(11, z, 1, SCHWARZ);
  }

  // Der Boden, Block 17 Zeile 17 und 18
  balken(0, 38, BREITE, SCHWARZ);
  balken(0, 39, BREITE, SCHWARZ);
  return leer;
}
