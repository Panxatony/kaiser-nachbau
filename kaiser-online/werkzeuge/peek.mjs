// Zeigt den Stand einer Runde:  node werkzeuge/peek.mjs [Rundenname] [Spielername]
import { anmelden, warte } from './verbindung.mjs';

const rundenName = process.argv[2] || null;
const spielerName = process.argv[3] || 'KARL';
const c = await anmelden(spielerName, 'werkzeug', { still: true });
await warte(300);

if (!rundenName) {
  console.log('Runden in der Lobby:');
  for (const r of c.lobby.runden) {
    console.log(`  ${r.name}  (${r.id})  ${r.gestartet ? 'Anno ' + r.jahr + ', ' + r.phase : 'wartet'}  ${r.spielerzahl}/${r.maxSpieler}${r.dabei ? '  <- dabei' : ''}`);
  }
  process.exit(0);
}

const r = c.lobby.runden.find(x => x.name === rundenName || x.id === rundenName);
if (!r) { console.log('Runde nicht gefunden:', rundenName); process.exit(1); }
if (!r.dabei) {
  console.log(`${r.name}: ${r.gestartet ? 'Anno ' + r.jahr + ', ' + r.phase : 'wartet'}, ${r.spielerzahl}/${r.maxSpieler} Plätze`);
  console.log('Spieler:', r.spieler.map(s => `${s.name} (${s.region})`).join(', ') || 'niemand');
  process.exit(0);
}
c.sende('spielOeffnen', { spielId: r.id });
for (let i = 0; i < 40 && !c.zustand; i++) await warte(100);
const z = c.zustand;
console.log('Runde', z.name, '| Jahr', z.jahr, '| Phase', z.phase);
for (const p of z.spieler) {
  console.log(` ${p.name}: ${p.titel} Land ${p.land} Kasse ${p.kasse} Soldaten ${p.soldaten} ${p.fertig ? 'fertig' : 'plant'}`);
}
if (z.ich) console.log(` ${z.ich.name} Kav ${z.ich.kavallerie} Art ${z.ich.artillerie} Inf ${z.ich.infanterie} Titelstufe ${z.ich.titel}`);
process.exit(0);
