import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Spiel, PHASEN, HALTUNG } from '../server/game.js';
import * as R from '../server/rules.js';
import * as B from '../server/battle.js';

function kriegslage(seed = 808) {
  const spiel = new Spiel({ id: 'a', seed, planungsSekunden: 0, diplomatieSekunden: 0 });
  for (let i = 0; i < 3; i++) spiel.beitreten({ id: 'p' + i, name: 'F' + i, weiblich: false, region: i });
  spiel.starten();
  for (const p of spiel.spieler) {
    p.titel = 5; p.kavallerie = 4; p.artillerie = 3; p.infanterie = 5;
    p.maerkte = 10; p.muehlen = 4; p.palast = 6;
    R.armeeAktualisieren(p);
  }
  const zug = id => {
    const s = spiel.spielerVon(id);
    spiel.aktion(id, 'kornVerteilen', { menge: Math.max(R.int(s.korn / 5), Math.min(R.kornBedarf(s), R.int(s.korn * 0.8))) });
    if (spiel.zustand[id].fertig) return;
    spiel.aktion(id, 'steuernEinziehen');
    if (id === 'p0') spiel.aktion(id, 'kriegErklaeren', { ziel: 'p1' });
    spiel.aktion(id, 'zugBeenden');
  };
  ['p0', 'p1', 'p2'].forEach(zug);
  return spiel;
}

test('Das Schlachtfeld steht schon in der Diplomatiephase bereit', () => {
  const spiel = kriegslage();
  assert.equal(spiel.phase, PHASEN.DIPLOMATIE);
  const k = spiel.kriege[0];
  assert.equal(k.feld.length, B.ZEILEN * B.SPALTEN, 'Gelände ist erzeugt');
  assert.ok(k.einheitenA.length > 0 && k.einheitenV.length > 0, 'Einheitenlisten liegen vor');
});

test('Nur die Kriegsparteien sehen das Gelände', () => {
  const spiel = kriegslage();
  const sichtA = spiel.sichtFuer('p0').kriege[0];
  const sichtDritter = spiel.sichtFuer('p2').kriege[0];
  assert.ok(sichtA.feld, 'Der Angreifer sieht das Feld');
  assert.equal(sichtA.spalte, B.SPALTE_ANGREIFER);
  assert.equal(sichtA.istAngreifer, true);
  assert.equal(sichtDritter.feld, null, 'Ein Dritter sieht es nicht');
  assert.equal(sichtDritter.einheiten, null);
});

test('Aufstellung wird geprueft und uebernommen', () => {
  const spiel = kriegslage();
  const k = spiel.kriege[0];
  const e = spiel.aktion('p0', 'aufstellung', {
    aufstellung: [
      { gattung: 'kavallerie', zeile: 10 },
      { gattung: 'kavallerie', zeile: 10 },   // doppelte Zeile, wird verworfen
      { gattung: 'infanterie', zeile: 20 },
      { gattung: 'infanterie', zeile: 999 },  // ausserhalb, wird verworfen
      { gattung: 'drache', zeile: 30 }        // gibt es nicht
    ]
  });
  assert.ok(!e.fehler, e.fehler);
  assert.equal(e.gesetzt, 2, 'Zwei gueltige Einheiten');
  assert.deepEqual(k.aufstellungA, [{ gattung: 'kavallerie', zeile: 10 }, { gattung: 'infanterie', zeile: 20 }]);
});

test('Mehr Einheiten als vorhanden werden abgewiesen', () => {
  const spiel = kriegslage();
  const zuviel = Array.from({ length: 30 }, (_, i) => ({ gattung: 'kavallerie', zeile: i }));
  const e = spiel.aktion('p0', 'aufstellung', { aufstellung: zuviel });
  const kav = spiel.spielerVon('p0').kavallerie;
  assert.equal(e.gesetzt, kav, `Nur die ${kav} vorhandenen Schwadronen werden gesetzt`);
});

test('Ein Dritter darf nicht aufstellen', () => {
  const spiel = kriegslage();
  assert.match(spiel.aktion('p2', 'aufstellung', { aufstellung: [] }).fehler, /keinem Krieg beteiligt/);
});

test('Die gewaehlte Aufstellung landet auf dem Schlachtfeld', () => {
  const spiel = kriegslage();
  spiel.aktion('p0', 'aufstellung', { aufstellung: [{ gattung: 'kavallerie', zeile: 5 }] });
  spiel.aktion('p1', 'aufstellung', { aufstellung: [{ gattung: 'infanterie', zeile: 5 }] });
  ['p0', 'p1', 'p2'].forEach(id => spiel.aktion(id, 'bereit'));
  const k = spiel.letzterBericht.kriege[0];
  assert.ok(k.startbild, 'Das Ausgangsbild wird mitgeliefert');
  // In Zeile 5 muessen zu Beginn beide Einheiten stehen
  const zeile = k.startbild.slice(5 * B.SPALTEN, 6 * B.SPALTEN);
  assert.equal(zeile[B.SPALTE_ANGREIFER], 227, 'Kavallerie des Angreifers in Zeile 5');
  assert.equal(zeile[B.SPALTE_VERTEIDIGER], 103, 'Infanterie des Verteidigers in Zeile 5');
});

test('Die Aufzeichnung ergibt genau den Endzustand', () => {
  const spiel = kriegslage(4242);
  ['p0', 'p1', 'p2'].forEach(id => spiel.aktion(id, 'bereit'));
  const k = spiel.letzterBericht.kriege[0];
  assert.ok(k.aufzeichnung.length > 0, 'Es wurde etwas aufgezeichnet');
  const feld = Uint8Array.from(k.startbild);
  for (const bild of k.aufzeichnung) {
    for (let i = 0; i < bild.length; i += 2) feld[bild[i]] = bild[i + 1];
  }
  for (let i = 0; i < feld.length; i++) {
    assert.equal(feld[i], k.feld[i], `Feld ${i} weicht ab`);
  }
});

test('Die Aufzeichnung bleibt handlich', () => {
  const spiel = kriegslage(7);
  ['p0', 'p1', 'p2'].forEach(id => spiel.aktion(id, 'bereit'));
  const k = spiel.letzterBericht.kriege[0];
  const kb = JSON.stringify(k.aufzeichnung).length / 1024;
  assert.ok(kb < 512, `Aufzeichnung ist ${kb.toFixed(0)} KB gross`);
});

test('Die Entwicklungsaktion ist ohne Freischaltung gesperrt', () => {
  const normal = new Spiel({ id: 'n', seed: 1, planungsSekunden: 0, diplomatieSekunden: 0 });
  normal.beitreten({ id: 'p0', name: 'A', weiblich: false, region: 0 });
  normal.starten();
  const e = normal.aktion('p0', 'demoAufruesten', { titel: 9, kasse: 999999 });
  assert.match(e.fehler, /nicht freigeschaltet/);
  assert.equal(normal.spielerVon('p0').titel, 1, 'Der Titel bleibt unverändert');
  assert.equal(normal.spielerVon('p0').kasse, 10000, 'Die Kasse bleibt unverändert');
});

test('Mit Freischaltung greift die Entwicklungsaktion und begrenzt die Werte', () => {
  const demo = new Spiel({ id: 'd', seed: 1, planungsSekunden: 0, diplomatieSekunden: 0, demo: true });
  demo.beitreten({ id: 'p0', name: 'A', weiblich: false, region: 0 });
  demo.starten();
  assert.ok(!demo.aktion('p0', 'demoAufruesten', { titel: 99, kavallerie: 5, kasse: 50000 }).fehler);
  const s = demo.spielerVon('p0');
  assert.equal(s.titel, 9, 'Titel wird auf 9 begrenzt');
  assert.equal(s.kavallerie, 5);
  assert.equal(s.kasse, 50000);
  assert.ok(s.soldaten >= 100, 'Die Armee wird neu berechnet');
});

// ------------------------------------------------------- Wellenangriff

test('Gefallene Kameraden helfen den Nachrueckenden derselben Zeile', () => {
  // Zeile 148 setzt z einmal je Zeile, Zeile 177 sammelt darin die
  // Reststaerke gefallener Einheiten. Drei Kompanien hintereinander haben
  // deshalb eine deutlich bessere Chance gegen eine Schwadron als eine.
  const chance = anzahl => {
    let siege = 0;
    for (let seed = 0; seed < 200; seed++) {
      const a = R.neuerSpieler('a', 'A', false, 0);
      const v = R.neuerSpieler('v', 'V', false, 1);
      Object.assign(a, { infanterie: anzahl, kavallerie: 0, artillerie: 0,
                         maerkte: 0, muehlen: 0, palast: 0, kathedrale: 0 });
      Object.assign(v, { kavallerie: 1, infanterie: 0, artillerie: 0,
                         maerkte: 0, muehlen: 0, palast: 0, kathedrale: 0 });
      R.armeeAktualisieren(a); R.armeeAktualisieren(v);
      const rnd = R.makeRng(seed);
      const f = B.feldAufbauen(a, v, rnd);
      const meine = [];
      for (let i = 0; i < anzahl; i++) meine.push({ gattung: 'infanterie', zeile: 20, spalte: 4 + 4 * i });
      B.aufstellen(f, a, true, meine, () => 20);
      B.aufstellen(f, v, false, [{ gattung: 'kavallerie', zeile: 20, spalte: 26 }], () => 20);
      const erg = B.schlacht({ ...a }, { ...v }, f, rnd, [], []);
      if (erg.verluste[1].kavallerie > 0) siege++;
    }
    return siege;
  };
  const einer = chance(1), drei = chance(3);
  assert.ok(drei > einer * 1.5,
    `drei Kompanien (${drei}) sollten deutlich oefter durchkommen als eine (${einer})`);
});

test('Mehrere Einheiten passen in eine Zeile', () => {
  const a = R.neuerSpieler('a', 'A', false, 0);
  const v = R.neuerSpieler('v', 'V', false, 1);
  Object.assign(a, { infanterie: 3, kavallerie: 0, artillerie: 0,
                     maerkte: 0, muehlen: 0, palast: 0, kathedrale: 0 });
  R.armeeAktualisieren(a); R.armeeAktualisieren(v);
  const rnd = R.makeRng(3);
  const f = B.feldAufbauen(a, v, rnd);
  const gesetzt = B.aufstellen(f, a, true, [
    { gattung: 'infanterie', zeile: 20, spalte: 4 },
    { gattung: 'infanterie', zeile: 20, spalte: 9 },
    { gattung: 'infanterie', zeile: 20, spalte: 14 }
  ], () => 20);
  const inZeile20 = gesetzt.filter(e => e.zeile === 20);
  assert.equal(inZeile20.length, 3, 'alle drei stehen in Zeile 20');
  assert.deepEqual(inZeile20.map(e => e.spalte).sort((x, y) => x - y), [4, 9, 14]);
});

test('Ausserhalb des eigenen Bereichs wird eingepasst', () => {
  const a = R.neuerSpieler('a', 'A', false, 0);
  const v = R.neuerSpieler('v', 'V', false, 1);
  R.armeeAktualisieren(a); R.armeeAktualisieren(v);
  const f = B.feldAufbauen(a, v, R.makeRng(9));
  const gesetzt = B.aufstellen(f, a, true, [{ gattung: 'infanterie', zeile: 20, spalte: 35 }], () => 20);
  assert.ok(gesetzt[0].spalte <= B.AUFSTELLUNG.angreifer.bis,
    'der Angreifer kommt nicht ins Feindesland: ' + gesetzt[0].spalte);
});

// ---------------------------------------------------------- Der Feldherr

test('Der Feldherr stellt nahe der feindlichen Grenze auf', () => {
  const a = R.neuerSpieler('a', 'A', false, 0), v = R.neuerSpieler('v', 'V', false, 1);
  for (const s of [a, v]) {
    Object.assign(s, { land: 30000, einwohner: 6000, kavallerie: 3, artillerie: 2, infanterie: 4 });
    R.armeeAktualisieren(s);
  }
  const f = B.feldAufbauen(a, v, R.makeRng(11));
  const stellungA = B.aufstellen(f, a, true, [], null);
  const stellungV = B.aufstellen(f, v, false, [], null);

  assert.ok(stellungA.length > 0 && stellungV.length > 0, 'Es wurde etwas gesetzt');
  for (const e of stellungA) {
    const g = f.grenzspalte[e.zeile];
    assert.ok(e.spalte < g, `Angreifer bleibt diesseits der Grenze (${e.spalte} < ${g})`);
    assert.ok(g - e.spalte <= B.FELDHERR_ABSTAND + 1,
      `Angreifer steht grenznah, nicht in Spalte ${B.SPALTE_ANGREIFER}: ${e.spalte} bei Grenze ${g}`);
  }
  for (const e of stellungV) {
    const g = f.grenzspalte[e.zeile];
    assert.ok(e.spalte > g, `Verteidiger bleibt jenseits der Grenze (${e.spalte} > ${g})`);
    assert.ok(e.spalte - g <= B.FELDHERR_ABSTAND + 1,
      `Verteidiger steht grenznah, nicht in Spalte ${B.SPALTE_VERTEIDIGER}: ${e.spalte} bei Grenze ${g}`);
  }
});

test('Wer nur eine Zeile nennt, bleibt in der Startspalte des Cursors', () => {
  const a = R.neuerSpieler('a', 'A', false, 0), v = R.neuerSpieler('v', 'V', false, 1);
  for (const s of [a, v]) {
    Object.assign(s, { land: 30000, einwohner: 6000, kavallerie: 1, artillerie: 0, infanterie: 0 });
    R.armeeAktualisieren(s);
  }
  const f = B.feldAufbauen(a, v, R.makeRng(12));
  const [erste] = B.aufstellen(f, a, true, [{ gattung: 'kavallerie', zeile: 9 }], null);
  assert.equal(erste.spalte, B.SPALTE_ANGREIFER);
});

test('Die Aufstellung des Feldherrn schlaegt die Startspalte', () => {
  // Gleich starke Heere, der Verteidiger stellt von Hand in die Startspalte,
  // der Angreifer ueberlaesst alles dem Feldherrn -- und umgekehrt.
  const schlacht = (seed, feldherrFuerAngreifer) => {
    const a = R.neuerSpieler('a', 'A', false, 0), v = R.neuerSpieler('v', 'V', false, 1);
    for (const s of [a, v]) {
      Object.assign(s, { land: 30000, einwohner: 6000, kasse: 100000, maerkte: 20,
        muehlen: 12, palast: 10, kathedrale: 4, kavallerie: 5, artillerie: 5, infanterie: 10 });
      R.armeeAktualisieren(s);
    }
    const rnd = R.makeRng(seed);
    const f = B.feldAufbauen(a, v, rnd);
    const n = Math.max(B.einheitenListe(a).length, B.einheitenListe(v).length);
    // "Von Hand" heisst hier: in die Startspalte, so wie der Feldherr es frueher tat.
    const startspalte = (s, istA) => B.einheitenListe(s).map((g, i) => ({
      gattung: g, zeile: Math.round((i + 0.5) * B.ZEILEN / n),
      spalte: istA ? B.SPALTE_ANGREIFER : B.SPALTE_VERTEIDIGER
    }));
    const aufA = feldherrFuerAngreifer ? [] : startspalte(a, true);
    const aufV = feldherrFuerAngreifer ? startspalte(v, false) : [];
    return B.schlacht(a, v, f, rnd, aufA, aufV, undefined).landAngreifer;
  };
  const mittel = seiten => {
    const p = Array.from({ length: 20 }, (_, i) => schlacht(i, seiten));
    return p.reduce((x, y) => x + y, 0) / p.length;
  };
  assert.ok(mittel(true) > 0, 'Der Feldherr gewinnt als Angreifer gegen die Startspalte');
  assert.ok(mittel(false) < 0, 'Der Feldherr haelt als Verteidiger die Startspalte auf');
});

// ------------------------------------------- was der Server annimmt und behaelt

test('Die gewaehlte Spalte ueberlebt den Server', () => {
  const spiel = kriegslage();
  spiel.aktion('p0', 'aufstellung', { aufstellung: [
    { gattung: 'kavallerie', zeile: 10, spalte: 17 },
    { gattung: 'kavallerie', zeile: 10, spalte: 14 },   // dieselbe Zeile, daneben
    { gattung: 'artillerie', zeile: 20, spalte: 3 }
  ] });
  const k = spiel.kriege[0];
  assert.deepEqual(k.aufstellungA, [
    { gattung: 'kavallerie', zeile: 10, spalte: 17 },
    { gattung: 'kavallerie', zeile: 10, spalte: 14 },
    { gattung: 'artillerie', zeile: 20, spalte: 3 }
  ], 'Zeile und Spalte kommen unveraendert an');
});

test('Zwei Einheiten duerfen sich nicht ueberlappen', () => {
  const spiel = kriegslage();
  spiel.aktion('p0', 'aufstellung', { aufstellung: [
    { gattung: 'kavallerie', zeile: 10, spalte: 12 },
    { gattung: 'kavallerie', zeile: 10, spalte: 13 }    // eine Spalte daneben
  ] });
  assert.equal(spiel.kriege[0].aufstellungA.length, 1, 'die zweite wird abgewiesen');
});

test('Eine Spalte ausserhalb des eigenen Bereichs wird eingepasst', () => {
  const spiel = kriegslage();
  spiel.aktion('p0', 'aufstellung', { aufstellung: [
    { gattung: 'kavallerie', zeile: 5, spalte: 30 }     // jenseits der Grenze
  ] });
  const e = spiel.kriege[0].aufstellungA[0];
  assert.ok(e.spalte <= B.AUFSTELLUNG.angreifer.bis, `eingepasst auf ${e.spalte}`);
});

test('Die Sicht des Gegners zeigt die fremde Aufstellung', () => {
  const spiel = kriegslage();
  spiel.aktion('p0', 'aufstellung', { aufstellung: [{ gattung: 'kavallerie', zeile: 7, spalte: 16 }] });
  const sichtV = spiel.sichtFuer('p1').kriege[0];
  assert.deepEqual(sichtV.gegnerAufstellung, [{ gattung: 'kavallerie', zeile: 7, spalte: 16 }],
    'der Verteidiger sieht, was der Angreifer gesetzt hat');
});
