// Langzeitsimulation mit vorsichtiger Strategie.
//
// Mit REGELN=neu laeuft sie unter der Fassung 2026, sonst unter dem Original:
//   REGELN=neu node werkzeuge/sim.mjs
import { Spiel } from '../server/game.js';
import * as R from '../server/rules.js';

function lauf(seed, jahre = 200, still = true) {
  const spiel = new Spiel({ id: 'sim', seed, regelwerk: process.env.REGELN, planungsSekunden: 0, diplomatieSekunden: 0 });
  spiel.beitreten({ id: 'p0', name: 'STRATEGE', weiblich: false, region: 0 });
  spiel.starten();
  const s = spiel.spielerVon('p0');
  let letzterTitel = 1, enthebungen = 0;

  for (let jahr = 0; jahr < jahre; jahr++) {
    const z = spiel.zustand['p0'];
    if (!z || z.aussetzen) { enthebungen++; continue; }
    const bedarf = R.kornBedarf(s);

    // Korn ist die Lebensgrundlage: Reserve auf das Dreifache des Bedarfs bringen
    if (s.korn < bedarf * 3 && s.kasse > 5000) {
      const bezahlbar = Math.trunc((s.kasse - 5000) * 1000 / Math.max(1, z.markt.kornpreis));
      const menge = Math.min(bedarf * 3 - s.korn, bezahlbar, bedarf * 3);
      if (menge > 0) spiel.aktion('p0', 'kornKaufen', { menge });
    }
    // Land nur so weit, wie die Bevoelkerung es bestellen kann, aber nie unter der Einwohnerzahl
    const zielLand = Math.max(s.einwohner * 2, Math.min(s.einwohner * 5, 60000));
    if (s.land < zielLand && s.kasse > 12000) {
      const menge = Math.min(zielLand - s.land, Math.trunc((s.kasse - 10000) / Math.max(0.1, z.markt.landpreis)));
      if (menge > 0) spiel.aktion('p0', 'landKaufen', { menge });
    }

    const menge = Math.max(Math.trunc(s.korn / 5), Math.min(Math.trunc(bedarf * 1.3), Math.trunc(s.korn * 0.8)));
    if (spiel.aktion('p0', 'kornVerteilen', { menge }).fehler) { spiel.aktion('p0', 'zugBeenden'); continue; }
    spiel.aktion('p0', 'steuernSetzen', { zoll: 28, mwst: 12, est: 8, justiz: 2 });
    spiel.aktion('p0', 'steuernEinziehen');

    for (let i = 0; i < 4; i++) {
      const d = Math.trunc(s.land / 1000);
      if (s.kasse > 120000 && s.land >= 25000 && s.kathedrale < 14 && d >= 24) spiel.aktion('p0', 'bauen', { was: 'kathedrale' });
      else if (s.kasse > 80000 && s.land >= 13000 && s.palast < 16 && d >= 12) spiel.aktion('p0', 'bauen', { was: 'palast' });
      else if (s.kasse > 40000 && s.muehlen < 15 && s.muehlen + 1 < d) spiel.aktion('p0', 'bauen', { was: 'muehle' });
      else if (s.kasse > 25000 && s.maerkte < 30 && s.maerkte + 1 < d) spiel.aktion('p0', 'bauen', { was: 'markt' });
      else break;
    }
    spiel.aktion('p0', 'zugBeenden');

    if (s.titel !== letzterTitel) {
      if (!still) console.log(`Jahr ${spiel.jahr - 1}: ${R.anrede(s)} | Land ${s.land} Kasse ${s.kasse} Einw ${s.einwohner} M ${s.maerkte} Mü ${s.muehlen} P ${s.palast} K ${s.kathedrale}`);
      letzterTitel = s.titel;
    }
    if (s.kaiser) return { jahr: spiel.jahr - 1, titel: s.titel, enthebungen, kaiser: true };
  }
  return { jahr: spiel.jahr, titel: s.titel, enthebungen, kaiser: false, land: s.land, einw: s.einwohner, kasse: s.kasse };
}

lauf(2026, 200, false);
console.log('---');
for (const seed of [1, 7, 99, 2026, 31337]) {
  const e = lauf(seed, 200);
  console.log(`Seed ${seed}: Titelstufe ${e.titel} nach ${e.jahr - 1700} Jahren, ${e.enthebungen} Amtsenthebungen${e.kaiser ? ' -> KAISER' : ` (Land ${e.land}, Einw ${e.einw})`}`);
}
