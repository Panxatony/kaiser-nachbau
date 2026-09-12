// Schlacht von Kaiser, nach extracted/main_game.bas Zeile 148-250 und 395-431.
// Das Schlachtfeld ist wie im Original ein Zeichenraster aus 76 Zeilen zu 40 Spalten.
// Links steht der Angreifer, rechts der Verteidiger, dazwischen die Grenze.

import { int, armeeAktualisieren } from './rules.js';
import { STANDARD } from './regelwerk.js';

export const ZEILEN = 76;
export const SPALTEN = 40;
export const SPALTE_ANGREIFER = 13;    // Zeile 358 des Originals
export const SPALTE_VERTEIDIGER = 26;  // Zeile 372 des Originals
export const LEER = 32;
const VERSATZ = 128;   // Zeichen des Angreifers liegen 128 hoeher als die des Verteidigers

// Zeichencodes des Verteidigers (Angreifer = +128), aus dem Original

export const T = {
  ruine:      [97, 98],
  kavallerie: [109, 110],
  artillerie: [113, 114],
  infanterie: [103, 104],
  miliz:      [105, 106],
  markt:      [27, 28],
  marktGross: [29, 30],
  muehle:     [115, 116],
  baum:       [107, 108],
  baum2:      [117, 118],
  fluss:      [119, 120, 123, 0],
  grenze:     [240, 247, 248, 251, 128]
};

export const GATTUNGEN = ['kavallerie', 'artillerie', 'infanterie', 'miliz'];
// Verteidigungswert je Gattung, Zeile 172-174 und 219-221
const WEHRWERT = { kavallerie: 5, miliz: 1.5, infanterie: 1, artillerie: 0.6 };
// Angriffsstaerke und Reichweite, Zeile 158 und 203
const MARSCH = {
  angreifer: { kavallerie: { kraft: 2, weite: 19 }, infanterie: { kraft: 1, weite: 13 } },
  verteidiger: { kavallerie: { kraft: 2, weite: 20 }, infanterie: { kraft: 1, weite: 13 } }
};

const istGrenze = c => T.grenze.includes(c) || c === 239;
// Zeile 69 nennt 111, 0, 119, 120 und 123.
const istFluss  = c => c === 111 || c === 0 || c === 119 || c === 120 || c === 123;

/** Legt ein leeres Schlachtfeld an. */
function leeresFeld() {
  return { z: new Uint8Array(ZEILEN * SPALTEN).fill(LEER), grenzspalte: new Int8Array(ZEILEN) };
}
const idx = (r, c) => r * SPALTEN + c;
const lies = (f, r, c) => (c < 0 || c >= SPALTEN || r < 0 || r >= ZEILEN) ? 255 : f.z[idx(r, c)];

/**
 * Setzt ein Feld und schreibt die Aenderung in die Aufzeichnung, falls eine
 * laeuft. Daraus baut der Client spaeter die Schlachtanimation.
 */
function setz(f, r, c, v) {
  if (c < 0 || c >= SPALTEN || r < 0 || r >= ZEILEN) return;
  const i = idx(r, c);
  if (f.z[i] === v) return;
  f.z[i] = v;
  if (f.bild) f.bild.push(i, v);
}

/** Beginnt ein neues Einzelbild der Aufzeichnung. */
function bildAbschliessen(f) {
  if (!f.aufzeichnung || !f.bild || !f.bild.length) return;
  if (f.aufzeichnung.length < MAX_BILDER) f.aufzeichnung.push(f.bild);
  f.bild = [];
}
const MAX_BILDER = 4000;

/**
 * Baut das Schlachtfeld auf, Zeile 395-430.
 * angreifer und verteidiger sind Spielerobjekte.
 */
export function feldAufbauen(angreifer, verteidiger, rnd) {
  const f = leeresFeld();

  // Grenzverlauf um Spalte 19-21, Zeile 397-403
  let x = 20;
  for (let y = 0; y < ZEILEN; y++) {
    let i;
    do { i = int(rnd() * 3) - 1; } while ((i === -1 && x < 19) || (i === 1 && x > 21));
    if (i === -1) { setz(f, y, x - 1, 251); setz(f, y, x, 247); }
    else if (i === 0) { setz(f, y, x, 240); }
    else { setz(f, y, x, 248); setz(f, y, x + 1, 128); }
    f.grenzspalte[y] = x;
    x += i;
  }

  const seiten = [
    { s: angreifer, versatz: VERSATZ, spalte: 0 },
    { s: verteidiger, versatz: 0, spalte: 35 }
  ];
  for (const { s, versatz, spalte } of seiten) {
    // Hauptstadt, Zeile 405-407
    const zeile = int(rnd() * 67) + 4;
    const stadt = 'HAUPT', stadt2 = 'STADT';
    for (let i = 0; i < 5; i++) {
      setz(f, zeile, spalte + i, stadt.charCodeAt(i) - 64);
      setz(f, zeile + 1, spalte + i, stadt2.charCodeAt(i) - 64);
    }
    // Palast und Kathedrale, Zeile 408-412
    if (s.palast > 4)  { setz(f, zeile - 1, spalte, 60 + versatz); setz(f, zeile - 2, spalte, 34 + versatz); }
    if (s.palast > 10) { setz(f, zeile - 1, spalte + 2, 62 + versatz); setz(f, zeile - 2, spalte + 2, 36 + versatz); }
    if (s.kathedrale > 0)  { setz(f, zeile + 3, spalte, 37 + versatz); setz(f, zeile + 2, spalte, 42 + versatz); }
    if (s.kathedrale > 5)  { setz(f, zeile + 3, spalte + 1, 38 + versatz); setz(f, zeile + 2, spalte + 1, 31 + versatz); }
    if (s.kathedrale > 10) { setz(f, zeile + 3, spalte + 2, 39 + versatz); setz(f, zeile + 2, spalte + 2, 42 + versatz); }

    // Maerkte und Muehlen im eigenen Gebiet, Zeile 420-423
    const eigenesFeld = () => {
      for (let versuch = 0; versuch < 400; versuch++) {
        const r = int(rnd() * ZEILEN);
        const g = f.grenzspalte[r];
        const c = versatz ? int(rnd() * Math.max(1, g - 3)) : g + 3 + int(rnd() * Math.max(1, SPALTEN - g - 5));
        if (lies(f, r, c) === LEER && lies(f, r, c + 1) === LEER) return [r, c];
      }
      return null;
    };
    for (let i = 0; i < s.muehlen; i++) {
      const p = eigenesFeld(); if (!p) break;
      setz(f, p[0], p[1], T.muehle[0] + versatz); setz(f, p[0], p[1] + 1, T.muehle[1] + versatz);
    }
    for (let i = 0; i < s.maerkte; i++) {
      const p = eigenesFeld(); if (!p) break;
      setz(f, p[0], p[1], T.markt[0] + versatz); setz(f, p[0], p[1] + 1, T.markt[1] + versatz);
    }
  }

  // Fluesse, Baeume und Buschwerk, Zeile 424-429. Fuenf Durchgaenge, in
  // jedem ein Lauf vom linken und einer vom rechten Rand: zehn Fluesse.
  for (let i = 0; i < 5; i++) { flussZeichnen(f, rnd, true); flussZeichnen(f, rnd, false); }
  for (let i = 0; i < 110; i++) {
    const r = int(rnd() * ZEILEN), c = int(rnd() * (SPALTEN - 1));
    if (lies(f, r, c) === LEER && lies(f, r, c + 1) === LEER) { setz(f, r, c, 107); setz(f, r, c + 1, 108); }
  }
  for (let i = 0; i < 60; i++) {
    const r = int(rnd() * ZEILEN), c = int(rnd() * (SPALTEN - 1));
    if (lies(f, r, c) === LEER && lies(f, r, c + 1) === LEER) { setz(f, r, c, 117); setz(f, r, c + 1, 118); }
  }
  return f;
}

/**
 * Ein maeandernder Flusslauf, Zeile 81 bis 91.
 *
 * Der Lauf beginnt am Rand (Zeile 424 links, Zeile 425 rechts) und waehlt in
 * jedem Schritt eine von drei Richtungen. Geradeaus setzt ein einzelnes
 * waagerechtes Stueck; ein Knick setzt zwei Zeichen, eines an der Ecke und
 * eines in der neuen Zeile, und rueckt danach zwingend ein Feld zur Seite.
 * Abgebrochen wird am Rand, auf besetztem Feld oder mit drei Prozent je
 * Schritt (Zeile 81).
 */
function flussZeichnen(f, rnd, nachRechts) {
  const fa = nachRechts ? 1 : -1;
  // Zeile 424: f3=119, f4=0, f5=120, f6=123. Zeile 425 vertauscht sie.
  const [f3, f4, f5, f6] = nachRechts ? [119, 0, 120, 123] : [120, 123, 119, 0];
  let r = int(rnd() * ZEILEN);
  let c = nachRechts ? 0 : SPALTEN - 1;
  const ende = () => r < 0 || r >= ZEILEN || c < 0 || c >= SPALTEN
                     || lies(f, r, c) !== LEER || rnd() < 0.03;

  for (let schutz = 0; schutz < 500; schutz++) {
    const richtung = schutz === 0 ? 0 : int(rnd() * 3);   // Zeile 424 steigt bei 82 ein
    if (ende()) return;
    if (richtung === 0) {                  // geradeaus, Zeile 83
      setz(f, r, c, 111); c += fa;
    } else if (richtung === 1) {           // nach oben, Zeile 85 und 90
      setz(f, r, c, f3); r -= 1;
      if (ende()) return;
      setz(f, r, c, f6); c += fa;
    } else {                               // nach unten, Zeile 87 und 88
      setz(f, r, c, f4); r += 1;
      if (ende()) return;
      setz(f, r, c, f5); c += fa;
    }
  }
}

/** Einheitenliste eines Spielers in fester Reihenfolge. */
export function einheitenListe(spieler) {
  const bestand = {
    kavallerie: spieler.kavallerie, artillerie: spieler.artillerie,
    infanterie: spieler.infanterie, miliz: spieler.miliz
  };
  return GATTUNGEN.flatMap(g => Array(Math.max(0, int(bestand[g]))).fill(g));
}

/**
 * Truppen aufstellen. Der Aufstellcursor beginnt beim Angreifer in Spalte 13,
 * beim Verteidiger in Spalte 26 (Zeile 358 und 372 des Originals). verteilung
 * ist eine Liste {gattung, zeile, spalte}; fehlende Einheiten setzt der
 * Feldherr auf ein gemeinsames Zeilenraster nahe der feindlichen Grenze, damit
 * beide Seiten aufeinandertreffen (siehe FELDHERR_ABSTAND).
 */
/**
 * Der Bereich, in dem eine Seite aufstellen darf.
 *
 * Im Original ist der Aufstellcursor zweidimensional beweglich. Zeile 368 und
 * 370 lassen den Angreifer von Spalte 13 aus nach links bis an den Rand und
 * nach rechts bis an die Grenze; Zeile 384 und 385 spiegeln das fuer den
 * Verteidiger. Zeile 98 und 103 sperren die oberste und die unterste Zeile.
 */
export const AUFSTELLUNG = {
  angreifer:   { von: 0, bis: 18 },
  verteidiger: { von: 21, bis: SPALTEN - 2 },
  ersteZeile: 1,
  letzteZeile: ZEILEN - 2
};

/** Passt eine Spalte in den erlaubten Bereich der Seite ein. */
export function spalteEinpassen(spalte, istAngreifer) {
  const g = AUFSTELLUNG[istAngreifer ? 'angreifer' : 'verteidiger'];
  return Math.max(g.von, Math.min(g.bis, int(spalte)));
}

/**
 * Der Abstand, den der Feldherr zur feindlichen Grenze haelt, wenn er fuer
 * einen Spieler aufstellt, der selbst nicht aufgestellt hat.
 *
 * Das Original kennt keinen Feldherrn: dort steht der Aufstellcursor zu Beginn
 * auf Spalte 13 beziehungsweise 26, und jeder Spieler rueckt selbst vor. Wer
 * bei uns nichts tut oder die Frist verstreichen laesst, bekam seine Truppen
 * bisher genau in diese Startspalte gesetzt. Das ist die schlechteste aller
 * Stellungen, denn im Kampf gewinnt, wer naeher an der Grenze steht.
 *
 * Gemessen an je 40 Schlachten mit gleich starken Heeren (20 Einheiten je
 * Seite, Regelwerk Original):
 *
 *   Angreifer grenznah, Verteidiger auf Spalte 26   Angreifer siegt 31 mal
 *   beide grenznah                                  Angreifer siegt  2 mal
 *   Angreifer auf Spalte 13, Verteidiger grenznah   Angreifer siegt  1 mal
 *
 * Die Startspalte war also eine Falle fuer den, der sie nicht anruehrt, und
 * keine Regel. Der Feldherr stellt darum nahe der Grenze auf, in beiden
 * Regelwerken.
 *
 * Das Handbuch gibt den Rat selbst: "Beim Aufstellen der Truppen im Krieg
 * sollte man jede Einheit moeglichst nahe der feindlichen Grenze postieren."
 *
 * Drei Spalten, nicht null: der Grenzmaeander belegt je nach Schritt auch die
 * Spalte links oder rechts davon, und das Original selbst behandelt in Zeile
 * 420 bis 423 erst alles jenseits von drei Spalten als eigenes Gebiet, wenn es
 * Maerkte und Muehlen verteilt. Von Hand kann man noch etwas dichter heran;
 * das bleibt der Lohn dafuer, selbst aufzustellen.
 */
export const FELDHERR_ABSTAND = 3;

export function aufstellen(f, spieler, istAngreifer, verteilung, raster) {
  // Wo der Aufstellcursor des Originals steht. Nennt ein Spieler nur eine
  // Zeile und keine Spalte, bleibt die Einheit dort stehen.
  const vorgabe = istAngreifer ? SPALTE_ANGREIFER : SPALTE_VERTEIDIGER;
  const offen = einheitenListe(spieler);
  const gesetzt = [];
  const frei = (z, c) => lies(f, z, c) === LEER && lies(f, z, c + 1) === LEER;

  // Die Grenze maeandert, laeuft also in jeder Zeile anders. Der Feldherr
  // sucht darum seine Spalte fuer jede Zeile neu.
  const grenznah = z => {
    const g = f.grenzspalte[Math.max(0, Math.min(ZEILEN - 1, z))];
    return spalteEinpassen(istAngreifer ? g - FELDHERR_ABSTAND : g + FELDHERR_ABSTAND,
                           istAngreifer);
  };

  const platziere = (gattung, wunschZeile, wunschSpalte) => {
    const spalteZu = z => wunschSpalte == null
      ? grenznah(z)
      : spalteEinpassen(wunschSpalte, istAngreifer);
    let z = Math.max(AUFSTELLUNG.ersteZeile,
                     Math.min(AUFSTELLUNG.letzteZeile, int(wunschZeile)));
    let versuche = 0;
    const zeilen = AUFSTELLUNG.letzteZeile - AUFSTELLUNG.ersteZeile + 1;
    while (versuche < zeilen && !frei(z, spalteZu(z))) {
      z = AUFSTELLUNG.ersteZeile + ((z - AUFSTELLUNG.ersteZeile + 1) % zeilen);
      versuche++;
    }
    if (versuche >= zeilen) return false;
    const c = spalteZu(z);
    const [links, rechts] = zeichenPaar(gattung, istAngreifer);
    setz(f, z, c, links);
    setz(f, z, c + 1, rechts);
    gesetzt.push({ gattung, zeile: z, spalte: c });
    return true;
  };

  // Zuerst die vom Spieler gewuenschten Positionen
  const rest = [...offen];
  if (verteilung && verteilung.length) {
    for (const e of verteilung) {
      const i = rest.indexOf(e.gattung);
      const spalte = e.spalte == null ? vorgabe : e.spalte;
      if (i >= 0 && platziere(e.gattung, e.zeile, spalte)) rest.splice(i, 1);
    }
  }
  // Rest auf das gemeinsame Raster, damit beide Seiten aufeinandertreffen
  rest.forEach(g => {
    const nr = gesetzt.length;
    // Ohne Spaltenwunsch: der Feldherr stellt nahe der feindlichen Grenze auf.
    platziere(g, raster ? raster(nr) : Math.round((nr + 0.5) * ZEILEN / Math.max(1, offen.length)), null);
  });
  return gesetzt;
}

/**
 * Erkennt eine Einheit an ihrem Zeichencode.
 * Angreifer: 225+2b (links) und 226+2b (rechts) fuer b = 1..4.
 * Verteidiger: die Paare aus T.
 */
function gattungVonZeichen(c) {
  if (c >= 227 && c <= 234) {
    const n = c - 225;                       // 2..9
    return {
      seite: 'angreifer',
      gattung: GATTUNGEN[Math.floor(n / 2) - 1],
      rechts: n % 2 === 1
    };
  }
  for (const g of GATTUNGEN) {
    if (T[g][0] === c) return { seite: 'verteidiger', gattung: g, rechts: false };
    if (T[g][1] === c) return { seite: 'verteidiger', gattung: g, rechts: true };
  }
  return null;
}

/** Zeichenpaar [links, rechts] einer Gattung. */
function zeichenPaar(gattung, istAngreifer) {
  const b = GATTUNGEN.indexOf(gattung) + 1;
  return istAngreifer ? [225 + 2 * b, 226 + 2 * b] : [T[gattung][0], T[gattung][1]];
}

/**
 * Fuehrt die Schlacht aus.
 * Liefert Verluste, Gebaeudeschaeden und die Landverschiebung.
 */
export function schlacht(angreifer, verteidiger, f, rnd, aufAngreifer = [], aufVerteidiger = [], regeln = STANDARD) {
  // Gemeinsames Zeilenraster, damit sich beide Seiten treffen
  const nA = einheitenListe(angreifer).length, nV = einheitenListe(verteidiger).length;
  const n = Math.max(1, nA, nV);
  const raster = i => Math.round((i + 0.5) * ZEILEN / n);
  const stellungA = aufstellen(f, angreifer, true, aufAngreifer, raster);
  const stellungV = aufstellen(f, verteidiger, false, aufVerteidiger, raster);

  // Ab hier wird jede Feldaenderung aufgezeichnet. Der Ausgangszustand des
  // Feldes wird vorher kopiert, damit der Client die Animation nachspielen kann.
  const startbild = Array.from(f.z);
  f.aufzeichnung = [];
  f.bild = [];

  const verluste = [{ kavallerie: 0, artillerie: 0, infanterie: 0, miliz: 0 },
                    { kavallerie: 0, artillerie: 0, infanterie: 0, miliz: 0 }];
  const gebaeude = [{ maerkte: 0, muehlen: 0, palast: 0, kathedrale: 0 },
                    { maerkte: 0, muehlen: 0, palast: 0, kathedrale: 0 }];
  const ereignisse = [];
  let landAngreifer = 0;   // f4 im Original, positiv = Angreifer gewinnt Land
  let maxGewinn = 0;       // f5
  let maxVerlust = 0;      // f6

  const zustand = {
    verluste, gebaeude, ereignisse, regeln,
    landGewinnProFeld: {
      angreifer: int(verteidiger.land / 800),
      verteidiger: int(angreifer.land / 800)
    }
  };

  // Angriff, Zeile 296-300: Zeilen 0 bis 75
  for (let r = 0; r < ZEILEN; r++) {
    zeileAbwickeln(f, r, 'angreifer', angreifer, verteidiger, rnd, zustand, nn => {
      landAngreifer += nn; if (landAngreifer > maxGewinn) maxGewinn = landAngreifer;
    });
  }
  // Gegenangriff, Zeile 301-302: Zeilen 75 bis 0
  for (let r = ZEILEN - 1; r >= 0; r--) {
    zeileAbwickeln(f, r, 'verteidiger', verteidiger, angreifer, rnd, zustand, nn => {
      landAngreifer -= nn;
    });
  }
  // Zeile 216: f6=f5-f4. Der Rueckgewinn des Verteidigers ist die Differenz
  // zwischen dem weitesten Vordringen und dem Stand am Ende, nicht erst das,
  // was ueber die eigene Grenze hinausgeht. Wer zurueckgedraengt wird, zahlt
  // also auch dann Kasse und Einwohner, wenn er unterm Strich Land gewinnt.
  maxVerlust = maxGewinn - landAngreifer;

  // Fassung 2026: der Ausgang streut, und auch ein Sieg kostet.
  if (regeln.schlachtStreuung) {
    const faktor = 1 - regeln.schlachtStreuung + rnd() * 2 * regeln.schlachtStreuung;
    landAngreifer = int(landAngreifer * faktor);
    maxGewinn = int(maxGewinn * faktor);
    maxVerlust = int(maxVerlust * faktor);
  }
  if (regeln.sockelverlust) sockelverlusteZiehen(f, verluste, rnd, regeln.sockelverlust);

  // Kappung, Zeile 308-309
  if (landAngreifer > verteidiger.land - 1) { landAngreifer = verteidiger.land - 1; maxGewinn = landAngreifer; }
  if (-landAngreifer > angreifer.land - 1) { landAngreifer = 1 - angreifer.land; maxVerlust = Math.abs(landAngreifer); }

  bildAbschliessen(f);
  const aufzeichnung = f.aufzeichnung;
  delete f.aufzeichnung; delete f.bild;

  return { verluste, gebaeude, ereignisse, landAngreifer, maxGewinn, maxVerlust,
           feld: f, startbild, aufzeichnung, stellungA, stellungV };
}

/**
 * Alle Einheiten einer Zeile handeln lassen, Zeile 148-157.
 * Der Angreifer wird von rechts nach links durchsucht (die vorderste Einheit zuerst),
 * der Verteidiger von links nach rechts.
 */
function zeileAbwickeln(f, r, seite, eigen, gegner, rnd, zustand, landZaehler) {
  const istA = seite === 'angreifer';
  const spalten = istA
    ? Array.from({ length: SPALTEN }, (_, i) => SPALTEN - 1 - i)
    : Array.from({ length: SPALTEN }, (_, i) => i);

  // Zeile 148 und 153 setzen z und f3 einmal je Zeile, nicht je Einheit.
  //
  //   148 f3=0:y=e+40*c6:x=25+y:z=0:IFt1(c6)<>1THENRETURN
  //   177 ...:z=z+b:z(0,i)=z(0,i)+1:GOSUB67:RETURN
  //
  // Faellt eine Einheit im Zweikampf, wandert ihre Reststaerke in z, und die
  // naechste Einheit derselben Zeile faengt damit an. So belohnt das Original
  // den Wellenangriff: gefallene Kameraden erhoehen ueber RND*(c7+b+z)>c7 die
  // Siegchance des Nachrueckenden und gehen in die Stosskraft gegen Gebaeude
  // und Graeben ein. Ebenso gilt die Grenzmarke f3 fuer die ganze Zeile: hat
  // eine Einheit die Grenze ueberschritten, zaehlt jeder weitere Marschschritt
  // jeder Einheit dieser Zeile Land.
  const zeile = { z: 0, ueberGrenze: false };

  for (const c of spalten) {
    const einheit = gattungVonZeichen(lies(f, r, c));
    if (!einheit || einheit.seite !== seite) continue;
    // Es handelt jeweils das vordere Zeichen des Paares
    if (istA !== einheit.rechts) continue;

    if (einheit.gattung === 'kavallerie' || einheit.gattung === 'infanterie') {
      marschieren(f, r, c, seite, einheit.gattung, eigen, gegner, rnd, zustand, landZaehler, zeile);
    } else if (einheit.gattung === 'artillerie') {
      artillerie(f, r, c, seite, eigen, gegner, rnd, zustand);
    }
    // Miliz bleibt stehen und verteidigt nur
  }
}

/**
 * Marsch einer Kavallerie- oder Infanterieeinheit, Zeile 158-185 (Angreifer)
 * und 203-233 (Verteidiger).
 * Die Einheit belegt zwei Felder: kopf ist das vordere, kopf-richtung das hintere.
 * Geprueft wird immer das Feld kopf+richtung. Ueberrolltes Gelaende wird zwei
 * Felder spaeter wieder hinter der Einheit abgelegt (Variablen kp und ip im Original).
 */
function marschieren(f, r, kopfStart, seite, gattung, eigen, gegner, rnd, zustand, landZaehler, zeile) {
  const istA = seite === 'angreifer';
  const richtung = istA ? 1 : -1;
  const par = MARSCH[istA ? 'angreifer' : 'verteidiger'][gattung];
  let b = par.kraft * eigen.moral;   // Stosskraft
  let weite = par.weite;             // verbleibende Felder
  let kopf = kopfStart;
  let kp = LEER, ip = LEER;          // Gelaendespeicher

  const eigenIdx = istA ? 0 : 1, gegnerIdx = istA ? 1 : 0;
  const [links, rechts] = zeichenPaar(gattung, istA);
  const vorne = istA ? rechts : links;    // Zeichen am Kopf
  const hinten = istA ? links : rechts;   // Zeichen am Rumpf
  const eigenerVersatz = istA ? VERSATZ : 0;
  const gegnerVersatz = istA ? 0 : VERSATZ;

  // Zeile 177 und 224: POKEj-1,kp:POKEj,ip legt das ueberrollte Gelaende
  // zurueck, wenn die Einheit faellt. Sonst verschwaende ein Baum oder ein
  // Flussstueck unter ihr dauerhaft und die Nachrueckenden liefen frei durch.
  const raeumen = () => {
    setz(f, r, kopf, ip);
    setz(f, r, kopf - richtung, kp);
  };
  const vorruecken = probe => {
    setz(f, r, kopf - richtung, kp);   // Gelaende hinter der Einheit wiederherstellen
    kp = ip;
    ip = lies(f, r, probe);
    setz(f, r, kopf, hinten);
    setz(f, r, probe, vorne);
    kopf = probe;
    weite--;
  };

  // Zeile 170 bricht bei b<=0 ab, Zeile 217 aber erst bei b<0: der
  // Verteidiger marschiert mit genau null Stosskraft noch weiter.
  const laeuftNoch = () => (istA ? b > 0 : b >= 0);

  while (weite > 0 && laeuftNoch()) {
    const probe = kopf + richtung;
    if (probe < 0 || probe >= SPALTEN) return;
    const d = lies(f, r, probe);
    const basis = d >= VERSATZ ? d - VERSATZ : d;
    const gehoertGegner = d >= VERSATZ ? gegnerVersatz === VERSATZ : gegnerVersatz === 0;

    if (d !== LEER) {
      // Grenzuebertritt, Zeile 162 und 207. Der Grenzmaeander liegt in den
      // Spalten 19 bis 21 und besteht in zwei von drei Faellen aus ZWEI
      // Zeichen nebeneinander (Zeile 401 und 403). Das Original laesst jedes
      // davon kostenlos passieren und setzt nur ein Flag; nur die Graeben um
      // die Hauptstaedte ab Spalte 26 sind ein Hindernis (Zeile 165 und 166).
      //
      // Ohne diese Unterscheidung geraet das zweite Grenzzeichen in den
      // Wall-Zweig und verdoppelt dort die Stosskraft. Das traf zwei von drei
      // Zeilen und hat jede Schlacht verzerrt.
      if (istGrenze(d) && probe > 14 && probe < 26) {
        zeile.ueberGrenze = true;
        vorruecken(probe);
        landZaehler(zustand.landGewinnProFeld[seite]);
        continue;
      }

      // Baeume bremsen, Fluesse stark, Zeile 68 und 69. Ruinen stehen dort
      // nicht: ueber eigene Brandstaetten laeuft man ungehindert.
      if (basis === 107 || basis === 108 || basis === 117 || basis === 118) {
        b *= 0.95;
      } else if (istFluss(d)) {
        b *= 0.6;
      } else {
        const feind = gattungVonZeichen(d);
        if (feind && feind.seite !== seite) {
          // Zweikampf, Zeile 172-179 und 219-226
          let c7 = gegner.moral * WEHRWERT[feind.gattung];
          // Fassung 2026: wer auf eigenem Boden angegriffen wird, wehrt sich
          // besser. Das Handbuch spricht dem Verteidiger diesen Vorteil zu.
          const heim = zustand.regeln.heimvorteil;
          if (heim) {
            const grenz = f.grenzspalte[r];
            const eigenerBoden = feind.seite === 'angreifer' ? probe < grenz : probe >= grenz;
            if (eigenerBoden) c7 *= 1 + heim;
          }
          if (rnd() * (c7 + b + zeile.z) > c7) {
            zustand.verluste[gegnerIdx][feind.gattung]++;
            const start = feind.rechts ? probe - 1 : probe;
            setz(f, r, start, LEER); setz(f, r, start + 1, LEER);
            b -= c7; zeile.z = 0;
            zustand.ereignisse.push({ art: 'zweikampf', zeile: r, sieger: seite, verloren: feind.gattung });
            bildAbschliessen(f);
            continue;
          }
          zustand.verluste[eigenIdx][gattung]++;
          zeile.z += b;                       // Zeile 177 und 224
          raeumen();
          zustand.ereignisse.push({ art: 'zweikampf', zeile: r, sieger: feind.seite, verloren: gattung });
          bildAbschliessen(f);
          return;
        }

        if (gehoertGegner && (basis === T.markt[0] || basis === T.markt[1] ||
                              basis === T.marktGross[0] || basis === T.marktGross[1] ||
                              basis === T.muehle[0] || basis === T.muehle[1])) {
          // Markt oder Muehle niederbrennen, Zeile 180-182 und 227-229
          const istMuehle = basis === T.muehle[0] || basis === T.muehle[1];
          zeile.z += b;
          b = zeile.z - 0.3 - (istMuehle ? 0.25 : 0);
          if (b < 0) return;
          const rechtsTeil = basis === T.markt[1] || basis === T.muehle[1] || basis === T.marktGross[1];
          const start = rechtsTeil ? probe - 1 : probe;
          setz(f, r, start, T.ruine[0] + gegnerVersatz);
          setz(f, r, start + 1, T.ruine[1] + gegnerVersatz);
          if (istMuehle) zustand.gebaeude[gegnerIdx].muehlen++;
          else zustand.gebaeude[gegnerIdx].maerkte++;
          zeile.z = 0;
          zustand.ereignisse.push({ art: 'brand', zeile: r, was: istMuehle ? 'muehle' : 'markt', opfer: gegnerIdx });
          bildAbschliessen(f);
          continue;
        }

        const bau = gebaeudeTreffer(basis);
        if (bau && gehoertGegner) {
          // Palast oder Kathedrale, Zeile 73-74 und 78
          const schaden = 2 * b / (bau === 'palast' ? 2 : 3);
          zustand.gebaeude[gegnerIdx][bau] += schaden;
          zustand.ereignisse.push({ art: 'sturm', zeile: r, was: bau, opfer: gegnerIdx });
          bildAbschliessen(f);
          return;
        }

        if (istGrenze(d)) {
          // Graben um die Hauptstadt, Zeile 165 und 183 beim Angreifer, 210
          // und 230 beim Verteidiger. Er gilt nur tief im Feindesland: der
          // Angreifer ab Spalte 26, der Verteidiger bis Spalte 14.
          const imFeindesland = istA ? probe > 25 : probe < 15;
          if (!imFeindesland) { vorruecken(probe); bildAbschliessen(f); continue; }
          zeile.z += b;
          b = 2 * zeile.z - 0.4;
          if (b < 0) return;
          setz(f, r, probe, LEER);
          bildAbschliessen(f);
          zeile.z = 0;
          continue;
        }
        // Das Original kennt keine Sperre an eigenen Gebaeuden: Zeile 168
        // laeuft ueber alles hinweg, was keine der Pruefungen 163 bis 167
        // getroffen hat, und legt das Zeichen zwei Felder spaeter wieder ab.
      }
    }

    vorruecken(probe);
    bildAbschliessen(f);
    if (zeile.ueberGrenze) landZaehler(zustand.landGewinnProFeld[seite]);
  }
}

function gebaeudeTreffer(basis) {
  if ((basis > 33 && basis < 37) || (basis > 59 && basis < 63)) return 'palast';
  if ((basis > 36 && basis < 40) || basis === 42 || basis === 31) return 'kathedrale';
  return null;
}

/** Artilleriebeschuss, Zeile 186-202 und 234-249. */
function artillerie(f, r, c, seite, eigen, gegner, rnd, zustand) {
  const istA = seite === 'angreifer';
  const richtung = istA ? 1 : -1;
  const gegnerIdx = istA ? 1 : 0;
  let b = Math.min(1.5, eigen.moral);

  while (b > 0) {
    const weite = 16 + int(rnd() * 6);
    const ziel = c + richtung * weite;
    // Zeile 192 und 240: ein Schuss ins Leere verfaellt, die Batterie feuert
    // aber weiter, bis die Stosskraft aufgebraucht ist.
    if (ziel < 0 || ziel >= SPALTEN) { b -= 0.3; continue; }
    const d = lies(f, r, ziel);
    const basis = d >= VERSATZ ? d - VERSATZ : d;
    const gehoertGegner = (d >= VERSATZ) !== istA;
    const e = gattungVonZeichen(d);

    if (e) {
      // Zeile 59 bis 66: der Treffer wird gezaehlt, ganz gleich wem die
      // Einheit gehoert. Die Artillerie schiesst blind 16 bis 21 Felder weit
      // und trifft dabei auch die eigene Kavallerie, die schon vorgerueckt
      // ist. Die Moral kostet nur ein Treffer auf den Gegner (Zeile 200).
      const opferIdx = e.seite === 'angreifer' ? 0 : 1;
      zustand.verluste[opferIdx][e.gattung]++;
      const start = e.rechts ? ziel - 1 : ziel;
      setz(f, r, start, T.ruine[0] + (istA ? 0 : VERSATZ));
      setz(f, r, start + 1, T.ruine[1] + (istA ? 0 : VERSATZ));
      if (e.seite !== seite) gegner.moral -= 0.02;
      zustand.ereignisse.push({
        art: e.seite === seite ? 'eigenbeschuss' : 'treffer',
        zeile: r, gattung: e.gattung, opfer: e.seite
      });
    } else if (gehoertGegner && (basis === T.markt[0] || basis === T.markt[1] || basis === T.marktGross[0] || basis === T.marktGross[1])) {
      zustand.gebaeude[gegnerIdx].maerkte++;
      const start = (basis === T.markt[1] || basis === T.marktGross[1]) ? ziel - 1 : ziel;
      setz(f, r, start, T.ruine[0] + (d >= VERSATZ ? VERSATZ : 0));
      setz(f, r, start + 1, T.ruine[1] + (d >= VERSATZ ? VERSATZ : 0));
    } else if (gehoertGegner && (basis === T.muehle[0] || basis === T.muehle[1])) {
      zustand.gebaeude[gegnerIdx].muehlen++;
      const start = basis === T.muehle[1] ? ziel - 1 : ziel;
      setz(f, r, start, T.ruine[0] + (d >= VERSATZ ? VERSATZ : 0));
      setz(f, r, start + 1, T.ruine[1] + (d >= VERSATZ ? VERSATZ : 0));
    } else if (istGrenze(d)) {
      // Zeile 197 und 245: nur die Grabenkacheln fliegen weg, Fluesse bleiben
      // stehen. Sonst liesse sich ein Flusslauf freischiessen, der im
      // Original dauerhaft Stosskraft kostet.
      setz(f, r, ziel, LEER);
    } else {
      const p = gebaeudeTreffer(basis);
      if (p && gehoertGegner) {
        // Zeile 198 und 199: das Teil wird gezaehlt, das Zeichen bleibt aber
        // stehen. Dieselbe Zelle laesst sich also mehrfach beschiessen; die
        // Kappung auf den wirklichen Bestand kommt erst in der Abrechnung.
        zustand.gebaeude[gegnerIdx][p] += 1;
        zustand.ereignisse.push({ art: 'beschuss', zeile: r, was: p, opfer: istA ? 'verteidiger' : 'angreifer' });
      }
    }
    bildAbschliessen(f);
    b -= 0.3;
  }
}

/**
 * Fassung 2026: nach der Schlacht faellt auf beiden Seiten noch ein Teil der
 * Ueberlebenden aus. Ein Sieg ohne Verluste soll es nicht geben.
 *
 * Die Einheiten werden vom Feld genommen, damit das Bild zur Abrechnung passt.
 */
function sockelverlusteZiehen(f, verluste, rnd, anteil) {
  const gefunden = [[], []];
  for (let r = 0; r < ZEILEN; r++) {
    for (let c = 0; c < SPALTEN; c++) {
      const e = gattungVonZeichen(lies(f, r, c));
      if (!e || e.rechts) continue;                 // jede Einheit nur einmal
      gefunden[e.seite === 'angreifer' ? 0 : 1].push({ r, c, gattung: e.gattung });
    }
  }
  for (let seite = 0; seite < 2; seite++) {
    const liste = gefunden[seite];
    let offen = int(liste.length * anteil);
    while (offen > 0 && liste.length) {
      const i = int(rnd() * liste.length);
      const e = liste.splice(i, 1)[0];
      setz(f, e.r, e.c, LEER);
      setz(f, e.r, e.c + 1, LEER);
      verluste[seite][e.gattung]++;
      offen--;
    }
  }
  bildAbschliessen(f);
}

/**
 * Abrechnung nach der Schlacht, Zeile 303-352.
 * Aendert beide Spieler und liefert den Bericht.
 */
export function abrechnen(angreifer, verteidiger, erg, markt) {
  const bericht = { landAngreifer: erg.landAngreifer, seiten: [] };
  const seiten = [
    { s: angreifer, i: 0, name: 'Angreifer' },
    { s: verteidiger, i: 1, name: 'Verteidiger' }
  ];

  for (const { s, i, name } of seiten) {
    const v = erg.verluste[i], g = erg.gebaeude[i];
    const gm = Math.min(int(g.maerkte), s.maerkte);
    const gmu = Math.min(int(g.muehlen), s.muehlen);
    const gp = Math.min(int(g.palast), s.palast);
    const gk = Math.min(int(g.kathedrale), s.kathedrale);
    s.maerkte -= gm; s.muehlen -= gmu; s.palast -= gp; s.kathedrale -= gk;
    s.kavallerie = Math.max(0, s.kavallerie - v.kavallerie);
    s.artillerie = Math.max(0, s.artillerie - v.artillerie);
    s.infanterie = Math.max(0, s.infanterie - v.infanterie);
    s.miliz = int(s.maerkte / 5) * 3;                       // Zeile 305
    // Zeile 308: i(x)=20*(u(x)+s(x)+j(x)) -- ohne die Miliz, anders als die
    // Armeeformel in Zeile 761. Genau dieser Wert geht in die Siegpraemie
    // ein; mit der Miliz waere sie zu hoch.
    s.soldaten = 20 * (s.kavallerie + s.artillerie + s.infanterie);
    bericht.seiten.push({ name, verluste: { ...v }, gebaeude: { maerkte: gm, muehlen: gmu, palast: gp, kathedrale: gk } });
  }

  // Landverschiebung und Folgeverluste, Zeile 310-330
  const f4 = erg.landAngreifer;
  const f5 = erg.maxGewinn;    // Land, das der Verteidiger verliert
  const f6 = erg.maxVerlust;   // Land, das der Angreifer verliert

  if (f4 > 0) {
    const praemie = int(angreifer.soldaten * int(Math.log10(Math.abs(f4) + 1)) * 2);
    angreifer.kasse -= praemie;
    bericht.praemie = praemie;
  }

  const kasseA = angreifer.kasse > 0 && angreifer.land > 0 ? int((angreifer.kasse / angreifer.land) * f6) : 0;
  const kasseV = verteidiger.kasse > 0 && verteidiger.land > 0 ? int((verteidiger.kasse / verteidiger.land) * f5) : 0;
  const einwA = angreifer.land > 0 ? int((angreifer.einwohner / 2 / angreifer.land) * f6) : 0;
  const einwV = verteidiger.land > 0 ? int((verteidiger.einwohner / 2 / verteidiger.land) * f5) : 0;

  angreifer.einwohner = Math.max(1, angreifer.einwohner - einwA);
  verteidiger.einwohner = Math.max(1, verteidiger.einwohner - einwV);
  angreifer.kasse -= kasseA;
  verteidiger.kasse -= kasseV;
  angreifer.land += f4;
  verteidiger.land -= f4;
  if (angreifer.land < 1) angreifer.land = 1;
  if (verteidiger.land < 1) verteidiger.land = 1;

  bericht.seiten[0].einwohner = einwA; bericht.seiten[0].kasse = kasseA;
  bericht.seiten[1].einwohner = einwV; bericht.seiten[1].kasse = kasseV;

  armeeAktualisieren(angreifer);
  armeeAktualisieren(verteidiger);
  return bericht;
}
