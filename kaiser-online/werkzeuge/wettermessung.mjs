// Misst, wie weit zwei Fuersten mit derselben Strategie auseinanderlaufen --
// je nachdem, wie viel vom Wetter jeder fuer sich wuerfelt.
//
//   node werkzeuge/wettermessung.mjs [runden] [jahre]
//
// Grundlage fuer Regel 8 der Fassung 2026 (server/regelwerk.js). Laeuft ohne
// Server. Beide Fuersten spielen die vorsichtige Strategie aus sim.mjs.
import { Spiel } from '../server/game.js';
import * as R from '../server/rules.js';
import { regelwerk } from '../server/regelwerk.js';

const RUNDEN = Number(process.argv[2]) || 150;
const JAHRE = Number(process.argv[3]) || 50;

function zug(spiel, id) {
  const s = spiel.spielerVon(id);
  const z = spiel.zustand[id];
  if (!z || z.aussetzen || z.fertig) return;
  const bedarf = R.kornBedarf(s);
  if (s.korn < bedarf * 3 && s.kasse > 5000) {
    const bezahlbar = Math.trunc((s.kasse - 5000) * 1000 / Math.max(1, z.markt.kornpreis));
    const menge = Math.min(bedarf * 3 - s.korn, bezahlbar, bedarf * 3);
    if (menge > 0) spiel.aktion(id, 'kornKaufen', { menge });
  }
  const zielLand = Math.max(s.einwohner * 2, Math.min(s.einwohner * 5, 60000));
  if (s.land < zielLand && s.kasse > 12000) {
    const menge = Math.min(zielLand - s.land, Math.trunc((s.kasse - 10000) / Math.max(0.1, z.markt.landpreis)));
    if (menge > 0) spiel.aktion(id, 'landKaufen', { menge });
  }
  const menge = Math.max(Math.trunc(s.korn / 5), Math.min(Math.trunc(bedarf * 1.3), Math.trunc(s.korn * 0.8)));
  if (spiel.aktion(id, 'kornVerteilen', { menge }).fehler) { spiel.aktion(id, 'zugBeenden'); return; }
  spiel.aktion(id, 'steuernSetzen', { zoll: 28, mwst: 12, est: 8, justiz: 2 });
  spiel.aktion(id, 'steuernEinziehen');
  for (let i = 0; i < 4; i++) {
    const d = Math.trunc(s.land / 1000);
    if (s.kasse > 120000 && s.land >= 25000 && s.kathedrale < 14 && d >= 24) spiel.aktion(id, 'bauen', { was: 'kathedrale' });
    else if (s.kasse > 80000 && s.land >= 13000 && s.palast < 16 && d >= 12) spiel.aktion(id, 'bauen', { was: 'palast' });
    else if (s.kasse > 40000 && s.muehlen < 15 && s.muehlen + 1 < d) spiel.aktion(id, 'bauen', { was: 'muehle' });
    else if (s.kasse > 25000 && s.maerkte < 30 && s.maerkte + 1 < d) spiel.aktion(id, 'bauen', { was: 'markt' });
    else break;
  }
  spiel.aktion(id, 'zugBeenden');
}

function lauf(seed, wetterImReich, wetterAbweichung, faeuleImReich) {
  const spiel = new Spiel({ id: 'messung', seed, regelwerk: 'neu', planungsSekunden: 0, diplomatieSekunden: 0 });
  // Die Variante ueber das Regelwerk legen, nur fuer diesen einen Lauf.
  Object.defineProperty(spiel, 'regeln', { value: { ...regelwerk('neu'), wetterImReich, wetterAbweichung, faeuleImReich } });
  spiel.beitreten({ id: 'a', name: 'ANTON', weiblich: false, region: 0 });
  spiel.beitreten({ id: 'b', name: 'BERTA', weiblich: true, region: 1 });
  spiel.starten();
  for (let j = 0; j < JAHRE; j++) {
    const jahr = spiel.jahr;
    zug(spiel, 'a'); zug(spiel, 'b');
    // Ohne Krieg geht es von selbst weiter; sonst die Diplomatie bestaetigen.
    if (spiel.jahr === jahr) { spiel.aktion('a', 'bereit'); spiel.aktion('b', 'bereit'); }
    if (spiel.phase === 'ende') break;          // gekroent oder alle ausgeschieden
    if (spiel.jahr === jahr) throw new Error('Die Runde geht nicht weiter, Phase ' + spiel.phase);
  }
  const [a, b] = [spiel.spielerVon('a'), spiel.spielerVon('b')];
  return { a: a.titel, b: b.titel, landA: a.land, landB: b.land };
}

const VARIANTEN = [
  ['jeder fuer sich (Original)', false, 0, false],
  ['Reich, keine Abweichung', true, 0, true],
  ['Reich, Abweichung in 1 von 5 Jahren', true, 0.2, true],
  ['Reich, Abweichung in 1 von 3 Jahren', true, 1 / 3, true],
  ['Reich, Abweichung in 1 von 2 Jahren', true, 0.5, true],
  ['Reich, Abweichung in 2 von 3 Jahren', true, 2 / 3, true],
  ['1 von 3, aber Faeule je Fuerst', true, 1 / 3, false]
];

console.log(`${RUNDEN} Runden zu ${JAHRE} Jahren, zwei Fuersten, dieselbe Strategie\n`);
console.log('Variante'.padEnd(38) + 'Titelabst.  >=4 Stufen  einer<=3  Landabstand  Titel im Mittel');
for (const [name, reich, g, faeule] of VARIANTEN) {
  let abstand = 0, weit = 0, haengt = 0, land = 0, titel = 0;
  for (let n = 0; n < RUNDEN; n++) {
    const e = lauf(1000 + n * 7, reich, g, faeule);
    const d = Math.abs(e.a - e.b);
    abstand += d; if (d >= 4) weit++;
    if (Math.min(e.a, e.b) <= 3) haengt++;
    land += Math.abs(e.landA - e.landB);
    titel += (e.a + e.b) / 2;
  }
  const p = x => (100 * x / RUNDEN).toFixed(0).padStart(3) + ' %';
  console.log(name.padEnd(38) + (abstand / RUNDEN).toFixed(2).padStart(8) + '    ' + p(weit) + '       ' + p(haengt) +
    '   ' + String(Math.round(land / RUNDEN)).padStart(8) + ' ha' + (titel / RUNDEN).toFixed(2).padStart(12));
}
