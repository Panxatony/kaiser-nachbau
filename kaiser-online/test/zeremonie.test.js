import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.KAISER_DATEN = fs.mkdtempSync(path.join(os.tmpdir(), 'kaiser-zeremonie-'));

const { Spiel } = await import('../server/game.js');
const Ruhm = await import('../server/ruhmeshalle.js');

function runde(seed = 3) {
  const spiel = new Spiel({ id: 'z', seed, demo: true, planungsSekunden: 0, diplomatieSekunden: 0 });
  spiel.beitreten({ id: 'p0', name: 'KARL', weiblich: false });
  spiel.beitreten({ id: 'p1', name: 'MARIA', weiblich: true });
  spiel.starten();
  return spiel;
}

/** Beendet ein Jahr und liefert den Berichtseintrag des ersten Spielers. */
function jahrDurch(spiel) {
  spiel.aktion('p0', 'zugBeenden');
  spiel.aktion('p1', 'zugBeenden');
  return spiel.letzterBericht.spieler.find(s => s.id === 'p0');
}

test('Ein Titelaufstieg erzeugt eine Zeremonie mit der vollen Anrede', () => {
  const spiel = runde();
  const s = spiel.spielerVon('p0');
  Object.assign(s, { titel: 1, land: 40000, maerkte: 30, muehlen: 20, palast: 16, kathedrale: 14, kasse: 300000 });
  const e = jahrDurch(spiel);
  const z = e.zeremonien.find(x => x.art === 'titel');
  assert.ok(z, 'es gibt eine Titelzeremonie');
  assert.match(z.anrede, /^BARON KARL VON PREUSSEN$/, 'Titel, Name, VON, Region');
});

test('Die Kroenung nennt den Vorgaenger und traegt den neuen Kaiser ein', () => {
  const spiel = runde(11);
  const s = spiel.spielerVon('p0');
  Object.assign(s, { titel: 8, land: 40000, maerkte: 30, muehlen: 20, palast: 16, kathedrale: 14, kasse: 900000 });
  const e = jahrDurch(spiel);
  const k = e.zeremonien.find(x => x.art === 'kaiser');
  assert.ok(k, 'es gibt eine Kroenung');
  assert.equal(k.vorgaenger, Ruhm.ERSTER_KAISER, 'beim ersten Mal der Eintrag von der Diskette');
  assert.equal(k.kurz, 'KARL VON PREUSSEN');
  assert.equal(spiel.sieger, 'p0');
  assert.equal(spiel.phase, 'ende');
  assert.equal(Ruhm.letzterKaiser(), 'KARL VON PREUSSEN', 'die Halle kennt ihn jetzt');
});

test('Der naechste Kaiser sieht den vorigen', () => {
  const spiel = runde(12);
  const s = spiel.spielerVon('p0');
  Object.assign(s, { titel: 8, land: 40000, maerkte: 30, muehlen: 20, palast: 16, kathedrale: 14, kasse: 900000 });
  const e = jahrDurch(spiel);
  const k = e.zeremonien.find(x => x.art === 'kaiser');
  assert.equal(k.vorgaenger, 'KARL VON PREUSSEN', 'der aus dem vorigen Test');
  assert.equal(Ruhm.halle()[0].jahr, spiel.jahr);
  assert.equal(Ruhm.halle().length, 2);
});

test('Bankrott erzeugt eine Zeremonie', () => {
  const spiel = runde(5);
  const s = spiel.spielerVon('p0');
  s.kasse = -500000;
  const e = jahrDurch(spiel);
  const z = e.zeremonien.find(x => x.art === 'bankrott');
  assert.ok(z, 'es gibt eine Bankrottzeremonie');
  assert.match(z.anrede, /KARL VON PREUSSEN/);
  assert.match(e.meldungen.map(m => m.text).join(' '), /Sie sind leider Bankrott/);
});

test('Die Amtsenthebung erzeugt eine Zeremonie mit dem Grund', () => {
  const spiel = runde(9);
  const s = spiel.spielerVon('p0');
  s.land = 100; s.einwohner = 3000; s.kasse = 0;
  const e = jahrDurch(spiel);
  const z = e.zeremonien.find(x => x.art === 'amtsenthebung');
  assert.ok(z, 'es gibt eine Enthebungszeremonie');
  assert.match(z.text, /Wegen schlechter Landpolitik/);
  assert.match(z.text, /1 Jahr Ihres Amtes enthoben worden/);
});

test('Ein ruhiges Jahr bringt keine Zeremonie', () => {
  const spiel = runde(7);
  const e = jahrDurch(spiel);
  assert.deepEqual(e.zeremonien, []);
});
