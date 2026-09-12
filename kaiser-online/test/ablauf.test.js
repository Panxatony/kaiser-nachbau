import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Spiel, PHASEN, HALTUNG } from '../server/game.js';
import * as R from '../server/rules.js';

function spielMit(n, optionen = {}) {
  const s = new Spiel({ id: 't', seed: 12345, planungsSekunden: 0, diplomatieSekunden: 0, ...optionen });
  for (let i = 0; i < n; i++) {
    const e = s.beitreten({ id: 'p' + i, name: 'FUERST' + i, weiblich: i % 2 === 1, region: i });
    assert.ok(!e.fehler, e.fehler);
  }
  s.starten();
  return s;
}

/** Ein vollstaendiger Zug fuer einen Spieler. */
function zugMachen(spiel, id, extra = () => {}) {
  const z = spiel.zustand[id];
  if (!z || z.aussetzen || z.fertig) return;
  const s = spiel.spielerVon(id);
  const menge = Math.max(R.int(s.korn / 5), Math.min(z.markt.bedarf, R.int(s.korn * 0.8)));
  assert.ok(!spiel.aktion(id, 'kornVerteilen', { menge }).fehler);
  if (!spiel.zustand[id].fertig) {
    spiel.aktion(id, 'steuernEinziehen');
    extra(spiel, id, s);
    spiel.aktion(id, 'zugBeenden');
  }
}

test('Ein Spieler durchlaeuft mehrere Jahre', () => {
  const spiel = spielMit(1);
  for (let jahr = 0; jahr < 12; jahr++) {
    const vorher = spiel.jahr;
    zugMachen(spiel, 'p0', (sp, id) => {
      sp.aktion(id, 'bauen', { was: 'markt' });
      sp.aktion(id, 'truppenKaufen', { gattung: 'infanterie', soeldner: false });
    });
    assert.equal(spiel.jahr, vorher + 1, 'Das Jahr muss weiterlaufen');
    assert.equal(spiel.phase, PHASEN.PLANUNG);
  }
  const s = spiel.spielerVon('p0');
  assert.ok(s.einwohner > 0 && s.land > 0, 'Reich muss bestehen');
});

test('Parallele Zuege: die Runde wechselt erst, wenn alle fertig sind', () => {
  const spiel = spielMit(4);
  const jahr = spiel.jahr;
  zugMachen(spiel, 'p0');
  assert.equal(spiel.jahr, jahr, 'Noch kein Jahreswechsel');
  assert.equal(spiel.phase, PHASEN.PLANUNG);
  zugMachen(spiel, 'p1');
  zugMachen(spiel, 'p2');
  assert.equal(spiel.jahr, jahr, 'Immer noch nicht');
  zugMachen(spiel, 'p3');
  assert.equal(spiel.jahr, jahr + 1, 'Jetzt wechselt das Jahr');
});

test('Reihenfolge der Zugschritte wird erzwungen', () => {
  const spiel = spielMit(2);
  assert.match(spiel.aktion('p0', 'bauen', { was: 'markt' }).fehler, /Korn verteilen/);
  const s = spiel.spielerVon('p0');
  spiel.aktion('p0', 'kornVerteilen', { menge: R.int(s.korn / 2) });
  assert.match(spiel.aktion('p0', 'bauen', { was: 'markt' }).fehler, /Steuern/);
  assert.ok(!spiel.aktion('p0', 'steuernEinziehen').fehler);
  assert.ok(!spiel.aktion('p0', 'bauen', { was: 'markt' }).fehler);
});

test('Der Zug lässt sich jederzeit beenden, der Verwalter holt das Nötige nach', () => {
  const spiel = spielMit(2);
  const s = spiel.spielerVon('p0');
  const kornVorher = s.korn, kasseVorher = s.kasse;

  // Ohne einen einzigen Schritt beenden
  const e = spiel.aktion('p0', 'zugBeenden');
  assert.ok(!e.fehler, e.fehler);
  assert.deepEqual(e.nachgeholt, ['korn', 'steuern']);
  assert.ok(s.korn < kornVorher, 'Korn wurde verteilt');
  assert.ok(s.kasse !== kasseVorher, 'Steuern wurden eingezogen');
  assert.equal(spiel.zustand['p0'].fertig, true);
  assert.ok(spiel.zustand['p0'].meldungen.some(m => /Verwalter/.test(m.text)),
    'der Spieler erfährt, was nachgeholt wurde');
});

test('Wer alles selbst erledigt hat, bekommt nichts nachgeholt', () => {
  const spiel = spielMit(2);
  const s = spiel.spielerVon('p0');
  spiel.aktion('p0', 'kornVerteilen', { menge: R.int(s.korn / 2) });
  spiel.aktion('p0', 'steuernEinziehen');
  const e = spiel.aktion('p0', 'zugBeenden');
  assert.deepEqual(e.nachgeholt, []);
});

test('Sind alle vorzeitig fertig, wechselt die Phase sofort', () => {
  const spiel = spielMit(3, { planungsSekunden: 3600 });
  const jahr = spiel.jahr;
  spiel.aktion('p0', 'zugBeenden');
  spiel.aktion('p1', 'zugBeenden');
  assert.equal(spiel.jahr, jahr, 'noch nicht alle');
  spiel.aktion('p2', 'zugBeenden');
  assert.equal(spiel.jahr, jahr + 1, 'ohne auf die Frist zu warten');
});

test('Korngrenzen von 20 bis 80 Prozent gelten', () => {
  const spiel = spielMit(1);
  const s = spiel.spielerVon('p0');
  assert.match(spiel.aktion('p0', 'kornVerteilen', { menge: s.korn }).fehler, /ZU VIEL/);
  assert.match(spiel.aktion('p0', 'kornVerteilen', { menge: 1 }).fehler, /ZU WENIG/);
});

test('Krieg loest Diplomatie aus und wird ausgewertet', () => {
  const spiel = spielMit(3);
  for (const p of spiel.spieler) { p.titel = 4; p.kavallerie = 5; p.artillerie = 4; p.infanterie = 6; p.maerkte = 8; p.muehlen = 3; R.armeeAktualisieren(p); }
  const landVorher = { p0: spiel.spielerVon('p0').land, p1: spiel.spielerVon('p1').land };

  zugMachen(spiel, 'p0', (sp, id) => {
    const e = sp.aktion(id, 'kriegErklaeren', { ziel: 'p1' });
    assert.ok(!e.fehler, e.fehler);
  });
  zugMachen(spiel, 'p1');
  zugMachen(spiel, 'p2');

  assert.equal(spiel.phase, PHASEN.DIPLOMATIE, 'Diplomatie muss starten');
  assert.equal(spiel.kriege.length, 1);
  assert.ok(!spiel.aktion('p2', 'haltung', { kriegId: spiel.kriege[0].id, haltung: HALTUNG.DURCHMARSCH }).fehler);
  assert.match(spiel.aktion('p0', 'haltung', { kriegId: spiel.kriege[0].id, haltung: 1 }).fehler, /selbst beteiligt/);
  spiel.aktion('p0', 'bereit');
  spiel.aktion('p1', 'bereit');
  spiel.aktion('p2', 'bereit');

  assert.equal(spiel.phase, PHASEN.PLANUNG, 'Danach geht es weiter');
  const bericht = spiel.letzterBericht;
  assert.equal(bericht.kriege.length, 1);
  const k = bericht.kriege[0];
  assert.ok(k.feld && k.feld.length === 76 * 40, 'Schlachtfeld wird mitgeliefert');
  const verschoben = spiel.spielerVon('p0').land !== landVorher.p0 || spiel.spielerVon('p1').land !== landVorher.p1;
  assert.ok(verschoben, 'Der Krieg muss Land verschieben');
});

test('Krieg vor dem Titel Baron ist nicht erlaubt', () => {
  const spiel = spielMit(2);
  const s = spiel.spielerVon('p0');
  spiel.aktion('p0', 'kornVerteilen', { menge: R.int(s.korn / 2) });
  spiel.aktion('p0', 'steuernEinziehen');
  assert.match(spiel.aktion('p0', 'kriegErklaeren', { ziel: 'p1' }).fehler, /ZU FRÜH/);
});

test('Hilfstruppen werden zurueckgegeben oder entschaedigt', () => {
  const spiel = spielMit(3);
  for (const p of spiel.spieler) { p.titel = 5; p.kavallerie = 4; p.artillerie = 3; p.infanterie = 5; R.armeeAktualisieren(p); }
  const helferVorher = spiel.spielerVon('p2').kavallerie + spiel.spielerVon('p2').artillerie + spiel.spielerVon('p2').infanterie;
  zugMachen(spiel, 'p0', (sp, id) => sp.aktion(id, 'kriegErklaeren', { ziel: 'p1' }));
  zugMachen(spiel, 'p1');
  zugMachen(spiel, 'p2');
  spiel.aktion('p2', 'haltung', { kriegId: spiel.kriege[0].id, haltung: HALTUNG.HILFE_VERTEIDIGER });
  spiel.aktion('p0', 'bereit'); spiel.aktion('p1', 'bereit'); spiel.aktion('p2', 'bereit');
  const p2 = spiel.spielerVon('p2');
  const nachher = p2.kavallerie + p2.artillerie + p2.infanterie;
  assert.ok(nachher <= helferVorher, 'Der Helfer bekommt hoechstens seine Truppen zurueck');
  assert.ok(p2.soldaten >= 20, 'Der Helfer behaelt eine Restarmee');
});

test('Fristablauf beendet die Runde mit einem Auto-Zug', () => {
  const spiel = spielMit(3);
  zugMachen(spiel, 'p0');
  const jahr = spiel.jahr;
  spiel.fristAbgelaufen();
  assert.equal(spiel.jahr, jahr + 1, 'Die Runde wird trotzdem abgerechnet');
  for (const p of spiel.spieler) assert.ok(p.einwohner > 0, 'Niemand verhungert vollstaendig');
});

test('Amtsenthebung bei Landmangel', () => {
  // Zeile 571: geprueft wird erst nach dem Steuereinzug, und der Enthobene
  // behaelt die Einnahmen dieses Jahres.
  const spiel = spielMit(1);
  const s = spiel.spielerVon('p0');
  s.land = 100; s.einwohner = 3000;
  spiel.aktion('p0', 'kornVerteilen', { menge: R.int(s.korn / 2) });
  assert.ok(!s.gesperrtBis || s.gesperrtBis <= 1700, 'nach der Kornausgabe noch im Amt');
  const kasseVorher = s.kasse;
  const e = spiel.aktion('p0', 'steuernEinziehen');
  assert.ok(e.enthoben, 'die Enthebung kommt mit dem Steuereinzug');
  assert.ok(s.kasse > kasseVorher, 'die Steuern sind trotzdem gebucht');
  assert.ok(s.gesperrtBis > 1700, 'Der Spieler muss aussetzen');
});

test('Sicht enthaelt keine fremden Rundendaten', () => {
  const spiel = spielMit(2);
  const sicht = spiel.sichtFuer('p0');
  assert.equal(sicht.ich.id, 'p0');
  assert.ok(sicht.spieler.every(s => s.kasse !== undefined), 'Oeffentliche Werte sind sichtbar');
  assert.equal(sicht.spieler.find(s => s.id === 'p1').korn, undefined, 'Fremde Kornreserve bleibt geheim');
});
