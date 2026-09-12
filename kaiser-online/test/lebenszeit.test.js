import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.KAISER_DATEN = fs.mkdtempSync(path.join(os.tmpdir(), 'kaiser-leben-'));

const { Spiel } = await import('../server/game.js');
const R = await import('../server/rules.js');

function runde(seed = 3) {
  const spiel = new Spiel({ id: 'l', seed, demo: true, planungsSekunden: 0, diplomatieSekunden: 0 });
  spiel.beitreten({ id: 'p0', name: 'KARL', weiblich: false });
  spiel.beitreten({ id: 'p1', name: 'MARIA', weiblich: true });
  spiel.starten();
  return spiel;
}

function jahrDurch(spiel) {
  spiel.aktion('p0', 'zugBeenden');
  spiel.aktion('p1', 'zugBeenden');
  return spiel.letzterBericht;
}

// ------------------------------------------------------------- die Regel

test('Alle Regenten beginnen mit demselben Todesjahr 1760', () => {
  // Zeile 877: k(c)=1760
  const spiel = runde();
  for (const s of spiel.spieler) {
    assert.equal(s.lebenszeit, 1760);
    assert.equal(s.tot, false);
  }
});

test('Vor dem Todesjahr fliessen Zinsen und die Moral sinkt', () => {
  // Zeile 613: b(c)=INT(b(c)*1.1) : o(c)=o(c)*.9
  const s = R.neuerSpieler('x', 'X', false, 0);
  s.kasse = 10000; s.moral = 1;
  const e = R.zinsen(s, 1700, () => 0.9);
  assert.equal(e.zins, 1000);
  assert.equal(s.kasse, 11000);
  assert.ok(Math.abs(s.moral - 0.9) < 1e-9);
  assert.equal(s.tot, false);
});

test('Im Todesjahr entscheidet der Wurf ueber ein weiteres Jahr', () => {
  // Zeile 718: IFINT(RND(0)*2)=0THENk(c)=k(c)+1
  const s = R.neuerSpieler('x', 'X', false, 0);
  s.kasse = 10000;
  const e = R.zinsen(s, 1760, () => 0.1);     // INT(0.1*2)=0 -> ein Jahr mehr
  assert.deepEqual(e, { verlaengert: true });
  assert.equal(s.lebenszeit, 1761);
  assert.equal(s.tot, false);
  assert.equal(s.kasse, 10000, 'in diesem Jahr keine Zinsen');
});

test('Faellt der Wurf anders, stirbt der Regent', () => {
  const s = R.neuerSpieler('x', 'X', false, 0);
  const e = R.zinsen(s, 1760, () => 0.7);     // INT(0.7*2)=1 -> Tod
  assert.deepEqual(e, { gestorben: true });
  assert.equal(s.tot, true);
  assert.equal(s.gestorbenIn, 1760);
  assert.ok(s.lebenszeit < 1700, 'unter 1700 heisst draussen, Zeile 464');
});

test('Bankrott kostet zwei Lebensjahre', () => {
  // Zeile 734: k(c)=k(c)-2
  const spiel = runde(5);
  const s = spiel.spielerVon('p0');
  const vorher = s.lebenszeit;
  s.kasse = -500000;
  R.bankrottPruefen(s, spiel.zustand['p0'].markt, spiel.zustand['p0'].rnd);
  assert.equal(s.lebenszeit, vorher - 2);
});

// ----------------------------------------------------------- in der Runde

test('Ein verstorbener Regent setzt fuer immer aus', () => {
  const spiel = runde(7);
  const s = spiel.spielerVon('p0');
  s.lebenszeit = spiel.jahr;          // sein Todesjahr ist erreicht
  let gestorben = false;
  for (let i = 0; i < 12 && !gestorben; i++) {
    const b = jahrDurch(spiel);
    gestorben = s.tot;
    if (gestorben) {
      const e = b.spieler.find(x => x.id === 'p0');
      assert.ok(e.zeremonien.some(z => z.art === 'tod'), 'es gibt eine Sterbezeremonie');
      assert.match(e.meldungen.map(m => m.text).join(' '), /Altersschwäche/);
    }
  }
  assert.ok(gestorben, 'nach hoechstens zwoelf Jahren ist er tot');

  const z = spiel.zustand['p0'];
  assert.equal(z.tot, true);
  assert.equal(z.aussetzen, true);
  assert.equal(z.fertig, true, 'die Runde wartet nicht auf ihn');
  assert.match(spiel.aktion('p0', 'steuernEinziehen').fehler, /verschieden/);
});

test('Ein Toter ist kein Kriegsziel mehr', () => {
  // Zeile 685 und 686: IFk(h)>1700THEN687 sonst "DAS GEHT NICHT!"
  const spiel = runde(9);
  const angreifer = spiel.spielerVon('p0');
  const opfer = spiel.spielerVon('p1');
  angreifer.titel = 3;
  opfer.tot = true;
  assert.match(spiel.aktion('p0', 'kriegErklaeren', { ziel: 'p1' }).fehler, /GEHT NICHT/);
});

test('Wer sein Todesjahr erreicht hat, zieht nicht mehr in den Krieg', () => {
  // Zeile 687: IFze<k(c)THEN...GOTO251, sonst geht es zum Sterbewurf
  const spiel = runde(11);
  const s = spiel.spielerVon('p0');
  s.titel = 3;
  s.lebenszeit = spiel.jahr;
  assert.match(spiel.aktion('p0', 'kriegErklaeren', { ziel: 'p1' }).fehler, /Jahre sind gezählt/);
  s.lebenszeit = spiel.jahr + 1;
  assert.ok(spiel.aktion('p0', 'kriegErklaeren', { ziel: 'p1' }).ok, 'ein Jahr davor geht es noch');
});

test('Sind alle Regenten tot, ist die Runde zu Ende', () => {
  const spiel = runde(13);
  for (const s of spiel.spieler) s.lebenszeit = spiel.jahr;
  for (let i = 0; i < 30 && spiel.phase !== 'ende'; i++) jahrDurch(spiel);
  assert.equal(spiel.phase, 'ende');
  assert.equal(spiel.sieger, null, 'ohne Kaiser endet die Runde ohne Sieger');
  assert.ok(spiel.spieler.every(s => s.tot));
});

test('Die Runde laeuft weiter, solange einer lebt', () => {
  const spiel = runde(17);
  const s = spiel.spielerVon('p0');
  s.lebenszeit = spiel.jahr;
  for (let i = 0; i < 15 && !s.tot; i++) jahrDurch(spiel);
  assert.ok(s.tot);
  assert.equal(spiel.phase, 'planung', 'MARIA regiert weiter');
  assert.equal(spiel.spielerVon('p1').tot, false);
});
