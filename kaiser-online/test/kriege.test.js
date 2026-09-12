import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Spiel, PHASEN, HALTUNG } from '../server/game.js';
import * as R from '../server/rules.js';

function aufgestellt(n, seed = 5150) {
  const s = new Spiel({ id: 'k', seed, planungsSekunden: 0, diplomatieSekunden: 0 });
  for (let i = 0; i < n; i++) s.beitreten({ id: 'p' + i, name: 'F' + i, weiblich: false, region: i });
  s.starten();
  for (const p of s.spieler) {
    p.titel = 5; p.kavallerie = 4; p.artillerie = 3; p.infanterie = 6;
    p.maerkte = 10; p.muehlen = 4; p.palast = 6; p.kathedrale = 3;
    R.armeeAktualisieren(p);
  }
  return s;
}
function zug(spiel, id, extra = () => {}) {
  const z = spiel.zustand[id];
  if (!z || z.aussetzen || z.fertig) return;
  const s = spiel.spielerVon(id);
  spiel.aktion(id, 'kornVerteilen', { menge: Math.max(R.int(s.korn / 5), Math.min(R.kornBedarf(s), R.int(s.korn * 0.8))) });
  if (spiel.zustand[id].fertig) return;
  spiel.aktion(id, 'steuernEinziehen');
  extra(spiel, id);
  spiel.aktion(id, 'zugBeenden');
}
const bereit = spiel => spiel.spieler.forEach(p => spiel.aktion(p.id, 'bereit'));

test('Zwei Kriege in derselben Runde werden beide ausgewertet', () => {
  const spiel = aufgestellt(4);
  zug(spiel, 'p0', (s, id) => s.aktion(id, 'kriegErklaeren', { ziel: 'p1' }));
  zug(spiel, 'p2', (s, id) => s.aktion(id, 'kriegErklaeren', { ziel: 'p3' }));
  zug(spiel, 'p1'); zug(spiel, 'p3');
  assert.equal(spiel.phase, PHASEN.DIPLOMATIE);
  assert.equal(spiel.kriege.length, 2, 'Beide Kriege stehen an');
  bereit(spiel);
  assert.equal(spiel.letzterBericht.kriege.length, 2, 'Beide werden abgerechnet');
  for (const k of spiel.letzterBericht.kriege) assert.ok(k.feld, 'Jede Schlacht hat ein Feld');
});

test('Gegenseitige Kriegserklaerung ergibt eine einzige Schlacht', () => {
  const spiel = aufgestellt(2);
  zug(spiel, 'p0', (s, id) => s.aktion(id, 'kriegErklaeren', { ziel: 'p1' }));
  zug(spiel, 'p1', (s, id) => s.aktion(id, 'kriegErklaeren', { ziel: 'p0' }));
  assert.equal(spiel.kriege.length, 1, 'Nur eine Schlacht');
  bereit(spiel);
  assert.equal(spiel.letzterBericht.kriege.length, 1);
});

test('Ein Spieler kann nur einen Krieg pro Runde erklaeren', () => {
  const spiel = aufgestellt(3);
  const s = spiel.spielerVon('p0');
  spiel.aktion('p0', 'kornVerteilen', { menge: R.int(s.korn / 2) });
  spiel.aktion('p0', 'steuernEinziehen');
  spiel.aktion('p0', 'kriegErklaeren', { ziel: 'p1' });
  spiel.aktion('p0', 'kriegErklaeren', { ziel: 'p2' });
  spiel.aktion('p0', 'zugBeenden');
  zug(spiel, 'p1'); zug(spiel, 'p2');
  assert.equal(spiel.kriege.length, 1, 'Die zweite Erklaerung ersetzt die erste');
  assert.equal(spiel.kriege[0].verteidiger, 'p2');
});

test('Ohne Durchmarsch ist ein entfernter Gegner unerreichbar', () => {
  // Tirol (Index 6) und Flandern (Index 8) sind keine Nachbarn.
  const spiel = new Spiel({ id: 'w', seed: 3, planungsSekunden: 0, diplomatieSekunden: 0 });
  spiel.beitreten({ id: 'a', name: 'TIROLER', weiblich: false, region: 6 });
  spiel.beitreten({ id: 'b', name: 'FLAME', weiblich: false, region: 8 });
  for (const r of [0, 1, 2, 3, 4]) spiel.beitreten({ id: 'x' + r, name: 'SPERRE' + r, weiblich: false, region: r });
  spiel.starten();
  for (const p of spiel.spieler) { p.titel = 5; p.infanterie = 4; R.armeeAktualisieren(p); }

  zug(spiel, 'a', (s, id) => s.aktion(id, 'kriegErklaeren', { ziel: 'b' }));
  for (const p of spiel.spieler) zug(spiel, p.id);
  // Alle Dritten bleiben neutral, verweigern also den Durchmarsch
  bereit(spiel);
  const k = spiel.letzterBericht.kriege[0];
  assert.ok(k.abgebrochen, 'Der Angriff muss scheitern');
  assert.match(k.text, /versperrt/);
});

test('Mit Durchmarsch findet der Angriff seinen Weg', () => {
  const spiel = new Spiel({ id: 'w2', seed: 3, planungsSekunden: 0, diplomatieSekunden: 0 });
  spiel.beitreten({ id: 'a', name: 'TIROLER', weiblich: false, region: 6 });
  spiel.beitreten({ id: 'b', name: 'FLAME', weiblich: false, region: 8 });
  spiel.beitreten({ id: 'c', name: 'BAYER', weiblich: false, region: 2 });
  spiel.beitreten({ id: 'd', name: 'PFAELZER', weiblich: false, region: 7 });
  spiel.starten();
  for (const p of spiel.spieler) { p.titel = 5; p.infanterie = 4; p.kavallerie = 2; R.armeeAktualisieren(p); }
  zug(spiel, 'a', (s, id) => s.aktion(id, 'kriegErklaeren', { ziel: 'b' }));
  for (const p of spiel.spieler) zug(spiel, p.id);
  for (const p of ['c', 'd']) spiel.aktion(p, 'haltung', { kriegId: spiel.kriege[0].id, haltung: HALTUNG.DURCHMARSCH });
  bereit(spiel);
  const k = spiel.letzterBericht.kriege[0];
  assert.ok(!k.abgebrochen, 'Der Angriff muss stattfinden');
  assert.ok(k.pfad.length >= 3, 'Der Weg fuehrt ueber Dritte: ' + k.pfad.join(' -> '));
});

test('Ein starker Angreifer gewinnt Land, ein schwacher verliert es', () => {
  let stark = 0, schwach = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const spiel = aufgestellt(2, seed);
    const a = spiel.spielerVon('p0'), v = spiel.spielerVon('p1');
    a.kavallerie = 12; a.artillerie = 8; a.infanterie = 14; a.moral = 1.8;
    v.kavallerie = 1; v.artillerie = 1; v.infanterie = 2; v.moral = 0.6;
    R.armeeAktualisieren(a); R.armeeAktualisieren(v);
    const vorher = a.land;
    zug(spiel, 'p0', (s, id) => s.aktion(id, 'kriegErklaeren', { ziel: 'p1' }));
    zug(spiel, 'p1');
    bereit(spiel);
    if (spiel.spielerVon('p0').land > vorher) stark++; else schwach++;
  }
  assert.ok(stark >= 10, `Der uebermaechtige Angreifer sollte fast immer gewinnen, gewann aber nur ${stark} von 12`);
});

test('Der Jahresbericht nennt auch, was ausser Soldaten zu Bruch ging', () => {
  // Zeile 316 bis 329 des Originals: Maerkte, Muehlen, Palast, Kathedrale,
  // Einwohner und Staatskasse, je Seite.
  const spiel = aufgestellt(2, 4242);
  zug(spiel, 'p0', (s, id) => s.aktion(id, 'kriegErklaeren', { ziel: 'p1' }));
  zug(spiel, 'p1');
  bereit(spiel);
  const k = spiel.letzterBericht.kriege[0];
  for (const feld of ['gebaeude', 'einwohner', 'kasse']) {
    assert.ok(Array.isArray(k[feld]) && k[feld].length === 2, `${feld} steht fuer beide Seiten drin`);
  }
  for (const seite of k.gebaeude) {
    for (const bau of ['maerkte', 'muehlen', 'palast', 'kathedrale']) {
      assert.equal(typeof seite[bau], 'number', `${bau} ist eine Zahl`);
    }
  }
  assert.equal(typeof k.praemie, 'number', 'die Siegpraemie steht dabei');
});
