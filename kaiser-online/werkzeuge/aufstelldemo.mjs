// Bringt eine Runde bis in die Diplomatiephase mit offener Truppenaufstellung,
// damit sich die Aufstellungsoberflaeche im Browser ansehen laesst.
//
//   node werkzeuge/aufstelldemo.mjs [Rundenname] [--schlacht]
//
// Mit --schlacht wird die Schlacht gleich ausgetragen, sodass der Jahresbericht
// mit der Animation bereitsteht. Der Server muss mit KAISER_DEMO=1 laufen.
import { anmelden, rundeBetreten, warte } from './verbindung.mjs';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const rundenName = args[0] || 'Aufstellprobe';
const bisSchlacht = process.argv.includes('--schlacht');
const int = Math.trunc;

const spieler = [
  await anmelden('KARL', 'werkzeug'),
  await anmelden('MARIA', 'werkzeug'),
  await anmelden('OTTO', 'werkzeug')
];

await rundeBetreten(spieler[0], rundenName, {
  weiblich: false, planungsSekunden: 3600, diplomatieSekunden: 3600
});
await warte(300);
await rundeBetreten(spieler[1], rundenName, { weiblich: true });
await rundeBetreten(spieler[2], rundenName, { weiblich: false });
await warte(300);

spieler[0].sende('starten');
await warte(500);
console.log('Runde', rundenName, 'laeuft, Jahr', spieler[0].zustand.jahr);

// Alle bekommen sofort eine schlagkraeftige Armee (braucht KAISER_DEMO=1)
for (const c of spieler) {
  c.aktion('demoAufruesten', {
    titel: 5, kavallerie: 6, artillerie: 4, infanterie: 8,
    maerkte: 12, muehlen: 5, palast: 8, kathedrale: 4, kasse: 60000, moral: 1.3
  });
  await warte(150);
}
console.log('Armeen gestellt:', spieler.map(c => `${c.name} ${c.zustand.ich.soldaten} Soldaten`).join(', '));

async function zugMachen(c, krieg = null) {
  const z = c.zustand.runde;
  if (!z || z.aussetzen || z.fertig) return;
  const ich = c.zustand.ich;
  const menge = Math.max(int(ich.korn / 5), Math.min(ich.bedarf, int(ich.korn * 0.8)));
  c.aktion('kornVerteilen', { menge }); await warte(150);
  c.aktion('steuernEinziehen'); await warte(150);
  if (krieg) { c.aktion('kriegErklaeren', { ziel: krieg }); await warte(150); }
  c.aktion('zugBeenden'); await warte(150);
}

await zugMachen(spieler[0], 'MARIA');
await zugMachen(spieler[1]);
await zugMachen(spieler[2]);
await warte(700);

const s = spieler[0].zustand;
console.log('Phase:', s.phase, '| Kriege:', s.kriege.length);
if (s.kriege[0]) {
  const k = s.kriege[0];
  console.log(`Krieg ${k.angreifer} gegen ${k.verteidiger}`);
  console.log(`Eigene Einheiten: ${k.einheiten ? k.einheiten.length : 0} | Aufstellungsspalte ${k.spalte}`);
}

if (bisSchlacht && s.kriege[0]) {
  spieler[2].aktion('haltung', { kriegId: s.kriege[0].id, haltung: 2 }); await warte(250);
  for (const c of spieler) { c.aktion('bereit'); await warte(250); }
  await warte(900);
  const b = spieler[0].zustand.letzterBericht;
  if (b && b.kriege[0]) {
    const k = b.kriege[0];
    console.log(`Schlacht abgerechnet: Land ${k.landAngreifer}, ${k.aufzeichnung.length} Einzelbilder`);
  }
}
console.log('Im Browser: anmelden als KARL mit der Geheimzahl "werkzeug", dann die Runde öffnen.');
await warte(1800000);
