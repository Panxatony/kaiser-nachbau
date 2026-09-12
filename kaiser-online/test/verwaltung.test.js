import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.KAISER_DATEN = fs.mkdtempSync(path.join(os.tmpdir(), 'kaiser-verw-'));
const { Konten, BREMSE } = await import('../server/konten.js');

/** Legt ein Konto ohne Bremse an, für den Aufbau von Testfällen. */
const frei = (k, name, zahl = 'geheim1', admin = false) =>
  k.nutzerAnlegen(name, zahl, { admin });

// ------------------------------------------------------------------ Bremse

test('Das erste Konto wird Verwalter, die folgenden nicht', () => {
  const k = new Konten();
  const erst = k.registrieren('anna', 'geheim1', { quelle: '1.1.1.1' });
  assert.equal(erst.ersterNutzer, true);
  assert.equal(erst.konto.admin, true);
  const zweit = k.registrieren('bert', 'geheim2', { quelle: '1.1.1.2' });
  assert.equal(zweit.ersterNutzer, false);
  assert.equal(zweit.konto.admin, false);
  assert.equal(k.verwalterZahl(), 1);
});

test('Je Herkunftsadresse sind nur wenige Konten pro Stunde erlaubt', () => {
  const k = new Konten();
  for (let i = 0; i < BREMSE.proQuelleStunde; i++) {
    const e = k.registrieren('NUTZER' + i, 'geheim1', { quelle: '9.9.9.9' });
    assert.ok(!e.fehler, `Konto ${i}: ${e.fehler}`);
  }
  const zuviel = k.registrieren('NOCHEINER', 'geheim1', { quelle: '9.9.9.9' });
  assert.equal(zuviel.gebremst, true);
  assert.match(zuviel.fehler, /mehrere Konten/);
  // Eine andere Adresse darf weiter
  assert.ok(!k.registrieren('ANDERER', 'geheim1', { quelle: '8.8.8.8' }).fehler);
});

test('Die Gesamtbremse je Stunde greift über alle Adressen', () => {
  const k = new Konten();
  let angelegt = 0;
  for (let i = 0; i < 40; i++) {
    const e = k.registrieren('N' + i, 'geheim1', { quelle: '10.0.0.' + i });
    if (!e.fehler) angelegt++;
    else { assert.match(e.fehler, /auffällig viele/); break; }
  }
  assert.equal(angelegt, BREMSE.gesamtStunde);
});

test('Alte Versuche zählen nach einer Stunde nicht mehr', () => {
  const k = new Konten();
  for (let i = 0; i < BREMSE.proQuelleStunde; i++) k.registrieren('N' + i, 'geheim1', { quelle: '7.7.7.7' });
  assert.equal(k.registrieren('SPAETER', 'geheim1', { quelle: '7.7.7.7' }).gebremst, true);
  // Zeit zurückdrehen
  for (const a of k.anmeldungen) a.zeit -= 61 * 60 * 1000;
  assert.ok(!k.registrieren('SPAETER', 'geheim1', { quelle: '7.7.7.7' }).fehler);
});

test('Die Verwaltung umgeht die Bremse', () => {
  const k = new Konten();
  for (let i = 0; i < BREMSE.proQuelleStunde; i++) k.registrieren('N' + i, 'geheim1', { quelle: '5.5.5.5' });
  assert.equal(k.registrieren('GEBREMST', 'geheim1', { quelle: '5.5.5.5' }).gebremst, true);
  const e = k.nutzerAnlegen('VONVERWALTUNG', 'geheim1', { von: 'ANNA' });
  assert.ok(!e.fehler);
  assert.equal(e.konto.angelegtVon, 'ANNA');
});

test('Geschlossene Registrierung lässt niemanden mehr durch', () => {
  const k = new Konten();
  frei(k, 'ANNA', 'geheim1', true);
  k.registrierungSetzen(false);
  const e = k.registrieren('FREMD', 'geheim1', { quelle: '1.2.3.4' });
  assert.equal(e.gebremst, true);
  assert.match(e.fehler, /nur die Verwaltung/);
  assert.ok(!k.nutzerAnlegen('DURCHVERWALTUNG', 'geheim1').fehler, 'die Verwaltung darf weiter');
  k.registrierungSetzen(true);
  assert.ok(!k.registrieren('WIEDERFREI', 'geheim1', { quelle: '1.2.3.4' }).fehler);
});

test('Der Bremsenstand ist ablesbar', () => {
  const k = new Konten();
  k.registrieren('ANNA', 'geheim1', { quelle: '1.1.1.1' });
  k.registrieren('BERT', 'geheim2', { quelle: '1.1.1.2' });
  const b = k.bremsenStand();
  assert.equal(b.konten, 2);
  assert.equal(b.letzteStunde, 2);
  assert.equal(b.letzterTag, 2);
  assert.equal(b.registrierungOffen, true);
  assert.equal(b.grenzen.proQuelleStunde, BREMSE.proQuelleStunde);
});

// ------------------------------------------------------------------ Verwaltung

test('Gesperrte Konten kommen nicht mehr herein', () => {
  const k = new Konten();
  frei(k, 'ANNA', 'geheim1', true);
  frei(k, 'BERT', 'geheim2');
  const vorher = k.anmelden('BERT', 'geheim2');
  assert.ok(vorher.kennung);

  assert.ok(!k.sperren('BERT', true).fehler);
  assert.match(k.anmelden('BERT', 'geheim2').fehler, /gesperrt/);
  assert.equal(k.konto(vorher.kennung), null, 'die alte Sitzung gilt nicht mehr');

  k.sperren('BERT', false);
  assert.ok(k.anmelden('BERT', 'geheim2').kennung, 'nach dem Entsperren wieder');
});

test('Ein neues Kennwort beendet die alten Sitzungen', () => {
  const k = new Konten();
  frei(k, 'ANNA', 'geheim1', true);
  frei(k, 'BERT', 'geheim2');
  const alt = k.anmelden('BERT', 'geheim2');
  const e = k.kennwortSetzen('BERT', 'neuezahl');
  assert.equal(e.sitzungenBeendet, 1);
  assert.equal(k.konto(alt.kennung), null);
  assert.match(k.anmelden('BERT', 'geheim2').fehler, /stimmt nicht/);
  assert.ok(k.anmelden('BERT', 'neuezahl').kennung);
  assert.match(k.kennwortSetzen('BERT', '123').fehler, /mindestens 4/);
  assert.match(k.kennwortSetzen('GIBTSNICHT', 'lang genug').fehler, /gibt es nicht/);
});

test('Eine Sperre hebt auch die Fehlversuchssperre auf', () => {
  const k = new Konten();
  frei(k, 'ANNA', 'geheim1', true);
  frei(k, 'BERT', 'geheim2');
  for (let i = 0; i < 8; i++) k.anmelden('BERT', 'falsch');
  assert.match(k.anmelden('BERT', 'geheim2').fehler, /Fehlversuche/);
  k.kennwortSetzen('BERT', 'neuezahl');
  assert.ok(k.anmelden('BERT', 'neuezahl').kennung, 'nach dem Zurücksetzen geht es sofort');
});

test('Der letzte Verwalter ist geschützt', () => {
  const k = new Konten();
  frei(k, 'ANNA', 'geheim1', true);
  frei(k, 'BERT', 'geheim2');
  assert.match(k.adminSetzen('ANNA', false).fehler, /mindestens ein Verwalter/);
  assert.match(k.loeschen('ANNA').fehler, /letzte Verwalter/);
  assert.match(k.sperren('ANNA', true).fehler, /letzte Verwalter/);

  assert.ok(!k.adminSetzen('BERT', true).fehler);
  assert.equal(k.verwalterZahl(), 2);
  assert.ok(!k.adminSetzen('ANNA', false).fehler, 'mit zweitem Verwalter geht es');
  assert.equal(k.verwalterZahl(), 1);
});

test('Löschen entfernt Konto und Sitzungen', () => {
  const k = new Konten();
  frei(k, 'ANNA', 'geheim1', true);
  frei(k, 'BERT', 'geheim2');
  const s = k.anmelden('BERT', 'geheim2');
  assert.ok(!k.loeschen('BERT').fehler);
  assert.equal(k.gibtEs('BERT'), false);
  assert.equal(k.konto(s.kennung), null);
  assert.match(k.loeschen('BERT').fehler, /gibt es nicht/);
});

test('Die Kontenliste verrät keine Geheimnisse', () => {
  const k = new Konten();
  frei(k, 'ANNA', 'meingeheimnis', true);
  const liste = k.liste();
  assert.equal(liste.length, 1);
  const roh = JSON.stringify(liste);
  assert.ok(!roh.includes('meingeheimnis'));
  assert.ok(!roh.includes('streuwert'));
  assert.ok(!roh.includes('salz'));
  assert.deepEqual(Object.keys(liste[0]).sort(),
    ['admin', 'angelegt', 'angelegtVon', 'eingeladen', 'email', 'gesperrt',
     'kennwortGeaendert', 'name', 'sitzungen', 'weiblich', 'zuletzt']);
});

test('Verwalter stehen in der Liste oben', () => {
  const k = new Konten();
  frei(k, 'ZORA', 'geheim1');
  frei(k, 'ANNA', 'geheim2');
  k.adminSetzen('ZORA', true);
  assert.equal(k.liste()[0].name, 'ZORA');
});

test('Die Kontodaten für den Client nennen die Rolle', () => {
  const k = new Konten();
  const anna = frei(k, 'ANNA', 'geheim1', true).konto;
  const bert = frei(k, 'BERT', 'geheim2').konto;
  assert.equal(k.oeffentlich(anna).admin, true);
  assert.equal(k.oeffentlich(bert).admin, false);
  assert.equal(k.oeffentlich(anna).streuwert, undefined);
});

test('Einstellungen und Rollen überleben einen Neustart', () => {
  const datei = path.join(process.env.KAISER_DATEN, 'verwaltung.json');
  const k1 = new Konten(datei);
  k1.registrieren('ANNA', 'geheim1', { quelle: '1.1.1.1' });
  k1.nutzerAnlegen('BERT', 'geheim2');
  k1.sperren('BERT', true);
  k1.registrierungSetzen(false);

  const k2 = new Konten(datei);
  assert.equal(k2.konten.get('ANNA').admin, true);
  assert.equal(k2.konten.get('BERT').gesperrt, true);
  assert.equal(k2.bremsenStand().registrierungOffen, false);
  assert.equal(k2.bremsenStand().letzterTag, 1, 'die Bremse zählt weiter');
});
