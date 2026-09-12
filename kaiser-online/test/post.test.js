import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Ohne SMTP-Angaben ist der Versand abgeschaltet; genau das wird hier geprüft.
for (const v of ['KAISER_SMTP_HOST', 'KAISER_SMTP_USER', 'KAISER_SMTP_PASS', 'KAISER_SMTP_VON']) {
  delete process.env[v];
}
process.env.KAISER_ADRESSE_WEB = 'https://kaiser.example.org';
process.env.KAISER_DATEN = fs.mkdtempSync(path.join(os.tmpdir(), 'kaiser-post-'));

const post = await import('../server/post.js');
const { Konten } = await import('../server/konten.js');

test('Ohne Zugangsdaten ist der Versand abgeschaltet', async () => {
  assert.equal(post.bereit(), false);
  const s = post.stand();
  assert.equal(s.bereit, false);
  assert.equal(s.host, null);
  assert.equal(s.adresse, 'https://kaiser.example.org');
  assert.match((await post.pruefen()).fehler, /nicht eingerichtet/);
  assert.match((await post.einladen({ an: 'a@b.de', name: 'X', kennwort: 'y' })).fehler, /nicht eingerichtet/);
});

test('Der Stand verrät kein Kennwort', () => {
  process.env.KAISER_SMTP_PASS = 'sehr-geheim';
  const s = post.stand();
  assert.ok(!JSON.stringify(s).includes('sehr-geheim'));
  delete process.env.KAISER_SMTP_PASS;
});

test('Mailadressen werden grob geprüft', () => {
  assert.ok(post.adresseGueltig('anna@example.org'));
  assert.ok(post.adresseGueltig('a.b+c@sub.example.co.uk'));
  assert.ok(!post.adresseGueltig('ohne-at'));
  assert.ok(!post.adresseGueltig('kein@punkt'));
  assert.ok(!post.adresseGueltig('mit leer@zeichen.de'));
  assert.ok(!post.adresseGueltig(''));
  assert.ok(!post.adresseGueltig(null));
});

test('Gewürfelte Kennwörter sind sprechbar und verschieden', () => {
  const proben = Array.from({ length: 200 }, () => post.kennwortWuerfeln());
  for (const k of proben) {
    assert.match(k, /^[bdfghkmnprstvwz][aeiou][bdfghkmnprstvwz][aeiou]-[bdfghkmnprstvwz][aeiou][bdfghkmnprstvwz][aeiou]-\d{4}$/,
      'unerwartete Form: ' + k);
    assert.ok(!/[lj]/.test(k), 'schwer unterscheidbare Mitlaute in ' + k);
  }
  assert.ok(new Set(proben).size > 190, 'die Kennwörter wiederholen sich zu oft');
});

test('Die Einladung ist im Ton des 17. Jahrhunderts gehalten', () => {
  const b = post.einladungSetzen({
    name: 'KARL', kennwort: 'muster-kenn-1234',
    weiblich: false, vonWem: 'LARS', adresse: 'https://kaiser.example.org'
  });
  assert.equal(b.betreff, 'Bestallung zu einem Fürstenthum im Heiligen Römischen Reiche');
  assert.match(b.text, /Hochwohlgeborener Herr KARL/);
  assert.match(b.text, /göttliche Aufgabe/);
  assert.match(b.text, /Cron des Kaisers/);
  assert.match(b.text, /muster-kenn-1234/);
  assert.match(b.text, /https:\/\/kaiser\.example\.org/);
  assert.match(b.text, /Ausgefertiget zu Händen durch LARS/);
  // Die HTML-Fassung trägt dasselbe
  assert.match(b.html, /muster-kenn-1234/);
  assert.match(b.html, /Zum Fürstenthum eintreten/);
  assert.match(b.html, /<a href="https:\/\/kaiser\.example\.org"/);
});

test('Die Anrede richtet sich nach dem Geschlecht', () => {
  const w = post.einladungSetzen({ name: 'ANNA', kennwort: 'x', weiblich: true, adresse: 'u' });
  assert.match(w.text, /Hochwohlgeborene Frau ANNA/);
  const m = post.einladungSetzen({ name: 'OTTO', kennwort: 'x', weiblich: false, adresse: 'u' });
  assert.match(m.text, /Hochwohlgeborener Herr OTTO/);
});

test('Der Brief verspricht kein bestimmtes Fürstentum', () => {
  // Die Region wird erst beim Beitritt zu einer Runde gewählt. Ein Brief, der
  // Bayern zusagt, während der Platz dann Hessen ist, wäre eine falsche Zusage.
  const b = post.einladungSetzen({ name: 'KARL', kennwort: 'x', weiblich: false, adresse: 'u' });
  for (const r of ['zu Bayern', 'zu Preussen', 'zu Hessen', 'zu Sachsen']) {
    assert.ok(!b.text.includes(r), 'der Brief sagt ' + r + ' zu');
    assert.ok(!b.html.includes(r), 'die HTML-Fassung sagt ' + r + ' zu');
  }
  assert.ok(!b.text.includes('undefined') && !b.text.includes('null'));
  assert.match(b.text, /Welches Land Euch zufalle/, 'stattdessen wird es offen gelassen');
});

// ------------------------------------------------------- eigenes Kennwort

test('Ein Spieler ändert sein Kennwort selbst', () => {
  const k = new Konten();
  k.nutzerAnlegen('ANNA', 'einladung1');
  const alt = k.anmelden('ANNA', 'einladung1');
  assert.ok(alt.kennung);

  assert.match(k.eigenesKennwortAendern('ANNA', 'falsch', 'neues123').fehler, /bisherige Kennwort/);
  assert.match(k.eigenesKennwortAendern('ANNA', 'einladung1', '123').fehler, /mindestens 4/);
  assert.match(k.eigenesKennwortAendern('ANNA', 'einladung1', 'einladung1').fehler, /unterscheiden/);

  const e = k.eigenesKennwortAendern('ANNA', 'einladung1', 'neues123');
  assert.ok(e.ok);
  assert.equal(e.sitzungenBeendet, 1, 'die alte Sitzung endet');
  assert.equal(k.konto(alt.kennung), null);
  assert.match(k.anmelden('ANNA', 'einladung1').fehler, /stimmt nicht/);
  assert.ok(k.anmelden('ANNA', 'neues123').kennung);
});

test('Nach eigener Änderung gilt das Kennwort nicht mehr als Einladungskennwort', () => {
  const k = new Konten();
  const angelegt = k.nutzerAnlegen('BERT', 'einladung1', { email: 'bert@example.org' }).konto;
  assert.equal(k.oeffentlich(angelegt).ausEinladung, true);
  k.eigenesKennwortAendern('BERT', 'einladung1', 'selbst123');
  assert.equal(k.oeffentlich(k.konten.get('BERT')).ausEinladung, false);
});

test('Setzt die Verwaltung zurück, gilt es wieder als Einladungskennwort', () => {
  const k = new Konten();
  k.nutzerAnlegen('ANNA', 'geheim1', { admin: true });
  k.nutzerAnlegen('BERT', 'einladung1', { email: 'bert@example.org' });
  k.eigenesKennwortAendern('BERT', 'einladung1', 'selbst123');
  assert.equal(k.oeffentlich(k.konten.get('BERT')).ausEinladung, false);
  k.kennwortSetzen('BERT', 'neu-von-oben');
  assert.equal(k.oeffentlich(k.konten.get('BERT')).ausEinladung, true);
});

test('Die Mailadresse steht in der Verwaltungsliste, nicht beim Spieler', () => {
  const k = new Konten();
  const konto = k.nutzerAnlegen('ANNA', 'geheim1', { email: 'anna@example.org' }).konto;
  assert.equal(k.liste()[0].email, 'anna@example.org');
  assert.ok(k.liste()[0].eingeladen > 0);
  assert.equal(k.oeffentlich(konto).email, undefined, 'der Client bekommt sie nicht');
});

test('Eine erneute Einladung wird vermerkt', () => {
  const k = new Konten();
  k.nutzerAnlegen('ANNA', 'geheim1');
  assert.equal(k.liste()[0].eingeladen, null);
  assert.ok(!k.einladungVermerken('ANNA', 'anna@example.org').fehler);
  const eintrag = k.liste()[0];
  assert.equal(eintrag.email, 'anna@example.org');
  assert.ok(eintrag.eingeladen > 0);
  assert.equal(eintrag.kennwortGeaendert, false);
  assert.match(k.einladungVermerken('GIBTSNICHT', 'x@y.de').fehler, /gibt es nicht/);
});
