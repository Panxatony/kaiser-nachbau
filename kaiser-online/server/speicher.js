// Spielstände auf die Platte schreiben, damit Partien über Tage laufen können
// und ein Serverneustart sie nicht verliert.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Spiel } from './game.js';
import { makeRng, steuerFaktoren } from './rules.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
// Spielstaende liegen in einem eigenen Unterordner, damit sie sich nicht mit
// anderen Daten wie der Kontenliste vermischen.
export const DATENWURZEL = process.env.KAISER_DATEN || path.join(HIER, '..', 'daten');
export const ORDNER = path.join(DATENWURZEL, 'spiele');

/** Rundenzustand ohne die nicht serialisierbaren Teile. */
function rundeSichern(z) {
  const { rnd, ...rest } = z;
  return { ...rest, rndZaehler: z.rndZaehler || 0 };
}

export function sichern(spiel) {
  try {
    fs.mkdirSync(ORDNER, { recursive: true });
    const daten = {
      version: 1,
      id: spiel.id, name: spiel.name, jahr: spiel.jahr, phase: spiel.phase,
      angelegt: spiel.angelegt || null, angelegtVon: spiel.angelegtVon || null,
      gestartet: spiel.gestartet, sieger: spiel.sieger, seed: spiel.seed,
      regelwerk: spiel.regelwerkId,
      rundenNr: spiel.rundenNr, frist: spiel.frist,
      planungsSekunden: spiel.planungsSekunden, diplomatieSekunden: spiel.diplomatieSekunden,
      spieler: spiel.spieler,
      // Das Gelaende der laufenden Diplomatiephase muss mitgesichert werden,
      // damit die Aufstellung nach einem Neustart weitergeht
      kriege: spiel.kriege || [],
      zustand: Object.fromEntries(Object.entries(spiel.zustand).map(([k, v]) => [k, rundeSichern(v)])),
      // Der letzte Bericht wird ohne die grossen Felddaten gesichert
      letzterBericht: spiel.letzterBericht ? {
        ...spiel.letzterBericht,
        kriege: spiel.letzterBericht.kriege.map(
          ({ feld, ereignisse, startbild, aufzeichnung, ...rest }) => rest)
      } : null
    };
    const ziel = path.join(ORDNER, spiel.id.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json');
    fs.writeFileSync(ziel + '.tmp', JSON.stringify(daten));
    fs.renameSync(ziel + '.tmp', ziel);
    return true;
  } catch (e) {
    console.error('Spielstand konnte nicht gesichert werden:', e.message);
    return false;
  }
}

export function laden(id) {
  const datei = path.join(ORDNER, id.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json');
  if (!fs.existsSync(datei)) return null;
  try {
    const d = JSON.parse(fs.readFileSync(datei, 'utf8'));
    if (!d || d.version !== 1 || !Array.isArray(d.spieler)) {
      console.error(`${datei} ist kein Spielstand, wird uebergangen.`);
      return null;
    }
    const spiel = new Spiel({ id: d.id, name: d.name, seed: d.seed, regelwerk: d.regelwerk });
    Object.assign(spiel, {
      jahr: d.jahr, phase: d.phase, gestartet: d.gestartet, sieger: d.sieger,
      rundenNr: d.rundenNr, frist: d.frist, spieler: d.spieler, kriege: d.kriege,
      planungsSekunden: d.planungsSekunden, diplomatieSekunden: d.diplomatieSekunden,
      letzterBericht: d.letzterBericht,
      angelegt: d.angelegt || null, angelegtVon: d.angelegtVon || null
    });
    // Zufallsgeneratoren der laufenden Runde neu erzeugen
    spiel.zustand = {};
    for (const [k, v] of Object.entries(d.zustand || {})) {
      const s = spiel.spielerVon(k);
      spiel.zustand[k] = { ...v, rnd: makeRng(d.seed + d.rundenNr * 1000 + (s ? s.region : 0)) };
    }
    return spiel;
  } catch (e) {
    console.error('Spielstand konnte nicht geladen werden:', e.message);
    return null;
  }
}

/** Loescht einen gesicherten Spielstand. */
export function loeschen(id) {
  const datei = path.join(ORDNER, id.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json');
  try { if (fs.existsSync(datei)) fs.unlinkSync(datei); return true; }
  catch (e) { console.error('Spielstand konnte nicht geloescht werden:', e.message); return false; }
}

export function alleIds() {
  try {
    return fs.readdirSync(ORDNER).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
  } catch { return []; }
}
