// Zeichnet das Schlachtfeld und spielt eine Schlacht als Animation nach.
// Das Feld ist wie im Original ein Raster aus 76 Zeilen zu 40 Spalten.

import { zeichensatzLaden, zeichenBunt, FARBEN } from './c64.js';

export const ZEILEN = 76;
export const SPALTEN = 40;
export const KACHEL = 8;

// Das Schlachtfeld benutzt den schmalen Zeichensatz bei $E400 im
// Multicolor-Textmodus. Kommando 24 ($A93D) setzt dafuer:
//
//   $D016 = $D8   Multicolor ein
//   $D022 = 7     gelb
//   $D023 = 5     gruen
//
// und das Farbschema der Schlacht (BASIC-Zeile 395, g=20, DATA-Zeile 983)
// setzt den Hintergrund auf 0, also schwarz.
export const GRUND = FARBEN[0];
const PAAR01 = FARBEN[7];
const PAAR10 = FARBEN[5];

// Die Scrollroutine $A9AC faerbt jede Zelle nach dem obersten Bit des
// Feldwerts: gesetzt heisst Angreifer und Farbe 10 (hellrot), sonst
// Verteidiger und Farbe 14 (hellblau). Das Zeichen selbst ist der Wert ohne
// dieses Bit; es ist also keine Inversschrift, sondern ein eigenes Zeichen.
const ANGREIFER = FARBEN[10];
const VERTEIDIGER = FARBEN[14];

/** Die Farbe der Zelle im Farb-RAM, also das Bitpaar 11. */
export function tileFarbe(code) {
  return code >= 128 ? ANGREIFER : VERTEIDIGER;
}

/** Die vier Farben eines Feldzeichens. */
function paare(code) {
  return [null, PAAR01, PAAR10, tileFarbe(code)];
}

export function zeichensatzBereit() {
  return zeichensatzLaden('assets/charset_map.png');
}

/** Malt eine einzelne Zelle des Feldes. */
export function zelleMalen(ctx, code, x, y, groesse = KACHEL) {
  zeichenBunt(ctx, code & 127, x, y, groesse, paare(code));
}

/** Zeichnet das ganze Feld neu. */
export function feldZeichnen(ctx, feld, groesse = KACHEL) {
  ctx.fillStyle = GRUND;
  ctx.fillRect(0, 0, SPALTEN * groesse, ZEILEN * groesse);
  for (let r = 0; r < ZEILEN; r++) {
    for (let c = 0; c < SPALTEN; c++) {
      const code = feld[r * SPALTEN + c];
      if (code === 32) continue;
      zelleMalen(ctx, code, c * groesse, r * groesse, groesse);
    }
  }
}

/** Zeichnet nur die angegebenen Felder neu. */
export function kachelnZeichnen(ctx, feld, indizes, groesse = KACHEL) {
  for (const i of indizes) {
    const r = Math.floor(i / SPALTEN), c = i % SPALTEN;
    ctx.fillStyle = GRUND;
    ctx.fillRect(c * groesse, r * groesse, groesse, groesse);
    const code = feld[i];
    if (code === 32) continue;
    zelleMalen(ctx, code, c * groesse, r * groesse, groesse);
  }
}

/**
 * Spielt eine Schlacht nach.
 * startbild ist das Feld vor dem ersten Zug, aufzeichnung eine Liste von
 * Einzelbildern; jedes Einzelbild ist eine flache Folge aus Feldindex und
 * neuem Zeichen.
 */
export class Nachspieler {
  constructor(ctx, startbild, aufzeichnung, groesse = KACHEL) {
    this.ctx = ctx;
    this.groesse = groesse;
    this.aufzeichnung = aufzeichnung || [];
    this.original = Uint8Array.from(startbild);
    this.feld = Uint8Array.from(startbild);
    this.bild = 0;
    this.laeuft = false;
    this.tempo = 24;          // Einzelbilder je Sekunde
    this.beiFortschritt = null;
    this._zeitgeber = null;
  }

  get anzahl() { return this.aufzeichnung.length; }

  neuZeichnen() { feldZeichnen(this.ctx, this.feld, this.groesse); }

  /** Springt an eine bestimmte Stelle der Aufzeichnung. */
  springen(bild) {
    bild = Math.max(0, Math.min(this.anzahl, Math.round(bild)));
    if (bild < this.bild) { this.feld = Uint8Array.from(this.original); this.bild = 0; }
    while (this.bild < bild) {
      const b = this.aufzeichnung[this.bild];
      for (let i = 0; i < b.length; i += 2) this.feld[b[i]] = b[i + 1];
      this.bild++;
    }
    this.neuZeichnen();
    if (this.beiFortschritt) this.beiFortschritt(this.bild, this.anzahl);
  }

  /** Ein Einzelbild weiter, zeichnet nur die geänderten Kacheln. */
  schritt() {
    if (this.bild >= this.anzahl) return false;
    const b = this.aufzeichnung[this.bild];
    const geaendert = [];
    for (let i = 0; i < b.length; i += 2) { this.feld[b[i]] = b[i + 1]; geaendert.push(b[i]); }
    this.bild++;
    kachelnZeichnen(this.ctx, this.feld, geaendert, this.groesse);
    if (this.beiFortschritt) this.beiFortschritt(this.bild, this.anzahl);
    return true;
  }

  starten() {
    if (this.laeuft) return;
    if (this.bild >= this.anzahl) this.springen(0);
    this.laeuft = true;
    const takt = () => {
      if (!this.laeuft) return;
      for (let i = 0; i < Math.max(1, Math.round(this.tempo / 24)); i++) {
        if (!this.schritt()) { this.anhalten(); return; }
      }
      this._zeitgeber = setTimeout(takt, 1000 / Math.min(this.tempo, 24));
    };
    takt();
  }

  anhalten() {
    this.laeuft = false;
    if (this._zeitgeber) { clearTimeout(this._zeitgeber); this._zeitgeber = null; }
  }

  zumEnde() { this.anhalten(); this.springen(this.anzahl); }
}
