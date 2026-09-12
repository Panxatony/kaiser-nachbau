// Schreibt die letzte Schlacht einer Runde als JSON.
//   node werkzeuge/schlachtDump.mjs <Rundenname> <Spielername> <Zieldatei>
import fs from 'node:fs';
import { anmelden, warte } from './verbindung.mjs';

const rundenName = process.argv[2] || 'Aufstellprobe';
const spielerName = process.argv[3] || 'KARL';
const ziel = process.argv[4] || 'schlacht.json';
const c = await anmelden(spielerName, 'werkzeug', { still: true });
await warte(300);

const r = c.lobby.runden.find(x => x.name === rundenName || x.id === rundenName);
if (!r || !r.dabei) { console.log('Keine eigene Runde:', rundenName); process.exit(1); }
c.sende('spielOeffnen', { spielId: r.id });
for (let i = 0; i < 40 && !c.zustand; i++) await warte(100);

const b = c.zustand.letzterBericht;
if (!b || !b.kriege.length) { console.log('Keine Schlacht im letzten Bericht.'); process.exit(1); }
const k = b.kriege[0];
fs.writeFileSync(ziel, JSON.stringify({
  angreifer: k.angreifer, verteidiger: k.verteidiger, landAngreifer: k.landAngreifer,
  startbild: k.startbild, aufzeichnung: k.aufzeichnung, feld: k.feld
}));
console.log(`${ziel}: ${k.aufzeichnung.length} Einzelbilder, ${Math.round(fs.statSync(ziel).size / 1024)} KB`);
process.exit(0);
