// Legt eine Demorunde an, spielt sie mit vernuenftiger Strategie bis zum Titel
// Baron und fuehrt dann Krieg. Damit lassen sich Jahresbericht und Schlachtfeld
// im Browser ansehen.
//
//   node werkzeuge/kriegsdemo.mjs [Rundenname]
//
import { anmelden, rundeBetreten, warte } from './verbindung.mjs';
const rundenName = process.argv[2] || 'Kriegsprobe';
const int = Math.trunc;

const spieler = [
  await anmelden('KARL', 'werkzeug'),
  await anmelden('MARIA', 'werkzeug'),
  await anmelden('OTTO', 'werkzeug')
];

await rundeBetreten(spieler[0], rundenName, {
  weiblich: false, planungsSekunden: 1800, diplomatieSekunden: 900
});
await warte(300);
await rundeBetreten(spieler[1], rundenName, { weiblich: true });
await rundeBetreten(spieler[2], rundenName, { weiblich: false });
await warte(300);
spieler[0].sende('starten');
await warte(500);
const akt = (c, a, d = {}) => c.aktion(a, d);

/** Ein Jahr mit vorsichtiger Haushaltsfuehrung. */
async function jahrSpielen(kriegVon = null, kriegGegen = null) {
  for (const c of spieler) {
    const z = c.zustand.runde;
    if (!z || z.aussetzen || z.fertig) continue;
    let ich = c.zustand.ich;
    const bedarf = ich.bedarf;

    if (ich.korn < bedarf * 3 && ich.kasse > 6000) {
      const bezahlbar = int((ich.kasse - 5000) * 1000 / Math.max(1, z.markt.kornpreis));
      const menge = Math.min(bedarf * 3 - ich.korn, bezahlbar, bedarf * 3);
      if (menge > 0) { akt(c, 'kornKaufen', { menge }); await warte(70); }
    }
    ich = c.zustand.ich;
    const zielLand = Math.max(ich.einwohner * 2, Math.min(ich.einwohner * 5, 60000));
    if (ich.land < zielLand && ich.kasse > 12000) {
      const menge = Math.min(zielLand - ich.land, int((ich.kasse - 10000) / Math.max(0.1, z.markt.landpreis)));
      if (menge > 0) { akt(c, 'landKaufen', { menge }); await warte(70); }
    }
    ich = c.zustand.ich;
    const menge = Math.max(int(ich.korn / 5), Math.min(int(bedarf * 1.3), int(ich.korn * 0.8)));
    akt(c, 'kornVerteilen', { menge }); await warte(100);
    akt(c, 'steuernSetzen', { zoll: 28, mwst: 12, est: 8, justiz: 2 }); await warte(60);
    akt(c, 'steuernEinziehen'); await warte(100);

    for (let i = 0; i < 3; i++) {
      ich = c.zustand.ich;
      const d = int(ich.land / 1000);
      if (ich.kasse > 120000 && ich.land >= 25000 && ich.kathedrale < 14 && d >= 24) akt(c, 'bauen', { was: 'kathedrale' });
      else if (ich.kasse > 80000 && ich.land >= 13000 && ich.palast < 16 && d >= 12) akt(c, 'bauen', { was: 'palast' });
      else if (ich.kasse > 45000 && ich.muehlen < 15 && ich.muehlen + 1 < d) akt(c, 'bauen', { was: 'muehle' });
      else if (ich.kasse > 30000 && ich.maerkte < 30 && ich.maerkte + 1 < d) akt(c, 'bauen', { was: 'markt' });
      else break;
      await warte(70);
    }
    for (const gattung of ['kavallerie', 'artillerie', 'infanterie']) {
      ich = c.zustand.ich;
      const preis = { kavallerie: z.preise.kavallerie + 600, artillerie: z.preise.artillerie + 400, infanterie: z.preise.infanterie + 200 }[gattung];
      if (ich.kasse > preis + 25000) { akt(c, 'truppenKaufen', { gattung }); await warte(70); }
    }
    if (kriegVon === c.name && kriegGegen) { akt(c, 'kriegErklaeren', { ziel: kriegGegen }); await warte(90); }
    akt(c, 'zugBeenden'); await warte(100);
  }
  await warte(350);
}

for (let i = 0; i < 45; i++) {
  await jahrSpielen();
  const ich = spieler[0].zustand.ich;
  if (ich.titel >= 3 && ich.kavallerie >= 3 && ich.artillerie >= 2 && ich.infanterie >= 3) break;
}
let ich = spieler[0].zustand.ich;
console.log(`Aufbau fertig: ${ich.anrede} | Jahr ${spieler[0].zustand.jahr} | Land ${ich.land} Kasse ${ich.kasse}`);
console.log(`Truppen KARL: Kav ${ich.kavallerie} Art ${ich.artillerie} Inf ${ich.infanterie} Miliz ${ich.miliz}`);

await jahrSpielen('KARL', 'MARIA');
await warte(400);
const s = spieler[0].zustand;
if (s.phase === 'diplomatie' && s.kriege.length) {
  akt(spieler[2], 'haltung', { kriegId: s.kriege[0].id, haltung: 2 }); await warte(250);
  for (const c of spieler) { akt(c, 'bereit'); await warte(200); }
}
await warte(800);
const b = spieler[0].zustand.letzterBericht;
console.log('Phase:', spieler[0].zustand.phase, '| Kriege im Bericht:', b ? b.kriege.length : 0);
if (b && b.kriege[0]) {
  const k = b.kriege[0];
  console.log(`Schlacht ${k.angreifer} gegen ${k.verteidiger}: Landverschiebung ${k.landAngreifer}, Feld ${k.feld.length} Zeichen`);
}
console.log(`Im Browser: als KARL mit der Geheimzahl "werkzeug" anmelden, dann "${rundenName}" öffnen.`);
await warte(1800000);
