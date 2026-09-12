// Kontoverwaltung fuer die Lobby.
//
// Ein Konto ist ein Name und ein Kennwort. Damit meldet sich ein Spieler an
// und bekommt eine Sitzungskennung, die im Browser gespeichert wird. Das
// Kennwort wird nur als Streuwert abgelegt, nie im Klartext und nie an einen
// Client geschickt.
//
// Das erste angelegte Konto wird Verwalter. Verwalter koennen Konten anlegen,
// loeschen, sperren, das Kennwort zuruecksetzen und die offene Registrierung
// ein- und ausschalten.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const STREU_LAENGE = 32;
const SALZ_LAENGE = 16;
const SITZUNGSDAUER = 30 * 24 * 3600 * 1000;   // 30 Tage
const MAX_FEHLVERSUCHE = 8;
const SPERRDAUER = 5 * 60 * 1000;              // 5 Minuten

/** Bremse fuer die offene Registrierung. */
export const BREMSE = {
  proQuelleStunde: 3,      // Konten je Herkunftsadresse und Stunde
  proQuelleTag: 10,        // Konten je Herkunftsadresse und Tag
  gesamtStunde: 20,        // Konten insgesamt je Stunde
  hoechstzahl: 200         // so viele Konten insgesamt, dann ist Schluss
};
const STUNDE = 3600 * 1000;
const TAG = 24 * STUNDE;

/** Normiert einen Spielernamen: Grossbuchstaben, hoechstens 14 Zeichen. */
export function nameNormieren(name) {
  return String(name || '').trim().toUpperCase().slice(0, 14);
}

/** Prueft, ob ein Name als Kontoname taugt. */
export function nameGueltig(name) {
  return /^[A-ZÄÖÜß0-9 .\-]{2,14}$/.test(name);
}

function streuen(kennwort, salz) {
  return crypto.scryptSync(String(kennwort), salz, STREU_LAENGE).toString('hex');
}

function gleich(a, b) {
  const x = Buffer.from(String(a), 'utf8'), y = Buffer.from(String(b), 'utf8');
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

export class Konten {
  /** @param {string} [datei] Ablageort; ohne Angabe wird nichts gespeichert. */
  constructor(datei) {
    this.datei = datei || null;
    this.konten = new Map();        // Name -> Konto
    this.sitzungen = new Map();     // Kennung -> { name, gueltigBis }
    this.fehlversuche = new Map();  // Name -> { anzahl, bis }
    this.anmeldungen = [];          // { quelle, zeit } der offenen Registrierungen
    this.einstellungen = { registrierungOffen: true };
    this.laden();
  }

  laden() {
    if (!this.datei || !fs.existsSync(this.datei)) return;
    try {
      const d = JSON.parse(fs.readFileSync(this.datei, 'utf8'));
      for (const k of d.konten || []) this.konten.set(k.name, k);
      const jetzt = Date.now();
      for (const s of d.sitzungen || []) {
        if (s.gueltigBis > jetzt) this.sitzungen.set(s.kennung, { name: s.name, gueltigBis: s.gueltigBis });
      }
      if (d.einstellungen) Object.assign(this.einstellungen, d.einstellungen);
      this.anmeldungen = (d.anmeldungen || []).filter(a => jetzt - a.zeit < TAG);
    } catch (e) {
      console.error('Konten konnten nicht geladen werden:', e.message);
    }
  }

  sichern() {
    if (!this.datei) return;
    try {
      fs.mkdirSync(path.dirname(this.datei), { recursive: true });
      const d = {
        einstellungen: this.einstellungen,
        konten: [...this.konten.values()],
        sitzungen: [...this.sitzungen.entries()].map(([kennung, s]) => ({ kennung, ...s })),
        anmeldungen: this.anmeldungen
      };
      fs.writeFileSync(this.datei + '.tmp', JSON.stringify(d));
      fs.renameSync(this.datei + '.tmp', this.datei);
    } catch (e) {
      console.error('Konten konnten nicht gesichert werden:', e.message);
    }
  }

  gibtEs(name) { return this.konten.has(nameNormieren(name)); }
  anzahl() { return this.konten.size; }
  verwalterZahl() { return [...this.konten.values()].filter(k => k.admin).length; }

  // ------------------------------------------------------------ Registrierung

  /**
   * Prueft die Bremse. Liefert null, wenn angelegt werden darf, sonst einen
   * Klartext, warum nicht.
   */
  bremse(quelle) {
    if (!this.einstellungen.registrierungOffen) {
      return 'Neue Konten legt zurzeit nur die Verwaltung an. Bitte dort melden.';
    }
    if (this.konten.size >= BREMSE.hoechstzahl) {
      return 'Es gibt schon zu viele Konten. Bitte bei der Verwaltung melden.';
    }
    const jetzt = Date.now();
    this.anmeldungen = this.anmeldungen.filter(a => jetzt - a.zeit < TAG);

    const vonHier = this.anmeldungen.filter(a => a.quelle === quelle);
    if (vonHier.filter(a => jetzt - a.zeit < STUNDE).length >= BREMSE.proQuelleStunde) {
      return 'Von dieser Adresse wurden gerade mehrere Konten angelegt. Bitte in einer Stunde erneut versuchen.';
    }
    if (vonHier.length >= BREMSE.proQuelleTag) {
      return 'Von dieser Adresse wurden heute schon genug Konten angelegt. Bitte morgen erneut versuchen.';
    }
    if (this.anmeldungen.filter(a => jetzt - a.zeit < STUNDE).length >= BREMSE.gesamtStunde) {
      return 'Gerade werden auffällig viele Konten angelegt. Bitte später erneut versuchen.';
    }
    return null;
  }

  /**
   * Legt ein Konto an.
   * @param {object} [optionen] quelle = Herkunftsadresse, ohneBremse = von der
   *        Verwaltung angelegt, admin = soll Verwalter werden.
   */
  registrieren(name, kennwort, optionen = {}) {
    name = nameNormieren(name);
    if (!nameGueltig(name)) {
      return { fehler: 'Der Name braucht 2 bis 14 Zeichen: Buchstaben, Ziffern, Leerzeichen, Punkt oder Bindestrich.' };
    }
    if (this.konten.has(name)) return { fehler: 'Diesen Namen gibt es schon. Melden Sie sich an oder wählen Sie einen anderen.' };
    const z = String(kennwort || '');
    if (z.length < 4 || z.length > 64) return { fehler: 'Das Kennwort braucht mindestens 4 Zeichen.' };

    if (!optionen.ohneBremse) {
      const halt = this.bremse(optionen.quelle || 'unbekannt');
      if (halt) return { fehler: halt, gebremst: true };
    }

    const salz = crypto.randomBytes(SALZ_LAENGE).toString('hex');
    // Das erste Konto wird Verwalter, damit sich der Dienst ohne Handgriff
    // in Betrieb nehmen laesst.
    const ersterNutzer = this.konten.size === 0;
    const konto = {
      name, salz, streuwert: streuen(z, salz),
      angelegt: Date.now(), zuletzt: null,
      weiblich: false,
      admin: !!optionen.admin || ersterNutzer,
      gesperrt: false,
      email: optionen.email || null,
      eingeladen: optionen.email ? Date.now() : null,
      kennwortGeaendert: false,
      angelegtVon: optionen.angelegtVon || (ersterNutzer ? 'Erstanmeldung' : null)
    };
    this.konten.set(name, konto);
    if (!optionen.ohneBremse) this.anmeldungen.push({ quelle: optionen.quelle || 'unbekannt', zeit: Date.now() });
    this.sichern();
    return { konto, ersterNutzer };
  }

  // ------------------------------------------------------------ Anmeldung

  anmelden(name, kennwort) {
    name = nameNormieren(name);
    const sperre = this.fehlversuche.get(name);
    if (sperre && sperre.anzahl >= MAX_FEHLVERSUCHE && Date.now() < sperre.bis) {
      const rest = Math.ceil((sperre.bis - Date.now()) / 1000);
      return { fehler: `Zu viele Fehlversuche. Bitte ${rest} Sekunden warten.` };
    }
    const konto = this.konten.get(name);
    // Auch ohne Konto rechnen, damit die Antwortzeit nichts verrät
    const salz = konto ? konto.salz : 'x'.repeat(SALZ_LAENGE * 2);
    const streuwert = streuen(String(kennwort || ''), salz);
    if (!konto || !gleich(streuwert, konto.streuwert)) {
      const f = this.fehlversuche.get(name) || { anzahl: 0, bis: 0 };
      f.anzahl++; f.bis = Date.now() + SPERRDAUER;
      this.fehlversuche.set(name, f);
      return { fehler: 'Name oder Kennwort stimmt nicht.' };
    }
    if (konto.gesperrt) {
      return { fehler: 'Dieses Konto ist gesperrt. Bitte bei der Verwaltung melden.' };
    }
    this.fehlversuche.delete(name);
    konto.zuletzt = Date.now();
    const kennung = crypto.randomBytes(32).toString('hex');
    this.sitzungen.set(kennung, { name, gueltigBis: Date.now() + SITZUNGSDAUER });
    this.sichern();
    return { kennung, konto };
  }

  konto(kennung) {
    const s = this.sitzungen.get(kennung);
    if (!s) return null;
    if (s.gueltigBis < Date.now()) { this.sitzungen.delete(kennung); return null; }
    const k = this.konten.get(s.name);
    if (!k || k.gesperrt) return null;
    return k;
  }

  abmelden(kennung) {
    if (this.sitzungen.delete(kennung)) this.sichern();
  }

  /** Wirft alle Sitzungen eines Kontos weg. */
  sitzungenBeenden(name) {
    name = nameNormieren(name);
    let weg = 0;
    for (const [kennung, s] of this.sitzungen) {
      if (s.name === name) { this.sitzungen.delete(kennung); weg++; }
    }
    return weg;
  }

  anredeMerken(name, weiblich) {
    const k = this.konten.get(nameNormieren(name));
    if (!k) return;
    k.weiblich = !!weiblich;
    this.sichern();
  }

  // ------------------------------------------------------------ Verwaltung

  /** Liste aller Konten fuer die Verwaltung. */
  liste() {
    return [...this.konten.values()]
      .map(k => ({
        name: k.name, admin: !!k.admin, gesperrt: !!k.gesperrt,
        weiblich: !!k.weiblich, angelegt: k.angelegt, zuletzt: k.zuletzt,
        email: k.email || null, eingeladen: k.eingeladen || null,
        kennwortGeaendert: !!k.kennwortGeaendert,
        angelegtVon: k.angelegtVon || null,
        sitzungen: [...this.sitzungen.values()].filter(s => s.name === k.name).length
      }))
      .sort((a, b) => (b.admin - a.admin) || a.name.localeCompare(b.name, 'de'));
  }

  /** Zustand der Bremse, fuer die Verwaltungsansicht. */
  bremsenStand() {
    const jetzt = Date.now();
    const letzteStunde = this.anmeldungen.filter(a => jetzt - a.zeit < STUNDE).length;
    const letzterTag = this.anmeldungen.filter(a => jetzt - a.zeit < TAG).length;
    return {
      registrierungOffen: !!this.einstellungen.registrierungOffen,
      letzteStunde, letzterTag,
      konten: this.konten.size,
      grenzen: { ...BREMSE }
    };
  }

  registrierungSetzen(offen) {
    this.einstellungen.registrierungOffen = !!offen;
    this.sichern();
    return this.einstellungen.registrierungOffen;
  }

  /** Verwaltung legt ein Konto an, ohne Bremse. */
  nutzerAnlegen(name, kennwort, { admin = false, von = null, email = null } = {}) {
    return this.registrieren(name, kennwort, { ohneBremse: true, admin, angelegtVon: von, email });
  }

  /** Merkt sich, wann zuletzt eine Einladung verschickt wurde. */
  einladungVermerken(name, email) {
    const k = this.konten.get(nameNormieren(name));
    if (!k) return { fehler: 'Dieses Konto gibt es nicht.' };
    k.email = email || k.email;
    k.eingeladen = Date.now();
    k.kennwortGeaendert = false;
    this.sichern();
    return { ok: true };
  }

  /**
   * Ein Spieler ändert seine eigene Kennwort. Die alte muss stimmen; die
   * anderen Sitzungen desselben Kontos werden beendet.
   */
  eigenesKennwortAendern(name, alt, neu) {
    name = nameNormieren(name);
    const k = this.konten.get(name);
    if (!k) return { fehler: 'Dieses Konto gibt es nicht.' };
    if (!gleich(streuen(String(alt || ''), k.salz), k.streuwert)) {
      return { fehler: 'Das bisherige Kennwort stimmt nicht.' };
    }
    const z = String(neu || '');
    if (z.length < 4 || z.length > 64) return { fehler: 'Das neue Kennwort braucht mindestens 4 Zeichen.' };
    if (z === String(alt)) return { fehler: 'Das neue Kennwort muss sich vom alten unterscheiden.' };
    k.salz = crypto.randomBytes(SALZ_LAENGE).toString('hex');
    k.streuwert = streuen(z, k.salz);
    k.kennwortGeaendert = true;
    const weg = this.sitzungenBeenden(name);
    this.sichern();
    return { ok: true, sitzungenBeendet: weg };
  }

  /** Setzt ein neues Kennwort und wirft die alten Sitzungen weg. */
  kennwortSetzen(name, kennwort) {
    const k = this.konten.get(nameNormieren(name));
    if (!k) return { fehler: 'Dieses Konto gibt es nicht.' };
    const z = String(kennwort || '');
    if (z.length < 4 || z.length > 64) return { fehler: 'Das Kennwort braucht mindestens 4 Zeichen.' };
    k.salz = crypto.randomBytes(SALZ_LAENGE).toString('hex');
    k.streuwert = streuen(z, k.salz);
    k.kennwortGeaendert = false;
    const weg = this.sitzungenBeenden(k.name);
    this.fehlversuche.delete(k.name);
    this.sichern();
    return { ok: true, sitzungenBeendet: weg };
  }

  sperren(name, gesperrt) {
    const k = this.konten.get(nameNormieren(name));
    if (!k) return { fehler: 'Dieses Konto gibt es nicht.' };
    if (k.admin && gesperrt && this.verwalterZahl() <= 1) {
      return { fehler: 'Der letzte Verwalter kann nicht gesperrt werden.' };
    }
    k.gesperrt = !!gesperrt;
    if (k.gesperrt) this.sitzungenBeenden(k.name);
    this.sichern();
    return { ok: true };
  }

  adminSetzen(name, admin) {
    const k = this.konten.get(nameNormieren(name));
    if (!k) return { fehler: 'Dieses Konto gibt es nicht.' };
    if (k.admin && !admin && this.verwalterZahl() <= 1) {
      return { fehler: 'Es muss mindestens ein Verwalter bleiben.' };
    }
    k.admin = !!admin;
    this.sichern();
    return { ok: true };
  }

  loeschen(name) {
    const k = this.konten.get(nameNormieren(name));
    if (!k) return { fehler: 'Dieses Konto gibt es nicht.' };
    if (k.admin && this.verwalterZahl() <= 1) {
      return { fehler: 'Der letzte Verwalter kann nicht gelöscht werden.' };
    }
    this.sitzungenBeenden(k.name);
    this.konten.delete(k.name);
    this.fehlversuche.delete(k.name);
    this.sichern();
    return { ok: true };
  }

  /** Sicht für den Client, ohne Geheimnisse. */
  oeffentlich(konto) {
    if (!konto) return null;
    return {
      name: konto.name, weiblich: !!konto.weiblich,
      angelegt: konto.angelegt, admin: !!konto.admin,
      // Damit der Client zur Änderung raten kann, solange die Zahl aus der
      // Einladung unverändert ist
      ausEinladung: !!konto.eingeladen && !konto.kennwortGeaendert
    };
  }
}
