// Spielregeln von Kaiser (C64, Sir Aliba 1985).
// Alle Formeln stammen aus extracted/main_game.bas; die BASIC-Zeilennummern
// stehen als Kommentar an der jeweiligen Funktion.

import { REGIONEN, TITEL, GRENZEN } from './data.js';
import { STANDARD } from './regelwerk.js';

/**
 * INT wie in CBM-BASIC: immer abrunden, auch bei negativen Zahlen.
 * INT(-2.5) ist dort -3, nicht -2. Das ist kein Haarspalten: die Kasse kann
 * negativ werden, und dann weicht ein Abschneiden zur Null in jeder Buchung
 * um einen Taler ab, immer zugunsten des Spielers.
 */
export const int = n => Math.floor(n);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Deterministischer Zufallsgenerator (mulberry32), damit Runden reproduzierbar sind. */
export function makeRng(seed) {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rnd.seed = seed;
  return rnd;
}

/** Neuer Spieler mit den Startwerten aus Zeile 876-878. */
export function neuerSpieler(id, name, weiblich, regionIndex) {
  return {
    id, name, weiblich, region: regionIndex,
    land: 15000,        // a(c)
    kasse: 10000,       // b(c)
    einwohner: 2000,    // c(c)
    korn: 10000,        // p(c)
    titel: 1,           // t(c)
    zoll: 25,           // zo(c)
    mwst: 10,           // r(c)
    est: 5,             // l(c)
    justiz: 2,          // d(c)
    maerkte: 0,         // e(c)
    muehlen: 0,         // f(c)
    palast: 0,          // g(c)
    kathedrale: 0,      // h(c)
    kavallerie: 0,      // u(c)
    artillerie: 0,      // s(c)
    infanterie: 1,      // j(c)
    miliz: 1,           // q(c)
    soldaten: 20,       // i(c)
    soeldner: 0,        // w(c)
    moral: 1,           // o(c)
    punkte: 4,          // v(c)
    handel: 5,          // m(c)
    wohlstand: 25,      // ws(c)
    gebaeudeBonus: 1,   // n(c)
    lebenszeit: 1760,   // k(c)  das Todesjahr, Zeile 877
    tot: false,
    gestorbenIn: null,
    gesperrtBis: 1700,  // b8(c)
    enthebungsGrund: null,
    bankrott: false,
    kaiser: false
  };
}

export const titelName = s => TITEL[s.titel - 1][s.weiblich ? 1 : 0];
export const regionName = s => REGIONEN[s.region];
export const anrede = s => `${titelName(s)} ${s.name} VON ${regionName(s)}`;

/** Armee neu berechnen, Zeile 760-764. */
export function armeeAktualisieren(s) {
  let m = int(s.maerkte / 5) * 2;
  const mm = int(s.muehlen / 3) * 2;
  if (mm < m) m = mm;
  m += int((s.palast + s.kathedrale) / 2);
  s.miliz = m;
  s.soldaten = (s.kavallerie + s.artillerie + s.infanterie + s.miliz) * 20;
  if (s.soeldner > s.soldaten) s.soeldner = s.soldaten - s.miliz * 20;
  if (s.soeldner < 0) s.soeldner = 0;
  if (s.soldaten < 20) {
    s.soldaten = 20; s.infanterie = 1; s.kavallerie = 0; s.artillerie = 0;
  }
}

/** Kornbedarf des Volkes, Zeile 620. */
export function kornBedarf(s) {
  return Math.abs(int(
    s.punkte * 100 + s.handel * 40 + s.wohlstand * 30 + s.einwohner * 5 + s.soldaten * 10
  ));
}

/**
 * Ernte, Kornpreis und Landpreis zu Rundenbeginn, Zeile 466-472.
 * Liefert die Marktlage des Spielers fuer diese Runde.
 */
export function ernte(s, rnd, regeln = STANDARD) {
  const wetter = int(rnd() * 5 + 1);                 // c5, 1..5
  let d = s.land;
  const b1 = Math.max(0, (s.einwohner - s.muehlen * 100) * 5);
  if (b1 < d) d = b1;
  const b2 = s.korn * 2;
  if (b2 < d) d = b2;

  const faktor = wetter - 0.5;
  const zuwachs = d * faktor;
  s.korn = int(s.korn + zuwachs);

  const bedarf = kornBedarf(s);
  let verhaeltnis = zuwachs < 1 ? 2 : bedarf / zuwachs;
  verhaeltnis = clamp(verhaeltnis, 0.8, 2);

  let landpreis = (3 * wetter + 12 + rnd() * 12) / 10;
  landpreis = int(10 * landpreis * verhaeltnis) / 10;

  const verfault = int(rnd() * 50 + 1);
  s.korn = int(s.korn * (1 - verfault / 100));

  let kornpreis = int((20 - 3 * wetter + rnd() * 10) * 8 * verhaeltnis);
  if (kornpreis < 1) kornpreis = 1;

  // flaeche ist die tatsaechlich bestellte Flaeche, also das Kleinste aus
  // Landbesitz, (Einwohner - Muehlen*100)*5 und Korn*2. Das Original zeigt sie
  // nicht; wir nennen sie, weil sonst nicht zu sehen ist, warum die Ernte
  // klein bleibt, obwohl das Land gross ist (siehe TEXTE.md).
  return { wetter, verfault, kornpreis, landpreis, bedarf,
           ernteMenge: int(zuwachs), flaeche: int(d) };
}

/** Korn kaufen, Zeile 494-497. Maximal 3x Bedarf pro Runde. */
export function kornKaufen(s, markt, menge) {
  menge = Math.max(0, int(menge));
  const max = markt.bedarf * 3;
  const rest = max - markt.gekauft;
  let warnung = null;
  if (menge > rest) { menge = Math.max(0, rest); warnung = 'VORRÄTE ERSCHÖPFT!'; }
  markt.gekauft += menge;
  s.korn += menge;
  s.kasse = int(s.kasse - menge * markt.kornpreis / 1000);
  return { menge, warnung };
}

/** Korn verkaufen, Zeile 498-500. */
export function kornVerkaufen(s, markt, menge) {
  menge = Math.max(0, int(menge));
  if (menge > s.korn) return { fehler: 'Soviel Korn haben Sie nicht.' };
  markt.gekauft -= menge;
  s.korn = int(s.korn - menge);
  s.kasse = int(s.kasse + menge * markt.kornpreis / 1111);
  return { menge };
}

/** Land kaufen, Zeile 501-502. */
export function landKaufen(s, markt, menge, freiesLand = Infinity) {
  menge = Math.max(0, int(menge));
  // Fassung 2026: das Reich hat eine feste Flaeche. Gekauft wird aus dem
  // gemeinsamen Vorrat; ist er leer, hilft nur noch der Krieg.
  if (menge > freiesLand) menge = Math.max(0, int(freiesLand));
  if (!menge) return { menge: 0, fehler: 'Im Reich ist kein Land mehr zu haben.' };
  s.land = int(s.land + menge);
  s.kasse = int(s.kasse - menge * markt.landpreis);
  return { menge };
}

/** Land verkaufen, Zeile 503-505. Mindestens 1 Hektar bleibt. */
export function landVerkaufen(s, markt, menge) {
  menge = Math.max(0, int(menge));
  if (menge > s.land - 1) return { fehler: 'Soviel Land haben Sie nicht.' };
  s.land = int(s.land - menge);
  s.kasse = int(s.kasse + menge * markt.landpreis * 0.9);
  return { menge };
}

/**
 * Korn ans Volk verteilen samt Bevoelkerungsentwicklung, Zeile 506-535 und 620-632.
 * z = ausgegebene Menge, erlaubt sind 20% bis 80% der Reserve.
 */
export function kornVerteilen(s, markt, z, rnd) {
  const bedarf = markt.bedarf;
  const min = int(s.korn / 5), max = int(s.korn * 0.8);
  z = int(z);
  if (z > max) return { fehler: 'DAS IST ZU VIEL!' };
  if (z < min) return { fehler: 'DAS IST ZU WENIG!' };

  s.korn -= z;
  const bericht = { ausgegeben: z, geboren: 0, gestorben: 0, einwanderer: 0, ausgewandert: 0 };
  const geburten = va => {
    const f = int((rnd() * va + 1) * s.einwohner / 100);
    s.einwohner += f; bericht.geboren = f;
  };
  const sterben = va => {
    let f = int((rnd() * va + 1) * s.einwohner / 100);
    if (z / bedarf < 0.5) f = int((1 - z / bedarf) * s.einwohner);
    // Zeile 628: IFc(c)-f<382THENf=c(c)-382. Steht das Volk schon unter 382,
    // wird f negativ und das Sterben laesst es wachsen. Eine Marotte des
    // Originals, die wir uebernehmen; sie greift nur unterhalb der Schwelle,
    // ab der ohnehin die Amtsenthebung faellig ist.
    if (s.einwohner - f < GRENZEN.minEinwohner) f = s.einwohner - GRENZEN.minEinwohner;
    s.einwohner -= f; bericht.gestorben = f;
  };
  const auswanderung = () => {                                    // Zeile 630
    const f = int((2 + rnd()) * (s.einwohner / 100 * (s.justiz - 2) * (s.justiz - 2)));
    s.einwohner -= f; bericht.ausgewandert = f;
  };

  if (z >= bedarf - 1) {
    geburten(7);
    sterben(3);
    if (rnd() * 20 + 1 > s.mwst) s.punkte += int(rnd() * 2);
    if (rnd() * 20 + 1 > s.est) s.handel += int(rnd() * 3);
    if (z > bedarf * (1.1 + rnd() * 0.4)) {                       // Zeile 524-530
      const b = s.einwohner / 1000;
      let d = (z - bedarf) / bedarf * 10 * b * (rnd() * 65 + 2);
      if (d > s.einwohner / 10) d = int(s.einwohner / 10);
      d = int((rnd() * d + 2) * (1.1 - s.mwst / 100) * (1.1 - s.zoll / 100) * (1.1 - s.est / 100) / 2);
      // Zeile 529 und 530 laufen ohne Bedingung, auch wenn niemand kommt.
      // Wer die Schwelle aus Zeile 524 ueberschreitet, bekommt Ansehen und
      // Handel also schon fuer den guten Ruf, nicht erst fuer die Leute.
      s.einwohner += d; bericht.einwanderer = d;
      let w = rnd() * d / 5 + 1; if (w > 50) w = 50;
      s.wohlstand += w; s.punkte += 1; s.handel += 2;
    }
    if (s.justiz > 2 || (90 - s.zoll - s.mwst - s.est) < 0) auswanderung();
  } else {
    let j = (bedarf - z) / bedarf * 100 - 9;
    j = clamp(j, 0, 65);
    geburten(3);
    sterben(j + 8);
    auswanderung();
  }
  // Die Untergrenze von 382 steht im Original nur im Sterbeteil (Zeile 628).
  // Die Auswanderung danach darf darunter gehen; ab 500 Einwohnern greift
  // ohnehin die Amtsenthebung und setzt auf 500 zurueck.
  if (s.einwohner < 0) s.einwohner = 0;
  return bericht;
}

/** Einnahmen aus Gebaeuden und Sold, Zeile 536-542. */
export function gebaeudeEinnahmen(s, rnd) {
  const maerkte = s.maerkte * int(127 + rnd() * 127);
  const muehlen = s.muehlen * int(250 + rnd() * 250);
  const sold = s.soldaten * 3 + s.soeldner * 12;
  s.kasse += maerkte + muehlen - sold;
  return { maerkte, muehlen, sold };
}

/** Zufallsfaktoren der Steuerberechnung, Zeile 543-544. Einmal pro Runde. */
export function steuerFaktoren(s, rnd) {
  const b = s.einwohner / 100;
  return {
    f3: b / (rnd() * 3000 + 2500),
    f4: b / (rnd() * 4000 + 2000),
    f5: b / (rnd() * 2000 + 3000),
    f6: b / (rnd() * 3000 + 2500) * 100,
    f7: int(70 + rnd() * 82)
  };
}

/** Steuereinnahmen bei den aktuellen Saetzen, Zeile 633-637. */
export function steuern(s, f) {
  const basis = f.f7 - s.zoll - s.mwst - s.est;
  let zoll = int((s.punkte * 180 + s.titel * 75 + s.wohlstand * 20) * (basis / 100) + s.gebaeudeBonus * 100);
  let mwst = int((s.punkte * 50 + s.wohlstand * 75 + s.gebaeudeBonus * 10) * basis * (5 - s.justiz) / 200);
  let est  = int(s.punkte * 250 + s.gebaeudeBonus * 20 + (10 * s.justiz * s.punkte) * (basis / 100));
  zoll = int(zoll * s.zoll * f.f3);
  mwst = int(mwst * s.mwst * f.f4);
  est  = int(est * s.est * f.f5);
  const gold = int((s.justiz * 300 - 500) * s.titel * f.f6);
  if (s.titel === 8) { zoll *= 3; est *= 2; }
  return { zoll, mwst, est, gold, summe: zoll + mwst + est + gold };
}

/** Amtsenthebung bei Land- oder Einwohnermangel, Zeile 571 und 766-768. */
export function amtsenthebung(s, jahr) {
  if (s.land < s.einwohner) {
    s.gesperrtBis = jahr + 2;
    return 'Wegen schlechter Landpolitik sind Sie 1 Jahr Ihres Amtes enthoben worden!';
  }
  if (s.einwohner < 500) {
    s.einwohner = 500;
    s.gesperrtBis = jahr + 2;
    return 'Wegen schlechter Einwohnerpolitik sind Sie 1 Jahr Ihres Amtes enthoben worden!';
  }
  return null;
}

/** Gebaeudeverlust bei Landmangel, Zeile 697-717. */
export function landmangel(s) {
  const d = int(s.land / 1000);
  const verluste = [];
  if (s.maerkte > d) { verluste.push({ anzahl: s.maerkte - d, was: 'Märkte' }); s.maerkte = d; }
  if (s.muehlen > d) { verluste.push({ anzahl: s.muehlen - d, was: 'Mühlen' }); s.muehlen = d; }
  if (d < 12 && s.palast > 0) { verluste.push({ anzahl: 1, was: 'Palast' }); s.palast = 0; }
  if (d < 24 && s.kathedrale > 0) { verluste.push({ anzahl: 1, was: 'Kathedrale' }); s.kathedrale = 0; }
  return verluste;
}

/** Truppenpreise dieser Runde, Zeile 572. */
export function truppenPreise(rnd) {
  return {
    kavallerie: 3680 + int(511 * rnd()),
    artillerie: 2300 + int(511 * rnd()),
    infanterie: 1500 + int(256 * rnd())
  };
}

/** Gebaeudekauf, Zeile 592-600. */
export function bauen(s, was, rnd = Math.random) {
  const zuWenigLand = { ok: false, fehler: 'ZU WENIG BAULAND' };
  switch (was) {
    case 'markt':
      if (s.land / 1000 - 1 < s.maerkte) return zuWenigLand;
      s.maerkte++; s.kasse -= 1000; s.gebaeudeBonus += 1;
      armeeAktualisieren(s);             // Zeile 593 ruft GOSUB760
      break;
    case 'muehle':
      if (s.land / 1000 - 1 < s.muehlen) return zuWenigLand;
      // Original Zeile 595: n(c)=n(c)/4  -- als Eigenheit uebernommen
      s.muehlen++; s.kasse -= 2000; s.gebaeudeBonus = s.gebaeudeBonus / 4;
      armeeAktualisieren(s);             // Zeile 595 ruft GOSUB760
      break;
    case 'palast':
      // Zeile 597 ruft kein GOSUB760: die neue Miliz aus dem Palast zaehlt
      // erst im naechsten Jahr oder nach dem naechsten Markt- oder Muehlenkauf.
      if (s.land < GRENZEN.palastLand || s.palast > 15) return zuWenigLand;
      s.palast++; s.kasse -= 5000; s.gebaeudeBonus += 0.5; break;
    case 'kathedrale':
      if (s.land < GRENZEN.kathedraleLand || s.kathedrale > 13) return zuWenigLand;
      s.kathedrale++; s.kasse -= 9000; s.gebaeudeBonus += 1;
      // Zeile 600: jedes Kathedralenteil hebt den Handel um 1 bis 6.
      // Das ist der einzige Weg, auf dem der Handel spuerbar waechst, und
      // geht ueber m(c) in den Kornbedarf und in die Aufstiegspunkte ein.
      s.handel += 1 + int(rnd() * 6);
      break;
    default:
      return { ok: false, fehler: 'Unbekanntes Gebäude' };
  }
  return { ok: true };
}

/**
 * Truppen anwerben, Zeile 651-672.
 * soeldner=false rekrutiert Landeskinder, true wirbt Soeldner an.
 */
export function truppenKaufen(s, preise, art, soeldner) {
  const b = soeldner ? 1 : 0;
  const basis = { kavallerie: preise.kavallerie + 600, artillerie: preise.artillerie + 400, infanterie: preise.infanterie + 200 }[art];
  const roh = { kavallerie: preise.kavallerie, artillerie: preise.artillerie, infanterie: preise.infanterie }[art];
  if (basis === undefined) return { ok: false, fehler: 'Unbekannte Truppengattung' };
  const preis = basis + int(b * roh / 2);

  if (!soeldner && !(s.einwohner / (s.soldaten - s.soeldner + 1) > 7)) {
    return { ok: false, fehler: 'ZU VIELE SOLDATEN !' };
  }
  const alt = s.soldaten;              // i(c) vor GOSUB760
  if (art === 'kavallerie') s.kavallerie++;
  if (art === 'artillerie') s.artillerie++;
  if (art === 'infanterie') s.infanterie++;
  s.kasse -= preis;

  // Moralmischung, Zeile 667 bis 669. Die Reihenfolge ist wichtig, denn
  // mitten in Zeile 667 steht ein GOSUB760, das die Armee neu rechnet:
  //
  //   667 ONqGOSUB670,671,672:o(c)=o(c)*(i(c)+20):GOSUB760:c(c)=c(c)-(20*(1-b))
  //   668 w(c)=w(c)+20*b:o(c)=o(c)/(i(c)+20-30*b)
  //   669 o(c)=(o(c)*(i(c)/20-1)+1)/(i(c)/20)
  //
  // Der erste Schritt rechnet also noch mit dem alten Soldatenstand, die
  // beiden anderen schon mit dem neuen. Rechnet man ueberall mit dem alten,
  // kostet Rekrutieren keine Moral mehr und Soeldner heben sie sogar; bei
  // einer Armee von zwanzig Mann wird die Moral dann auf glatt 1 gesetzt.
  s.moral = s.moral * (alt + 20);
  armeeAktualisieren(s);               // GOSUB760
  const neu = s.soldaten;              // i(c) danach
  if (soeldner) s.soeldner += 20; else s.einwohner -= 20;
  s.moral = s.moral / (neu + 20 - 30 * b);
  s.moral = (s.moral * (neu / 20 - 1) + 1) / (neu / 20);
  return { ok: true, preis };
}

/**
 * Manoever, Zeile 673.
 *
 * Das Original erlaubt beliebig viele im Jahr, jedes bringt 0,1 Moral. Die
 * Fassung 2026 halbiert den Ertrag mit jedem weiteren Manoever desselben
 * Jahres und deckelt die Moral. `schonGehalten` ist die Zahl der Manoever,
 * die dieser Regent dieses Jahr bereits abgehalten hat.
 */
export function manoever(s, regeln = STANDARD, schonGehalten = 0) {
  const kosten = 4 * s.soldaten + 1000;
  s.kasse -= kosten;
  const gewinn = regeln.manoeverGedeckelt ? 0.1 / Math.pow(2, schonGehalten) : 0.1;
  s.moral = Math.min(regeln.moralGrenze, s.moral + gewinn);
  return { kosten, gewinn };
}

/** Bankrottpruefung, Zeile 695 und 728-739. */
export function bankrottPruefen(s, markt, rnd, freiesLand = Infinity) {
  const schwelle = (-10000 * s.titel) * (int(8 + rnd() * 6) / 10);
  if (!(schwelle > s.kasse)) return null;
  s.kasse += s.kathedrale * 2500; s.kathedrale = 0;
  s.kasse += s.palast * 1500;     s.palast = 0;
  s.kasse += s.muehlen * 1000;    s.muehlen = 0;
  s.kasse += s.maerkte * 500;     s.maerkte = 0;
  s.soeldner = int(s.soeldner / 2);
  s.moral = s.moral / 2;
  if (s.land > 3000) {
    s.land -= 3000;
    s.kasse = int(s.kasse + s.land * markt.landpreis * 0.8);
    s.land = 3000;
  }
  if (s.kasse > 0) {
    // Zeile 733 steckt den Rest wieder in Land. In der Fassung 2026 darf
    // dabei kein Land aus dem Nichts entstehen; der Vorrat des Reiches ist
    // durch die Pfaendung gerade gewachsen und begrenzt den Rueckkauf.
    const menge = Math.min(int(s.kasse / markt.landpreis), int(freiesLand));
    s.land += Math.max(0, menge);
    s.kasse = 0;
  }
  s.lebenszeit -= 2;
  s.bankrott = true;
  armeeAktualisieren(s);
  return 'Sie sind leider Bankrott! Gläubiger haben große Teile Ihres Besitzes gepfändet!';
}

/** Punktzahl fuer den Titelaufstieg, Zeile 601-606. */
export function aufstiegsPunkte(s) {
  const t = x => Math.min(17, int(x));
  return [s.maerkte, s.palast, s.kathedrale, s.muehlen, s.kasse / 5000, s.land / 6000,
          s.wohlstand / 50, s.punkte / 5, s.soldaten / 50, s.handel / 10,
          s.einwohner / 2000, s.gebaeudeBonus / 5]
    .reduce((a, x) => a + t(x), 0);
}

/** Titelaufstieg, Zeile 607 und 740-753. Liefert den neuen Titel oder null. */
/**
 * Was die Bauwerke eines Fuersten wert sind.
 *
 * Die Zahlen sind nicht erfunden: es sind die Betraege, die das Original beim
 * Bankrott dafuer erloest (Zeile 728 bis 731). Wer gepfaendet wird, bekommt je
 * Kathedralenteil 2.500, je Palastteil 1.500, je Muehle 1.000 und je Markt
 * 500 Taler. Das ist die einzige Stelle, an der das Spiel selbst sagt, was ein
 * Bauwerk wert ist.
 */
export const bauwerte = s =>
  s.kathedrale * 2500 + s.palast * 1500 + s.muehlen * 1000 + s.maerkte * 500;

/** Kasse plus Bauwerke. */
export const vermoegenVon = s => s.kasse + bauwerte(s);

/**
 * Was ein Fuerst vorweisen muss, um den naechsten Titel zu bekommen.
 *
 * Das Original kennt einen festen Betrag: 9.999 Taler, Zeile 740, vom Herrn
 * bis zum Koenig derselbe. In der Fassung 2026 steigt die Schwelle mit dem
 * Rang -- die erste Befoerderung kostet weiterhin 9.999, jede weitere mehr:
 *
 *   Herr -> Baron          9.999
 *   Baron -> Landgraf     20.000
 *   Landgraf -> Markgraf  30.000
 *   ...
 *   Koenig -> Kaiser      80.000   (dazu 100.000 in bar, Zeile 743)
 *
 * `titelSchwelle` ist der Abstand zwischen zwei Stufen. Steht er auf 0, bleibt
 * es beim festen Betrag des Originals.
 */
export function titelSchwelleFuer(titel, regeln = STANDARD) {
  if (!regeln.titelSchwelle) return 9999;
  return titel <= 1 ? 9999 : 10000 + (titel - 1) * regeln.titelSchwelle;
}

/**
 * Titelaufstieg, Zeile 607 und 740-753.
 *
 * Liefert bei Erfolg den neuen Titel, sonst einen Grund: 'geld', wenn es
 * allein am Vermoegen lag, sonst null.
 */
export function titelPruefen(s, regeln = STANDARD) {
  let stufe = int(aufstiegsPunkte(s) / 9);
  if (stufe > 9) stufe = 9;
  if (s.titel >= stufe) return null;

  // Zeile 740: unter 9.999 Talern gibt es keinen Titel.
  //
  // In der Fassung 2026 zaehlen dabei auch die Bauwerke mit, solange die Kasse
  // nicht im Minus steht. Sonst bestraft die Huerde genau das, was die Punkte
  // bringt: wer seine Taler in Maerkte und Muehlen steckt, kommt nie ueber die
  // Schwelle, und wer sie hortet, sammelt keine Punkte. Im Original fiel das
  // nicht auf, weil der Zinseszins jede Kasse ueberlaufen liess.
  const schwelle = titelSchwelleFuer(s.titel, regeln);
  if (regeln.titelVermoegen) {
    if (s.kasse <= 0) return 'geld';
    if (vermoegenVon(s) < schwelle) return 'geld';
  } else if (s.kasse < schwelle) {
    return 'geld';
  }

  if (s.titel > 6 && s.palast < 16) return null;
  if (s.titel > 7 && (s.kathedrale < 14 || s.muehlen < 15 || s.maerkte < 25)) return null;
  // Der letzte Schritt verlangt bare Muenze, in beiden Regelwerken.
  if (s.titel === 8 && s.kasse < 100000) return 'geld';
  s.titel += 1;
  if (s.titel > 8) { s.titel = 9; s.kaiser = true; }
  return s.titel;
}

/**
 * Lebenszeit und Zinsen am Rundenende, Zeile 612, 613 und 718.
 *
 * Jeder Regent bekommt zu Spielbeginn dasselbe Todesjahr 1760 (Zeile 877).
 * Ist das Jahr erreicht, wird nicht mehr gerechnet, sondern gewuerfelt:
 *
 *   718 IFINT(RND(0)*2)=0THENk(c)=k(c)+1
 *
 * Mit der einen Haelfte lebt der Regent ein Jahr laenger, mit der anderen
 * stirbt er. Der Sterbefall selbst stand in den Zeilen 719 bis 725, die auf
 * dieser Diskette fehlen: sie ist eine bearbeitete Fassung, das
 * Inhaltsverzeichnis nennt die Aenderung "ewiges leben". Wir bauen sie
 * wieder ein. Ein Todesjahr unter 1700 heisst im Original, dass der Spieler
 * uebersprungen wird (Zeile 464), also draussen ist.
 *
 * Solange der Regent lebt, wachsen Kasse um ein Zehntel und die Moral sinkt
 * um ein Zehntel (Zeile 613).
 *
 * Liefert { zins } im Normalfall, { verlaengert: true } fuer ein gewonnenes
 * Jahr und { gestorben: true }, wenn der Regent stirbt.
 */
export function zinsen(s, jahr, rnd, regeln = STANDARD) {
  if (jahr >= s.lebenszeit) {
    if (int(rnd() * 2) === 0) { s.lebenszeit += 1; return { verlaengert: true }; }
    s.tot = true;
    s.gestorbenIn = jahr;
    s.lebenszeit = 1699;        // unter 1700: der Platz bleibt leer
    return { gestorben: true };
  }
  const vorher = s.kasse;
  if (regeln.zinsGedeckelt && s.kasse > 0) {
    // Fassung 2026: nur Kapital bis zur Bonitaet traegt Zinsen. Die Bonitaet
    // nennt das Handbuch: 10.000 Taler, mit jedem Titel 10.000 mehr.
    const bonitaet = bonitaetVon(s);
    s.kasse += int(Math.min(s.kasse, bonitaet) * 0.1);
  } else {
    s.kasse = int(s.kasse * 1.1);
  }
  if (regeln.moralZurMitte) s.moral = s.moral + (1 - s.moral) / 10;
  else s.moral = s.moral * 0.9;
  return { zins: s.kasse - vorher };
}

/** Die Bonitaet eines Regenten: 10.000 Taler je Titelstufe (Handbuch, S. 13). */
export const bonitaetVon = s => 10000 * s.titel;
