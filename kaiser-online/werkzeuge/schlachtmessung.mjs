// Misst den Ausgang vieler Schlachten zwischen zwei gleich starken Fuersten.
//
//   node werkzeuge/schlachtmessung.mjs [schlachten]
//
// Dient als Vorher-Nachher-Probe, wenn am Schlachtfeld oder am Kampf etwas
// geaendert wird. Beide Seiten ueberlassen die Aufstellung dem Feldherrn.
//
// Achtung, alter Fehler: NICHT erst aufstellen() und dann schlacht() rufen --
// schlacht() stellt selbst auf, jede Einheit staende zweimal auf dem Feld.
import * as B from '../server/battle.js';
import * as R from '../server/rules.js';
import { regelwerk } from '../server/regelwerk.js';

const N = Number(process.argv[2]) || 400;

function fuerst(name, region) {
  const s = R.neuerSpieler(name, name, false, region);
  Object.assign(s, { land: 30000, einwohner: 6000, kasse: 50000, maerkte: 20, muehlen: 10,
                     palast: 8, kathedrale: 4, kavallerie: 8, artillerie: 6, infanterie: 10, moral: 1 });
  R.armeeAktualisieren(s);
  return s;
}

for (const id of ['original', 'neu']) {
  const regeln = regelwerk(id);
  const sum = { land: 0, sieg: 0, vA: 0, vV: 0, maerkte: 0, muehlen: 0, palast: 0, kathedrale: 0 };
  for (let n = 0; n < N; n++) {
    const a = fuerst('A', 0), v = fuerst('V', 1);
    const rnd = R.makeRng(5000 + n * 13);
    const feld = B.feldAufbauen(a, v, rnd);
    const e = B.schlacht(a, v, feld, rnd, [], [], regeln);
    sum.land += e.landAngreifer; if (e.landAngreifer > 0) sum.sieg++;
    const zahl = x => x.kavallerie + x.artillerie + x.infanterie + x.miliz;
    sum.vA += zahl(e.verluste[0]); sum.vV += zahl(e.verluste[1]);
    for (const k of ['maerkte', 'muehlen', 'palast', 'kathedrale']) sum[k] += Math.trunc(e.gebaeude[1][k]);
  }
  const m = x => (x / N).toFixed(2).padStart(9);
  console.log(`${regeln.name}, ${N} Schlachten, je 24 Einheiten plus Miliz`);
  console.log(`  Angreifer gewinnt Land in ${(100 * sum.sieg / N).toFixed(0)} %, im Mittel ${Math.round(sum.land / N)} ha`);
  console.log(`  Verluste Einheiten   Angreifer${m(sum.vA)}   Verteidiger${m(sum.vV)}`);
  console.log(`  Schaden beim Verteidiger: Maerkte${m(sum.maerkte)} Muehlen${m(sum.muehlen)} Palast${m(sum.palast)} Kathedrale${m(sum.kathedrale)}`);
}
