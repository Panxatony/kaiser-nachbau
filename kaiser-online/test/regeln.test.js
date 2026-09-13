import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../server/rules.js';

/** Ein Fürst mit einer Armee aus lauter Infanterie und ohne Bauwerke. */
function fuerst(einheiten = 1) {
  const s = R.neuerSpieler('x', 'X', false, 0);
  s.infanterie = einheiten; s.kavallerie = 0; s.artillerie = 0;
  s.maerkte = 0; s.muehlen = 0; s.palast = 0; s.kathedrale = 0;
  R.armeeAktualisieren(s);
  s.moral = 1; s.einwohner = 100000; s.kasse = 1e9; s.soeldner = 0;
  return s;
}

const PREISE = { kavallerie: 3700, artillerie: 2400, infanterie: 1600 };

// ------------------------------------------------- Moral beim Truppenkauf

/**
 * Die Rechnung des Originals, Zeile 667 bis 669. Entscheidend ist das
 * GOSUB760 mitten in Zeile 667: der erste Schritt rechnet mit dem alten
 * Soldatenstand, die beiden folgenden mit dem neuen.
 */
function moralNachOriginal(iAlt, b, o0) {
  let o = o0 * (iAlt + 20);
  const iNeu = iAlt + 20;
  o = o / (iNeu + 20 - 30 * b);
  return (o * (iNeu / 20 - 1) + 1) / (iNeu / 20);
}

test('Die Moral folgt beim Truppenkauf der Rechnung des Originals', () => {
  for (const einheiten of [1, 3, 10, 25]) {
    for (const soeldner of [false, true]) {
      const s = fuerst(einheiten);
      const iAlt = s.soldaten;
      R.truppenKaufen(s, PREISE, 'infanterie', soeldner);
      const soll = moralNachOriginal(iAlt, soeldner ? 1 : 0, 1);
      assert.ok(Math.abs(s.moral - soll) < 1e-9,
        `${iAlt} Soldaten, ${soeldner ? 'Söldner' : 'Rekruten'}: ${s.moral} statt ${soll}`);
    }
  }
});

test('Rekrutieren kostet Moral, Söldner heben sie', () => {
  const a = fuerst(3); R.truppenKaufen(a, PREISE, 'infanterie', false);
  assert.ok(a.moral < 1, 'Rekruten verwässern die Truppe: ' + a.moral);
  const b = fuerst(3); R.truppenKaufen(b, PREISE, 'infanterie', true);
  assert.ok(b.moral > 1, 'Söldner sind ausgebildet: ' + b.moral);
});

test('Rekruten kosten zwanzig Einwohner, Söldner keine', () => {
  const a = fuerst(3); const vorher = a.einwohner;
  R.truppenKaufen(a, PREISE, 'infanterie', false);
  assert.equal(a.einwohner, vorher - 20);
  assert.equal(a.soeldner, 0);

  const b = fuerst(3);
  R.truppenKaufen(b, PREISE, 'infanterie', true);
  assert.equal(b.einwohner, 100000, 'Söldner kommen nicht aus dem Volk');
  assert.equal(b.soeldner, 20);
});

// --------------------------------------------------- Kathedrale und Handel

test('Jedes Kathedralenteil hebt den Handel um eins bis sechs', () => {
  // Zeile 600: m(c)=m(c)+1+INT(RND(0)*6)
  const s = fuerst(1);
  s.land = 30000;
  const vorher = s.handel;
  const wuerfe = [0, 0.99, 0.5, 0.17];
  let i = 0;
  const rnd = () => wuerfe[i++];
  for (const erwartet of [1, 6, 4, 2]) {
    const davor = s.handel;
    const e = R.bauen(s, 'kathedrale', rnd);
    assert.ok(e.ok);
    assert.equal(s.handel - davor, erwartet, 'Zuwachs beim Teil ' + s.kathedrale);
  }
  assert.equal(s.handel, vorher + 13);
});

test('Nur die Kathedrale hebt den Handel, die anderen Bauten nicht', () => {
  for (const was of ['markt', 'muehle', 'palast']) {
    const s = fuerst(1);
    s.land = 30000;
    const vorher = s.handel;
    assert.ok(R.bauen(s, was, () => 0.5).ok, was);
    assert.equal(s.handel, vorher, was + ' darf den Handel nicht ändern');
  }
});

test('Der Handel geht in Kornbedarf und Aufstiegspunkte ein', () => {
  // Zeile 620: no=...+m(c)*40 ; Zeile 605: Kennzahl m(c)/10
  const a = fuerst(1); a.handel = 5;
  const b = fuerst(1); b.handel = 65;
  assert.equal(R.kornBedarf(b) - R.kornBedarf(a), 60 * 40, '40 Maß je Handelspunkt');
  assert.equal(R.aufstiegsPunkte(b) - R.aufstiegsPunkte(a), 6, 'sechs Aufstiegspunkte mehr');
});

// ----------------------------------------- Armeeneuberechnung beim Bauen

test('Markt und Mühle rechnen die Armee neu, Palast und Kathedrale nicht', () => {
  // Zeile 593 und 595 rufen GOSUB760, Zeile 597 und 599 nicht
  const s = fuerst(1);
  s.land = 30000; s.maerkte = 9; s.muehlen = 9;
  R.armeeAktualisieren(s);
  const vorher = s.soldaten;

  const p = { ...s };
  R.bauen(p, 'palast', () => 0.5);
  assert.equal(p.soldaten, vorher, 'der Palast wirkt erst später');

  const m = { ...s };
  R.bauen(m, 'markt', () => 0.5);
  assert.ok(m.soldaten >= vorher, 'der Markt rechnet sofort neu');
});

test('Die Ernte nennt die bestellte Flaeche', () => {
  // Bestellt wird das Kleinste aus Landbesitz, (Einwohner - Muehlen*100)*5
  // und Korn*2 (Zeile 466 bis 468). Ohne diese Zahl sieht niemand, warum eine
  // Ernte klein bleibt, obwohl das Land gross ist.
  const s = R.neuerSpieler('a', 'A', false, 0);
  Object.assign(s, { land: 22000, einwohner: 2389, muehlen: 17, korn: 20000 });
  const m = R.ernte(s, R.makeRng(1));
  assert.equal(m.flaeche, (2389 - 1700) * 5, 'die Muehlen binden die Landarbeiter');

  const t = R.neuerSpieler('b', 'B', false, 0);
  Object.assign(t, { land: 4000, einwohner: 6000, muehlen: 0, korn: 20000 });
  assert.equal(R.ernte(t, R.makeRng(1)).flaeche, 4000, 'sonst begrenzt das Land');

  const u = R.neuerSpieler('c', 'C', false, 0);
  Object.assign(u, { land: 40000, einwohner: 6000, muehlen: 0, korn: 500 });
  assert.equal(R.ernte(u, R.makeRng(1)).flaeche, 1000, 'oder das Saatgut');
});
