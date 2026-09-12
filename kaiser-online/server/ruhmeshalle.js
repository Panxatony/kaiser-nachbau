// Die Ruhmeshalle: wer schon einmal Kaiser war.
//
// Das Original schreibt den Namen des neuen Kaisers in eine Datei auf der
// Diskette und zeigt beim naechsten Mal den bisherigen Rekordhalter:
//
//   753 ... OPEN2,8,2,"Ö by sir ali*,s,r":INPUT#2,b$ ...
//   756     PRINTTAB(10)"Der letzte Kaiser des"
//   759     OPEN2,8,2,"@:Ö by sir ali*,s,w":PRINT#2,e$;" VON ";d$
//
// Auf der mitgelieferten Diskette steht dort POWER C. VON PREUSSEN. Wir
// halten es genauso, nur in JSON und mit Jahr und Rundennamen dazu.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Den Datenordner selbst bestimmen statt aus speicher.js zu holen: sonst
// entstuende ein Ringschluss speicher -> game -> ruhmeshalle -> speicher.
const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = process.env.KAISER_DATEN || path.join(HIER, '..', 'daten');
const DATEI = path.join(WURZEL, 'ruhmeshalle.json');

/** Der Eintrag von der Originaldiskette, solange noch niemand gekroent wurde. */
export const ERSTER_KAISER = 'POWER C. VON PREUSSEN';

function lesen() {
  try {
    const d = JSON.parse(fs.readFileSync(DATEI, 'utf8'));
    if (Array.isArray(d.kaiser)) return d;
  } catch { /* noch keine Halle */ }
  return { kaiser: [] };
}

/** Wer zuletzt gekroent wurde. Liefert den Diskettenwert, wenn noch niemand. */
export function letzterKaiser() {
  const d = lesen();
  return d.kaiser.length ? d.kaiser[d.kaiser.length - 1].anrede : ERSTER_KAISER;
}

/** Die ganze Halle, neueste zuerst. */
export function halle() {
  return lesen().kaiser.slice().reverse();
}

/**
 * Traegt einen neuen Kaiser ein und liefert den Vorgaenger, genau wie das
 * Original: erst lesen, dann ueberschreiben.
 */
export function kroenen({ anrede, name, region, jahr, runde }) {
  const vorher = letzterKaiser();
  const d = lesen();
  d.kaiser.push({ anrede, name, region, jahr, runde, gekroent: Date.now() });
  if (d.kaiser.length > 200) d.kaiser.shift();
  try {
    fs.mkdirSync(WURZEL, { recursive: true });
    fs.writeFileSync(DATEI, JSON.stringify(d, null, 2));
  } catch (e) {
    console.error('Ruhmeshalle nicht schreibbar:', e.message);
  }
  return vorher;
}
