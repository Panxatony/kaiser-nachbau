// Originaldaten aus extracted/main_game.bas (DATA-Zeilen 908-985 und 946-963)

/**
 * Die neun Fuerstentuemer, DATA-Zeilen 932 bis 940. Die Reihenfolge ist die
 * Spielernummer: Spieler 1 regiert Preussen, Spieler 2 Hessen und so fort.
 *
 * In Zeile 937 steht im Original woertlich MOEHREN, nicht MAEHREN. Das ist
 * ein Tippfehler von 1984, byteweise nachgeprueft: das Zeichen dort ist
 * dasselbe wie in BOEHMEN und KOENIG. Wir schreiben MAEHREN, weil MOEHREN im
 * Spiel nur wie ein Fehler unsererseits aussaehe.
 */
export const REGIONEN = [
  'PREUSSEN', 'HESSEN', 'BAYERN', 'BÖHMEN', 'SACHSEN',
  'MÄHREN', 'TIROL', 'DER PFALZ', 'FLANDERN'
];

// Titel 1..9, [maennlich, weiblich]  (DATA-Zeilen 914-931)
export const TITEL = [
  ['HERR', 'FRAU'],
  ['BARON', 'BARONIN'],
  ['LANDGRAF', 'LANDGRÄFIN'],
  ['MARKGRAF', 'MARKGRÄFIN'],
  ['FÜRST', 'FÜRSTIN'],
  ['HERZOG', 'HERZOGIN'],
  ['KURFÜRST', 'KURFÜRSTIN'],
  ['KÖNIG', 'KÖNIGIN'],
  ['KAISER', 'KAISERIN']
];

export const JUSTIZ = ['Sehr fair', 'Bescheiden', 'Hart', 'Gierig'];

export const WETTER = [
  { name: 'Dürre',        text: 'Hungersnot droht' },
  { name: 'Regen',        text: 'Schlechte Ernte' },
  { name: 'Gewöhnliche Ernte', text: '' },
  { name: 'Gutes Wetter', text: 'Reiche Ernte' },
  { name: 'Tolles Wetter', text: 'Rekordernte' }
];

// Angriffswege, DATA-Zeilen 946-963. Erste Ziffer = Angreifer, letzte = Ziel,
// Ziffern dazwischen = Transitregionen (1-basiert).
const WEGE_RAW = [
  '12,123,153,143,1983,14,15,16,147,167,1537,1237,19837,128,198,1538,1438,16738,19',
  '21,23,214,234,254,25,216,2546,2376,2346,25376,237,2147,2167,2547,28,29',
  '321,351,341,3761,3891,32,34,35,346,376,3516,3216,38916,37,38,329,389,3519,3419,37619',
  '41,412,432,452,43,45,46,47,438,4528,4198,4329,4529,4389,419',
  '51,52,53,54,516,546,5376,537,547,5167,528,538,5198,519,529,5389',
  '61,612,6452,6432,6732,643,673,6153,6123,61983,65,67,6738,6438,6128,6198,61538,64528,619,64529,64389,64329,67389,67329',
  '761,741,7351,7321,73891,732,7452,7412,7612,73,74,735,745,7615,76,738,74528,74128,74198,76128,76198,7389,7329,7419,7619,73519,74529',
  '891,821,8351,8341,83761,82,83,834,8254,8214,8914,825,835,8915,8376,846,8216,8916,83516,82546,837,82547,82147,82167,89147,89167,89',
  '91,92,983,923,9153,9143,91673,914,9254,9234,9834,925,915,9835,916,92546,92376,98346,98376,9837,9237,9167,9147,92547,91537,98'
];

// WEGE[angreifer][ziel] = Liste von Pfaden, jeder Pfad = Array der Regionsindizes (0-basiert),
// beginnend beim Angreifer, endend beim Ziel.
export const WEGE = WEGE_RAW.map(zeile => {
  const proZiel = {};
  for (const eintrag of zeile.split(',')) {
    const pfad = [...eintrag].map(z => Number(z) - 1);
    const ziel = pfad[pfad.length - 1];
    (proZiel[ziel] ||= []).push(pfad);
  }
  // Reihenfolge wie in den DATA-Zeilen des Originals: der erste passende Weg gewinnt.
  return proZiel;
});

/**
 * Unmittelbare Grenzen, abgeleitet aus den Angriffswegen.
 *
 * Ein Weg der Laenge zwei fuehrt ohne Zwischenland ans Ziel, das ist eine
 * gemeinsame Grenze. GRENZEN[a] ist die Liste der Nachbarn von a.
 *
 * Zwei Grenzen sind im Original einseitig, vermutlich ein Versehen in der
 * Datentabelle: Boehmen kann Maehren unmittelbar angreifen, Maehren aber
 * Boehmen nicht, und Maehren kann Sachsen angreifen, Sachsen aber Maehren
 * nicht. Wir uebernehmen das unveraendert.
 */
export const NACHBARN = WEGE.map(proZiel => {
  const nachbarn = new Set();
  for (const ziel of Object.keys(proZiel)) {
    for (const pfad of proZiel[ziel]) if (pfad.length === 2) nachbarn.add(pfad[1]);
  }
  return [...nachbarn].sort((a, b) => a - b);
});

// Farbschemata je Bildschirm (DATA-Zeilen 964-985: Rahmen + 6 Textfarben)
export const FARBEN = {
  1:  [9, 9, 8, 0, 0, 7, 7],      // Ernte
  2:  [8, 8, 9, 0, 0, 7, 7],      // Kornverteilung
  3:  [0, 0, 4, 2, 1, 1, 0],      // Bevoelkerung
  4:  [2, 2, 10, 9, 0, 0, 1],     // Militaer
  5:  [6, 6, 11, 1, 0, 1, 0],     // Steuern
  11: [7, 7, 0, 7, 2, 1, 0],      // Staatseinkaeufe
  12: [10, 10, 2, 10, 0, 1, 0],   // Bankrott / Abspann
  13: [12, 12, 0, 2, 1, 15, 15],  // Landmangel
  15: [7, 7, 5, 5, 14, 1, 0],     // Titelverleihung
  16: [14, 14, 14, 6, 1, 1, 1],   // Spielstand
  17: [6, 6, 2, 7, 0, 7, 0],      // Amtsenthebung
  18: [0, 0, 11, 7, 7, 1, 0],     // Truppenkauf
  19: [0, 0, 9, 8, 1, 0, 0],
  20: [0, 0, 0, 0, 0, 13, 0],     // Schlachtfeld
  21: [0, 0, 9, 9, 1, 0, 0],      // Kriegsabrechnung
  22: [0, 0, 9, 0, 1, 0, 1]       // Verluste
};

export const KOSTEN = {
  markt: 1000,
  muehle: 2000,
  palast: 5000,
  kathedrale: 9000,
  manoeverBasis: 1000
};

export const GRENZEN = {
  palastTeile: 16,
  kathedraleTeile: 14,
  palastLand: 13000,
  kathedraleLand: 25000,
  minEinwohner: 382
};
