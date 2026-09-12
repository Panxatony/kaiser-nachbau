import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Spiel, PHASEN, HALTUNG } from '../server/game.js';
import * as R from '../server/rules.js';
import * as B from '../server/battle.js';

/**
 * Setzt eine Einheit in die erste Zeile, in der in dieser Spalte Platz ist.
 * Das Schlachtfeld traegt Staedte, Maerkte und Muehlen; eine feste Zeile waere
 * darum eine Wette.
 */
function setze(spiel, id, spalte) {
  const k = spiel.kriege[0];
  for (let zeile = 1; zeile <= 74; zeile++) {
    if (!spiel.platzFrei(k, zeile, spalte)) continue;
    const e = spiel.aktion(id, 'aufstellungSetzen', { zeile, spalte });
    if (!e.fehler) return { zeile, spalte };
  }
  throw new Error('keine freie Zeile in Spalte ' + spalte);
}

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

test('Gesetzt wird abwechselnd, und der Ueberschuss zuerst', () => {
  const spiel = kriegslage();
  const k = spiel.kriege[0];
  // Beide Seiten sind gleich stark, also beginnt der Angreifer (Zeile 295).
  assert.equal(k.einheitenA.length, k.einheitenV.length);
  assert.equal(k.amZug, 'angreifer');

  assert.match(spiel.aktion('p1', 'aufstellungSetzen', { zeile: 10, spalte: 24 }).fehler,
    /Gegner ist am Zug/, 'der Verteidiger muss warten');

  assert.ok(!spiel.aktion('p0', 'aufstellungSetzen', { zeile: 10, spalte: 16 }).fehler);
  assert.equal(k.amZug, 'verteidiger', 'jetzt der andere');
  assert.ok(!spiel.aktion('p1', 'aufstellungSetzen', { zeile: 10, spalte: 24 }).fehler);
  assert.equal(k.amZug, 'angreifer', 'und wieder zurueck');

  assert.deepEqual(k.aufstellungA, [{ gattung: 'kavallerie', zeile: 10, spalte: 16 }]);
  assert.deepEqual(k.aufstellungV, [{ gattung: 'kavallerie', zeile: 10, spalte: 24 }]);
});

test('Die staerkere Seite setzt ihren Ueberschuss zuerst', () => {
  const spiel = kriegslage();
  const k = spiel.kriege[0];
  // Dem Verteidiger zwei Einheiten mehr geben und den Krieg neu aufbauen
  k.einheitenV = [...k.einheitenV, 'infanterie', 'infanterie'];
  k.amZug = spiel.amZug(k);
  assert.equal(k.amZug, 'verteidiger', 'wer mehr hat, faengt an');
  spiel.aktion('p1', 'aufstellungSetzen', { zeile: 1, spalte: 24 });
  assert.equal(k.amZug, 'verteidiger', 'und setzt weiter, bis es gleich steht');
  spiel.aktion('p1', 'aufstellungSetzen', { zeile: 3, spalte: 24 });
  assert.equal(k.amZug, 'angreifer', 'erst dann kommt der andere');
});

test('Die Gattung kommt in fester Reihenfolge', () => {
  const spiel = kriegslage();
  const k = spiel.kriege[0];
  const gattungen = [];
  for (let n = 0; n < 5; n++) {
    setze(spiel, 'p0', 16);
    gattungen.push(k.aufstellungA[k.aufstellungA.length - 1].gattung);
    setze(spiel, 'p1', 24);
  }
  assert.deepEqual(gattungen.slice(0, 4), ['kavallerie', 'kavallerie', 'kavallerie', 'kavallerie'],
    'erst die Kavallerie, davon gibt es vier');
  assert.equal(gattungen[4], 'artillerie', 'dann die Artillerie');
});

test('Auf eine besetzte Stelle laesst sich nichts setzen', () => {
  const spiel = kriegslage();
  const k = spiel.kriege[0];
  spiel.aktion('p0', 'aufstellungSetzen', { zeile: 10, spalte: 16 });
  spiel.aktion('p1', 'aufstellungSetzen', { zeile: 10, spalte: 24 });
  const e = spiel.aktion('p0', 'aufstellungSetzen', { zeile: 10, spalte: 17 });
  assert.match(e.fehler, /kein Platz/, 'eine Einheit ist zwei Zeichen breit');
  assert.equal(k.aufstellungA.length, 1);
  assert.equal(k.amZug, 'angreifer', 'wer danebentrifft, bleibt am Zug');
});

test('Eine Spalte ausserhalb des eigenen Bereichs wird eingepasst', () => {
  const spiel = kriegslage();
  const k = spiel.kriege[0];
  for (let zeile = 1; zeile <= 74; zeile++) {
    if (!spiel.platzFrei(k, zeile, B.AUFSTELLUNG.angreifer.bis)) continue;
    assert.ok(!spiel.aktion('p0', 'aufstellungSetzen', { zeile, spalte: 30 }).fehler);
    break;
  }
  const e = k.aufstellungA[0];
  assert.equal(e.spalte, B.AUFSTELLUNG.angreifer.bis, 'bis an die Grenze, nicht darueber');
});

test('Wer abgibt, laesst den anderen weitermachen', () => {
  const spiel = kriegslage();
  const k = spiel.kriege[0];
  assert.ok(!spiel.aktion('p0', 'aufstellungAbgeben', {}).fehler);
  assert.equal(k.amZug, 'verteidiger', 'der andere setzt allein zu Ende');
  spiel.aktion('p1', 'aufstellungSetzen', { zeile: 4, spalte: 24 });
  assert.equal(k.amZug, 'verteidiger', 'und bleibt dran');
  assert.equal(k.aufstellungA.length, 0, 'fuer den Abgebenden setzt der Feldherr');
});

test('Ein Dritter darf nicht aufstellen', () => {
  const spiel = kriegslage();
  assert.match(spiel.aktion('p2', 'aufstellungSetzen', { zeile: 5, spalte: 16 }).fehler,
    /keinem Krieg beteiligt/);
});

test('Die gewaehlte Aufstellung landet auf dem Schlachtfeld', () => {
  const spiel = kriegslage();
  spiel.aktion('p0', 'aufstellungSetzen', { zeile: 5, spalte: 16 });
  spiel.aktion('p1', 'aufstellungSetzen', { zeile: 5, spalte: 24 });
  ['p0', 'p1', 'p2'].forEach(id => spiel.aktion(id, 'bereit'));
  const k = spiel.letzterBericht.kriege[0];
  assert.ok(k.startbild, 'Das Ausgangsbild wird mitgeliefert');
  const zeile = k.startbild.slice(5 * B.SPALTEN, 6 * B.SPALTEN);
  assert.equal(zeile[16], 227, 'Kavallerie des Angreifers in Zeile 5, Spalte 16');
  assert.equal(zeile[24], 109, 'Kavallerie des Verteidigers in Zeile 5, Spalte 24');
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
