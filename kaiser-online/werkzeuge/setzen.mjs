// Setzt fuer einen Spieler eine Aufstellung, damit sich die Anzeige pruefen laesst.
//   node werkzeuge/setzen.mjs <Rundenname> <Spielername>
import { anmelden, warte } from './verbindung.mjs';

const rundenName = process.argv[2] || 'Aufstellprobe';
const spielerName = process.argv[3] || 'KARL';
const c = await anmelden(spielerName, 'werkzeug', { still: true });
await warte(300);

const r = c.lobby.runden.find(x => x.name === rundenName || x.id === rundenName);
if (!r || !r.dabei) { console.log('Keine eigene Runde:', rundenName); process.exit(1); }
c.sende('spielOeffnen', { spielId: r.id });
for (let i = 0; i < 40 && !c.zustand; i++) await warte(100);

const k = c.zustand.kriege.find(x => x.beteiligt && x.feld);
if (!k) { console.log('Kein eigener Krieg in der Diplomatiephase.'); process.exit(1); }

const frei = [];
for (let z = 0; z < 76 && frei.length < k.einheiten.length; z++) {
  if (k.feld[z * 40 + k.spalte] === 32 && k.feld[z * 40 + k.spalte + 1] === 32) frei.push(z);
}
const aufstellung = k.einheiten.map((gattung, i) => ({ gattung, zeile: frei[i] })).filter(e => e.zeile !== undefined);
c.aktion('aufstellung', { aufstellung });
console.log(`${aufstellung.length} Einheiten gesetzt, Zeilen ${aufstellung[0].zeile} bis ${aufstellung[aufstellung.length - 1].zeile}`);
await warte(600);
process.exit(0);
