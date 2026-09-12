// Die Reichskarte, im Original der Menüpunkt "Karte malen".
//
// Das Original zeichnet sie in einen Puffer von 74 Spalten und 11 Zeilen und
// scrollt ihn mit dem Joystick. Nachgebaut nach extracted/main_game.bas
// Zeile 107 bis 147; die Zeilennummern stehen an den einzelnen Stücken.
//
// Ein Feld mit 0 ist leer, so wie im Original. Alle Zeichen stammen aus dem
// Kartenzeichensatz.

import { int } from './rules.js';

export const SPALTEN = 74;
export const ZEILEN = 11;

/** Marktzeichen, DATA-Zeilen 908 bis 913. */
const MARKTZEICHEN = [146, 139, 143, 138, 145, 147];

/** Palastteile als Paare aus Versatz und Zeichen, DATA-Zeile 831. */
const PALAST = [
  [239, 16], [238, 5], [237, 5], [240, 20], [241, 5], [242, 5], [164, 5],
  [90, 6], [167, 5], [93, 6], [163, 1], [168, 12], [165, 12], [166, 12],
  [90, 22], [93, 22]
];

/** Kathedralenteile, DATA-Zeile 848. */
const KATHEDRALE = [
  [694, 20], [695, 5], [696, 5], [697, 5], [698, 16], [620, 3], [546, 0],
  [624, 3], [550, 0], [621, 9], [623, 9], [622, 5], [548, 3], [474, 0]
];

/**
 * Baut die Karte eines Fürstentums.
 * @param {object} s   Spieler
 * @param {function} rnd  Zufallsgeber, damit dieselbe Runde dieselbe Karte zeigt
 */
export function karteBauen(s, rnd) {
  const feld = new Uint8Array(SPALTEN * ZEILEN);   // 0 = leer
  const lies = i => (i >= 0 && i < feld.length) ? feld[i] : 255;
  const setz = (i, v) => { if (i >= 0 && i < feld.length) feld[i] = v; };

  // --- Vermögensbalken ganz links, Zeile 109 bis 111 ---------------------
  // Ein Feld steht für 6000 Taler, zwei Felder je Zeile, höchstens 22.
  // Bei Schulden ein anderes Zeichen.
  const reich = s.kasse >= 0 ? 31 : 159;
  let a = 0;
  let i = Math.abs(s.kasse / 6000);
  if (i > 22) i = 22;
  while (i > 1 && a < ZEILEN) {
    setz(SPALTEN * a, reich);
    setz(1 + SPALTEN * a, reich);
    a++; i -= 2;
  }
  if (i > 0 && a < ZEILEN) setz(SPALTEN * a, reich);

  // --- Umzäuntes Land, Zeile 112 bis 115 ---------------------------------
  // Die Breite wächst mit dem Landbesitz: ein Feld je 500 Hektar.
  let breite = int(s.land / 500);
  if (breite > 68) breite = 68;
  const e = 2;                       // die Umzäunung beginnt in Spalte 2
  if (breite >= 1) {
    setz(e, 77);                                        // Ecke oben links
    for (let z = 1; z <= 9; z++) {
      setz(e + SPALTEN * z, 92);                        // linke Seite
      setz(e + 1 + SPALTEN * z + breite, 92);           // rechte Seite
    }
    setz(e + SPALTEN * 10, 85);                         // Ecke unten links
    for (let z = 1; z <= breite + 1; z++) {
      setz(e + z, 78);                                  // oben
      setz(e + SPALTEN * 10 + z, 78);                   // unten
    }
    setz(e + 1 + breite, 68);                           // Ecke oben rechts
    setz(e + SPALTEN * 10 + 1 + breite, 66);            // Ecke unten rechts
  }

  // --- Palast und Kathedrale, Zeile 116, 117, 830, 847 -------------------
  for (let n = 0; n < Math.min(s.palast, PALAST.length); n++) {
    setz(e + PALAST[n][0], PALAST[n][1]);
  }
  for (let n = 0; n < Math.min(s.kathedrale, KATHEDRALE.length); n++) {
    setz(e + KATHEDRALE[n][0], KATHEDRALE[n][1]);
  }

  const marktzeichen = () => MARKTZEICHEN[int(rnd() * 6)];

  // --- Märkte, Zeile 118 bis 131 ----------------------------------------
  //
  // Die Stelle ist nicht frei gewürfelt: der Zähler b bestimmt die Spalte,
  // gewürfelt wird nur die Zeile.
  //
  //   121 y=INT(RND(0)*9)*74+75+e+2*b
  //
  // Mit e = 2 ist das Zeile 1 bis 9, Spalte 3 + 2b. Die Märkte wandern also
  // Schritt für Schritt nach rechts, jeder in einer eigenen Spalte, und nur
  // die Höhe ist Zufall. Ist die Stelle besetzt, wird neu gewürfelt.
  //
  // Ab und zu entsteht statt einzelner Marktstände eine umwallte Stadt. Dafür
  // müssen noch mehr als vier Märkte offen und mehr als zwei Mühlen übrig
  // sein (Zeile 120). Eine Stadt verbraucht drei Mühlen und **fünf** Märkte:
  // Zeile 131 erhöht b um vier und springt nach 123, wo b noch einmal um eins
  // wächst. Das Handbuch nennt dieselbe Zahl, wenn es das Ziel des Spiels
  // beschreibt: "fünf Städte, bestehend aus 5 Marktplätzen und 3 Kornmühlen".
  if (s.maerkte >= 1) {
    let b = 0;
    let muehlenUebrig = s.muehlen;
    let zahl = s.maerkte;
    if (zahl > 35) zahl = 35;

    let notbremse = 0;
    while (b < zahl && notbremse++ < 4000) {
      if (zahl - b > 4 && muehlenUebrig > 2) {
        // Stadt: fünf mal vier Felder, Zeile 125 bis 131
        let x = -1;
        for (let versuch = 0; versuch < 300; versuch++) {
          const p = int(rnd() * 9) * SPALTEN + 75 + e + 2 * b;
          const belegt = [0, 4, SPALTEN, SPALTEN + 4, 2 * SPALTEN,
                          3 * SPALTEN, 3 * SPALTEN + 1, 3 * SPALTEN + 2,
                          3 * SPALTEN + 3, 3 * SPALTEN + 4]
            .some(d => lies(p + d));
          if (!belegt) { x = p; break; }
        }
        // Das Original würfelt hier ewig weiter und bleibt hängen, wenn
        // keine der neun Zeilen frei ist. Wir geben auf und nehmen den Platz
        // als einzelnen Stand.
        if (x < 0) { b++; continue; }
        setz(x, 77); setz(x + 1, 78); setz(x + 2, 78); setz(x + 3, 78); setz(x + 4, 68);
        setz(x + SPALTEN, 92); setz(x + SPALTEN + 4, 92);
        setz(x + 2 * SPALTEN, 92);
        setz(x + 3 * SPALTEN, 85); setz(x + 3 * SPALTEN + 1, 78);
        setz(x + 3 * SPALTEN + 2, 78); setz(x + 3 * SPALTEN + 3, 78);
        setz(x + 3 * SPALTEN + 4, 66);
        setz(x + SPALTEN + 1, marktzeichen());
        setz(x + SPALTEN + 2, marktzeichen());
        setz(x + SPALTEN + 3, marktzeichen());
        setz(x + 2 * SPALTEN + 1, marktzeichen());
        setz(x + 2 * SPALTEN + 2, marktzeichen());
        muehlenUebrig -= 3;
        b += 5;            // vier in Zeile 131, einer in Zeile 123
      } else {
        // Einzelner Marktstand, Zeile 121 und 122
        let y = -1;
        for (let versuch = 0; versuch < 300; versuch++) {
          const p = int(rnd() * 9) * SPALTEN + 75 + e + 2 * b;
          if (!lies(p)) { y = p; break; }
        }
        if (y >= 0) setz(y, marktzeichen());
        b++;
      }
    }
  }

  // --- Mühlen, Zeile 132 bis 136 ----------------------------------------
  //
  // Dieselbe Ordnung, eine Spalte weiter links:
  //
  //   135 y=INT(RND(0)*9)*74+74+e+2*b
  //
  // also Zeile 1 bis 9, Spalte 2 + 2b, mit b von 1 an. Gezeichnet werden
  // **alle** Mühlen, auch die drei, die eine Stadt schon verbraucht hat:
  // Zeile 133 nimmt wieder f(c) und nicht den Rest d.
  if (s.muehlen >= 1) {
    let zahl = s.muehlen;
    if (zahl > 34) zahl = 34;
    for (let b = 1; b <= zahl; b++) {
      for (let versuch = 0; versuch < 300; versuch++) {
        const y = int(rnd() * 9) * SPALTEN + SPALTEN + e + 2 * b;
        if (!lies(y)) { setz(y, 200); break; }
      }
    }
  }

  // --- Bäume und Buschwerk, Zeile 137 und 138 ---------------------------
  for (let b = 1; b <= 40; b++) {
    const x = int(rnd() * 9) * SPALTEN + e + 75;
    const y = int(rnd() * 70) + x;
    if (!lies(y)) setz(y, 93);
  }

  // --- Einwohnerbalken rechts der Umzäunung, Zeile 139 bis 144 ----------
  // Zwei Spalten freiräumen, dann je Zeile vier Einheiten zu 300 Einwohnern.
  for (let z = 0; z < ZEILEN; z++) {
    setz(e + 2 + breite + SPALTEN * z, 0);
    setz(e + 3 + breite + SPALTEN * z, 0);
  }
  let volk = int(s.einwohner / 300);
  if (volk > 44) volk = 44;
  let zeile = 0;
  const voll = 224, halb = 225;
  while (volk > 3 && zeile < ZEILEN) {
    setz(e + 2 + breite + SPALTEN * zeile, voll);
    setz(e + 3 + breite + SPALTEN * zeile, voll);
    volk -= 4; zeile++;
  }
  if (zeile < ZEILEN) {
    if (volk === 3) { setz(e + 2 + breite + SPALTEN * zeile, voll); setz(e + 3 + breite + SPALTEN * zeile, halb); }
    else if (volk === 2) { setz(e + 2 + breite + SPALTEN * zeile, halb); setz(e + 3 + breite + SPALTEN * zeile, halb); }
    else if (volk === 1) { setz(e + 2 + breite + SPALTEN * zeile, halb); }
  }

  return {
    feld: Array.from(feld),
    spalten: SPALTEN,
    zeilen: ZEILEN,
    landbreite: breite,
    schulden: s.kasse < 0,
    // Das Original wuerfelt jedes Jahr ein Farbschema, Zeile 466:
    // c5=INT(RND(0)*5+1), und holt damit ueber g=c5+5 eine der DATA-Zeilen
    // 969 bis 973. Der Grund wird dadurch braun, orange, cyan oder gruen.
    farbschema: 1 + int(rnd() * 5)
  };
}
