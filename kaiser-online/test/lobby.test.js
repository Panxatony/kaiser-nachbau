import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.KAISER_DATEN = fs.mkdtempSync(path.join(os.tmpdir(), 'kaiser-lobby-'));
const { Konten, nameNormieren, nameGueltig } = await import('../server/konten.js');
const { Lobby, kennungAus, MAX_SPIELER } = await import('../server/lobby.js');
const R = await import('../server/rules.js');

// ------------------------------------------------------------------ Konten

test('Namen werden normiert und geprueft', () => {
  assert.equal(nameNormieren('  anna  '), 'ANNA');
  assert.equal(nameNormieren('einsehrlangernamehier'), 'EINSEHRLANGERN', 'auf 14 Zeichen gekürzt');
  assert.ok(nameGueltig('ANNA'));
  assert.ok(nameGueltig('KARL DER GR'));
  assert.ok(!nameGueltig('A'), 'ein Zeichen ist zu wenig');
  assert.ok(!nameGueltig('ANNA!'), 'Sonderzeichen nicht erlaubt');
});

test('Konto anlegen und anmelden', () => {
  const k = new Konten();
  assert.match(k.registrieren('ab', '123').fehler, /Kennwort/);
  assert.match(k.registrieren('x', 'geheim1').fehler, /2 bis 14/);
  const e = k.registrieren('anna', 'geheim1');
  assert.equal(e.konto.name, 'ANNA');
  assert.match(k.registrieren('ANNA', 'andere').fehler, /gibt es schon/);

  const a = k.anmelden('anna', 'geheim1');
  assert.ok(a.kennung && a.kennung.length >= 32);
  assert.equal(k.konto(a.kennung).name, 'ANNA');
  assert.match(k.anmelden('anna', 'falsch').fehler, /stimmt nicht/);
  assert.match(k.anmelden('gibtsnicht', 'x').fehler, /stimmt nicht/, 'verrät nicht, ob es das Konto gibt');
});

test('Das Kennwort wird nie im Klartext abgelegt oder herausgegeben', () => {
  const k = new Konten();
  const konto = k.nutzerAnlegen('anna', 'meingeheimnis').konto;
  assert.equal(konto.kennwort, undefined);
  assert.ok(!JSON.stringify(konto).includes('meingeheimnis'));
  const oeffentlich = k.oeffentlich(konto);
  assert.deepEqual(Object.keys(oeffentlich).sort(),
    ['admin', 'angelegt', 'ausEinladung', 'name', 'weiblich']);
  assert.equal(oeffentlich.streuwert, undefined);
  assert.equal(oeffentlich.salz, undefined);
});

test('Zu viele Fehlversuche sperren vorübergehend', () => {
  const k = new Konten();
  k.nutzerAnlegen('anna', 'geheim1');
  for (let i = 0; i < 8; i++) k.anmelden('anna', 'falsch');
  const e = k.anmelden('anna', 'geheim1');
  assert.match(e.fehler, /Fehlversuche/, 'auch die richtige Zahl wird jetzt abgewiesen');
});

test('Abmelden macht die Kennung ungültig', () => {
  const k = new Konten();
  k.nutzerAnlegen('anna', 'geheim1');
  const a = k.anmelden('anna', 'geheim1');
  k.abmelden(a.kennung);
  assert.equal(k.konto(a.kennung), null);
});

test('Konten überleben einen Neustart', () => {
  const datei = path.join(process.env.KAISER_DATEN, 'konten-test.json');
  const k1 = new Konten(datei);
  k1.nutzerAnlegen('anna', 'geheim1');
  const a = k1.anmelden('anna', 'geheim1');
  const k2 = new Konten(datei);
  assert.ok(k2.gibtEs('ANNA'));
  assert.equal(k2.konto(a.kennung)?.name, 'ANNA', 'Sitzung gilt weiter');
  assert.ok(!k2.anmelden('anna', 'geheim1').fehler);
});

// ------------------------------------------------------------------ Lobby

/**
 * Konten fuer die Lobbytests. Sie werden ueber die Verwaltung angelegt, damit
 * die Bremse fuer die offene Registrierung hier nicht dazwischenfunkt; die
 * wird in verwaltung.test.js geprueft.
 */
function aufbau() {
  const k = new Konten();
  const anna = k.nutzerAnlegen('anna', 'geheim1').konto;
  const bert = k.nutzerAnlegen('bert', 'geheim2').konto;
  const cleo = k.nutzerAnlegen('cleo', 'geheim3').konto;
  return { k, anna, bert, cleo, l: new Lobby() };
}

test('Kennung aus dem Rundennamen', () => {
  assert.equal(kennungAus('Abendrunde'), 'abendrunde');
  assert.equal(kennungAus('Königs Partie!'), 'koenigs-partie');
  assert.equal(kennungAus(''), 'runde');
  assert.equal(kennungAus('Abendrunde', new Set(['abendrunde'])), 'abendrunde-2');
});

test('Runde anlegen und beitreten', () => {
  const { l, anna, bert } = aufbau();
  assert.match(l.anlegen('x').fehler, /mindestens 2 Zeichen/);
  const e = l.anlegen('Abendrunde', { von: anna.name, planungsSekunden: 600 });
  assert.equal(e.spiel.name, 'Abendrunde');
  assert.equal(e.spiel.planungsSekunden, 600);
  assert.match(l.anlegen('abendrunde').fehler, /gibt es schon/);

  assert.ok(!l.beitreten(e.spiel.id, anna, { weiblich: true }).fehler);
  assert.ok(!l.beitreten(e.spiel.id, bert, {}).fehler);
  assert.equal(e.spiel.spieler.length, 2);
  assert.equal(e.spiel.spielerVon('ANNA').weiblich, true);
  const nochmal = l.beitreten(e.spiel.id, anna, {});
  assert.equal(nochmal.schonDrin, true, 'zweiter Beitritt gibt nur den Platz zurück');
  assert.equal(e.spiel.spieler.length, 2);
});

test('Die Lobbyübersicht zeigt Plätze und das nächste Fürstentum', () => {
  const { l, k, anna, bert } = aufbau();
  const e = l.anlegen('Abendrunde', { von: anna.name });
  l.beitreten(e.spiel.id, anna, {});
  l.beitreten(e.spiel.id, bert, {});

  const fuerAnna = l.sicht(k.oeffentlich(anna)).runden[0];
  assert.equal(fuerAnna.spielerzahl, 2);
  assert.equal(fuerAnna.maxSpieler, MAX_SPIELER);
  assert.equal(fuerAnna.dabei, true);
  assert.equal(fuerAnna.beitretbar, true);
  assert.equal(fuerAnna.spieler.find(s => s.name === 'ANNA').selbst, true);
  assert.equal(fuerAnna.spieler.find(s => s.name === 'BERT').selbst, false);
  assert.equal(fuerAnna.naechsteRegion, 'BAYERN', 'der dritte Platz ist Bayern');
});

test('Wer nicht dabei ist, sieht die Runde als beitretbar', () => {
  const { l, k, anna, cleo } = aufbau();
  const e = l.anlegen('Abendrunde', { von: anna.name });
  l.beitreten(e.spiel.id, anna, { region: 0 });
  const fuerCleo = l.sicht(k.oeffentlich(cleo)).runden[0];
  assert.equal(fuerCleo.dabei, false);
  assert.equal(fuerCleo.beitretbar, true);
  assert.ok(fuerCleo.spieler.every(s => s.selbst === false));
});

test('Eine volle Runde nimmt niemanden mehr auf', () => {
  const { l, k } = aufbau();
  const e = l.anlegen('Grosse Runde');
  for (let i = 0; i < MAX_SPIELER; i++) {
    const konto = k.nutzerAnlegen('SPIELER' + i, 'geheim' + i).konto;
    assert.ok(!l.beitreten(e.spiel.id, konto, {}).fehler, 'Platz ' + i);
  }
  const einerZuviel = k.nutzerAnlegen('ZEHN', 'geheim9').konto;
  assert.match(l.beitreten(e.spiel.id, einerZuviel, {}).fehler, /voll/);
  assert.equal(l.sicht(k.oeffentlich(einerZuviel)).runden[0].beitretbar, false);
});

test('Eine laufende Runde nimmt niemanden mehr auf', () => {
  const { l, anna, bert } = aufbau();
  const e = l.anlegen('Abendrunde');
  l.beitreten(e.spiel.id, anna, {});
  e.spiel.starten();
  assert.match(l.beitreten(e.spiel.id, bert, {}).fehler, /läuft schon/);
  assert.match(l.verlassen(e.spiel.id, anna).fehler, /laufende Runde/);
});

test('Die letzte Person, die geht, räumt die Runde weg', () => {
  const { l, anna, bert } = aufbau();
  const e = l.anlegen('Kurzrunde');
  l.beitreten(e.spiel.id, anna, {});
  l.beitreten(e.spiel.id, bert, {});
  l.verlassen(e.spiel.id, anna);
  assert.ok(l.spiel(e.spiel.id), 'mit Bert bleibt sie bestehen');
  l.verlassen(e.spiel.id, bert);
  assert.equal(l.spiel(e.spiel.id), null, 'leere Runde verschwindet');
});

test('Das Fürstentum richtet sich nach der Sitzreihenfolge', () => {
  // Wie im Original, Zeile 869 bis 878: Spieler 1 Preussen, Spieler 2 Hessen.
  // Gewaehlt wird nichts, ein Wunsch aus dem Client wird nicht beachtet.
  const { l, anna, bert } = aufbau();
  const e = l.anlegen('Abendrunde');
  const a = l.beitreten(e.spiel.id, anna, { region: 3 });
  const b = l.beitreten(e.spiel.id, bert, { region: 3 });
  assert.equal(a.region, 'PREUSSEN');
  assert.equal(b.region, 'HESSEN');
  assert.deepEqual(e.spiel.spieler.map(s => s.region), [0, 1]);
});

test('Wird ein Platz frei, faellt er dem naechsten Beitretenden zu', () => {
  const { l, k, anna, bert, cleo } = aufbau();
  const e = l.anlegen('Abendrunde');
  l.beitreten(e.spiel.id, anna, {});
  l.beitreten(e.spiel.id, bert, {});
  assert.equal(e.spiel.spielerVon('BERT').region, 1, 'Hessen');
  l.verlassen(e.spiel.id, bert);
  const c = l.beitreten(e.spiel.id, cleo, {});
  assert.equal(c.region, 'HESSEN', 'der freie Platz wird wieder besetzt');
});

test('Meine Runden werden gefunden', () => {
  const { l, anna, bert } = aufbau();
  const a = l.anlegen('Eins'); l.beitreten(a.spiel.id, anna, {});
  const b = l.anlegen('Zwei'); l.beitreten(b.spiel.id, bert, {});
  const c = l.anlegen('Drei'); l.beitreten(c.spiel.id, anna, {});
  assert.deepEqual(l.meineSpiele(anna).map(s => s.name).sort(), ['Drei', 'Eins']);
  assert.deepEqual(l.meineSpiele(bert).map(s => s.name), ['Zwei']);
});

test('Eigene Runden stehen in der Übersicht oben', () => {
  const { l, k, anna, bert } = aufbau();
  const fremd = l.anlegen('Fremde'); l.beitreten(fremd.spiel.id, bert, {});
  const meine = l.anlegen('Meine'); l.beitreten(meine.spiel.id, anna, {});
  const runden = l.sicht(k.oeffentlich(anna)).runden;
  assert.equal(runden[0].name, 'Meine');
});

test('Eine gesicherte Runde kommt nach dem Neustart zurück in die Lobby', () => {
  const { l, k, anna, bert } = aufbau();
  const e = l.anlegen('Dauerrunde', { von: anna.name });
  l.beitreten(e.spiel.id, anna, {});
  l.beitreten(e.spiel.id, bert, {});
  e.spiel.starten();
  const s = e.spiel.spielerVon('ANNA');
  e.spiel.aktion('ANNA', 'kornVerteilen', { menge: R.int(s.korn / 2) });
  l.allesSichern();

  const neu = new Lobby();
  const r = neu.sicht(k.oeffentlich(anna)).runden.find(x => x.name === 'Dauerrunde');
  assert.ok(r, 'Runde ist wieder da');
  assert.equal(r.gestartet, true);
  assert.equal(r.spielerzahl, 2);
  assert.equal(r.dabei, true);
  assert.equal(r.angelegtVon, 'ANNA');
});

test('Die Kontendatei wird nicht als Spielstand missverstanden', () => {
  const wurzel = process.env.KAISER_DATEN;
  fs.writeFileSync(path.join(wurzel, 'konten.json'), JSON.stringify({ konten: [], sitzungen: [] }));
  const l = new Lobby();
  assert.ok(!l.spiel('konten'), 'konten.json taucht nicht als Runde auf');
});

test('Ein Rundenname darf kein Markup enthalten', () => {
  const lobby = new Lobby();
  const boese = lobby.anlegen('<img src=x onerror=alert(1)>', { von: 'KARL' });
  assert.ok(boese.fehler, 'Der Name wird abgewiesen');
  assert.ok(!boese.spiel, 'und es entsteht keine Runde');

  // Anfuehrungszeichen und kaufmaennisches Und ebenfalls nicht
  assert.ok(lobby.anlegen('Tom & Jerry', { von: 'KARL' }).fehler);
  assert.ok(lobby.anlegen('Runde "Nord"', { von: 'KARL' }).fehler);

  // Umlaute, Ziffern und die ueblichen Satzzeichen bleiben erlaubt
  for (const gut of ['Abendrunde', 'Wir-Testen2', 'Runde für Könige!', 'Die Zweite (2026)']) {
    const e = lobby.anlegen(gut, { von: 'KARL' });
    assert.ok(e.spiel, `"${gut}" muss durchgehen: ${e.fehler || ''}`);
  }
});
