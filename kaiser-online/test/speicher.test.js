import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.KAISER_DATEN = fs.mkdtempSync(path.join(os.tmpdir(), 'kaiser-'));
const { sichern, laden } = await import('../server/speicher.js');
const { Spiel } = await import('../server/game.js');
const R = await import('../server/rules.js');

test('Spielstand ueberlebt Sichern und Laden', () => {
  const spiel = new Spiel({ id: 'sicher', seed: 4711, planungsSekunden: 0, diplomatieSekunden: 0 });
  spiel.beitreten({ id: 'p0', name: 'ANNA', weiblich: true, region: 0 });
  spiel.beitreten({ id: 'p1', name: 'BERND', weiblich: false, region: 1 });
  spiel.starten();
  const s = spiel.spielerVon('p0');
  spiel.aktion('p0', 'kornVerteilen', { menge: R.int(s.korn / 2) });
  spiel.aktion('p0', 'steuernEinziehen');
  spiel.aktion('p0', 'bauen', { was: 'markt' });
  const kasseVorher = s.kasse, maerkteVorher = s.maerkte;

  assert.ok(sichern(spiel), 'Sichern muss gelingen');
  const geladen = laden('sicher');
  assert.ok(geladen, 'Laden muss gelingen');
  assert.equal(geladen.jahr, spiel.jahr);
  assert.equal(geladen.phase, spiel.phase);
  assert.equal(geladen.spieler.length, 2);
  const g = geladen.spielerVon('p0');
  assert.equal(g.kasse, kasseVorher);
  assert.equal(g.maerkte, maerkteVorher);
  assert.equal(R.anrede(g), R.anrede(s));

  // Die geladene Partie muss weiterspielbar sein
  const s1 = geladen.spielerVon('p1');
  assert.ok(!geladen.aktion('p1', 'kornVerteilen', { menge: R.int(s1.korn / 2) }).fehler);
  geladen.aktion('p1', 'steuernEinziehen');
  geladen.aktion('p1', 'zugBeenden');
  geladen.aktion('p0', 'zugBeenden');
  assert.equal(geladen.jahr, spiel.jahr + 1, 'Das Jahr laeuft weiter');
});

test('Unbekannter Spielstand liefert null', () => {
  assert.equal(laden('gibtesnicht'), null);
});
