// Die Geraeusche des Originals, nachgebaut mit Web Audio.
//
// Das Original ruft dafuer drei Maschinenroutinen auf:
//
//   SYSm,6                      fester Fehlerton
//   SYSm,16,Stimme,Wert,Rang    Ton mit einem 16-Bit-SID-Frequenzwert
//   SYSm,17,Stimme,Note,Rang    Note aus einer Halbtontabelle
//
// Aus dem SID-Wert wird die Frequenz so: f = Wert * Takt / 2^24, mit dem
// PAL-Takt 985248 Hz. Ein Wert von 10000 sind also rund 587 Hz. Damit klingen
// die Toene hier so hoch wie damals, ohne dass wir einen SID nachbauen muessen.
//
// Der Ton laesst sich abschalten und merkt sich das im Browser.

const TAKT = 985248;
const HZ = wert => wert * TAKT / 16777216;

let kontext = null;
let summe = null;                        // gemeinsamer Lautstaerkeregler
let an = false;

try { an = localStorage.getItem('kaiser.ton') !== 'aus'; } catch { an = true; }

export function tonLaeuft() { return an; }

/** Schaltet den Ton um und liefert den neuen Stand. */
export function tonUmschalten() {
  an = !an;
  try { localStorage.setItem('kaiser.ton', an ? 'ein' : 'aus'); } catch { /* egal */ }
  if (!an && kontext) kontext.suspend();
  return an;
}

/**
 * Liefert den Audiokontext. Browser lassen ihn erst nach einer Eingabe des
 * Benutzers laufen, deshalb wird er beim ersten Geraeusch angelegt.
 */
function bereit() {
  if (!an) return null;
  if (!kontext) {
    const K = window.AudioContext || window.webkitAudioContext;
    if (!K) return null;
    kontext = new K();
    summe = kontext.createGain();
    summe.gain.value = 0.18;
    summe.connect(kontext.destination);
  }
  if (kontext.state === 'suspended') kontext.resume();
  return kontext;
}

/**
 * Ein einzelner Ton.
 * @param {number} hz      Frequenz
 * @param {number} ms      Dauer
 * @param {object} o       form: 'square' oder 'triangle', ab: Startzeit, laut: Anteil
 */
function ton(hz, ms, { form = 'square', ab = 0, laut = 1 } = {}) {
  const k = bereit();
  if (!k || hz <= 0) return;
  const t = k.currentTime + ab;
  const o = k.createOscillator();
  const g = k.createGain();
  o.type = form;
  o.frequency.setValueAtTime(hz, t);
  // Kurze Huellkurve, damit es nicht knackt
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(laut, t + 0.006);
  g.gain.setValueAtTime(laut, t + Math.max(0.008, ms / 1000 - 0.012));
  g.gain.linearRampToValueAtTime(0, t + ms / 1000);
  o.connect(g); g.connect(summe);
  o.start(t); o.stop(t + ms / 1000 + 0.02);
}

/** Ein gleitender Ton, wie die Schleifen in Zeile 76, 77 und 190. */
function gleiten(vonWert, bisWert, ms, laut = 1) {
  const k = bereit();
  if (!k) return;
  const t = k.currentTime;
  const o = k.createOscillator();
  const g = k.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(HZ(vonWert), t);
  o.frequency.linearRampToValueAtTime(HZ(bisWert), t + ms / 1000);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(laut, t + 0.01);
  g.gain.linearRampToValueAtTime(0, t + ms / 1000);
  o.connect(g); g.connect(summe);
  o.start(t); o.stop(t + ms / 1000 + 0.02);
}

/** Rauschen, im Original Wellenform 8 (Zeile 105). */
function rauschen(ms, laut = 1) {
  const k = bereit();
  if (!k) return;
  const n = Math.floor(k.sampleRate * ms / 1000);
  const puffer = k.createBuffer(1, Math.max(1, n), k.sampleRate);
  const d = puffer.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const q = k.createBufferSource();
  const g = k.createGain();
  g.gain.value = laut;
  q.buffer = puffer;
  q.connect(g); g.connect(summe);
  q.start();
}

// ------------------------------------------------------------- die Geraeusche

/** Fehlerton, im Original SYSm,6. Dreieck, kurz, immer gleich. */
export function fehler() { ton(145, 110, { form: 'triangle' }); }

/** Klick beim Bewegen der Auswahl, Zeile 660: SYSm,16,0,3500,9. */
export function klick() { ton(HZ(3500), 40); }

/** Bestaetigung eines Kaufs, Zeile 590: SYSm,16,0,7500,9. */
export function kauf() { ton(HZ(7500), 70); }

/** Manoever, Zeile 647: SYSm,16,0,500,9. Ein tiefes Grollen. */
export function manoever() { ton(HZ(500), 220, { form: 'triangle' }); }

/** Truppenkauf, Zeile 664: SYSm,17,0,91,9. Eine kurze Note. */
export function truppen() { ton(220, 120); }

/** Eine Einheit des Angreifers faellt, Zeile 76: 10000 abwaerts nach 1000. */
export function verlustAngreifer() { gleiten(10000, 1000, 260); }

/** Eine Einheit des Verteidigers faellt, Zeile 77: 1000 aufwaerts nach 10000. */
export function verlustVerteidiger() { gleiten(1000, 10000, 260); }

/** Kanonenkugel im Flug, Zeile 190: von 20000 abwaerts. */
export function kugelflug(ms = 400) { gleiten(20000, 8000, ms, 0.8); }

/** Einschlag mit Rauschen, Zeile 105 und 106. */
export function einschlag() { rauschen(180); ton(HZ(2600), 90, { form: 'triangle' }); }

/** Der Sweep vor der Schlacht, Zeile 296. */
export function schlachtbeginn() { gleiten(2000, 20000, 700, 0.7); }

/**
 * Die Fanfare zur Titelverleihung.
 *
 * Zweistimmig aus DATA 941 bis 943. Jedes Tripel ist Stimme 0, Stimme 1 und
 * ein Dauerwert; die Schleife in Zeile 750 laeuft 40/b*30 mal, die Dauer ist
 * also umgekehrt proportional zu b. Ein Schleifendurchlauf dauert auf dem C64
 * etwa 0,7 Millisekunden.
 *
 * Im vorliegenden Abzug des Spiels wird sie nie gespielt: Zeile 749 lautet
 * GOTO752 und ueberspringt die Abspielschleife. Gemeint war sie offensichtlich,
 * die Noten stehen ja da.
 */
const NOTEN = { 0: 0, 40: 784, 50: 622, 68: 466, 81: 392, 102: 311 };
const FANFARE = [
  [68, 81, 6], [68, 81, 16], [68, 81, 16], [68, 81, 4], [68, 81, 4], [50, 102, 1], [0, 0, 8],
  [68, 81, 6], [68, 81, 16], [68, 81, 16], [68, 81, 4], [68, 81, 4], [50, 102, 1], [0, 0, 8],
  [68, 81, 4], [68, 81, 16], [68, 81, 16], [68, 81, 2], [50, 102, 4], [50, 81, 4],
  [40, 50, 1], [50, 68, 1]
];

export function fanfare() {
  if (!bereit()) return;
  let ab = 0;
  for (const [a, b, dauer] of FANFARE) {
    const ms = 840 / dauer;
    if (a) ton(NOTEN[a], ms * 0.9, { ab, laut: 0.8 });
    if (b) ton(NOTEN[b], ms * 0.9, { ab, laut: 0.6 });
    ab += ms / 1000;
  }
}

/** Ein tiefer Schlag, fuer Bankrott und Amtsenthebung. */
export function unheil() {
  ton(HZ(2500), 320, { form: 'triangle', laut: 0.9 });
  ton(HZ(1700), 520, { form: 'triangle', ab: 0.28, laut: 0.9 });
}
