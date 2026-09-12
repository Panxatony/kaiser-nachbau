// sid.js -- Abspielen der originalen SID-Musik aus "Kaiser" (Sir Aliba, 1985)
// im Browser.
//
// Enthaelt einen 6502-Prozessorkern, eine Nachbildung des SID-Klangchips
// (drei Stimmen, Dreieck/Saegezahn/Rechteck/Rauschen, ADSR-Huellkurve) und
// die Anbindung an Web Audio.
//
// Bewusst NICHT nachgebildet:
//   * das analoge Filter des SID ($D415-$D417). Beide Kaiser-Stuecke schalten
//     das Filter nicht ein ($D418 wird nur mit $0F beschrieben, also
//     Lautstaerke 15 und kein Filter-Ausgang), deshalb faellt nichts weg.
//   * Ring-Modulation und Oszillator-Sync. Die Stuecke schreiben in die
//     Kontrollregister ausschliesslich $41 (Rechteck+Gate, Titelmusik) bzw.
//     $21 (Saegezahn+Gate, Abspann); Bit 1 (Sync) und Bit 2 (Ring) bleiben 0.
//   * Der Ausgang laeuft durch einen einfachen Hochpass (Gleichspannungs-
//     sperre), so wie beim echten C64 der Koppelkondensator am Klangausgang.
//   * kombinierte Wellenformen werden nur grob (bitweises UND) angenaehert;
//     sie kommen in beiden Stuecken nicht vor.
//
// Schnittstelle (siehe unten): musikLaden, abspielen, anhalten, lautstaerke.

export const TAKT_PAL = 985248;      // Taktfrequenz des C64 (PAL) in Hz

// ---------------------------------------------------------------------------
// SID-Klangchip
// ---------------------------------------------------------------------------

class SidChip {
  constructor() {
    this.ueberabtastung = 4;   // Zwischenschritte je Ausgabewert
    this.ruecksetzen();
  }

  ruecksetzen() {
    this.stimmen = [];
    for (let i = 0; i < 3; i++) {
      this.stimmen.push({
        frequenz: 0,
        pulsweite: 0,
        kontrolle: 0,
        angriff: 0, abfall: 0, halten: 0, ausklang: 0,
        phase: 0,            // 24-Bit-Phasenakkumulator (Gleitkomma)
        rauschAkku: 0,
        schieberegister: 0x7ffff8,
        huelle: 0,           // 0..255
        zustand: 3,          // 0=Angriff 1=Abfall 2=Halten 3=Ausklang
        tor: false,
        ratenZaehler: 0,
        expZaehler: 0
      });
    }
    this.lautstaerke = 15;
    // Einfacher Hochpass: der C64 koppelt seinen Klangausgang kapazitiv aus.
    // Ohne ihn erzeugen "Pausen"-Noten (Frequenz 0, Rechteck bleibt unten)
    // einen kraeftigen Gleichanteil und damit Knackser.
    this.hpEin = 0;
    this.hpAus = 0;
  }

  // Registerschreibzugriff, Registernummer 0..24
  schreiben(reg, wert) {
    wert &= 0xff;
    if (reg >= 21) {
      if (reg === 24) this.lautstaerke = wert & 0x0f;
      return;                       // Filterregister werden ignoriert
    }
    const s = this.stimmen[Math.floor(reg / 7)];
    switch (reg % 7) {
      case 0: s.frequenz = (s.frequenz & 0xff00) | wert; break;
      case 1: s.frequenz = (s.frequenz & 0x00ff) | (wert << 8); break;
      case 2: s.pulsweite = (s.pulsweite & 0x0f00) | wert; break;
      case 3: s.pulsweite = (s.pulsweite & 0x00ff) | ((wert & 0x0f) << 8); break;
      case 4: this.kontrolleSetzen(s, wert); break;
      case 5: s.angriff = wert >> 4; s.abfall = wert & 0x0f; break;
      case 6: s.halten = wert >> 4; s.ausklang = wert & 0x0f; break;
    }
  }

  kontrolleSetzen(s, wert) {
    const torNeu = (wert & 1) !== 0;
    if (torNeu && !s.tor) {          // Tor an -> Angriffsphase
      s.zustand = 0;
      s.ratenZaehler = 0;
      s.expZaehler = 0;
    } else if (!torNeu && s.tor) {   // Tor aus -> Ausklang
      s.zustand = 3;
    }
    s.tor = torNeu;
    if (wert & 0x08) {               // Testbit setzt den Oszillator zurueck
      s.phase = 0;
      s.rauschAkku = 0;
      s.schieberegister = 0x7ffff8;
    }
    s.kontrolle = wert;
  }

  // Zaehlerperioden der Huellkurve in Taktzyklen (nach reSID)
  static get RATEN() {
    return [9, 32, 63, 95, 149, 220, 267, 313, 392, 977,
            1954, 3126, 3907, 11719, 19531, 31250];
  }

  static expPeriode(huelle) {
    if (huelle > 93) return 1;
    if (huelle > 54) return 2;
    if (huelle > 26) return 4;
    if (huelle > 14) return 8;
    if (huelle > 6) return 16;
    if (huelle > 0) return 30;
    return 0;                        // 0 = angekommen, kein weiterer Schritt
  }

  huelleTakten(s, takte) {
    const raten = SidChip.RATEN;
    let rate;
    if (s.zustand === 0) rate = raten[s.angriff];
    else if (s.zustand === 1) rate = raten[s.abfall];
    else if (s.zustand === 3) rate = raten[s.ausklang];
    else rate = raten[s.abfall];     // Haltephase: kein Schritt noetig
    s.ratenZaehler += takte;
    let schritte = Math.floor(s.ratenZaehler / rate);
    if (schritte <= 0) return;
    s.ratenZaehler -= schritte * rate;
    if (schritte > 256) schritte = 256;
    while (schritte-- > 0) {
      if (s.zustand === 0) {
        s.huelle++;
        if (s.huelle >= 255) { s.huelle = 255; s.zustand = 1; s.expZaehler = 0; }
      } else if (s.zustand === 1) {
        const ziel = s.halten * 0x11;
        if (s.huelle <= ziel) { s.zustand = 2; continue; }
        const p = SidChip.expPeriode(s.huelle);
        if (p === 0) continue;
        if (++s.expZaehler >= p) { s.expZaehler = 0; s.huelle--; }
      } else if (s.zustand === 3) {
        if (s.huelle === 0) continue;
        const p = SidChip.expPeriode(s.huelle);
        if (p === 0) { s.huelle = 0; continue; }
        if (++s.expZaehler >= p) { s.expZaehler = 0; s.huelle--; }
      } else {
        const ziel = s.halten * 0x11;
        if (s.huelle > ziel) s.huelle--;
        else if (s.huelle < ziel) s.huelle = ziel;
      }
    }
  }

  schiebenRauschen(s) {
    const bit = (((s.schieberegister >>> 22) ^ (s.schieberegister >>> 17)) & 1);
    s.schieberegister = ((s.schieberegister << 1) | bit) & 0x7fffff;
  }

  oszillatorTakten(s, takte) {
    if (s.kontrolle & 0x08) return;  // Testbit haelt den Oszillator an
    const zuwachs = s.frequenz * takte;
    s.phase += zuwachs;
    if (s.phase >= 16777216) s.phase = s.phase % 16777216;
    s.rauschAkku += zuwachs;
    while (s.rauschAkku >= 1048576) {   // Bit 19 des Akkumulators steigt
      s.rauschAkku -= 1048576;
      this.schiebenRauschen(s);
    }
  }

  wellenform(s) {
    const w = (s.kontrolle >> 4) & 0x0f;
    if (w === 0) return 0;
    const akku = s.phase | 0;
    let ergebnis = 0xfff;
    if (w & 1) {                     // Dreieck
      const msb = akku & 0x800000;
      ergebnis &= ((msb ? (~akku) : akku) >>> 11) & 0xfff;
    }
    if (w & 2) {                     // Saegezahn
      ergebnis &= (akku >>> 12) & 0xfff;
    }
    if (w & 4) {                     // Rechteck
      ergebnis &= ((akku >>> 12) >= s.pulsweite) ? 0xfff : 0x000;
    }
    if (w & 8) {                     // Rauschen
      const r = s.schieberegister;
      ergebnis &= ((r & 0x400000) >>> 11) | ((r & 0x100000) >>> 10) |
                  ((r & 0x010000) >>> 7) | ((r & 0x002000) >>> 5) |
                  ((r & 0x000800) >>> 4) | ((r & 0x000080) >>> 1) |
                  ((r & 0x000010) << 1) | ((r & 0x000004) << 2);
    }
    return ergebnis;
  }

  // Erzeugt einen Ausgabewert und laesst den Chip dabei "takte" Zyklen laufen.
  abtastwert(takte) {
    const n = this.ueberabtastung;
    const teil = takte / n;
    let summe = 0;
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < 3; i++) {
        const s = this.stimmen[i];
        this.oszillatorTakten(s, teil);
        this.huelleTakten(s, teil);
      }
      for (let i = 0; i < 3; i++) {
        const s = this.stimmen[i];
        summe += (this.wellenform(s) - 2048) * s.huelle;
      }
    }
    // 3 Stimmen * 2048 * 255 = Vollausschlag
    const roh = (summe / n) * (this.lautstaerke / 15) / (3 * 2048 * 255);
    this.hpAus = 0.9985 * (this.hpAus + roh - this.hpEin);
    this.hpEin = roh;
    return this.hpAus;
  }
}

// ---------------------------------------------------------------------------
// 6502-Prozessorkern (alle dokumentierten Befehle)
// ---------------------------------------------------------------------------

class Cpu6502 {
  constructor(lesen, schreiben) {
    this.lesen = lesen;
    this.schreiben = schreiben;
    this.a = 0; this.x = 0; this.y = 0; this.sp = 0xfd; this.pc = 0;
    this.fn = false; this.fv = false; this.fd = false;
    this.fi = true; this.fz = false; this.fc = false;
    this.schritte = 0;
  }

  status() {
    return (this.fn ? 0x80 : 0) | (this.fv ? 0x40 : 0) | 0x20 |
           (this.fd ? 0x08 : 0) | (this.fi ? 0x04 : 0) |
           (this.fz ? 0x02 : 0) | (this.fc ? 0x01 : 0);
  }

  statusSetzen(w) {
    this.fn = (w & 0x80) !== 0; this.fv = (w & 0x40) !== 0;
    this.fd = (w & 0x08) !== 0; this.fi = (w & 0x04) !== 0;
    this.fz = (w & 0x02) !== 0; this.fc = (w & 0x01) !== 0;
  }

  nz(w) { this.fz = (w & 0xff) === 0; this.fn = (w & 0x80) !== 0; return w & 0xff; }

  hole() { const w = this.lesen(this.pc); this.pc = (this.pc + 1) & 0xffff; return w; }
  hole16() { const l = this.hole(); return l | (this.hole() << 8); }

  ablegen(w) { this.schreiben(0x0100 | this.sp, w & 0xff); this.sp = (this.sp - 1) & 0xff; }
  holenVomStapel() { this.sp = (this.sp + 1) & 0xff; return this.lesen(0x0100 | this.sp); }

  // Ruft eine Unterroutine auf und laeuft, bis sie per RTS zurueckkehrt.
  aufrufen(adresse, akku, obergrenze) {
    const ende = 0xffff;
    this.a = akku & 0xff; this.x = 0; this.y = 0;
    this.sp = 0xfd; this.fi = true; this.fd = false;
    this.ablegen((ende - 1) >> 8);
    this.ablegen((ende - 1) & 0xff);
    this.pc = adresse & 0xffff;
    const grenze = obergrenze || 2000000;
    let n = 0;
    while (this.pc !== ende && n++ < grenze) this.schritt();
    return n;
  }

  // Adressberechnung
  adrZp() { return this.hole(); }
  adrZpX() { return (this.hole() + this.x) & 0xff; }
  adrZpY() { return (this.hole() + this.y) & 0xff; }
  adrAbs() { return this.hole16(); }
  adrAbsX() { return (this.hole16() + this.x) & 0xffff; }
  adrAbsY() { return (this.hole16() + this.y) & 0xffff; }
  adrIndX() { const z = (this.hole() + this.x) & 0xff;
              return this.lesen(z) | (this.lesen((z + 1) & 0xff) << 8); }
  adrIndY() { const z = this.hole();
              return ((this.lesen(z) | (this.lesen((z + 1) & 0xff) << 8)) + this.y) & 0xffff; }

  verzweigen(bedingung) {
    const d = this.hole();
    if (bedingung) this.pc = (this.pc + (d < 128 ? d : d - 256)) & 0xffff;
  }

  vergleichen(reg, wert) {
    const r = (reg - wert) & 0x1ff;
    this.fc = reg >= wert;
    this.nz(r);
  }

  adc(wert) {
    if (this.fd) {                                  // Dezimalmodus
      let lo = (this.a & 0x0f) + (wert & 0x0f) + (this.fc ? 1 : 0);
      let hi = (this.a >> 4) + (wert >> 4);
      if (lo > 9) { lo += 6; hi++; }
      this.fz = ((this.a + wert + (this.fc ? 1 : 0)) & 0xff) === 0;
      this.fn = (hi & 8) !== 0;
      this.fv = ((((hi << 4) ^ this.a) & 0x80) && !((this.a ^ wert) & 0x80)) ? true : false;
      if (hi > 9) hi += 6;
      this.fc = hi > 15;
      this.a = ((hi << 4) | (lo & 0x0f)) & 0xff;
      return;
    }
    const s = this.a + wert + (this.fc ? 1 : 0);
    this.fc = s > 0xff;
    this.fv = (~(this.a ^ wert) & (this.a ^ s) & 0x80) !== 0;
    this.a = this.nz(s);
  }

  sbc(wert) {
    if (this.fd) {
      const uebertrag = this.fc ? 0 : 1;
      let lo = (this.a & 0x0f) - (wert & 0x0f) - uebertrag;
      let hi = (this.a >> 4) - (wert >> 4);
      if (lo & 0x10) { lo -= 6; hi--; }
      if (hi & 0x10) hi -= 6;
      const s = this.a - wert - uebertrag;
      this.fc = (s & 0x100) === 0;
      this.fv = ((this.a ^ wert) & (this.a ^ s) & 0x80) !== 0;
      this.nz(s);
      this.a = ((hi << 4) | (lo & 0x0f)) & 0xff;
      return;
    }
    this.adc((~wert) & 0xff);
  }

  schritt() {
    this.schritte++;
    const op = this.hole();
    let a, w;
    switch (op) {
      // --- Laden / Speichern
      case 0xa9: this.a = this.nz(this.hole()); break;
      case 0xa5: this.a = this.nz(this.lesen(this.adrZp())); break;
      case 0xb5: this.a = this.nz(this.lesen(this.adrZpX())); break;
      case 0xad: this.a = this.nz(this.lesen(this.adrAbs())); break;
      case 0xbd: this.a = this.nz(this.lesen(this.adrAbsX())); break;
      case 0xb9: this.a = this.nz(this.lesen(this.adrAbsY())); break;
      case 0xa1: this.a = this.nz(this.lesen(this.adrIndX())); break;
      case 0xb1: this.a = this.nz(this.lesen(this.adrIndY())); break;
      case 0xa2: this.x = this.nz(this.hole()); break;
      case 0xa6: this.x = this.nz(this.lesen(this.adrZp())); break;
      case 0xb6: this.x = this.nz(this.lesen(this.adrZpY())); break;
      case 0xae: this.x = this.nz(this.lesen(this.adrAbs())); break;
      case 0xbe: this.x = this.nz(this.lesen(this.adrAbsY())); break;
      case 0xa0: this.y = this.nz(this.hole()); break;
      case 0xa4: this.y = this.nz(this.lesen(this.adrZp())); break;
      case 0xb4: this.y = this.nz(this.lesen(this.adrZpX())); break;
      case 0xac: this.y = this.nz(this.lesen(this.adrAbs())); break;
      case 0xbc: this.y = this.nz(this.lesen(this.adrAbsX())); break;
      case 0x85: this.schreiben(this.adrZp(), this.a); break;
      case 0x95: this.schreiben(this.adrZpX(), this.a); break;
      case 0x8d: this.schreiben(this.adrAbs(), this.a); break;
      case 0x9d: this.schreiben(this.adrAbsX(), this.a); break;
      case 0x99: this.schreiben(this.adrAbsY(), this.a); break;
      case 0x81: this.schreiben(this.adrIndX(), this.a); break;
      case 0x91: this.schreiben(this.adrIndY(), this.a); break;
      case 0x86: this.schreiben(this.adrZp(), this.x); break;
      case 0x96: this.schreiben(this.adrZpY(), this.x); break;
      case 0x8e: this.schreiben(this.adrAbs(), this.x); break;
      case 0x84: this.schreiben(this.adrZp(), this.y); break;
      case 0x94: this.schreiben(this.adrZpX(), this.y); break;
      case 0x8c: this.schreiben(this.adrAbs(), this.y); break;
      // --- Register verschieben
      case 0xaa: this.x = this.nz(this.a); break;
      case 0xa8: this.y = this.nz(this.a); break;
      case 0x8a: this.a = this.nz(this.x); break;
      case 0x98: this.a = this.nz(this.y); break;
      case 0xba: this.x = this.nz(this.sp); break;
      case 0x9a: this.sp = this.x; break;
      // --- Stapel
      case 0x48: this.ablegen(this.a); break;
      case 0x68: this.a = this.nz(this.holenVomStapel()); break;
      case 0x08: this.ablegen(this.status() | 0x10); break;
      case 0x28: this.statusSetzen(this.holenVomStapel()); break;
      // --- Logik
      case 0x09: this.a = this.nz(this.a | this.hole()); break;
      case 0x05: this.a = this.nz(this.a | this.lesen(this.adrZp())); break;
      case 0x15: this.a = this.nz(this.a | this.lesen(this.adrZpX())); break;
      case 0x0d: this.a = this.nz(this.a | this.lesen(this.adrAbs())); break;
      case 0x1d: this.a = this.nz(this.a | this.lesen(this.adrAbsX())); break;
      case 0x19: this.a = this.nz(this.a | this.lesen(this.adrAbsY())); break;
      case 0x01: this.a = this.nz(this.a | this.lesen(this.adrIndX())); break;
      case 0x11: this.a = this.nz(this.a | this.lesen(this.adrIndY())); break;
      case 0x29: this.a = this.nz(this.a & this.hole()); break;
      case 0x25: this.a = this.nz(this.a & this.lesen(this.adrZp())); break;
      case 0x35: this.a = this.nz(this.a & this.lesen(this.adrZpX())); break;
      case 0x2d: this.a = this.nz(this.a & this.lesen(this.adrAbs())); break;
      case 0x3d: this.a = this.nz(this.a & this.lesen(this.adrAbsX())); break;
      case 0x39: this.a = this.nz(this.a & this.lesen(this.adrAbsY())); break;
      case 0x21: this.a = this.nz(this.a & this.lesen(this.adrIndX())); break;
      case 0x31: this.a = this.nz(this.a & this.lesen(this.adrIndY())); break;
      case 0x49: this.a = this.nz(this.a ^ this.hole()); break;
      case 0x45: this.a = this.nz(this.a ^ this.lesen(this.adrZp())); break;
      case 0x55: this.a = this.nz(this.a ^ this.lesen(this.adrZpX())); break;
      case 0x4d: this.a = this.nz(this.a ^ this.lesen(this.adrAbs())); break;
      case 0x5d: this.a = this.nz(this.a ^ this.lesen(this.adrAbsX())); break;
      case 0x59: this.a = this.nz(this.a ^ this.lesen(this.adrAbsY())); break;
      case 0x41: this.a = this.nz(this.a ^ this.lesen(this.adrIndX())); break;
      case 0x51: this.a = this.nz(this.a ^ this.lesen(this.adrIndY())); break;
      case 0x24: w = this.lesen(this.adrZp());
                 this.fz = (this.a & w) === 0; this.fn = (w & 0x80) !== 0;
                 this.fv = (w & 0x40) !== 0; break;
      case 0x2c: w = this.lesen(this.adrAbs());
                 this.fz = (this.a & w) === 0; this.fn = (w & 0x80) !== 0;
                 this.fv = (w & 0x40) !== 0; break;
      // --- Arithmetik
      case 0x69: this.adc(this.hole()); break;
      case 0x65: this.adc(this.lesen(this.adrZp())); break;
      case 0x75: this.adc(this.lesen(this.adrZpX())); break;
      case 0x6d: this.adc(this.lesen(this.adrAbs())); break;
      case 0x7d: this.adc(this.lesen(this.adrAbsX())); break;
      case 0x79: this.adc(this.lesen(this.adrAbsY())); break;
      case 0x61: this.adc(this.lesen(this.adrIndX())); break;
      case 0x71: this.adc(this.lesen(this.adrIndY())); break;
      case 0xe9: case 0xeb: this.sbc(this.hole()); break;
      case 0xe5: this.sbc(this.lesen(this.adrZp())); break;
      case 0xf5: this.sbc(this.lesen(this.adrZpX())); break;
      case 0xed: this.sbc(this.lesen(this.adrAbs())); break;
      case 0xfd: this.sbc(this.lesen(this.adrAbsX())); break;
      case 0xf9: this.sbc(this.lesen(this.adrAbsY())); break;
      case 0xe1: this.sbc(this.lesen(this.adrIndX())); break;
      case 0xf1: this.sbc(this.lesen(this.adrIndY())); break;
      case 0xc9: this.vergleichen(this.a, this.hole()); break;
      case 0xc5: this.vergleichen(this.a, this.lesen(this.adrZp())); break;
      case 0xd5: this.vergleichen(this.a, this.lesen(this.adrZpX())); break;
      case 0xcd: this.vergleichen(this.a, this.lesen(this.adrAbs())); break;
      case 0xdd: this.vergleichen(this.a, this.lesen(this.adrAbsX())); break;
      case 0xd9: this.vergleichen(this.a, this.lesen(this.adrAbsY())); break;
      case 0xc1: this.vergleichen(this.a, this.lesen(this.adrIndX())); break;
      case 0xd1: this.vergleichen(this.a, this.lesen(this.adrIndY())); break;
      case 0xe0: this.vergleichen(this.x, this.hole()); break;
      case 0xe4: this.vergleichen(this.x, this.lesen(this.adrZp())); break;
      case 0xec: this.vergleichen(this.x, this.lesen(this.adrAbs())); break;
      case 0xc0: this.vergleichen(this.y, this.hole()); break;
      case 0xc4: this.vergleichen(this.y, this.lesen(this.adrZp())); break;
      case 0xcc: this.vergleichen(this.y, this.lesen(this.adrAbs())); break;
      // --- Inkrement / Dekrement
      case 0xe6: a = this.adrZp(); this.schreiben(a, this.nz(this.lesen(a) + 1)); break;
      case 0xf6: a = this.adrZpX(); this.schreiben(a, this.nz(this.lesen(a) + 1)); break;
      case 0xee: a = this.adrAbs(); this.schreiben(a, this.nz(this.lesen(a) + 1)); break;
      case 0xfe: a = this.adrAbsX(); this.schreiben(a, this.nz(this.lesen(a) + 1)); break;
      case 0xc6: a = this.adrZp(); this.schreiben(a, this.nz(this.lesen(a) - 1)); break;
      case 0xd6: a = this.adrZpX(); this.schreiben(a, this.nz(this.lesen(a) - 1)); break;
      case 0xce: a = this.adrAbs(); this.schreiben(a, this.nz(this.lesen(a) - 1)); break;
      case 0xde: a = this.adrAbsX(); this.schreiben(a, this.nz(this.lesen(a) - 1)); break;
      case 0xe8: this.x = this.nz(this.x + 1); break;
      case 0xca: this.x = this.nz(this.x - 1); break;
      case 0xc8: this.y = this.nz(this.y + 1); break;
      case 0x88: this.y = this.nz(this.y - 1); break;
      // --- Schieben / Rotieren
      case 0x0a: this.fc = (this.a & 0x80) !== 0; this.a = this.nz(this.a << 1); break;
      case 0x06: case 0x16: case 0x0e: case 0x1e:
        a = (op === 0x06) ? this.adrZp() : (op === 0x16) ? this.adrZpX()
          : (op === 0x0e) ? this.adrAbs() : this.adrAbsX();
        w = this.lesen(a); this.fc = (w & 0x80) !== 0;
        this.schreiben(a, this.nz(w << 1)); break;
      case 0x4a: this.fc = (this.a & 1) !== 0; this.a = this.nz(this.a >> 1); break;
      case 0x46: case 0x56: case 0x4e: case 0x5e:
        a = (op === 0x46) ? this.adrZp() : (op === 0x56) ? this.adrZpX()
          : (op === 0x4e) ? this.adrAbs() : this.adrAbsX();
        w = this.lesen(a); this.fc = (w & 1) !== 0;
        this.schreiben(a, this.nz(w >> 1)); break;
      case 0x2a: w = (this.a << 1) | (this.fc ? 1 : 0);
                 this.fc = (this.a & 0x80) !== 0; this.a = this.nz(w); break;
      case 0x26: case 0x36: case 0x2e: case 0x3e:
        a = (op === 0x26) ? this.adrZp() : (op === 0x36) ? this.adrZpX()
          : (op === 0x2e) ? this.adrAbs() : this.adrAbsX();
        w = this.lesen(a); const rl = (w << 1) | (this.fc ? 1 : 0);
        this.fc = (w & 0x80) !== 0; this.schreiben(a, this.nz(rl)); break;
      case 0x6a: w = (this.a >> 1) | (this.fc ? 0x80 : 0);
                 this.fc = (this.a & 1) !== 0; this.a = this.nz(w); break;
      case 0x66: case 0x76: case 0x6e: case 0x7e:
        a = (op === 0x66) ? this.adrZp() : (op === 0x76) ? this.adrZpX()
          : (op === 0x6e) ? this.adrAbs() : this.adrAbsX();
        w = this.lesen(a); const rr = (w >> 1) | (this.fc ? 0x80 : 0);
        this.fc = (w & 1) !== 0; this.schreiben(a, this.nz(rr)); break;
      // --- Spruenge
      case 0x4c: this.pc = this.adrAbs(); break;
      case 0x6c: a = this.adrAbs();
                 this.pc = this.lesen(a) | (this.lesen((a & 0xff00) | ((a + 1) & 0xff)) << 8);
                 break;
      case 0x20: a = this.adrAbs();
                 this.ablegen(((this.pc - 1) >> 8) & 0xff);
                 this.ablegen((this.pc - 1) & 0xff);
                 this.pc = a; break;
      case 0x60: { const l = this.holenVomStapel(); const h = this.holenVomStapel();
                   this.pc = ((h << 8) | l) + 1; this.pc &= 0xffff; break; }
      case 0x40: { this.statusSetzen(this.holenVomStapel());
                   const l = this.holenVomStapel(); const h = this.holenVomStapel();
                   this.pc = (h << 8) | l; break; }
      // --- Verzweigungen
      case 0x10: this.verzweigen(!this.fn); break;
      case 0x30: this.verzweigen(this.fn); break;
      case 0x50: this.verzweigen(!this.fv); break;
      case 0x70: this.verzweigen(this.fv); break;
      case 0x90: this.verzweigen(!this.fc); break;
      case 0xb0: this.verzweigen(this.fc); break;
      case 0xd0: this.verzweigen(!this.fz); break;
      case 0xf0: this.verzweigen(this.fz); break;
      // --- Flags
      case 0x18: this.fc = false; break;
      case 0x38: this.fc = true; break;
      case 0x58: this.fi = false; break;
      case 0x78: this.fi = true; break;
      case 0xb8: this.fv = false; break;
      case 0xd8: this.fd = false; break;
      case 0xf8: this.fd = true; break;
      // --- Sonstiges
      case 0xea: break;                       // NOP
      case 0x00: this.pc = 0xffff; break;     // BRK beendet den Lauf
      default:
        // unbekannter (undokumentierter) Befehl: als NOP behandeln
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Zusammenbau: Speicher, CPU, SID, CIA-Zeitgeber
// ---------------------------------------------------------------------------

class SidMotor {
  constructor(abtastrate) {
    this.abtastrate = abtastrate;
    this.taktProSample = TAKT_PAL / abtastrate;
    this.ram = new Uint8Array(65536);
    this.sid = new SidChip();
    this.cia = new Uint8Array(16);
    this.cpu = new Cpu6502(
      (adresse) => this.speicherLesen(adresse),
      (adresse, wert) => this.speicherSchreiben(adresse, wert));
    this.initAdresse = 0;
    this.playAdresse = 0;
    this.periode = TAKT_PAL / 50;
    this.taktBisPlay = 0;
    this.aufrufe = 0;
    this.neustartNachAufrufen = 0;
    this.beendet = false;
  }

  speicherLesen(adresse) {
    adresse &= 0xffff;
    if (adresse >= 0xdc00 && adresse <= 0xdcff) return this.cia[adresse & 0x0f];
    if (adresse >= 0xd400 && adresse <= 0xd7ff) return 0;
    return this.ram[adresse];
  }

  speicherSchreiben(adresse, wert) {
    adresse &= 0xffff;
    wert &= 0xff;
    if (adresse >= 0xd400 && adresse <= 0xd7ff) {
      const reg = (adresse - 0xd400) & 0x1f;
      if (reg <= 24) this.sid.schreiben(reg, wert);
      return;
    }
    if (adresse >= 0xdc00 && adresse <= 0xdcff) {
      this.cia[adresse & 0x0f] = wert;
      return;
    }
    this.ram[adresse] = wert;
  }

  laden(musik) {
    this.ram.fill(0);
    this.ram.set(musik.daten, musik.ladeadresse);
    this.initAdresse = musik.initAdresse;
    this.playAdresse = musik.playAdresse;
    this.ciaTakt = (musik.speed & 1) !== 0;
    this.neustartNachAufrufen = musik.neustartNachAufrufen || 0;
  }

  ciaPeriode() {
    const latch = this.cia[4] | (this.cia[5] << 8);
    if (!this.ciaTakt || latch < 16) return TAKT_PAL / 50;
    return latch + 1;
  }

  starten(lied) {
    this.sid.ruecksetzen();
    this.cia.fill(0);
    this.cpu.aufrufen(this.initAdresse, (lied || 1) - 1);
    this.periode = this.ciaPeriode();
    this.taktBisPlay = 0;
    this.aufrufe = 0;
    this.beendet = false;
  }

  einAufruf() {
    this.cpu.aufrufen(this.playAdresse, 0);
    this.periode = this.ciaPeriode();
    this.aufrufe++;
    // Das Abspann-Stueck haengt den IRQ-Vektor am Ende auf $03D4 zurueck.
    if (this.ram[0x0314] === 0xd4 && this.ram[0x0315] === 0x03) this.beendet = true;
    if (this.neustartNachAufrufen > 0 && this.aufrufe >= this.neustartNachAufrufen) {
      this.starten(1);          // feste Laenge -> Endlosschleife
    } else if (this.beendet && this.neustartNachAufrufen === -1) {
      this.starten(1);          // Stueck hat sich selbst beendet -> neu
    }
  }

  fuellen(puffer, anzahl) {
    for (let i = 0; i < anzahl; i++) {
      this.taktBisPlay -= this.taktProSample;
      if (this.taktBisPlay <= 0) {
        this.einAufruf();
        this.taktBisPlay += this.periode;
      }
      puffer[i] = this.sid.abtastwert(this.taktProSample);
    }
  }
}

// ---------------------------------------------------------------------------
// PSID-Datei einlesen
// ---------------------------------------------------------------------------

export function psidLesen(rohdaten) {
  const b = new Uint8Array(rohdaten);
  const sicht = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const kennung = String.fromCharCode(b[0], b[1], b[2], b[3]);
  if (kennung !== 'PSID' && kennung !== 'RSID') {
    throw new Error('Keine PSID-Datei (Kennung "' + kennung + '")');
  }
  const version = sicht.getUint16(4);
  const datenversatz = sicht.getUint16(6);
  let ladeadresse = sicht.getUint16(8);
  const initAdresse = sicht.getUint16(10);
  const playAdresse = sicht.getUint16(12);
  const lieder = sicht.getUint16(14);
  const startlied = sicht.getUint16(16);
  const speed = sicht.getUint32(18);
  const text = (versatz) => {
    let s = '';
    for (let i = versatz; i < versatz + 32 && b[i]; i++) s += String.fromCharCode(b[i]);
    return s;
  };
  let anfang = datenversatz;
  if (ladeadresse === 0) {
    ladeadresse = b[anfang] | (b[anfang + 1] << 8);
    anfang += 2;
  }
  return {
    version, ladeadresse, initAdresse, playAdresse, lieder, startlied, speed,
    name: text(22), autor: text(54), jahr: text(86),
    daten: b.slice(anfang)
  };
}

// ---------------------------------------------------------------------------
// Quelltext fuer den AudioWorklet zusammensetzen
// ---------------------------------------------------------------------------

function motorQuelltext() {
  return 'const TAKT_PAL = ' + TAKT_PAL + ';\n' +
         SidChip.toString() + '\n' +
         Cpu6502.toString() + '\n' +
         SidMotor.toString() + '\n';
}

function worklerQuelltext() {
  return motorQuelltext() +
    'class KaiserSidProzessor extends AudioWorkletProcessor {\n' +
    '  constructor(o) {\n' +
    '    super();\n' +
    '    this.motor = new SidMotor(sampleRate);\n' +
    '    this.motor.laden(o.processorOptions.musik);\n' +
    '    this.motor.starten(1);\n' +
    '    this.laeuft = true;\n' +
    '    this.port.onmessage = (e) => {\n' +
    '      if (e.data === "stopp") this.laeuft = false;\n' +
    '      if (e.data === "neu") this.motor.starten(1);\n' +
    '    };\n' +
    '  }\n' +
    '  process(eingaenge, ausgaenge) {\n' +
    '    if (!this.laeuft) return false;\n' +
    '    const kanaele = ausgaenge[0];\n' +
    '    const k0 = kanaele[0];\n' +
    '    this.motor.fuellen(k0, k0.length);\n' +
    '    for (let c = 1; c < kanaele.length; c++) kanaele[c].set(k0);\n' +
    '    return true;\n' +
    '  }\n' +
    '}\n' +
    'registerProcessor("kaiser-sid", KaiserSidProzessor);\n';
}

// ---------------------------------------------------------------------------
// Oeffentliche Schnittstelle
// ---------------------------------------------------------------------------

let geladeneMusik = null;
let klangkontext = null;
let quelle = null;          // AudioWorkletNode oder ScriptProcessorNode
let verstaerker = null;
let aktuelleLautstaerke = 0.5;
let workletAdresse = null;

/**
 * Laedt eine .sid-Datei.
 * @param {string} pfad         Pfad zur PSID-Datei, z.B. "assets/kaiser_titel.sid"
 * @param {object} [optionen]   { neustartNachAufrufen: n }
 *        n > 0  -> nach n Play-Aufrufen wird neu gestartet (Endlosschleife).
 *        n = -1 -> Neustart, sobald das Stueck sich selbst beendet.
 *        Fuer die Titelmusik ist n = 2688 die vom Stueck vorgegebene Laenge.
 */
export async function musikLaden(pfad, optionen) {
  const antwort = await fetch(pfad);
  if (!antwort.ok) throw new Error('Konnte ' + pfad + ' nicht laden (' + antwort.status + ')');
  const roh = await antwort.arrayBuffer();
  geladeneMusik = psidLesen(roh);
  geladeneMusik.neustartNachAufrufen = (optionen && optionen.neustartNachAufrufen) || 0;
  return information();
}

/** Laedt Musik direkt aus einem ArrayBuffer (fuer Tests). */
export function musikSetzen(rohdaten, optionen) {
  geladeneMusik = psidLesen(rohdaten);
  geladeneMusik.neustartNachAufrufen = (optionen && optionen.neustartNachAufrufen) || 0;
  return information();
}

/** Liefert die Kopfdaten des geladenen Stuecks. */
export function information() {
  if (!geladeneMusik) return null;
  const m = geladeneMusik;
  return {
    name: m.name, autor: m.autor, jahr: m.jahr,
    ladeadresse: m.ladeadresse, initAdresse: m.initAdresse,
    playAdresse: m.playAdresse, lieder: m.lieder, speed: m.speed,
    bytes: m.daten.length
  };
}

/**
 * Erzeugt einen AudioWorkletNode mit der geladenen Musik in einem beliebigen
 * Kontext -- auch in einem OfflineAudioContext (wird von musiktest.html genutzt).
 */
export async function workletKnoten(kontext, musik) {
  const m = musik || geladeneMusik;
  if (!m) throw new Error('Es ist keine Musik geladen');
  if (!kontext.audioWorklet) throw new Error('AudioWorklet nicht verfuegbar');
  if (!workletAdresse) {
    workletAdresse = URL.createObjectURL(
      new Blob([worklerQuelltext()], { type: 'application/javascript' }));
  }
  await kontext.audioWorklet.addModule(workletAdresse);
  return new AudioWorkletNode(kontext, 'kaiser-sid', {
    numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
    processorOptions: { musik: m }
  });
}

/** Startet die Wiedergabe. Muss aus einer Benutzeraktion heraus aufgerufen werden. */
export async function abspielen() {
  if (!geladeneMusik) throw new Error('Es ist keine Musik geladen');
  await anhalten();
  const Kontext = window.AudioContext || window.webkitAudioContext;
  if (!klangkontext || klangkontext.state === 'closed') {
    klangkontext = new Kontext({ sampleRate: 44100 });
  }
  if (klangkontext.state === 'suspended') await klangkontext.resume();

  verstaerker = klangkontext.createGain();
  verstaerker.gain.value = aktuelleLautstaerke;
  verstaerker.connect(klangkontext.destination);

  if (klangkontext.audioWorklet) {
    quelle = await workletKnoten(klangkontext);
  } else {
    // Rueckfalloption fuer aeltere Browser
    const motor = new SidMotor(klangkontext.sampleRate);
    motor.laden(geladeneMusik);
    motor.starten(1);
    quelle = klangkontext.createScriptProcessor(4096, 0, 1);
    quelle.onaudioprocess = (e) => {
      const k = e.outputBuffer.getChannelData(0);
      motor.fuellen(k, k.length);
    };
  }
  quelle.connect(verstaerker);
  return true;
}

/** Haelt die Wiedergabe an. */
export async function anhalten() {
  if (quelle) {
    try {
      if (quelle.port) quelle.port.postMessage('stopp');
      quelle.disconnect();
    } catch (e) { /* egal */ }
    if (quelle.onaudioprocess) quelle.onaudioprocess = null;
    quelle = null;
  }
  if (verstaerker) {
    try { verstaerker.disconnect(); } catch (e) { /* egal */ }
    verstaerker = null;
  }
  return true;
}

/** Setzt die Lautstaerke, 0.0 bis 1.0. */
export function lautstaerke(wert) {
  aktuelleLautstaerke = Math.max(0, Math.min(1, Number(wert)));
  if (verstaerker) verstaerker.gain.value = aktuelleLautstaerke;
  return aktuelleLautstaerke;
}

/**
 * Rechnet die Musik ohne Web Audio in einen Float32Array (Werte -1..1).
 * Nuetzlich zum Pruefen und zum Erzeugen von WAV-Dateien.
 */
export function rendern(sekunden, abtastrate, musik) {
  const m = musik || geladeneMusik;
  if (!m) throw new Error('Es ist keine Musik geladen');
  const rate = abtastrate || 44100;
  const motor = new SidMotor(rate);
  motor.laden(m);
  motor.starten(1);
  const anzahl = Math.floor(sekunden * rate);
  const puffer = new Float32Array(anzahl);
  motor.fuellen(puffer, anzahl);
  return puffer;
}

/** Gibt den Motor fuer eigene Auswertungen frei (Tests). */
export function motorErzeugen(abtastrate, musik) {
  const motor = new SidMotor(abtastrate);
  motor.laden(musik || geladeneMusik);
  motor.starten(1);
  return motor;
}
