// Reine Logik der Truppenaufstellung, ohne Bezug zum Browser.
// Dadurch laesst sie sich ohne Oberflaeche testen.

export const ZEILEN = 76;
export const SPALTEN = 40;

// Wo eine Seite aufstellen darf. Im Original ist der Cursor zweidimensional
// beweglich: Zeile 368 und 370 lassen den Angreifer von Spalte 13 aus nach
// links bis an den Rand und nach rechts bis an die Grenze, Zeile 384 und 385
// spiegeln das fuer den Verteidiger. Zeile 98 und 103 sperren die oberste und
// die unterste Feldzeile.
export const AUFSTELLUNG = {
  angreifer:   { von: 0, bis: 18 },
  verteidiger: { von: 21, bis: SPALTEN - 2 },
  ersteZeile: 1,
  letzteZeile: ZEILEN - 2
};
export const GATTUNGEN = ['kavallerie', 'artillerie', 'infanterie', 'miliz'];
export const GATTUNGSNAMEN = {
  kavallerie: 'Kavallerie', artillerie: 'Artillerie',
  infanterie: 'Infanterie', miliz: 'Miliz'
};
// Zeichenpaare des Verteidigers; der Angreifer benutzt 225+2b und 226+2b
const ZEICHEN = {
  kavallerie: [109, 110], artillerie: [113, 114],
  infanterie: [103, 104], miliz: [105, 106]
};

/** Zeichenpaar [links, rechts] einer Gattung. */
export function zeichenPaar(gattung, istAngreifer) {
  const b = GATTUNGEN.indexOf(gattung) + 1;
  return istAngreifer ? [225 + 2 * b, 226 + 2 * b] : ZEICHEN[gattung];
}

/**
 * Reihenfolge der Gattungen beim Aufstellen, BASIC-Zeile 354: es wird immer
 * die niedrigste noch vorhandene Gattung gesetzt. Das Handbuch sagt dasselbe:
 * "Zuerst werden also die Kavallerieeinheiten aufgestellt, dann folgen die
 * Artillerie, die Infantrie und die Miliz."
 */
export function naechsteGattung(z) {
  for (const g of GATTUNGEN) if (z.vorrat.includes(g)) return g;
  return null;
}

/** Baut den Aufstellungszustand aus der Kriegssicht des Servers. */
export function zustandAus(krieg) {
  const z = {
    kriegId: krieg.id,
    istAngreifer: krieg.istAngreifer,
    spalte: krieg.spalte,
    grenzspalte: krieg.grenzspalte ? Array.from(krieg.grenzspalte) : null,
    grund: Uint8Array.from(krieg.feld),
    vorrat: [...krieg.einheiten],
    gesetzt: (krieg.aufstellung || []).map(e => ({ spalte: krieg.spalte, ...e })),
    gewaehlt: null,
    // Der Gegner stellt auf demselben Feld auf und ist dabei zu sehen
    gegnerSpalte: krieg.gegnerSpalte ?? null,
    gegnerEinheiten: krieg.gegnerEinheiten || [],
    gegnerAufstellung: (krieg.gegnerAufstellung || []).map(e => ({ ...e }))
  };
  for (const e of z.gesetzt) {
    const i = z.vorrat.indexOf(e.gattung);
    if (i >= 0) z.vorrat.splice(i, 1);
  }
  z.gewaehlt = naechsteGattung(z);
  return z;
}

/** Rechnet eine Mausposition in eine Feldzeile um. */
export function zeileAusKlick(klickY, oben, hoehe, zeilen = ZEILEN) {
  if (!(hoehe > 0)) return -1;
  const z = Math.floor((klickY - oben) / hoehe * zeilen);
  return z >= 0 && z < zeilen ? z : -1;
}

/** Rechnet eine Mausposition in eine Feldspalte um. */
export function spalteAusKlick(klickX, links, breite, spalten = SPALTEN) {
  if (!(breite > 0)) return -1;
  const c = Math.floor((klickX - links) / breite * spalten);
  return c >= 0 && c < spalten ? c : -1;
}

/** Der erlaubte Spaltenbereich der eigenen Seite. */
export function spaltenbereich(z) {
  return AUFSTELLUNG[z.istAngreifer ? 'angreifer' : 'verteidiger'];
}

/** Passt eine Spalte in den erlaubten Bereich ein. */
export function spalteEinpassen(z, spalte) {
  const g = spaltenbereich(z);
  return Math.max(g.von, Math.min(g.bis, Math.trunc(spalte)));
}

/**
 * Die Spalte, in die der Feldherr in dieser Zeile stellen wuerde: drei Spalten
 * vor der feindlichen Grenze, eingepasst in den erlaubten Bereich. Das ist
 * dieselbe Rechnung wie in server/battle.js (FELDHERR_ABSTAND). Kennt der
 * Client den Grenzverlauf nicht, bleibt es bei der Startspalte des Cursors.
 */
export const FELDHERR_ABSTAND = 3;
export function feldherrSpalte(z, zeile) {
  if (!z.grenzspalte) return z.spalte;
  const g = z.grenzspalte[Math.max(0, Math.min(ZEILEN - 1, zeile))];
  if (g == null) return z.spalte;
  return spalteEinpassen(z, z.istAngreifer ? g - FELDHERR_ABSTAND : g + FELDHERR_ABSTAND);
}

/** Ist das Feldpaar an dieser Stelle frei, Gelaende wie eigene Einheiten? */
export function feldFrei(z, zeile, spalte) {
  if (zeile < AUFSTELLUNG.ersteZeile || zeile > AUFSTELLUNG.letzteZeile) return false;
  const g = spaltenbereich(z);
  if (spalte < g.von || spalte > g.bis) return false;
  const i = zeile * SPALTEN + spalte;
  if (z.grund[i] !== 32 || z.grund[i + 1] !== 32) return false;
  return !z.gesetzt.some(e => e.zeile === zeile &&
    Math.abs((e.spalte ?? z.spalte) - spalte) < 2);
}

/**
 * Behandelt einen Klick auf eine Zeile.
 * Liefert {geaendert, fehler}. Eine besetzte Zeile gibt die Einheit zurueck,
 * eine freie nimmt die gewaehlte Gattung auf.
 */
export function klick(z, zeile, spalte) {
  if (zeile < 0 || zeile >= ZEILEN) return { geaendert: false };
  const c = spalteEinpassen(z, spalte == null ? z.spalte : spalte);

  // Auf eine besetzte Stelle geklickt: die Einheit kommt zurueck
  const vorhanden = z.gesetzt.findIndex(e =>
    e.zeile === zeile && Math.abs((e.spalte ?? z.spalte) - c) < 2);
  if (vorhanden >= 0) {
    z.vorrat.push(z.gesetzt[vorhanden].gattung);
    z.gesetzt.splice(vorhanden, 1);
    z.gewaehlt = naechsteGattung(z);
    return { geaendert: true };
  }

  // Die Gattung ist nicht frei waehlbar, es kommt immer die naechste an die
  // Reihe, wie im Original.
  z.gewaehlt = naechsteGattung(z);
  if (!z.gewaehlt) return { geaendert: false, fehler: 'Alle Einheiten stehen schon.' };
  const i = z.vorrat.indexOf(z.gewaehlt);
  if (!feldFrei(z, zeile, c)) {
    return { geaendert: false, fehler: 'Dort ist kein Platz für eine Einheit.' };
  }
  z.vorrat.splice(i, 1);
  z.gesetzt.push({ gattung: z.gewaehlt, zeile, spalte: c });
  z.gewaehlt = naechsteGattung(z);
  return { geaendert: true };
}

/**
 * Verteilt die uebrigen Einheiten gleichmaessig auf freie Zeilen, und zwar
 * grenznah wie der Feldherr. Frueher landete alles in der Startspalte des
 * Cursors; das war die schlechteste Stellung des ganzen Feldes.
 */
export function restVerteilen(z) {
  if (!z.vorrat.length) return { geaendert: false };
  const frei = [];
  for (let r = AUFSTELLUNG.ersteZeile; r <= AUFSTELLUNG.letzteZeile; r++) {
    if (feldFrei(z, r, feldherrSpalte(z, r))) frei.push(r);
  }
  if (!frei.length) return { geaendert: false, fehler: 'Keine freie Zeile mehr.' };

  const rest = [...z.vorrat];
  z.vorrat = [];
  const schritt = frei.length / (rest.length + 1);
  for (let i = 0; i < rest.length; i++) {
    let k = Math.min(frei.length - 1, Math.round((i + 1) * schritt));
    let gefunden = -1;
    for (let versuch = 0; versuch < frei.length; versuch++) {
      const kandidat = frei[(k + versuch) % frei.length];
      if (feldFrei(z, kandidat, feldherrSpalte(z, kandidat))) { gefunden = kandidat; break; }
    }
    if (gefunden < 0) { z.vorrat.push(rest[i]); continue; }
    z.gesetzt.push({ gattung: rest[i], zeile: gefunden, spalte: feldherrSpalte(z, gefunden) });
  }
  z.gesetzt.sort((a, b) => a.zeile - b.zeile);
  z.gewaehlt = naechsteGattung(z);
  return { geaendert: true };
}

/** Nimmt alle Einheiten zurueck. */
export function alleZurueck(z) {
  for (const e of z.gesetzt) z.vorrat.push(e.gattung);
  z.gesetzt = [];
  z.gewaehlt = naechsteGattung(z);
  return { geaendert: true };
}

/**
 * Baut das anzuzeigende Feld: Gelaende, eigene Einheiten und die des Gegners.
 * Im Original stehen beide Parteien auf demselben Bildschirm, nichts ist
 * verdeckt.
 */
export function anzeigeFeld(z) {
  const feld = Uint8Array.from(z.grund);
  const setzen = (liste, standard, angreifer) => {
    if (standard == null) return;
    for (const e of liste) {
      const c = e.spalte ?? standard;
      const [links, rechts] = zeichenPaar(e.gattung, angreifer);
      feld[e.zeile * SPALTEN + c] = links;
      feld[e.zeile * SPALTEN + c + 1] = rechts;
    }
  };
  setzen(z.gegnerAufstellung || [], z.gegnerSpalte, !z.istAngreifer);
  setzen(z.gesetzt, z.spalte, z.istAngreifer);
  return feld;
}

/**
 * Zaehlt Einheiten je Gattung in einer Liste von Gattungsnamen.
 *
 * Gezaehlt werden nur die vier bekannten Gattungen. Die Liste kommt vom
 * Server; wuerde sie einen anderen Schluessel tragen, etwa "__proto__",
 * landete er sonst als Eigenschaft in einem gewoehnlichen Objekt.
 */
export function zaehlen(liste) {
  const n = Object.create(null);
  for (const g of GATTUNGEN) n[g] = 0;
  for (const g of liste || []) if (g in n) n[g] += 1;
  return n;
}

/** Zaehlt die uebrigen Einheiten je Gattung. */
export function offeneEinheiten(z) {
  return zaehlen(z.vorrat);
}
