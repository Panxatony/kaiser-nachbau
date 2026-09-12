import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Spiel } from '../server/game.js';
import * as R from '../server/rules.js';

function runde(seed = 1, optionen = {}) {
  const spiel = new Spiel({ id: 'v', seed, planungsSekunden: 0, diplomatieSekunden: 0, ...optionen });
  spiel.beitreten({ id: 'p0', name: 'PASSIV', weiblich: false, region: 0 });
  spiel.starten();
  return spiel;
}

/** Zwei Spieler, damit ein Aussetzjahr nicht sofort übersprungen wird. */
function rundeZuZweit(seed = 1) {
  const spiel = new Spiel({ id: 'v2', seed, planungsSekunden: 0, diplomatieSekunden: 0 });
  spiel.beitreten({ id: 'p0', name: 'PASSIV', weiblich: false, region: 0 });
  spiel.beitreten({ id: 'p1', name: 'ANDERER', weiblich: false, region: 1 });
  spiel.starten();
  return spiel;
}

test('Wer alles dem Verwalter überlässt, überlebt und wird nicht enthoben', () => {
  for (const seed of [1, 7, 42, 2026, 31337]) {
    const spiel = runde(seed);
    const s = spiel.spielerVon('p0');
    let enthebungen = 0;
    for (let i = 0; i < 30; i++) {
      if (spiel.zustand['p0'] && spiel.zustand['p0'].aussetzen) enthebungen++;
      spiel.aktion('p0', 'zugBeenden');
    }
    assert.equal(enthebungen, 0, `Seed ${seed}: ${enthebungen} Amtsenthebungen`);
    assert.ok(s.einwohner > 500, `Seed ${seed}: nur noch ${s.einwohner} Einwohner`);
    assert.ok(s.land >= s.einwohner, `Seed ${seed}: Land ${s.land} unter Einwohnern ${s.einwohner}`);
  }
});

test('Der Verwalter kauft Korn, wenn die Reserve den Bedarf nicht deckt', () => {
  const spiel = runde(5);
  const s = spiel.spielerVon('p0');
  const z = spiel.zustand['p0'];
  // Knappe Reserve, volle Kasse
  s.korn = 1000;
  s.kasse = 60000;
  const bedarf = z.markt.bedarf;
  assert.ok(s.korn < bedarf, 'Ausgangslage: die Reserve reicht nicht');

  const gekauft = spiel.verwalterKauftKorn(s, z);
  assert.ok(gekauft > 0, 'es wurde Korn gekauft');
  assert.ok(s.korn * 0.8 >= bedarf, `nach dem Kauf decken 80 Prozent den Bedarf: ${s.korn} gegen ${bedarf}`);
  assert.ok(s.kasse > 0, 'die Kasse bleibt im Plus');
});

test('Der Verwalter kauft nicht bis zum Bankrott', () => {
  const spiel = runde(5);
  const s = spiel.spielerVon('p0');
  const z = spiel.zustand['p0'];
  s.korn = 0;
  s.kasse = 5000;
  const vorher = s.kasse;
  spiel.verwalterKauftKorn(s, z);
  assert.ok(s.kasse >= R.int(vorher * 0.2) - 1,
    `mindestens ein Fünftel bleibt stehen: ${s.kasse} von ${vorher}`);
  assert.ok(s.kasse > 0);
});

test('Ohne Geld kann der Verwalter nichts ausrichten', () => {
  const spiel = runde(5);
  const s = spiel.spielerVon('p0');
  const z = spiel.zustand['p0'];
  s.korn = 100;
  s.kasse = 0;
  assert.equal(spiel.verwalterKauftKorn(s, z), 0);
  assert.equal(s.korn, 100, 'nichts gekauft');
});

test('Der Verwalter kauft Land, wenn sonst die Amtsenthebung droht', () => {
  const spiel = runde(5);
  const s = spiel.spielerVon('p0');
  const z = spiel.zustand['p0'];
  s.land = 1000;
  s.einwohner = 3000;
  s.kasse = 90000;
  const gekauft = spiel.verwalterKauftLand(s, z);
  assert.ok(gekauft > 0);
  assert.ok(s.land > s.einwohner, `Land ${s.land} über Einwohnern ${s.einwohner}`);
});

test('Reicht das Land, kauft der Verwalter keines dazu', () => {
  const spiel = runde(5);
  const s = spiel.spielerVon('p0');
  const z = spiel.zustand['p0'];
  const vorher = s.land;
  assert.equal(spiel.verwalterKauftLand(s, z), 0);
  assert.equal(s.land, vorher);
});

test('Der Verwalter meldet, was er getan hat', () => {
  const spiel = runde(5);
  const s = spiel.spielerVon('p0');
  s.korn = 500;
  s.kasse = 80000;
  spiel.aktion('p0', 'zugBeenden');
  const meldungen = spiel.zustand['p0'] ? [] : [];
  // Die Runde ist schon weiter; der Bericht des Vorjahres trägt die Meldung
  const bericht = spiel.letzterBericht.spieler.find(x => x.id === 'PASSIV' || x.name === 'PASSIV');
  const text = bericht.meldungen.map(m => m.text).join(' ');
  assert.match(text, /Ihr Verwalter hat/);
  assert.match(text, /Korn zugekauft/);
  assert.match(text, /Korn an das Volk verteilt/);
  assert.match(text, /Steuern eingezogen/);
});

test('Wer selbst alles erledigt, bekommt keine Verwaltermeldung', () => {
  const spiel = runde(5);
  const s = spiel.spielerVon('p0');
  spiel.aktion('p0', 'kornVerteilen', { menge: R.int(s.korn / 2) });
  spiel.aktion('p0', 'steuernEinziehen');
  spiel.aktion('p0', 'zugBeenden');
  const bericht = spiel.letzterBericht.spieler[0];
  const text = bericht.meldungen.map(m => m.text).join(' ');
  assert.ok(!/Ihr Verwalter/.test(text), 'kein Verwalter nötig: ' + text);
});

test('Der Grund der Amtsenthebung steht auch im Aussetzjahr', () => {
  const spiel = rundeZuZweit(9);
  const s = spiel.spielerVon('p0');
  // Land unter die Einwohnerzahl drücken, Kasse leer, damit der Verwalter
  // nichts ausrichten kann
  s.land = 100;
  s.einwohner = 3000;
  s.kasse = 0;
  const jahrDerEnthebung = spiel.jahr;
  spiel.aktion('p0', 'zugBeenden');
  spiel.aktion('p1', 'zugBeenden');
  assert.equal(s.gesperrtBis, jahrDerEnthebung + 2, 'wie im Original: Jahr + 2');
  assert.ok(s.enthebungsGrund);

  const z = spiel.zustand['p0'];
  assert.equal(z.aussetzen, true, 'das Folgejahr fällt aus');
  const text = z.meldungen.map(m => m.text).join(' ');
  assert.match(text, /Landpolitik/, 'der Grund steht dabei: ' + text);
  assert.match(text, /setzen dieses Jahr aus/);
});

test('Die Enthebung kostet genau ein Jahr, danach ist der Grund weg', () => {
  const spiel = rundeZuZweit(9);
  const s = spiel.spielerVon('p0');
  s.land = 100; s.einwohner = 3000; s.kasse = 0;
  spiel.aktion('p0', 'zugBeenden');
  spiel.aktion('p1', 'zugBeenden');
  assert.equal(spiel.zustand['p0'].aussetzen, true);

  // Das Aussetzjahr durchlaufen: der Aussetzende ist schon fertig
  spiel.aktion('p1', 'zugBeenden');
  assert.equal(spiel.zustand['p0'].aussetzen, false, 'danach wieder im Amt');
  assert.equal(s.enthebungsGrund, null, 'der Grund ist abgelegt');
});

test('Sitzen alle aus, bleibt die Runde nicht stehen', () => {
  // Ohne Frist und mit nur einem Spieler gab es sonst kein Weiterkommen
  const spiel = runde(9, { planungsSekunden: 0 });
  const s = spiel.spielerVon('p0');
  s.land = 100; s.einwohner = 3000; s.kasse = 0;
  const jahr = spiel.jahr;
  spiel.aktion('p0', 'zugBeenden');
  assert.equal(spiel.jahr, jahr + 2, 'das Aussetzjahr wird übersprungen');
  assert.equal(spiel.zustand['p0'].aussetzen, false, 'der Fürst ist wieder am Zug');
});
