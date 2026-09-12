// Bestaetigt fuer alle genannten Spieler die Diplomatiephase.
//   node werkzeuge/bereit.mjs <Rundenname> [Spielername...]
import { anmelden, warte } from './verbindung.mjs';

const rundenName = process.argv[2] || 'Aufstellprobe';
const namen = process.argv.slice(3);

for (const name of namen.length ? namen : ['KARL', 'MARIA', 'OTTO']) {
  const c = await anmelden(name, 'werkzeug', { still: true });
  await warte(250);
  const r = c.lobby.runden.find(x => x.name === rundenName || x.id === rundenName);
  if (!r || !r.dabei) { console.log(`${name}: kein Platz in ${rundenName}`); c.schliessen(); continue; }
  c.sende('spielOeffnen', { spielId: r.id });
  for (let i = 0; i < 40 && !c.zustand; i++) await warte(100);
  c.aktion('bereit');
  await warte(400);
  c.schliessen();
}
console.log('Alle bestaetigt.');
process.exit(0);
