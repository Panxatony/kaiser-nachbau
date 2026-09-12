import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Spiel, HALTUNG } from '../server/game.js';
import { REGIONEN } from '../server/data.js';

/** Eine Runde mit Spielern in bestimmten Fürstentümern. */
function runde(regionen, seed = 5) {
  const spiel = new Spiel({ id: 'w', seed, planungsSekunden: 0, diplomatieSekunden: 0 });
  regionen.forEach((r, i) => spiel.beitreten({ id: 'p' + i, name: 'F' + i, weiblich: false, region: r }));
  spiel.starten();
  for (const s of spiel.spieler) { s.titel = 3; s.land = 30000; s.kasse = 50000; }
  return spiel;
}

/** Führt einen Krieg aus und liefert das Ergebnis. */
function krieg(spiel, von, gegen, haltungen = {}) {
  spiel.aktion(von, 'kriegErklaeren', { ziel: gegen });
  for (const s of spiel.spieler) spiel.aktion(s.id, 'zugBeenden');
  for (const [id, h] of Object.entries(haltungen)) {
    spiel.aktion(id, 'haltung', { kriegId: spiel.kriege[0].id, haltung: h });
  }
  for (const s of spiel.spieler) spiel.aktion(s.id, 'bereit');
  return (spiel.letzterBericht.kriege || [])[0];
}

// -------------------------------------------------- leere Fuerstentuemer

test('Ein leeres Fürstentum dazwischen sperrt den Weg', () => {
  // Zeile 264: unbesetzte Regionen sind neutral, und neutral heißt gesperrt.
  // Preussen (0) und Bayern (2) haben keine gemeinsame Grenze.
  const spiel = runde([0, 2]);
  const e = krieg(spiel, 'p0', 'p1');
  assert.ok(e.abgebrochen, 'der Feldzug kommt nicht zustande');
  assert.match(e.text, /Alle Wege nach BAYERN sind versperrt/);
});

test('Ein unmittelbarer Nachbar ist immer erreichbar', () => {
  // Zeile 269 und 451: ein Weg der Länge zwei braucht keine Erlaubnis.
  const spiel = runde([0, 1]);   // Preussen und Hessen grenzen aneinander
  const e = krieg(spiel, 'p0', 'p1');
  assert.ok(!e.abgebrochen, 'der Feldzug läuft');
  assert.deepEqual(e.pfad, ['PREUSSEN', 'HESSEN']);
});

test('Wer Durchmarsch gewährt, öffnet den Weg', () => {
  const spiel = runde([0, 2, 1]);   // Preussen, Bayern, Hessen dazwischen
  const e = krieg(spiel, 'p0', 'p1', { p2: HALTUNG.DURCHMARSCH });
  assert.ok(!e.abgebrochen);
  assert.ok(e.pfad.includes('HESSEN'), 'der Weg führt durch Hessen: ' + e.pfad.join(' '));
});

test('Wer neutral bleibt, sperrt den Weg', () => {
  const spiel = runde([0, 2, 1]);
  const e = krieg(spiel, 'p0', 'p1', { p2: HALTUNG.NEUTRAL });
  assert.ok(e.abgebrochen, 'Hessen lässt niemanden durch');
});

// ------------------------------------------------------- Hilfstruppen

test('Ein Helfer muss selbst einen Weg zum Schlachtfeld haben', () => {
  // Zeile 278 und 446: der Helfer des Angreifers kommt nicht durch Länder,
  // die neutral sind oder zum Verteidiger halten.
  // Flandern (8) will Tirol (6) helfen, das Böhmen (3) angreift.
  const spiel = runde([6, 3, 8]);
  const e = krieg(spiel, 'p0', 'p1', { p2: HALTUNG.DURCHMARSCH_HILFE });
  const helfer = spiel.spielerVon('p2');
  assert.ok(e.nichtDurchgekommen.includes(helfer.name),
    'Flandern kommt nicht bis Böhmen: ' + JSON.stringify(e.nichtDurchgekommen));
  assert.ok(helfer.infanterie > 0, 'seine Truppen bleiben zu Hause');
});

test('Ein Nachbar des Verteidigers kommt immer zu Hilfe', () => {
  // Bayern (2) grenzt an Böhmen (3), kann also immer eingreifen.
  // Nach der Schlacht kommen die Truppen zurück (Zeile 331 bis 350),
  // deshalb wird hier die Moralmischung als Beleg genommen.
  const spiel = runde([6, 3, 2]);
  const helfer = spiel.spielerVon('p2');
  helfer.moral = 1.8;
  const e = krieg(spiel, 'p0', 'p1', { p2: HALTUNG.DURCHMARSCH_HILFE });
  assert.deepEqual(e.nichtDurchgekommen, [], 'niemand bleibt hängen');
  assert.ok(helfer.moral < 1.8, 'Bayern hat mitgekämpft und Moral abgegeben');
});

test('Beistand kostet auch Kampfgeist', () => {
  // Zeile 282: o(i)=o(c) zieht den Helfer auf die gemischte Moral herunter
  const spiel = runde([6, 3, 2]);
  const angreifer = spiel.spielerVon('p0');
  const helfer = spiel.spielerVon('p2');
  angreifer.moral = 0.4; helfer.moral = 1.6;
  krieg(spiel, 'p0', 'p1', { p2: HALTUNG.DURCHMARSCH_HILFE });
  assert.ok(helfer.moral < 1.6, 'die Moral des Helfers sinkt: ' + helfer.moral);
});
