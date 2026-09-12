import { test } from 'node:test';
import assert from 'node:assert/strict';
import { karteBauen, SPALTEN, ZEILEN } from '../server/karte.js';
import { makeRng } from '../server/rules.js';

/** Ein Fuerstentum mit runden Werten, damit man nachrechnen kann. */
function fuerst(mehr = {}) {
  return {
    kasse: 0, land: 0, einwohner: 0, maerkte: 0, muehlen: 0,
    palast: 0, kathedrale: 0, ...mehr
  };
}

const bei = (k, spalte, zeile) => k.feld[zeile * SPALTEN + spalte];

test('Die Karte hat die Masse des Originals', () => {
  const k = karteBauen(fuerst(), makeRng(1));
  assert.equal(k.spalten, 74);
  assert.equal(k.zeilen, 11);
  assert.equal(k.feld.length, 74 * 11);
  // Zeile 137 des Originals setzt immer 40 Baeume, auch ohne Besitz
  assert.ok(k.feld.every(c => c === 0 || c === 93), 'ein leeres Fuerstentum traegt nur Wald');
});

test('Der Vermoegensbalken zaehlt 6000 Taler je Feld, zwei Felder je Zeile', () => {
  // Zeile 109 bis 111 des Originals
  const k = karteBauen(fuerst({ kasse: 30000 }), makeRng(1));
  // 30000/6000 = 5 Felder: zwei volle Zeilen, dann ein einzelnes
  assert.deepEqual([bei(k, 0, 0), bei(k, 1, 0)], [31, 31]);
  assert.deepEqual([bei(k, 0, 1), bei(k, 1, 1)], [31, 31]);
  assert.equal(bei(k, 0, 2), 31);
  assert.equal(bei(k, 1, 2), 0);
  assert.equal(bei(k, 0, 3), 0);
});

test('Schulden bekommen das inverse Zeichen', () => {
  const k = karteBauen(fuerst({ kasse: -12000 }), makeRng(1));
  assert.equal(bei(k, 0, 0), 159, '31 plus 128, also Inversschrift');
  assert.equal(k.schulden, true);
});

test('Der Balken reicht nur bis 22 Felder', () => {
  const k = karteBauen(fuerst({ kasse: 5000000 }), makeRng(1));
  const felder = k.feld.filter(c => c === 31).length;
  assert.equal(felder, 22);
});

test('Die Umzaeunung waechst mit dem Land, ein Feld je 500 Hektar', () => {
  // Zeile 112 bis 115: Ecken 77/68/85/66, Seiten 92, oben und unten 78
  const k = karteBauen(fuerst({ land: 5000 }), makeRng(1));
  assert.equal(k.landbreite, 10);
  assert.equal(bei(k, 2, 0), 77, 'Ecke oben links');
  assert.equal(bei(k, 2 + 1 + 10, 0), 68, 'Ecke oben rechts');
  assert.equal(bei(k, 2, 10), 85, 'Ecke unten links');
  assert.equal(bei(k, 2 + 1 + 10, 10), 66, 'Ecke unten rechts');
  assert.equal(bei(k, 2, 5), 92, 'linke Seite');
  assert.equal(bei(k, 2 + 1 + 10, 5), 92, 'rechte Seite');
  assert.equal(bei(k, 5, 0), 78, 'obere Kante');
  assert.equal(bei(k, 5, 10), 78, 'untere Kante');
});

test('Die Umzaeunung endet bei 68 Feldern', () => {
  const k = karteBauen(fuerst({ land: 900000 }), makeRng(1));
  assert.equal(k.landbreite, 68);
});

test('Palast und Kathedrale stehen an den Stellen der DATA-Zeilen', () => {
  // Zeile 831: erstes Paar 239,16 - gemessen ab Spalte 2
  const k = karteBauen(fuerst({ palast: 1 }), makeRng(1));
  assert.equal(k.feld[2 + 239], 16);
  assert.equal(k.feld.filter(c => c && c !== 93).length, 1, 'ein Teil, ein Zeichen');

  const d = karteBauen(fuerst({ kathedrale: 2 }), makeRng(1));
  assert.equal(d.feld[2 + 694], 20);   // Zeile 848: 694,20
  assert.equal(d.feld[2 + 695], 5);
});

test('Maerkte und Muehlen bleiben in den oberen neun Zeilen', () => {
  // Das Original wuerfelt INT(RND*9), Zeile 121, 125 und 135
  const k = karteBauen(fuerst({ maerkte: 12, muehlen: 8 }), makeRng(4));
  const MARKT = [146, 139, 143, 138, 145, 147];
  for (let z = 0; z < ZEILEN; z++) {
    for (let sp = 0; sp < SPALTEN; sp++) {
      const c = bei(k, sp, z);
      if (c === 200) assert.ok(z <= 9, `Muehle in Zeile ${z}`);
      if (MARKT.includes(c)) assert.ok(z <= 9 + 2, `Markt in Zeile ${z}`);
    }
  }
  assert.ok(k.feld.filter(c => c === 200).length > 0, 'es stehen Muehlen da');
});

test('Der Einwohnerbalken zaehlt 300 Einwohner je Feld', () => {
  // Zeile 140 bis 144: 224 volles Feld, 225 halbes, vier Felder je Zeile
  const b = 2 + 2;                       // zwei Spalten rechts der Umzaeunung
  const k = karteBauen(fuerst({ land: 500, einwohner: 1500 }), makeRng(1));
  assert.equal(k.landbreite, 1);
  // 1500/300 = 5: eine volle Zeile zu vier, dann ein halbes Feld
  assert.equal(bei(k, b + 1, 0), 224);
  assert.equal(bei(k, b + 2, 0), 224);
  assert.equal(bei(k, b + 1, 1), 225, 'der Rest von eins wird ein halbes Feld');
  assert.equal(bei(k, b + 2, 1), 0);
});

test('Der Einwohnerbalken endet bei 44 Einheiten', () => {
  const k = karteBauen(fuerst({ land: 500, einwohner: 900000 }), makeRng(1));
  const voll = k.feld.filter(c => c === 224).length;
  assert.equal(voll, 22, '44 Einheiten zu je zwei Feldern');
});

test('Dieselbe Runde ergibt dieselbe Karte', () => {
  const s = fuerst({ kasse: 40000, land: 12000, einwohner: 3000, maerkte: 9, muehlen: 6, palast: 8 });
  const a = karteBauen(s, makeRng(99));
  const b = karteBauen(s, makeRng(99));
  assert.deepEqual(a.feld, b.feld);
});

test('Eine grosse Karte bleibt in ihren Grenzen', () => {
  const s = fuerst({ kasse: 200000, land: 40000, einwohner: 9000, maerkte: 40, muehlen: 40, palast: 16, kathedrale: 14 });
  const k = karteBauen(s, makeRng(7));
  assert.equal(k.feld.length, SPALTEN * ZEILEN);
  assert.ok(k.feld.filter(c => c).length > 200, 'die Karte ist gut gefuellt');
});

// ------------------------------------------- Märkte, Städte und Mühlen

const MARKTZEICHEN = [146, 139, 143, 138, 145, 147];
const zaehle = (k, prueflung) => k.feld.filter(prueflung).length;
const staedte = k => k.feld.filter((c, i) => c === 77 && i > 2).length;

test('Eine Stadt verbraucht fünf Märkte und drei Mühlen', () => {
  // Zeile 131 erhöht b um vier und springt nach Zeile 123, wo b noch einmal
  // um eins wächst. Das Handbuch nennt dieselbe Zahl beim Spielziel:
  // "fünf Städte, bestehend aus 5 Marktplätzen und 3 Kornmühlen".
  const k = karteBauen(fuerst({ land: 40000, maerkte: 5, muehlen: 3 }), makeRng(20));
  assert.equal(staedte(k), 1, 'genau eine Stadt');
  assert.equal(zaehle(k, c => MARKTZEICHEN.includes(c)), 5, 'fünf Marktzeichen');
});

test('Fünfundzwanzig Märkte und fünfzehn Mühlen ergeben fünf Städte', () => {
  // Das ist die Bedingung für den Kaiser
  const k = karteBauen(fuerst({ land: 40000, maerkte: 25, muehlen: 15 }), makeRng(20));
  assert.equal(staedte(k), 5);
  assert.equal(zaehle(k, c => MARKTZEICHEN.includes(c)), 25);
});

test('Es stehen nie mehr Marktzeichen da, als der Fürst Märkte hat', () => {
  for (let m = 1; m <= 30; m++) {
    for (const mu of [0, 2, 3, 8, 15]) {
      const k = karteBauen(fuerst({ land: 40000, maerkte: m, muehlen: mu }), makeRng(m * 31 + mu));
      const gezeichnet = zaehle(k, c => MARKTZEICHEN.includes(c));
      assert.ok(gezeichnet <= m, `${m} Märkte, ${mu} Mühlen: ${gezeichnet} Zeichen`);
    }
  }
});

test('Ohne drei freie Mühlen entsteht keine Stadt', () => {
  // Zeile 120: IFf-b>4ANDd>2THEN125
  const k = karteBauen(fuerst({ land: 40000, maerkte: 20, muehlen: 2 }), makeRng(20));
  assert.equal(staedte(k), 0);
  assert.equal(zaehle(k, c => MARKTZEICHEN.includes(c)), 20, 'lauter einzelne Stände');
});

test('Bei vier Märkten oder weniger entsteht keine Stadt', () => {
  const k = karteBauen(fuerst({ land: 40000, maerkte: 4, muehlen: 9 }), makeRng(20));
  assert.equal(staedte(k), 0);
});

test('Alle Mühlen werden gezeichnet, auch die der Städte', () => {
  // Zeile 133 nimmt wieder f(c), nicht den Rest d
  for (const [ma, mu] of [[5, 3], [25, 15], [12, 6]]) {
    const k = karteBauen(fuerst({ land: 40000, maerkte: ma, muehlen: mu }), makeRng(7));
    assert.equal(zaehle(k, c => c === 200), mu, `${ma} Märkte, ${mu} Mühlen`);
  }
});

test('Märkte und Mühlen stehen in festen Spalten, nur die Zeile ist Zufall', () => {
  // Zeile 121: y=INT(RND(0)*9)*74+75+e+2*b  -> Zeile 1 bis 9, Spalte 3+2b
  // Zeile 135: y=INT(RND(0)*9)*74+74+e+2*b  -> Zeile 1 bis 9, Spalte 2+2b
  const k = karteBauen(fuerst({ land: 40000, maerkte: 6, muehlen: 2 }), makeRng(3));
  for (let z = 0; z < ZEILEN; z++) {
    for (let sp = 0; sp < SPALTEN; sp++) {
      const c = bei(k, sp, z);
      if (MARKTZEICHEN.includes(c)) {
        assert.ok(z >= 1 && z <= 9, `Markt in Zeile ${z}`);
        assert.equal(sp % 2, 1, `Markt in Spalte ${sp}, erwartet ungerade`);
      }
      if (c === 200) {
        assert.ok(z >= 1 && z <= 9, `Mühle in Zeile ${z}`);
        assert.equal(sp % 2, 0, `Mühle in Spalte ${sp}, erwartet gerade`);
      }
    }
  }
});
