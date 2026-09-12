// Die Vollbildschirme des Originals: Titelverleihung, Kroenung, Bankrott und
// Amtsenthebung. Im Original unterbrechen sie den Zug, man drueckt den
// Joystickknopf und spielt weiter. Hier sind es Blaetter ueber der Seite, die
// man nacheinander wegklickt.
//
// Die Texte stehen woertlich so im BASIC; die Zeilennummern stehen dabei.

// Anreden und Namen kommen vom Server und enthalten Spielernamen; maskieren,
// siehe esc() in app.js.
const esc = wert => String(wert ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

import { zeichen, zeichensatzLaden } from './c64.js';

/**
 * Die Krone unter der Titelverleihung, BASIC-Zeile 747 und 748.
 *
 *   747 PRINTTAB(15)"{down}{down}   {$a3}  {$a3}"
 *       PRINTTAB(15)" {$b6}{$ac}{$a5}{$a1}{$ac}{$a5}{$a1}{$b6}"
 *   748 PRINTTAB(15)"{$ac}{$a5}{$a5}{$a5}{$a5}{$a5}{$a5}{$a5}{$a5}{$a1}"
 *       PRINTTAB(15)"{$b4}{$a5}{$a5}{$a5}{$b0}{$b4}{$a5}{$a5}{$a5}{$b0}"
 *
 * PETSCII $A0 bis $BF sind die Screencodes $60 bis $7F, also minus 64.
 * Ein 0 steht hier fuer eine leere Zelle.
 */
const KRONE = [
  [0, 0, 0, 99, 0, 0, 99, 0, 0, 0],
  [0, 118, 108, 101, 97, 108, 101, 97, 118, 0],
  [108, 101, 101, 101, 101, 101, 101, 101, 101, 97],
  [116, 101, 101, 101, 112, 116, 101, 101, 101, 112]
];

// Das Original malt die Krone weiss auf gelbem Grund (Farbschema g=15). Auf
// unserem Papier waere Weiss unsichtbar, deshalb ein Goldton.
const GOLD = '#8a6a1f';

/** Malt die Krone in einen Canvas. Zeichen aus dem Textsatz. */
export async function kroneMalen(c, groesse = 16) {
  try { await zeichensatzLaden('assets/charset.png'); } catch { return false; }
  c.width = KRONE[0].length * groesse;
  c.height = KRONE.length * groesse;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  for (let z = 0; z < KRONE.length; z++) {
    for (let sp = 0; sp < KRONE[z].length; sp++) {
      const code = KRONE[z][sp];
      if (!code) continue;
      zeichen(ctx, code, sp * groesse, z * groesse, groesse, GOLD, 'assets/charset.png');
    }
  }
  return true;
}

/**
 * Baut aus einem Zeremonieeintrag des Servers die Blaetter, die der Client
 * nacheinander zeigt. Die Kroenung sind zwei Bilder, genau wie im Original:
 * erst der Vorgaenger, dann der Abspann.
 */
export function blaetterAus(z) {
  switch (z.art) {

    // Zeile 745 bis 752
    case 'titel': return [{
      art: 'titel',
      titel: 'Ihnen wird ein neuer Titel verliehen!',
      zeilen: ['Sie sind nun', `<b>${esc(z.anrede)}</b> !`],
      krone: true
    }];

    // Zeile 735 bis 739
    case 'bankrott': return [{
      art: 'bankrott',
      titel: `${esc(z.anrede)},`,
      zeilen: ['Sie sind leider Bankrott!',
               'Gläubiger haben große Teile Ihres Besitzes gepfändet!']
    }];

    // Zeile 766 bis 768 und 806, 807
    case 'amtsenthebung': return [{
      art: 'amtsenthebung',
      titel: `${esc(z.anrede)},`,
      zeilen: [z.text || 'Sie sind 1 Jahr Ihres Amtes enthoben worden!']
    }];

    // Der Sterbefall. Zeile 612 schickt den Regenten, der sein Todesjahr
    // erreicht hat, nach 718; dort wird gewuerfelt, ob er ein Jahr laenger
    // lebt. Der Sterbefall selbst stand in den Zeilen 719 bis 725, die auf
    // dieser Diskette fehlen ("ewiges leben"). Der Text ist deshalb unser
    // eigener, im Ton der uebrigen Bildschirme.
    case 'tod': return [{
      art: 'tod',
      titel: `${esc(z.anrede)},`,
      zeilen: ['Ihre Stunde hat geschlagen.',
               `Sie sind Anno ${z.jahr} an Altersschwäche verschieden.`,
               'Ihr Fürstentum bleibt ohne Herrn zurück.']
    }];

    // Zeile 753 bis 759, danach der Abspann aus ewiges_leben_0801.prg
    case 'kaiser': return [
      {
        art: 'kaiserVorher',
        titel: 'Der letzte Kaiser des',
        zeilen: ['HEILIGEN RÖMISCHEN REICHES DEUTSCHER NATION',
                 'war', `<b>${esc(z.vorgaenger)}</b>.`]
      },
      {
        art: 'kaiser',
        titel: 'Es lebe',
        zeilen: [`<b>${esc(z.kurz)}</b>`, 'Kaiser von Gottes Gnaden'],
        abspann: true
      }
    ];

    default: return [];
  }
}
