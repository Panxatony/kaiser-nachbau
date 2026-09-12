// Lobby: verwaltet die Spielrunden und die Plätze darin.
//
// Eine Spielrunde ist ein Slot mit bis zu neun Plätzen, einer je Region. Wer
// angemeldet ist, sieht alle Runden, kann eine anlegen oder einer beitreten.

import { Spiel } from './game.js';
import { REGIONEN } from './data.js';
import { sichern, laden, alleIds, loeschen } from './speicher.js';

export const MAX_SPIELER = 9;

/** Erzeugt aus einem Namen eine Kennung, die als Dateiname taugt. */
/**
 * Welche Zeichen ein Rundenname tragen darf. Kontonamen sind schon enger
 * gefasst (siehe konten.js); hier ist etwas mehr erlaubt, aber nichts, womit
 * sich Markup bauen liesse: keine spitzen Klammern, keine Anfuehrungszeichen,
 * kein kaufmaennisches Und.
 */
export const ERLAUBTER_NAME = /^[\p{L}\p{N} .,\-_!?()]+$/u;

export function kennungAus(name, vorhanden = new Set()) {
  let k = String(name || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  if (!k) k = 'runde';
  if (!vorhanden.has(k)) return k;
  for (let i = 2; i < 1000; i++) if (!vorhanden.has(`${k}-${i}`)) return `${k}-${i}`;
  return `${k}-${Date.now()}`;
}

export class Lobby {
  constructor(optionen = {}) {
    this.spiele = new Map();     // spielId -> Spiel
    this.demo = !!optionen.demo;
    this.alleLaden();
  }

  /** Holt gesicherte Runden von der Platte in den Speicher. */
  alleLaden() {
    for (const id of alleIds()) {
      if (this.spiele.has(id)) continue;
      const s = laden(id);
      if (s) { s.demo = this.demo; this.spiele.set(id, s); }
    }
  }

  spiel(id) { return this.spiele.get(id) || null; }

  /** Legt eine neue Runde an. */
  anlegen(name, optionen = {}) {
    name = String(name || '').trim().slice(0, 40);
    if (name.length < 2) return { fehler: 'Die Runde braucht einen Namen mit mindestens 2 Zeichen.' };
    // Der Rundenname steht spaeter in der Lobby jedes Mitspielers. Erlaubt sind
    // darum nur Zeichen, aus denen sich kein Markup bauen laesst; der Client
    // maskiert zusaetzlich beim Einsetzen (siehe esc() in app.js).
    if (!ERLAUBTER_NAME.test(name)) {
      return { fehler: 'Im Rundennamen sind nur Buchstaben, Ziffern, Leerzeichen und . , - _ ! ? ( ) erlaubt.' };
    }
    if ([...this.spiele.values()].some(s => s.name.toLowerCase() === name.toLowerCase())) {
      return { fehler: 'Eine Runde mit diesem Namen gibt es schon.' };
    }
    if (this.spiele.size >= 50) return { fehler: 'Es gibt schon zu viele Runden.' };
    const id = kennungAus(name, new Set(this.spiele.keys()));
    const spiel = new Spiel({
      id, name, demo: this.demo,
      regelwerk: optionen.regelwerk,
      planungsSekunden: this.zahl(optionen.planungsSekunden, 0, 86400, 300),
      diplomatieSekunden: this.zahl(optionen.diplomatieSekunden, 0, 86400, 120)
    });
    spiel.angelegtVon = optionen.von || null;
    spiel.angelegt = Date.now();
    this.spiele.set(id, spiel);
    return { spiel };
  }

  zahl(wert, min, max, vorgabe) {
    const n = Number(wert);
    if (!Number.isFinite(n)) return vorgabe;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  /**
   * Setzt ein Konto auf den naechsten freien Platz einer Runde.
   *
   * Das Fuerstentum wird nicht gewaehlt. Im Original bekommt Spieler 1
   * Preussen, Spieler 2 Hessen und so fort (Zeile 869 bis 878); die
   * Sitzreihenfolge ist das Fuerstentum. Genau das macht die Lobby auch.
   */
  beitreten(spielId, konto, { weiblich } = {}) {
    const spiel = this.spiel(spielId);
    if (!spiel) return { fehler: 'Diese Runde gibt es nicht mehr.' };
    if (spiel.spielerVon(konto.name)) return { spiel, schonDrin: true };
    if (spiel.gestartet) return { fehler: 'Diese Runde läuft schon.' };
    if (spiel.spieler.length >= MAX_SPIELER) return { fehler: 'Diese Runde ist voll.' };

    const e = spiel.beitreten({ id: konto.name, name: konto.name, weiblich });
    if (e.fehler) return e;
    return { spiel, region: REGIONEN[e.spieler.region] };
  }

  /** Nimmt ein Konto aus einer Runde. Leere Runden werden entfernt. */
  verlassen(spielId, konto) {
    const spiel = this.spiel(spielId);
    if (!spiel) return { ok: true };
    if (spiel.gestartet) return { fehler: 'Eine laufende Runde kann man nicht verlassen.' };
    spiel.verlassen(konto.name);
    if (!spiel.spieler.length) this.entfernen(spielId);
    return { ok: true };
  }

  entfernen(spielId) {
    this.spiele.delete(spielId);
    loeschen(spielId);
  }

  /** Alle Runden, in denen dieses Konto einen Platz hat. */
  meineSpiele(konto) {
    return [...this.spiele.values()].filter(s => s.spielerVon(konto.name));
  }

  /** Übersicht einer Runde für die Lobby. */
  uebersicht(spiel, konto) {
    const belegt = new Set(spiel.spieler.map(s => s.region));
    return {
      id: spiel.id,
      name: spiel.name,
      jahr: spiel.jahr,
      phase: spiel.phase,
      gestartet: spiel.gestartet,
      beendet: !!spiel.sieger,
      sieger: spiel.sieger,
      angelegt: spiel.angelegt || null,
      angelegtVon: spiel.angelegtVon || null,
      planungsSekunden: spiel.planungsSekunden,
      diplomatieSekunden: spiel.diplomatieSekunden,
      regelwerk: spiel.regeln.id,
      regelwerkName: spiel.regeln.name,
      spielerzahl: spiel.spieler.length,
      maxSpieler: MAX_SPIELER,
      spieler: spiel.spieler.map(s => ({
        name: s.name, region: REGIONEN[s.region], titel: s.titel, selbst: s.name === konto.name
      })),
      // Welches Fuerstentum der naechste Beitretende bekommt
      naechsteRegion: REGIONEN[spiel.offeneRegionen.length ? spiel.offeneRegionen[0].index : 0],
      dabei: !!spiel.spielerVon(konto.name),
      beitretbar: !spiel.gestartet && spiel.spieler.length < MAX_SPIELER
    };
  }

  /** Die ganze Lobby aus Sicht eines Kontos. */
  sicht(konto) {
    this.alleLaden();
    const runden = [...this.spiele.values()]
      .map(s => this.uebersicht(s, konto))
      .sort((a, b) => {
        // Eigene zuerst, dann offene, dann laufende, jeweils die neuesten oben
        if (a.dabei !== b.dabei) return a.dabei ? -1 : 1;
        if (a.beitretbar !== b.beitretbar) return a.beitretbar ? -1 : 1;
        return (b.angelegt || 0) - (a.angelegt || 0);
      });
    return { konto, runden, regionen: REGIONEN };
  }

  /** Sichert alle laufenden Runden. */
  allesSichern() {
    for (const s of this.spiele.values()) if (s.gestartet) sichern(s);
  }
}
