// Rundenverwaltung mit parallelen Zuegen.
// Phase A Planung: alle Spieler handeln gleichzeitig.
// Phase B Diplomatie: Kriegserklaerungen werden aufgedeckt, Buendnisse gewaehlt.
// Phase C Auswertung: der Server rechnet Schlachten, Zinsen und Titel aus.

import * as R from './rules.js';
import * as B from './battle.js';
import { REGIONEN, WEGE, TITEL, NACHBARN } from './data.js';
import { karteBauen } from './karte.js';
import * as Ruhm from './ruhmeshalle.js';
import { regelwerk, STANDARD } from './regelwerk.js';

export const PHASEN = { PLANUNG: 'planung', DIPLOMATIE: 'diplomatie', AUSWERTUNG: 'auswertung', ENDE: 'ende' };

export const HALTUNG = {
  NEUTRAL: 0,          // im Original: neutral
  HILFE_VERTEIDIGER: 1,
  DURCHMARSCH: 2,
  DURCHMARSCH_HILFE: 3 // Durchmarsch und Hilfe fuer den Angreifer
};

let laufendeNummer = 0;

export class Spiel {
  constructor(optionen = {}) {
    this.id = optionen.id || 'spiel-' + (++laufendeNummer);
    this.name = optionen.name || 'Kaiser';
    this.jahr = 1700;
    this.phase = PHASEN.PLANUNG;
    this.spieler = [];            // Liste von Spielerobjekten
    this.zustand = {};            // id -> Rundenzustand (Markt, Steuerfaktoren, ...)
    this.gestartet = false;
    this.sieger = null;
    this.log = [];                // Jahresberichte
    this.planungsSekunden = optionen.planungsSekunden ?? 300;
    this.diplomatieSekunden = optionen.diplomatieSekunden ?? 120;
    this.frist = null;
    this.seed = optionen.seed ?? (Date.now() & 0x7fffffff);
    this.rundenNr = 0;
    // Schutz gegen endlose Jahre, in denen niemand handeln kann
    this.leereJahre = 0;
    // Nur fuer Entwicklung und Vorfuehrung, siehe Aktion 'demoAufruesten'
    this.demo = !!optionen.demo;
    // Welches Regelwerk gilt: das Original von 1984 oder die Fassung 2026
    this.regelwerkId = regelwerk(optionen.regelwerk).id;
  }

  /** Das gewaehlte Regelwerk. */
  get regeln() { return regelwerk(this.regelwerkId); }

  /**
   * Das Reich hat in der Fassung 2026 eine feste Flaeche, 30.000 Hektar je
   * Fuerstentum am Tisch. Hier steht, wie viel davon noch niemandem gehoert.
   */
  get freiesLand() {
    const jeFuerst = this.regeln.landJeFuerst;
    if (!jeFuerst) return Infinity;
    const belegt = this.spieler.reduce((a, s) => a + s.land, 0);
    return Math.max(0, jeFuerst * this.spieler.length - belegt);
  }

  get offeneRegionen() {
    const belegt = new Set(this.spieler.map(s => s.region));
    return REGIONEN.map((n, i) => ({ index: i, name: n })).filter(r => !belegt.has(r.index));
  }

  /**
   * Nimmt einen Spieler auf.
   *
   * Das Fürstentum wird nicht gewählt, sondern vergeben: Wer zuerst am Tisch
   * sitzt, regiert Preussen, der zweite Hessen und so fort. So macht es das
   * Original in Zeile 869 bis 878, wo die Spielernummer zugleich das
   * Fürstentum ist. Der Parameter `region` ist nur für Tests und Werkzeuge da,
   * die eine bestimmte Nachbarschaft brauchen; die Lobby übergibt ihn nie.
   */
  beitreten({ id, name, weiblich, region }) {
    if (this.gestartet) return { fehler: 'Das Spiel läuft bereits.' };
    if (this.spieler.length >= 9) return { fehler: 'Es können höchstens 9 Spieler mitspielen.' };
    name = String(name || '').trim().toUpperCase().slice(0, 14);
    if (!name) return { fehler: 'Bitte einen Namen angeben.' };
    if (this.spieler.some(s => s.name === name)) return { fehler: 'Diesen Namen gibt es schon.' };
    if (region == null || this.spieler.some(s => s.region === region)) {
      const frei = this.offeneRegionen;
      if (!frei.length) return { fehler: 'Keine Region mehr frei.' };
      region = frei[0].index;
    }
    const s = R.neuerSpieler(id, name, !!weiblich, region);
    R.armeeAktualisieren(s);
    this.spieler.push(s);
    return { spieler: s };
  }

  verlassen(id) {
    const i = this.spieler.findIndex(s => s.id === id);
    if (i >= 0 && !this.gestartet) this.spieler.splice(i, 1);
  }

  spielerVon(id) { return this.spieler.find(s => s.id === id); }

  starten() {
    if (this.gestartet) return { fehler: 'Läuft schon.' };
    if (!this.spieler.length) return { fehler: 'Keine Spieler.' };
    this.gestartet = true;
    this.rundeVorbereiten();
    return { ok: true };
  }

  // ---------------------------------------------------------------- Phase A

  /** Legt fuer jeden Spieler die Marktlage der neuen Runde an, Zeile 466-472. */
  rundeVorbereiten() {
    this.phase = PHASEN.PLANUNG;
    this.rundenNr++;
    this.zustand = {};
    for (const s of this.spieler) {
      const rnd = R.makeRng(this.seed + this.rundenNr * 1000 + s.region);
      const z = {
        rnd,
        // Ein toter Regent ist dauerhaft draussen, Zeile 464: wer ein
        // Todesjahr unter 1700 hat, wird uebersprungen.
        tot: !!s.tot,
        aussetzen: s.tot || s.gesperrtBis > this.jahr,
        fertig: false,
        schritt: 'ernte',
        meldungen: [],
        krieg: null,          // { ziel: spielerId, aufstellung: [] }
        haltungen: {},        // gegnerId -> HALTUNG
        markt: null,
        steuerFaktoren: null,
        verteiltesKorn: null,
        preise: null
      };
      if (z.tot) {
        z.fertig = true;
        z.meldungen.push({
          art: 'tod',
          text: `${R.anrede(s)} ist Anno ${s.gestorbenIn} verschieden. Das Fürstentum bleibt ohne Herrn.`
        });
      } else if (z.aussetzen) {
        z.fertig = true;
        z.meldungen.push({
          art: 'amtsenthebung',
          text: s.enthebungsGrund
            ? `${s.enthebungsGrund} Sie setzen dieses Jahr aus.`
            : 'Sie sind in diesem Jahr Ihres Amtes enthoben und setzen aus.'
        });
      } else {
        // Wer wieder im Amt ist, braucht den alten Grund nicht mehr zu lesen
        s.enthebungsGrund = null;
        // Zeile 465 bis 472: Armee neu rechnen, dann Ernte und Preise.
        // Die Steuerfaktoren (Zeile 543) und der Landmangel (Zeile 573)
        // kommen erst spaeter im Zug, nicht hier.
        R.armeeAktualisieren(s);
        z.markt = R.ernte(s, rnd, this.regeln);
        z.markt.gekauft = 0;
        z.steuerFaktoren = R.steuerFaktoren(s, rnd);   // Vorschau, bis die echten kommen
        z.preise = R.truppenPreise(rnd);
      }
      this.zustand[s.id] = z;
    }
    this.fristSetzen(this.planungsSekunden);

    // Sitzen alle Beteiligten aus, gibt es in diesem Jahr nichts zu planen.
    // Ohne diese Prüfung bliebe die Runde stehen, bis die Frist abläuft, und
    // bei einer Runde ohne Frist für immer.
    if (this.spieler.length && this.spieler.every(p => this.zustand[p.id].fertig)) {
      if (this.leereJahre < 12) {
        this.leereJahre++;
        this.diplomatieStarten();
        return;
      }
      console.error(`Runde ${this.id}: ${this.leereJahre} leere Jahre hintereinander, sie bleibt stehen.`);
    }
    this.leereJahre = 0;
  }

  fristSetzen(sekunden) {
    this.frist = sekunden > 0 ? Date.now() + sekunden * 1000 : null;
  }

  /** Fuehrt eine Spieleraktion aus. Liefert {ok} oder {fehler}. */
  aktion(id, art, daten = {}) {
    const s = this.spielerVon(id);
    if (!s) return { fehler: 'Unbekannter Spieler.' };
    const z = this.zustand[id];
    if (!z) return { fehler: 'Runde nicht bereit.' };

    if (s.tot) return { fehler: 'Der Regent ist verschieden.' };
    if (this.phase === PHASEN.DIPLOMATIE) return this.diplomatieAktion(s, z, art, daten);
    if (this.phase !== PHASEN.PLANUNG) return { fehler: 'Gerade ist keine Planung.' };
    if (z.aussetzen) return { fehler: 'Sie sind in diesem Jahr Ihres Amtes enthoben.' };
    if (z.fertig) return { fehler: 'Ihr Zug ist bereits beendet.' };

    const m = z.markt;
    switch (art) {
      case 'kornKaufen': {
        const e = R.kornKaufen(s, m, daten.menge);
        if (e.warnung) z.meldungen.push({ art: 'warnung', text: e.warnung });
        return { ok: true, menge: e.menge };
      }
      case 'kornVerkaufen': {
        const e = R.kornVerkaufen(s, m, daten.menge);
        return e.fehler ? e : { ok: true, menge: e.menge };
      }
      case 'landKaufen':   return { ok: true, ...R.landKaufen(s, m, daten.menge, this.freiesLand) };
      case 'landVerkaufen': {
        const e = R.landVerkaufen(s, m, daten.menge);
        return e.fehler ? e : { ok: true, menge: e.menge };
      }
      case 'kornVerteilen': {
        if (z.verteiltesKorn !== null) return { fehler: 'Sie haben das Korn schon verteilt.' };
        const e = R.kornVerteilen(s, m, daten.menge, z.rnd);
        if (e.fehler) return e;
        z.verteiltesKorn = daten.menge;
        z.schritt = 'steuern';
        z.bevoelkerung = e;
        z.einnahmen = R.gebaeudeEinnahmen(s, z.rnd);
        // Die Steuerfaktoren zieht das Original erst hier, in Zeile 543 und
        // 544, also nach der Kornausgabe und nach dem Sold. Sie haengen an
        // c(c)/100, der Einwohnerzahl NACH Geburten, Sterbefaellen und
        // Wanderung dieses Jahres. Wer sein Volk aushungert, kassiert im
        // selben Jahr weniger Steuern.
        z.steuerFaktoren = R.steuerFaktoren(s, z.rnd);
        return { ok: true, bevoelkerung: e, einnahmen: z.einnahmen };
      }
      case 'steuernSetzen': {
        for (const k of ['zoll', 'mwst', 'est']) {
          if (daten[k] != null) s[k] = Math.max(0, Math.min(99, R.int(daten[k])));
        }
        if (daten.justiz != null) s.justiz = Math.max(1, Math.min(4, R.int(daten.justiz)));
        return { ok: true, steuern: R.steuern(s, z.steuerFaktoren) };
      }
      case 'steuernEinziehen': {
        if (z.steuernEingezogen) return { fehler: 'Steuern sind schon eingezogen.' };
        if (z.verteiltesKorn === null) return { fehler: 'Verteilen Sie zuerst das Korn.' };
        const st = R.steuern(s, z.steuerFaktoren);
        s.kasse += st.summe;
        z.steuernEingezogen = st;
        z.schritt = 'einkauf';
        // Zeile 571: GOSUB695 direkt nach der Steuerbuchung
        if (this.bankrottPruefen(s, z)) return { ok: true, steuern: st, bankrott: true };
        // Zeile 571: erst sind die Steuern gebucht, dann wird geprueft, ob
        // der Regent seines Amtes enthoben wird. Der Enthobene behaelt die
        // Einnahmen dieses Jahres, sein Zug ist damit aber zu Ende.
        const enthoben = R.amtsenthebung(s, this.jahr);
        if (enthoben) {
          z.meldungen.push({ art: 'amtsenthebung', text: enthoben });
          z.enthoben = true;
          z.fertig = true;
          this.phasePruefen();
          return { ok: true, steuern: st, enthoben };
        }
        // Zeile 573: der Landmangel wird erst jetzt gewertet, auf dem
        // Landbesitz dieses Jahres, also nach allen Kaeufen und Verkaeufen.
        const verlust = R.landmangel(s);
        if (verlust.length) {
          z.meldungen.push({ art: 'landmangel', text: 'Sie haben wegen Landmangel Gebäude verloren.', verlust });
          R.armeeAktualisieren(s);
        }
        return { ok: true, steuern: st, verlust };
      }
      case 'bauen': {
        if (z.schritt !== 'einkauf') return { fehler: 'Erst Korn verteilen und Steuern einziehen.' };
        const e = R.bauen(s, daten.was, z.rnd);
        if (!e.ok) return { fehler: e.fehler };
        return { ok: true, bankrott: this.bankrottPruefen(s, z) };   // Zeile 580
      }
      case 'truppenKaufen': {
        if (z.schritt !== 'einkauf') return { fehler: 'Erst Korn verteilen und Steuern einziehen.' };
        const e = R.truppenKaufen(s, z.preise, daten.gattung, !!daten.soeldner);
        if (!e.ok) return { fehler: e.fehler };
        return { ok: true, preis: e.preis, bankrott: this.bankrottPruefen(s, z) };   // Zeile 694
      }
      case 'manoever': {
        if (z.schritt !== 'einkauf') return { fehler: 'Erst Korn verteilen und Steuern einziehen.' };
        z.manoever = (z.manoever || 0);
        const e = R.manoever(s, this.regeln, z.manoever);
        z.manoever++;
        return { ok: true, ...e, bankrott: this.bankrottPruefen(s, z) };
      }
      case 'kriegErklaeren': {
        if (s.titel < 2) return { fehler: 'ES IST NOCH ZU FRÜH!' };
        // Zeile 687: wer sein Todesjahr erreicht hat, zieht nicht mehr in den
        // Krieg. Statt des Feldzugs wird dort sein letztes Jahr ausgewuerfelt.
        if (this.jahr >= s.lebenszeit) {
          return { fehler: 'Ihre Jahre sind gezählt. An einen Feldzug ist nicht mehr zu denken.' };
        }
        const ziel = this.spielerVon(daten.ziel);
        if (!ziel || ziel.id === s.id) return { fehler: 'Ungültiges Ziel.' };
        // Zeile 685 und 686: ein verstorbener Regent ist kein Gegner mehr.
        if (ziel.tot) return { fehler: 'DAS GEHT NICHT!' };
        z.krieg = { ziel: ziel.id, aufstellung: daten.aufstellung || [] };
        return { ok: true };
      }
      case 'kriegZuruecknehmen':
        z.krieg = null;
        return { ok: true };
      case 'demoAufruesten': {
        // Entwicklungshilfe: setzt Titel, Truppen und Gebaeude in einem Schritt.
        // Nur verfuegbar, wenn der Server mit KAISER_DEMO=1 gestartet wurde.
        if (!this.demo) return { fehler: 'Diese Aktion ist nicht freigeschaltet.' };
        const zahl = (v, min, max) => Math.max(min, Math.min(max, R.int(v)));
        if (daten.titel != null) s.titel = zahl(daten.titel, 1, 9);
        for (const k of ['kavallerie', 'artillerie', 'infanterie', 'maerkte', 'muehlen', 'palast', 'kathedrale']) {
          if (daten[k] != null) s[k] = zahl(daten[k], 0, 99);
        }
        if (daten.kasse != null) s.kasse = R.int(daten.kasse);
        if (daten.lebenszeit != null) s.lebenszeit = R.int(daten.lebenszeit);
        if (daten.moral != null) s.moral = Number(daten.moral);
        R.armeeAktualisieren(s);
        return { ok: true };
      }
      case 'zugBeenden': {
        // Offene Schritte erledigt der Verwalter, damit man jederzeit fertig
        // werden kann, ohne auf den Fristablauf zu warten.
        const offen = this.restErledigen(s, z, daten.grund || 'Vorzeitig beendet');
        z.fertig = true;
        this.phasePruefen();
        return { ok: true, nachgeholt: offen };
      }
      default:
        return { fehler: 'Unbekannte Aktion: ' + art };
    }
  }

  // ---------------------------------------------------------------- Phase B

  diplomatieAktion(s, z, art, daten) {
    if (art === 'haltung') {
      const krieg = this.kriege.find(k => k.id === daten.kriegId);
      if (!krieg) return { fehler: 'Unbekannter Krieg.' };
      if (krieg.angreifer === s.id || krieg.verteidiger === s.id) return { fehler: 'Sie sind selbst beteiligt.' };
      const h = R.int(daten.haltung);
      if (h < 0 || h > 3) return { fehler: 'Ungültige Haltung.' };
      z.haltungen[krieg.id] = h;
      return { ok: true };
    }
    // Eine einzelne Einheit setzen. Im Original geht das nur, wenn man an der
    // Reihe ist: Zeile 292 bis 295 laesst die beiden Seiten abwechselnd je
    // eine Einheit setzen, und der Ueberschuss der staerkeren Seite kommt
    // zuerst. Beide sitzen dabei vor demselben Bildschirm und sehen zu.
    if (art === 'aufstellungSetzen') {
      const krieg = this.kriege.find(k => k.angreifer === s.id || k.verteidiger === s.id);
      if (!krieg) return { fehler: 'Sie sind an keinem Krieg beteiligt.' };
      const istAngreifer = krieg.angreifer === s.id;
      const meine = istAngreifer ? 'angreifer' : 'verteidiger';
      if (krieg.amZug !== meine) {
        return { fehler: krieg.amZug ? 'Der Gegner ist am Zug.' : 'Es steht schon alles.' };
      }
      const vorrat = istAngreifer ? krieg.einheitenA : krieg.einheitenV;
      const gesetzt = istAngreifer ? krieg.aufstellungA : krieg.aufstellungV;
      const offen = vorrat.slice(gesetzt.length);
      if (!offen.length) return { fehler: 'Sie haben nichts mehr zu setzen.' };

      const zeile = R.int(daten.zeile);
      const spalte = B.spalteEinpassen(daten.spalte, istAngreifer);
      if (!this.platzFrei(krieg, zeile, spalte)) {
        return { fehler: 'Dort ist kein Platz für eine Einheit.' };
      }
      // Die Gattung waehlt man nicht: es kommt immer die naechste an die
      // Reihe, Kavallerie, Artillerie, Infanterie, Miliz (BASIC-Zeile 354).
      gesetzt.push({ gattung: offen[0], zeile, spalte });
      krieg.amZug = this.amZug(krieg);
      return { ok: true, gesetzt: gesetzt.length, offen: offen.length - 1 };
    }

    // Den Rest dem Feldherrn ueberlassen. Das Original kennt das nicht, dort
    // sitzen beide vor dem Geraet und setzen zu Ende. Hier kann jemand
    // weggehen, und ohne diesen Ausweg stuende die andere Seite still, bis die
    // Frist ablaeuft -- in einer Runde ohne Frist fuer immer.
    if (art === 'aufstellungAbgeben') {
      const krieg = this.kriege.find(k => k.angreifer === s.id || k.verteidiger === s.id);
      if (!krieg) return { fehler: 'Sie sind an keinem Krieg beteiligt.' };
      if (krieg.angreifer === s.id) krieg.fertigA = true; else krieg.fertigV = true;
      krieg.amZug = this.amZug(krieg);
      return { ok: true };
    }

    if (art === 'bereit') {
      z.diplomatieFertig = true;
      // Wer bestaetigt, setzt nichts mehr. Damit der Gegner nicht auf einen
      // Zug wartet, der nicht mehr kommt, gilt das zugleich als Abgeben.
      for (const k of this.kriege) {
        if (k.angreifer === s.id) k.fertigA = true;
        else if (k.verteidiger === s.id) k.fertigV = true;
        else continue;
        k.amZug = this.amZug(k);
      }
      this.phasePruefen();
      return { ok: true };
    }
    return { fehler: 'Unbekannte Aktion: ' + art };
  }

  /**
   * Bankrottpruefung, Zeile 695.
   *
   * Das Original ruft GOSUB695 dreimal im Zug auf: nach dem Steuereinzug
   * (Zeile 571) und bei jedem Aufbau des Einkaufs- und des Militaerbildes
   * (580 und 694), also nach jedem einzelnen Kauf. Jedes Mal wird die
   * Schwelle neu gewuerfelt. Und Zeile 695 ist ein GOTO, kein GOSUB: die
   * Pfaendung endet in Zeile 739 mit GOTO463, dem Sprung zum naechsten
   * Spieler. Wer sich uebernimmt, verliert also den Rest des Zuges, und mit
   * ihm die Titelpruefung und die Zinsen.
   *
   * Liefert true, wenn gepfaendet wurde.
   */
  bankrottPruefen(s, z) {
    if (z.bankrott || z.aussetzen) return false;
    const text = R.bankrottPruefen(s, z.markt, z.rnd, this.freiesLand);
    if (!text) return false;
    z.bankrott = true;
    z.meldungen.push({ art: 'bankrott', text });
    z.fertig = true;
    this.phasePruefen();
    return true;
  }

  /**
   * Prueft, ob die aktuelle Phase abgeschlossen ist.
   * Eigene Zutat: das Original zieht reihum, hier ziehen alle gleichzeitig.
   */
  phasePruefen() {
    if (this.phase === PHASEN.PLANUNG) {
      if (this.spieler.every(s => this.zustand[s.id].fertig)) this.diplomatieStarten();
    } else if (this.phase === PHASEN.DIPLOMATIE) {
      if (this.spieler.every(s => this.zustand[s.id].diplomatieFertig)) this.auswerten();
    }
  }

  /**
   * Der Verwalter. **Das hat das Original nicht.**
   *
   * Dort sitzt der Spieler vor dem Rechner und wird durch alle Bilder geführt;
   * er kann den Zug gar nicht beenden, ohne Korn verteilt und die Steuern
   * eingezogen zu haben. In einer Runde, die über Tage im Browser läuft, kann
   * jemand die Frist verstreichen lassen. Dann übernimmt der Verwalter die
   * Pflichtschritte, damit die Runde weitergeht und das Fürstentum nicht
   * verhungert.
   *
   * Er handelt vorsichtig und nie besser, als der Spieler selbst könnte:
   * er kauft nur so viel Korn, dass der Bedarf gedeckt ist, kauft Land nur
   * gegen die drohende Amtsenthebung, und lässt ein Fünftel der Kasse stehen.
   *
   * Liefert, was nachgeholt wurde.
   */
  restErledigen(s, z, grund) {
    const nachgeholt = [];
    if (z.aussetzen) return nachgeholt;

    if (z.verteiltesKorn === null) {
      const m = z.markt;

      // Erst den Hunger abwenden, wenn die Kasse es hergibt. Ein Verwalter,
      // der das Volk verhungern lässt, während 18.000 Taler in der Truhe
      // liegen, wäre kein Verwalter.
      const gekauft = this.verwalterKauftKorn(s, z);
      if (gekauft) nachgeholt.push('kornkauf');

      // Dann Land zukaufen, falls sonst die Amtsenthebung wegen Landmangel droht
      const land = this.verwalterKauftLand(s, z);
      if (land) nachgeholt.push('landkauf');

      const menge = Math.max(R.int(s.korn / 5), Math.min(m.bedarf, R.int(s.korn * 0.8)));
      const e = R.kornVerteilen(s, m, menge, z.rnd);
      if (!e.fehler) {
        z.verteiltesKorn = menge;
        z.bevoelkerung = e;
        z.einnahmen = R.gebaeudeEinnahmen(s, z.rnd);
        nachgeholt.push('korn');
        z.steuerFaktoren = R.steuerFaktoren(s, z.rnd);      // Zeile 543
      }
    }
    if (!z.steuernEingezogen) {
      const st = R.steuern(s, z.steuerFaktoren);
      s.kasse += st.summe;
      z.steuernEingezogen = st;
      nachgeholt.push('steuern');
      // Zeile 571: erst buchen, dann Bankrott, dann Amtsenthebung
      this.bankrottPruefen(s, z);
      const enthoben = R.amtsenthebung(s, this.jahr);
      if (enthoben) {
        z.meldungen.push({ art: 'amtsenthebung', text: enthoben });
        // Den Grund ins nächste Jahr mitnehmen, sonst steht dort nur, dass
        // man aussetzt, und niemand weiß warum
        s.enthebungsGrund = enthoben;
      } else {
        const verlust = R.landmangel(s);                    // Zeile 573
        if (verlust.length) {
          z.meldungen.push({ art: 'landmangel', text: 'Sie haben wegen Landmangel Gebäude verloren.', verlust });
          R.armeeAktualisieren(s);
        }
      }
    }
    if (nachgeholt.length) {
      const taten = [];
      if (nachgeholt.includes('kornkauf')) taten.push('Korn zugekauft');
      if (nachgeholt.includes('landkauf')) taten.push('Land zugekauft');
      if (nachgeholt.includes('korn')) taten.push('Korn an das Volk verteilt');
      if (nachgeholt.includes('steuern')) taten.push('die Steuern eingezogen');
      const was = taten.length > 1
        ? taten.slice(0, -1).join(', ') + ' und ' + taten[taten.length - 1]
        : taten[0];
      z.meldungen.push({ art: 'warnung', text: `${grund}: Ihr Verwalter hat ${was}.` });
    }
    return nachgeholt;
  }

  /**
   * Der Verwalter kauft Korn, wenn die Reserve den Bedarf nicht deckt und die
   * Kasse es zulässt. Er lässt ein Fünftel der Kasse stehen, damit er den
   * Fürsten nicht in den Bankrott kauft. Eigene Zutat, siehe restErledigen.
   */
  verwalterKauftKorn(s, z) {
    const m = z.markt;
    const noetig = Math.ceil(m.bedarf * 1.25);      // damit 80 Prozent davon den Bedarf decken
    if (s.korn >= noetig) return 0;
    const ruecklage = Math.max(0, R.int(s.kasse * 0.2));
    const verfuegbar = s.kasse - ruecklage;
    if (verfuegbar <= 0) return 0;

    const bezahlbar = R.int(verfuegbar * 1000 / Math.max(1, m.kornpreis));
    const platz = m.bedarf * 3 - m.gekauft;         // Marktgrenze aus Zeile 495
    const menge = Math.min(noetig - s.korn, bezahlbar, Math.max(0, platz));
    if (menge <= 0) return 0;
    R.kornKaufen(s, m, menge);
    return menge;
  }

  /**
   * Der Verwalter kauft Land, wenn sonst die Amtsenthebung wegen Landmangel
   * droht: das Land muss die Einwohnerzahl übersteigen.
   */
  verwalterKauftLand(s, z) {
    if (s.land > s.einwohner) return 0;
    const m = z.markt;
    const fehlt = s.einwohner - s.land + 1;
    const ruecklage = Math.max(0, R.int(s.kasse * 0.2));
    const verfuegbar = s.kasse - ruecklage;
    if (verfuegbar <= 0) return 0;
    const bezahlbar = R.int(verfuegbar / Math.max(0.1, m.landpreis));
    const menge = Math.min(fehlt, bezahlbar);
    if (menge <= 0) return 0;
    R.landKaufen(s, m, menge, this.freiesLand);
    return menge;
  }

  /**
   * Wer setzt die naechste Einheit?
   *
   * Zeile 292 bis 295 des Originals: erst setzt die Seite mit den mehr
   * Einheiten ihren Ueberschuss, dann geht es Einheit um Einheit im Wechsel
   * weiter, beginnend beim Angreifer.
   *
   *   292 FORi=0TO1
   *   293 IFz(i,0)>z(1-i,0)THENGOSUB353:GOTO293
   *   294 NEXT
   *   295 FORi=0TO1:GOSUB353:NEXT:IFz(1,0)>0THEN295
   *
   * In eine Regel gefasst: es setzt, wer mehr uebrig hat; bei Gleichstand der
   * Angreifer. Sind beide fertig, ist niemand mehr am Zug.
   */
  amZug(k) {
    const offen = (liste, gesetzt, fertig) => fertig ? 0 : liste.length - gesetzt.length;
    const a = offen(k.einheitenA, k.aufstellungA, k.fertigA);
    const v = offen(k.einheitenV, k.aufstellungV, k.fertigV);
    if (a <= 0 && v <= 0) return null;
    if (a <= 0) return 'verteidiger';
    if (v <= 0) return 'angreifer';
    return a >= v ? 'angreifer' : 'verteidiger';
  }

  /** Ist die Stelle frei -- Gelaende wie schon gesetzte Einheiten beider Seiten? */
  platzFrei(k, zeile, spalte) {
    if (!(zeile >= B.AUFSTELLUNG.ersteZeile && zeile <= B.AUFSTELLUNG.letzteZeile)) return false;
    if (spalte < 0 || spalte + 1 >= B.SPALTEN) return false;
    const i = zeile * B.SPALTEN + spalte;
    if (k.feld[i] !== B.LEER || k.feld[i + 1] !== B.LEER) return false;
    for (const e of [...k.aufstellungA, ...k.aufstellungV]) {
      if (e.zeile === zeile && e.spalte != null && Math.abs(e.spalte - spalte) < 2) return false;
    }
    return true;
  }

  /** Erzwingt den Phasenwechsel bei Fristablauf (Auto-Zug fuer Saeumige). */
  fristAbgelaufen() {
    if (this.phase === PHASEN.PLANUNG) {
      for (const s of this.spieler) {
        const z = this.zustand[s.id];
        if (z.fertig) continue;
        this.restErledigen(s, z, 'Die Zeit lief ab');
        z.fertig = true;
      }
      this.diplomatieStarten();
    } else if (this.phase === PHASEN.DIPLOMATIE) {
      this.auswerten();
    }
  }

  diplomatieStarten() {
    // Kriegserklaerungen einsammeln
    this.kriege = [];
    for (const s of this.spieler) {
      const z = this.zustand[s.id];
      if (!z.krieg) continue;
      const ziel = this.spielerVon(z.krieg.ziel);
      if (!ziel) continue;
      this.kriege.push({
        id: `${s.id}->${ziel.id}`,
        angreifer: s.id, verteidiger: ziel.id,
        aufstellungA: z.krieg.aufstellung || [], aufstellungV: []
      });
    }
    // Gegenseitige Erklaerungen zu einer Schlacht zusammenfassen
    const gesehen = new Set();
    this.kriege = this.kriege.filter(k => {
      const rueck = `${k.verteidiger}->${k.angreifer}`;
      if (gesehen.has(rueck)) return false;
      gesehen.add(k.id);
      return true;
    });

    for (const s of this.spieler) {
      const z = this.zustand[s.id];
      z.diplomatieFertig = false;
      z.haltungen = {};
    }

    if (!this.kriege.length) { this.auswerten(); return; }
    this.phase = PHASEN.DIPLOMATIE;

    // Das Schlachtfeld entsteht schon jetzt, damit beide Seiten ihre Truppen
    // auf dem echten Gelaende aufstellen koennen. Es haengt nur von den
    // Gebaeuden der beiden Beteiligten ab, nicht von den Buendnissen.
    for (const k of this.kriege) {
      const a = this.spielerVon(k.angreifer), v = this.spielerVon(k.verteidiger);
      const rnd = R.makeRng(this.seed + this.rundenNr * 104729 + a.region * 31 + v.region);
      const feld = B.feldAufbauen(a, v, rnd);
      k.feld = Array.from(feld.z);
      k.grenzspalte = Array.from(feld.grenzspalte);
      k.einheitenA = B.einheitenListe(a);
      k.einheitenV = B.einheitenListe(v);
      k.fertigA = false;              // hat die Seite den Rest dem Feldherrn ueberlassen?
      k.fertigV = false;
      k.amZug = this.amZug(k);
    }
    // Beteiligte und Aussetzende muessen nichts entscheiden
    for (const s of this.spieler) {
      const beteiligt = this.kriege.some(k => k.angreifer === s.id || k.verteidiger === s.id);
      if (!beteiligt && this.zustand[s.id].aussetzen) this.zustand[s.id].diplomatieFertig = true;
    }
    this.fristSetzen(this.diplomatieSekunden);
    this.phasePruefen();
  }

  // ---------------------------------------------------------------- Phase C

  auswerten() {
    this.phase = PHASEN.AUSWERTUNG;
    this.frist = null;
    const rnd = R.makeRng(this.seed + this.rundenNr * 7919);
    const bericht = { jahr: this.jahr, kriege: [], spieler: [] };

    // 1. Kriege in zufaelliger Reihenfolge
    const kriege = [...(this.kriege || [])];
    for (let i = kriege.length - 1; i > 0; i--) {
      const j = R.int(rnd() * (i + 1));
      [kriege[i], kriege[j]] = [kriege[j], kriege[i]];
    }
    for (const k of kriege) {
      const erg = this.kriegAusfuehren(k, rnd);
      if (erg) bericht.kriege.push(erg);
    }

    // 2. Bankrott, Titel, Zinsen
    for (const s of this.spieler) {
      const z = this.zustand[s.id];
      // Zeremonien sind die Vollbildschirme des Originals: Titelverleihung
      // (Zeile 745 bis 752), Bankrott (735 bis 739), Amtsenthebung (766 bis
      // 768) und die Kroenung (753 bis 759). Der Client zeigt sie nacheinander.
      const eintrag = { id: s.id, name: s.name, meldungen: [...z.meldungen], zeremonien: [] };
      for (const m of z.meldungen) {
        if (m.art === 'amtsenthebung') {
          eintrag.zeremonien.push({ art: 'amtsenthebung', anrede: R.anrede(s), text: m.text });
        }
      }
      if (z.bankrott) {
        // Schon im Zug gepfaendet. Zeile 739 springt danach sofort zum
        // naechsten Spieler, es gibt also weder Titel noch Zinsen.
        eintrag.zeremonien.push({ art: 'bankrott', anrede: R.anrede(s) });
      } else if (!z.aussetzen) {
        const neuerTitel = R.titelPruefen(s);
        if (neuerTitel) {
          const name = TITEL[neuerTitel - 1][s.weiblich ? 1 : 0];
          eintrag.meldungen.push({ art: 'titel', text: `Ihnen wird ein neuer Titel verliehen! Sie sind nun ${R.anrede(s)}.` });
          eintrag.titel = name;
          eintrag.zeremonien.push({ art: 'titel', anrede: R.anrede(s) });
          if (s.kaiser && !this.sieger) {
            this.sieger = s.id;
            // Wie im Original wird der Vorgaenger gezeigt und dann ersetzt
            this.vorigerKaiser = Ruhm.kroenen({
              anrede: `${s.name} VON ${R.regionName(s)}`, name: s.name,
              region: R.regionName(s), jahr: this.jahr, runde: this.name
            });
            eintrag.zeremonien.push({
              art: 'kaiser',
              anrede: R.anrede(s),
              kurz: `${s.name} VON ${R.regionName(s)}`,
              vorgaenger: this.vorigerKaiser
            });
          }
        }
        const alter = R.zinsen(s, this.jahr, z.rnd, this.regeln);
        if (alter.zins) {
          eintrag.meldungen.push({ art: 'zinsen', text: `Zinsen und Erträge: ${alter.zins} Taler.` });
        } else if (alter.verlaengert) {
          eintrag.meldungen.push({
            art: 'alter',
            text: 'Ihre Jahre sind gezählt. Gott hat Ihnen ein weiteres geschenkt.'
          });
        } else if (alter.gestorben) {
          eintrag.meldungen.push({
            art: 'tod',
            text: `${R.anrede(s)} ist an Altersschwäche verschieden.`
          });
          eintrag.zeremonien.push({ art: 'tod', anrede: R.anrede(s), jahr: this.jahr });
        }
        R.armeeAktualisieren(s);
      }
      eintrag.stand = this.oeffentlicherStand(s);
      bericht.spieler.push(eintrag);
    }

    this.log.push(bericht);
    if (this.log.length > 30) this.log.shift();
    this.letzterBericht = bericht;

    if (this.sieger) { this.phase = PHASEN.ENDE; return bericht; }
    // Sind alle Regenten tot, ist die Runde vorbei. Einen Kaiser gibt es dann
    // nicht; das Original kennt fuer diesen Fall keinen Bildschirm.
    if (this.spieler.length && this.lebende.length === 0) {
      this.phase = PHASEN.ENDE;
      return bericht;
    }
    this.jahr++;
    this.rundeVorbereiten();
    return bericht;
  }

  /** Alle Regenten, die noch leben. */
  get lebende() { return this.spieler.filter(s => !s.tot); }

  /** Fuehrt einen einzelnen Krieg aus, Zeile 253-352. */
  kriegAusfuehren(k, rnd) {
    const a = this.spielerVon(k.angreifer);
    const v = this.spielerVon(k.verteidiger);
    if (!a || !v) return null;

    // ------------------------------------------------ Haltungen der Uebrigen
    //
    // Zeile 264: Fuerstentuemer ohne Regenten bekommen die Haltung 0, also
    // neutral. Und neutral heisst im Original: kein Durchmarsch. Bei wenigen
    // Spielern besteht die Karte ueberwiegend aus solchen Laendern, und genau
    // deshalb ist dort fast nur der unmittelbare Nachbar angreifbar.
    const haltung = id => {
      const z = this.zustand[id];
      return z && z.haltungen[k.id] != null ? z.haltungen[k.id] : HALTUNG.NEUTRAL;
    };
    const spielerInRegion = r => this.spieler.find(s => s.region === r);
    const haltungVonRegion = r => {
      if (r === a.region) return HALTUNG.DURCHMARSCH;      // Zeile 266
      const t = spielerInRegion(r);
      return t ? haltung(t.id) : HALTUNG.NEUTRAL;          // Zeile 264
    };

    /**
     * Sucht einen Weg von einer Region zum Verteidiger, Zeile 446 bis 455.
     * Gesperrt sind Zwischenlaender mit einer der beiden genannten Haltungen.
     * Ein Weg der Laenge zwei ist eine gemeinsame Grenze und immer gangbar,
     * ganz gleich, was die Nachbarn sagen (Zeile 451).
     */
    const wegSuchen = (von, gesperrt) => {
      for (const p of (WEGE[von] || {})[v.region] || []) {
        if (p.length === 2) return p;
        if (p.slice(1, -1).every(r => !gesperrt.includes(haltungVonRegion(r)))) return p;
      }
      return null;
    };

    // Der Weg des Hauptheeres, Zeile 267 bis 276: gesperrt ist alles unter
    // "Durchmarsch gewaehrt".
    const pfad = wegSuchen(a.region, [HALTUNG.NEUTRAL, HALTUNG.HILFE_VERTEIDIGER]);
    if (!pfad) {
      return { angreifer: a.name, verteidiger: v.name, abgebrochen: true,
               text: `Alle Wege nach ${REGIONEN[v.region]} sind versperrt!` };
    }

    // Moral nach Weglaenge, Zeile 277: ein langer Anmarsch zehrt an der Truppe
    a.moral = a.moral * 2 / pfad.length;

    // ------------------------------------------------------ Hilfstruppen
    //
    // Zeile 278 und 279: wer helfen will, braucht selbst einen Weg zum
    // Schlachtfeld, und zwar durch Laender, die auf seiner Seite stehen.
    // Zeile 446 sperrt fuer den Helfer des Angreifers die Haltungen 0 und 1,
    // Zeile 447 fuer den Helfer des Verteidigers die Haltungen 2 und 3.
    // Kommt er nicht durch, sinkt seine Haltung um eins und er schickt nichts
    // (Zeile 456 bis 458).
    const geliehen = [];
    const gescheitert = [];
    for (const h of this.spieler) {
      if (h.id === a.id || h.id === v.id) continue;
      const st = haltung(h.id);
      let seite = null, gesperrt = null;
      if (st === HALTUNG.DURCHMARSCH_HILFE) {
        seite = a; gesperrt = [HALTUNG.NEUTRAL, HALTUNG.HILFE_VERTEIDIGER];
      } else if (st === HALTUNG.HILFE_VERTEIDIGER) {
        seite = v; gesperrt = [HALTUNG.DURCHMARSCH, HALTUNG.DURCHMARSCH_HILFE];
      }
      if (!seite) continue;
      if (!wegSuchen(h.region, gesperrt)) {
        gescheitert.push(h.name);
        this.zustand[h.id].haltungen[k.id] = st - 1;       // Zeile 456
        continue;
      }
      const anteil = { kavallerie: h.kavallerie, artillerie: h.artillerie, infanterie: h.infanterie };
      if (!anteil.kavallerie && !anteil.artillerie && !anteil.infanterie) continue;
      const sSold = seite.soldaten, hSold = h.soldaten;
      seite.kavallerie += anteil.kavallerie;
      seite.artillerie += anteil.artillerie;
      seite.infanterie += anteil.infanterie;
      // Zeile 282 und 286: o(c) wird gemischt, und o(i)=o(c) zieht den Helfer
      // auf denselben Wert. Beistand kostet also auch Kampfgeist.
      const gemischt = (sSold * seite.moral + hSold * h.moral) / (sSold + hSold || 1);
      seite.moral = gemischt;
      h.moral = gemischt;
      h.kavallerie = 0; h.artillerie = 0; h.infanterie = 0;
      R.armeeAktualisieren(seite);
      // Der Helfer wird bewusst NICHT neu berechnet, solange seine Truppen fort sind:
      // die Mindestarmee aus Zeile 764 wuerde ihm sonst Ersatztruppen schenken.
      geliehen.push({ helfer: h, seite, anteil });
    }

    // Das in der Diplomatiephase erzeugte Gelaende wiederverwenden
    const feld = k.feld
      ? { z: Uint8Array.from(k.feld), grenzspalte: Int8Array.from(k.grenzspalte) }
      : B.feldAufbauen(a, v, rnd);
    const erg = B.schlacht(a, v, feld, rnd, k.aufstellungA, k.aufstellungV, this.regeln);
    const abrechnung = B.abrechnen(a, v, erg, this.zustand[a.id].markt);

    // Geliehene Truppen zurueckgeben, Zeile 331-350
    const entschaedigungen = [];
    for (const g of geliehen) {
      const preis = { kavallerie: 2000, artillerie: 1300, infanterie: 900 };
      let schuld = 0;
      for (const art of ['kavallerie', 'artillerie', 'infanterie']) {
        const zurueck = Math.min(g.anteil[art], g.seite[art]);
        g.seite[art] -= zurueck;
        g.helfer[art] += zurueck;
        const fehlend = g.anteil[art] - zurueck;
        if (fehlend > 0) schuld += fehlend * preis[art];
      }
      if (schuld > 0) {
        g.seite.kasse -= schuld;
        g.helfer.kasse += schuld;
        entschaedigungen.push({ von: g.seite.name, an: g.helfer.name, taler: schuld });
      }
      R.armeeAktualisieren(g.seite);
      R.armeeAktualisieren(g.helfer);
    }

    R.armeeAktualisieren(a);
    R.armeeAktualisieren(v);

    return {
      id: k.id,
      angreifer: a.name, verteidiger: v.name,
      pfad: pfad.map(r => REGIONEN[r]),
      // Zeile 458: wer helfen wollte, aber nicht durchkam
      nichtDurchgekommen: gescheitert,
      landAngreifer: erg.landAngreifer,
      verluste: erg.verluste,
      gebaeude: abrechnung.seiten.map(x => x.gebaeude),
      einwohner: abrechnung.seiten.map(x => x.einwohner),
      kasse: abrechnung.seiten.map(x => x.kasse),
      praemie: abrechnung.praemie || 0,
      entschaedigungen,
      feld: Array.from(erg.feld.z),
      grenzspalte: Array.from(erg.feld.grenzspalte),
      // Fuer die Animation: Ausgangsbild und alle Feldaenderungen der Schlacht
      startbild: erg.startbild,
      aufzeichnung: erg.aufzeichnung,
      ereignisse: erg.ereignisse.slice(0, 400)
    };
  }

  // ---------------------------------------------------------------- Sicht

  oeffentlicherStand(s) {
    return {
      id: s.id, name: s.name, region: REGIONEN[s.region], regionIndex: s.region,
      titel: R.titelName(s), titelStufe: s.titel, anrede: R.anrede(s),
      punkte: s.punkte, soldaten: s.soldaten, land: s.land, kasse: s.kasse,
      einwohner: s.einwohner, kaiser: s.kaiser,
      tot: !!s.tot, gestorbenIn: s.gestorbenIn || null
    };
  }

  /** Vollstaendige Sicht fuer einen bestimmten Spieler. */
  sichtFuer(id) {
    const s = this.spielerVon(id);
    const z = s ? this.zustand[s.id] : null;
    return {
      spielId: this.id, name: this.name, jahr: this.jahr, phase: this.phase,
      gestartet: this.gestartet, sieger: this.sieger,
      regelwerk: { id: this.regeln.id, name: this.regeln.name, kurz: this.regeln.kurz },
      freiesLand: Number.isFinite(this.freiesLand) ? this.freiesLand : null,
      frist: this.frist,
      planungsSekunden: this.planungsSekunden,
      diplomatieSekunden: this.diplomatieSekunden,
      spieler: this.spieler.map(p => ({
        ...this.oeffentlicherStand(p),
        fertig: this.zustand[p.id] ? !!this.zustand[p.id].fertig : false,
        diplomatieFertig: this.zustand[p.id] ? !!this.zustand[p.id].diplomatieFertig : false,
        aussetzen: this.zustand[p.id] ? !!this.zustand[p.id].aussetzen : false,
        tot: !!p.tot,
        selbst: p.id === id
      })),
      kriege: (this.kriege || []).map(k => {
        const beteiligt = k.angreifer === id || k.verteidiger === id;
        const istAngreifer = k.angreifer === id;
        return {
          id: k.id,
          angreifer: this.spielerVon(k.angreifer)?.name,
          verteidiger: this.spielerVon(k.verteidiger)?.name,
          angreiferId: k.angreifer, verteidigerId: k.verteidiger,
          beteiligt, istAngreifer,
          haltung: z ? (z.haltungen[k.id] ?? null) : null,
          // Gelaende und eigene Einheiten nur fuer die beiden Kriegsparteien
          feld: beteiligt ? k.feld : null,
          spalte: beteiligt ? (istAngreifer ? B.SPALTE_ANGREIFER : B.SPALTE_VERTEIDIGER) : null,
          // Der Grenzverlauf, damit der Client dieselbe grenznahe Aufstellung
          // anbieten kann wie der Feldherr (siehe B.FELDHERR_ABSTAND).
          grenzspalte: beteiligt ? (k.grenzspalte || null) : null,
          einheiten: beteiligt ? (istAngreifer ? k.einheitenA : k.einheitenV) : null,
          aufstellung: beteiligt ? (istAngreifer ? k.aufstellungA : k.aufstellungV) : null,
          // Wer die naechste Einheit setzt, und was man selbst noch im Vorrat
          // hat. Beides braucht der Browser, um zu zeigen, wer dran ist.
          amZug: beteiligt ? (k.amZug === (istAngreifer ? 'angreifer' : 'verteidiger') ? 'ich'
                            : k.amZug ? 'gegner' : null) : null,
          abgegeben: beteiligt ? !!(istAngreifer ? k.fertigA : k.fertigV) : null,
          // Das Original stellt beide Parteien auf demselben Bildschirm auf,
          // abwechselnd und fuer alle sichtbar (Zeile 292 bis 295). Es gibt
          // dort keine verdeckte Aufstellung, also gibt es sie hier auch nicht.
          gegnerSpalte: beteiligt ? (istAngreifer ? B.SPALTE_VERTEIDIGER : B.SPALTE_ANGREIFER) : null,
          gegnerEinheiten: beteiligt ? (istAngreifer ? k.einheitenV : k.einheitenA) : null,
          gegnerAufstellung: beteiligt ? (istAngreifer ? k.aufstellungV : k.aufstellungA) : null
        };
      }),
      // Der eigene Stand, ohne die Werte, die das Original nie zeigt: Moral,
      // Todesjahr, Handel, Wohlstand, Gebaeudebonus, die Sperrfrist fuer den
      // naechsten Krieg und die Kennzahl des Titelaufstiegs rechnet das
      // Programm im Verborgenen (siehe TEXTE.md). Sie gehen darum auch nicht
      // ueber die Leitung; der Grund einer Amtsenthebung kommt als Meldung.
      ich: s ? (({ moral, lebenszeit, handel, wohlstand, gebaeudeBonus,
                   gesperrtBis, enthebungsGrund, ...rest }) => ({
        ...rest,
        anrede: R.anrede(s),
        titelName: R.titelName(s),
        regionName: REGIONEN[s.region],
        bedarf: R.kornBedarf(s)
      }))(s) : null,
      // Die Reichskarte hängt nur am eigenen Stand und wird bei Bedarf frisch
      // gezeichnet, damit Bauten sofort darauf erscheinen.
      karte: s && !this.zustand[s.id]?.aussetzen
        ? karteBauen(s, R.makeRng(this.seed + this.rundenNr * 7717 + s.region))
        : null,
      runde: z ? {
        tot: !!z.tot, aussetzen: z.aussetzen, fertig: z.fertig, schritt: z.schritt,
        markt: z.markt, preise: z.preise,
        steuerVorschau: s && z.steuerFaktoren ? R.steuern(s, z.steuerFaktoren) : null,
        verteiltesKorn: z.verteiltesKorn,
        bevoelkerung: z.bevoelkerung || null,
        einnahmen: z.einnahmen || null,
        steuernEingezogen: z.steuernEingezogen || null,
        krieg: z.krieg, meldungen: z.meldungen,
        diplomatieFertig: !!z.diplomatieFertig
      } : null,
      // Die Nachbarschaften des Reiches. Sie aendern sich nie, aber der Client
      // braucht sie fuer die Uebersichtskarte.
      reich: { regionen: REGIONEN, nachbarn: NACHBARN },
      letzterBericht: this.letzterBericht || null
    };
  }
}
