import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.KAISER_DATEN = fs.mkdtempSync(path.join(os.tmpdir(), 'kaiser-regeln-'));

const { Spiel } = await import('../server/game.js');
const R = await import('../server/rules.js');
const B = await import('../server/battle.js');
const { REGELWERKE, regelwerk } = await import('../server/regelwerk.js');

function runde(id, spieler = 2, seed = 5) {
  const spiel = new Spiel({ id: 'r', seed, regelwerk: id, planungsSekunden: 0, diplomatieSekunden: 0 });
  for (let i = 0; i < spieler; i++) {
    spiel.beitreten({ id: 'p' + i, name: 'F' + i, weiblich: false });
  }
  spiel.starten();
  return spiel;
}

test('Ohne Angabe gilt das Original', () => {
  assert.equal(new Spiel({ id: 'x' }).regeln.id, 'original');
  assert.equal(regelwerk('quatsch').id, 'original');
  assert.equal(regelwerk('neu').id, 'neu');
});

// ------------------------------------------------------------ 1. Zinsen

test('Das Original verzinst das ganze Vermögen, die Fassung 2026 nur die Bonität', () => {
  const bau = () => {
    const s = R.neuerSpieler('x', 'X', false, 0);
    s.kasse = 1000000; s.titel = 4; s.lebenszeit = 1800;
    return s;
  };
  const alt = bau();
  R.zinsen(alt, 1700, () => 0.5, REGELWERKE.original);
  assert.equal(alt.kasse, 1100000, 'zehn Prozent auf alles');

  const neu = bau();
  R.zinsen(neu, 1700, () => 0.5, REGELWERKE.neu);
  assert.equal(R.bonitaetVon(neu), 40000, 'Bonität ist 10.000 je Titelstufe');
  assert.equal(neu.kasse, 1004000, 'zehn Prozent nur auf 40.000');
});

test('Schulden verzinsen sich in beiden Fassungen voll', () => {
  for (const w of [REGELWERKE.original, REGELWERKE.neu]) {
    const s = R.neuerSpieler('x', 'X', false, 0);
    s.kasse = -100000; s.titel = 4; s.lebenszeit = 1800;
    R.zinsen(s, 1700, () => 0.5, w);
    // INT rundet ab, deshalb ein Taler mehr Schuld als die glatte Rechnung
    assert.ok(Math.abs(s.kasse + 110000) <= 1, w.name + ': Schulden wachsen weiter, ' + s.kasse);
  }
});

// -------------------------------------------------------------- 2. Moral

test('Die Moral fällt im Original und kehrt in der Fassung 2026 zur Mitte', () => {
  const lauf = (w, start) => {
    const s = R.neuerSpieler('x', 'X', false, 0);
    s.moral = start; s.lebenszeit = 1800; s.kasse = 1000;
    for (let j = 0; j < 40; j++) R.zinsen(s, 1700 + j, () => 0.5, w);
    return s.moral;
  };
  assert.ok(lauf(REGELWERKE.original, 1) < 0.02, 'im Original bleibt nichts übrig');
  const neu = lauf(REGELWERKE.neu, 1);
  assert.ok(Math.abs(neu - 1) < 0.01, 'in der Fassung 2026 bleibt sie bei eins: ' + neu);
  const vonUnten = lauf(REGELWERKE.neu, 0.1);
  assert.ok(vonUnten > 0.9, 'und erholt sich von unten: ' + vonUnten);
});

// ----------------------------------------------------------- 3. Manöver

test('Manöver bringen im Original beliebig viel, in der Fassung 2026 nicht', () => {
  const bau = () => {
    const s = R.neuerSpieler('x', 'X', false, 0);
    Object.assign(s, { kavallerie: 5, artillerie: 5, infanterie: 10, kasse: 5000000 });
    R.armeeAktualisieren(s); s.moral = 1; return s;
  };
  const alt = bau();
  for (let i = 0; i < 200; i++) R.manoever(alt, REGELWERKE.original, i);
  assert.ok(alt.moral > 20, 'im Original ist Moral käuflich: ' + alt.moral);

  const neu = bau();
  for (let i = 0; i < 200; i++) R.manoever(neu, REGELWERKE.neu, i);
  assert.ok(neu.moral < 1.21, 'in der Fassung 2026 ist bei 1,2 Schluss: ' + neu.moral);
  assert.ok(neu.moral > 1.19, 'das erste Manöver wirkt aber voll: ' + neu.moral);
});

test('Die Moral steigt in der Fassung 2026 nie über zwei', () => {
  const s = R.neuerSpieler('x', 'X', false, 0);
  s.moral = 1.95; s.kasse = 100000;
  R.manoever(s, REGELWERKE.neu, 0);
  assert.ok(s.moral <= 2);
});

// -------------------------------------------------------------- 6. Land

test('Im Original entsteht Land aus dem Nichts', () => {
  const spiel = runde('original', 2);
  assert.equal(spiel.freiesLand, Infinity);
  const s = spiel.spielerVon('p0');
  s.kasse = 10000000;
  spiel.aktion('p0', 'landKaufen', { menge: 500000 });
  assert.equal(s.land, 515000);
});

test('Die Fassung 2026 hat ein Reich von fester Größe', () => {
  const spiel = runde('neu', 2);
  // 30.000 Hektar je Fürstentum, zwei Fürsten mit je 15.000 zu Beginn
  assert.equal(spiel.freiesLand, 30000);
  const s = spiel.spielerVon('p0');
  s.kasse = 10000000;
  const e = spiel.aktion('p0', 'landKaufen', { menge: 500000 });
  assert.equal(e.menge, 30000, 'mehr als der Vorrat gibt es nicht');
  assert.equal(s.land, 45000);
  assert.equal(spiel.freiesLand, 0);

  const nochmal = spiel.aktion('p0', 'landKaufen', { menge: 1000 });
  assert.match(nochmal.fehler, /kein Land mehr/);
});

test('Verkauftes Land kommt in den Vorrat zurück', () => {
  const spiel = runde('neu', 2);
  const s = spiel.spielerVon('p0');
  s.kasse = 10000000;
  spiel.aktion('p0', 'landKaufen', { menge: 30000 });
  assert.equal(spiel.freiesLand, 0);
  spiel.aktion('p0', 'landVerkaufen', { menge: 5000 });
  assert.equal(spiel.freiesLand, 5000);
});

test('Das Reich wächst mit der Zahl der Fürsten', () => {
  assert.equal(runde('neu', 2).freiesLand, 30000);
  assert.equal(runde('neu', 4).freiesLand, 60000);
  assert.equal(runde('neu', 9).freiesLand, 135000);
});

// --------------------------------------------------- 4. und 5. Schlacht

function schlacht(regeln, seed, { moralA = 1, moralV = 1, einheitenA = 5 } = {}) {
  const a = R.neuerSpieler('a', 'A', false, 0), v = R.neuerSpieler('v', 'V', false, 1);
  for (const s of [a, v]) Object.assign(s, { land: 30000, einwohner: 6000, kasse: 100000,
    maerkte: 20, muehlen: 12, palast: 10, kathedrale: 4 });
  Object.assign(a, { kavallerie: einheitenA, artillerie: einheitenA, infanterie: einheitenA * 2 });
  Object.assign(v, { kavallerie: 5, artillerie: 5, infanterie: 10 });
  a.moral = moralA; v.moral = moralV;
  R.armeeAktualisieren(a); R.armeeAktualisieren(v);
  const rnd = R.makeRng(seed);
  const f = B.feldAufbauen(a, v, rnd);
  // Die Aufstellung wird an schlacht() uebergeben, denn die Schlacht stellt
  // selbst auf. Wer vorher aufstellt, bekommt jede Einheit doppelt.
  const wunsch = (spieler, spalte) => {
    const liste = B.einheitenListe(spieler);
    return liste.map((g, i) => ({
      gattung: g, zeile: Math.round((i + 0.5) * 76 / liste.length), spalte
    }));
  };
  // beide dicht an der Grenze
  const erg = B.schlacht(a, v, f, rnd, wunsch(a, 16), wunsch(v, 23), regeln);
  const verluste = seite => Object.values(erg.verluste[seite]).reduce((x, y) => x + y, 0);
  return { land: erg.landAngreifer, verlusteA: verluste(0), verlusteV: verluste(1) };
}

test('Der Heimvorteil macht den Angriff zum Wagnis', () => {
  const proben = w => Array.from({ length: 40 }, (_, i) => schlacht(w, i));
  const alt = proben(REGELWERKE.original).filter(x => x.land > 0).length;
  const neu = proben(REGELWERKE.neu).filter(x => x.land > 0).length;
  assert.ok(alt > neu, `Original ${alt}/40 gegen Fassung 2026 ${neu}/40`);
});

test('In der Fassung 2026 kostet auch ein Sieg', () => {
  const mittel = (w, k) => {
    const p = Array.from({ length: 40 }, (_, i) => schlacht(w, i, { einheitenA: 12 }));
    return p.reduce((a, x) => a + x[k], 0) / p.length;
  };
  const altSieger = mittel(REGELWERKE.original, 'verlusteA');
  const neuSieger = mittel(REGELWERKE.neu, 'verlusteA');
  assert.ok(neuSieger > altSieger, `Verluste des Siegers: ${altSieger} gegen ${neuSieger}`);
});

test('Der Landgewinn streut in der Fassung 2026', () => {
  const werte = w => Array.from({ length: 30 }, (_, i) => schlacht(w, i, { einheitenA: 12 }).land);
  const streuung = a => {
    const m = a.reduce((x, y) => x + y, 0) / a.length;
    return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length) / Math.abs(m || 1);
  };
  assert.ok(streuung(werte(REGELWERKE.neu)) > streuung(werte(REGELWERKE.original)) * 0.9,
    'die Ergebnisse liegen weiter auseinander');
});

// ------------------------------------------------------------ Speichern

test('Das Regelwerk überlebt einen Neustart', async () => {
  const { sichern, laden } = await import('../server/speicher.js');
  const spiel = runde('neu', 2);
  sichern(spiel);
  const zurueck = laden('r');
  assert.equal(zurueck.regeln.id, 'neu');
  assert.equal(zurueck.regeln.name, 'Fassung 2026');
});

// ------------------------------------------- 7. Vermoegen beim Titelaufstieg

function fuerst(mehr = {}) {
  return Object.assign(R.neuerSpieler('a', 'A', false, 0), {
    titel: 1, kasse: 4948, land: 14166, einwohner: 2033, punkte: 22, handel: 52,
    wohlstand: 57.6, soldaten: 160, gebaeudeBonus: 1.52,
    maerkte: 10, muehlen: 10, palast: 2, kathedrale: 0
  }, mehr);
}

test('Die Bauwerke werden mit den Pfandbetraegen des Originals bewertet', () => {
  // Zeile 728 bis 731: Kathedralenteil 2.500, Palastteil 1.500, Muehle 1.000,
  // Markt 500. Andere Zahlen nennt das Spiel nirgends.
  const s = fuerst({ maerkte: 2, muehlen: 3, palast: 4, kathedrale: 5 });
  assert.equal(R.bauwerte(s), 2 * 500 + 3 * 1000 + 4 * 1500 + 5 * 2500);
  assert.equal(R.vermoegenVon(s), s.kasse + R.bauwerte(s));
});

test('Im Original bleibt der Aufbauer ohne Titel, in der Fassung 2026 nicht', () => {
  // Die Zahlen stammen aus der Runde SirNormi, Anno 1740.
  assert.equal(R.aufstiegsPunkte(fuerst()), 38, 'das reicht fuer Stufe 4');
  const alt = fuerst(), neu = fuerst();
  assert.equal(R.titelPruefen(alt, REGELWERKE.original), 'geld', 'die Kasse ist zu leer');
  assert.equal(alt.titel, 1, 'und er bleibt Herr');
  assert.equal(R.titelPruefen(neu, REGELWERKE.neu), 2, 'mit den Bauwerken steigt er auf');
  assert.equal(neu.titel, 2, 'eine Stufe je Jahr, wie im Original');
});

test('Wer Schulden hat, steigt auch mit Bauwerken nicht auf', () => {
  const s = fuerst({ kasse: -8367 });
  assert.equal(R.titelPruefen(s, REGELWERKE.neu), 'geld');
  assert.equal(s.titel, 1);
});

test('Der letzte Schritt zum Kaiser verlangt weiter bares Geld', () => {
  const s = fuerst({ titel: 8, kasse: 50000, maerkte: 30, muehlen: 20,
                     palast: 16, kathedrale: 14, land: 120000, einwohner: 9000,
                     punkte: 60, handel: 100, wohlstand: 900, soldaten: 900 });
  assert.ok(R.aufstiegsPunkte(s) >= 81, 'die Punkte reichen');
  assert.ok(R.vermoegenVon(s) > 100000, 'das Vermoegen auch');
  assert.equal(R.titelPruefen(s, REGELWERKE.neu), 'geld', 'aber die Kasse nicht');
  s.kasse = 100000;
  assert.equal(R.titelPruefen(s, REGELWERKE.neu), 9, 'mit 100.000 in bar wird er Kaiser');
  assert.ok(s.kaiser);
});
