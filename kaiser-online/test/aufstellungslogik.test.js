import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../client/aufstellungslogik.js';

// Seit die beiden Seiten abwechselnd setzen, haelt der Browser keinen eigenen
// Zwischenstand mehr: jede Einheit geht sofort an den Server, und was
// zurueckkommt, ist die Wahrheit. klick() setzt darum nichts mehr, es prueft
// nur und liefert die Stelle, die gesetzt werden soll.

/** Ein Krieg wie ihn der Server schickt: leeres Gelände, ein paar Hindernisse. */
function krieg(istAngreifer = true, hindernisse = [], mehr = {}) {
  const feld = new Array(A.ZEILEN * A.SPALTEN).fill(32);
  const spalte = istAngreifer ? 13 : 26;
  for (const r of hindernisse) feld[r * A.SPALTEN + spalte] = 107;   // Baum auf der Linie
  return {
    id: 'a->b', istAngreifer, spalte, feld,
    einheiten: ['kavallerie', 'kavallerie', 'artillerie', 'infanterie', 'infanterie', 'miliz'],
    aufstellung: [],
    amZug: 'ich',
    ...mehr
  };
}

test('Zustand entsteht aus der Kriegssicht', () => {
  const z = A.zustandAus(krieg());
  assert.equal(z.vorrat.length, 6);
  assert.equal(z.gesetzt.length, 0);
  assert.equal(z.gewaehlt, 'kavallerie');
  assert.deepEqual({ ...A.offeneEinheiten(z) },
    { kavallerie: 2, artillerie: 1, infanterie: 2, miliz: 1 });
});

test('Bereits gesetzte Einheiten kommen aus dem Vorrat', () => {
  const k = krieg();
  k.aufstellung = [{ gattung: 'kavallerie', zeile: 3, spalte: 13 }];
  const z = A.zustandAus(k);
  assert.equal(z.gesetzt.length, 1);
  assert.equal(z.vorrat.length, 5);
  assert.equal(z.vorrat.filter(g => g === 'kavallerie').length, 1);
});

test('Ein Klick liefert die Stelle, die gesetzt werden soll', () => {
  const z = A.zustandAus(krieg());
  const e = A.klick(z, 10, 16);
  assert.deepEqual(e.setzen, { zeile: 10, spalte: 16 });
  assert.ok(!e.fehler);
  // Gesetzt wird erst, wenn der Server es bestaetigt; hier aendert sich nichts.
  assert.equal(z.gesetzt.length, 0);
});

test('Wer nicht am Zug ist, klickt vergebens', () => {
  const z = A.zustandAus(krieg(true, [], { amZug: 'gegner' }));
  const e = A.klick(z, 10, 16);
  assert.ok(!e.setzen);
  assert.match(e.fehler, /Gegner ist am Zug/);
});

test('Wer abgegeben hat, setzt nichts mehr', () => {
  const z = A.zustandAus(krieg(true, [], { abgegeben: true }));
  assert.match(A.klick(z, 10, 16).fehler, /abgegeben/);
});

test('Auf eine besetzte Stelle laesst sich nichts setzen', () => {
  const k = krieg();
  k.aufstellung = [{ gattung: 'kavallerie', zeile: 10, spalte: 16 }];
  const z = A.zustandAus(k);
  assert.match(A.klick(z, 10, 17).fehler, /kein Platz/, 'eine Einheit ist zwei Zeichen breit');
  assert.ok(A.klick(z, 10, 18).setzen, 'zwei Felder weiter geht es');
});

test('Auch die Truppen des Gegners stehen im Weg', () => {
  const k = krieg(true, [], {
    gegnerSpalte: 26,
    gegnerAufstellung: [{ gattung: 'kavallerie', zeile: 4, spalte: 17 }]
  });
  const z = A.zustandAus(k);
  assert.match(A.klick(z, 4, 16).fehler, /kein Platz/);
  assert.ok(A.klick(z, 4, 12).setzen);
});

test('Auf besetztes Gelaende laesst sich nichts stellen', () => {
  const z = A.zustandAus(krieg(true, [7]));
  assert.match(A.klick(z, 7, 13).fehler, /kein Platz/);
});

test('Ohne Vorrat passiert nichts mehr', () => {
  const k = krieg();
  k.aufstellung = k.einheiten.map((gattung, n) => ({ gattung, zeile: 5 + n * 5, spalte: 13 }));
  const z = A.zustandAus(k);
  assert.equal(z.vorrat.length, 0);
  assert.match(A.klick(z, 60, 13).fehler, /stehen schon/);
});

test('Es gibt kein Zuruecknehmen und kein Rest-Verteilen mehr', () => {
  assert.equal(typeof A.alleZurueck, 'undefined');
  assert.equal(typeof A.restVerteilen, 'undefined');
});

test('Zeilenberechnung aus der Mausposition', () => {
  // Feld 76 Zeilen, dargestellt 1216 Pixel hoch, beginnt bei y = 100
  assert.equal(A.zeileAusKlick(100, 100, 1216), 0);
  assert.equal(A.zeileAusKlick(100 + 16, 100, 1216), 1);
  assert.equal(A.zeileAusKlick(100 + 1215, 100, 1216), 75);
  assert.equal(A.zeileAusKlick(99, 100, 1216), -1, 'oberhalb');
  assert.equal(A.zeileAusKlick(100 + 1216, 100, 1216), -1, 'unterhalb');
});

test('Das Anzeigefeld traegt die eigenen Zeichen', () => {
  const k = krieg();
  k.aufstellung = [{ gattung: 'kavallerie', zeile: 12, spalte: 13 }];
  const feld = A.anzeigeFeld(A.zustandAus(k));
  const [links, rechts] = A.zeichenPaar('kavallerie', true);
  assert.equal(feld[12 * A.SPALTEN + 13], links);
  assert.equal(feld[12 * A.SPALTEN + 14], rechts);
});

test('Das Anzeigefeld zeigt auch die Truppen des Gegners', () => {
  // Im Original stehen beide Parteien auf demselben Bildschirm, Zeile 292-295
  const k = krieg(true, [], {
    gegnerSpalte: 26,
    gegnerAufstellung: [{ gattung: 'infanterie', zeile: 20, spalte: 26 }]
  });
  const feld = A.anzeigeFeld(A.zustandAus(k));
  const [links, rechts] = A.zeichenPaar('infanterie', false);
  assert.equal(feld[20 * A.SPALTEN + 26], links);
  assert.equal(feld[20 * A.SPALTEN + 27], rechts);
});

test('Die Gattung wird nicht gewaehlt, sie kommt der Reihe nach', () => {
  const k = krieg();
  assert.equal(A.zustandAus(k).gewaehlt, 'kavallerie');
  k.aufstellung = [{ gattung: 'kavallerie', zeile: 1, spalte: 13 },
                   { gattung: 'kavallerie', zeile: 4, spalte: 13 }];
  assert.equal(A.zustandAus(k).gewaehlt, 'artillerie', 'die Kavallerie ist aufgebraucht');
  k.aufstellung.push({ gattung: 'artillerie', zeile: 7, spalte: 13 });
  assert.equal(A.zustandAus(k).gewaehlt, 'infanterie');
});

test('Die Tafel zaehlt beide Seiten', () => {
  // zaehlen() liefert ein Objekt ohne Prototyp und mit allen vier Gattungen,
  // damit ein Schluessel wie "__proto__" aus dem Netz nirgends landen kann.
  const leer = { kavallerie: 0, artillerie: 0, infanterie: 0, miliz: 0 };
  assert.deepEqual({ ...A.zaehlen(['miliz', 'miliz', 'kavallerie']) },
                   { ...leer, miliz: 2, kavallerie: 1 });
  assert.deepEqual({ ...A.zaehlen([]) }, leer);
  assert.deepEqual({ ...A.zaehlen(null) }, leer);
  assert.deepEqual({ ...A.zaehlen(['__proto__', 'constructor', 'miliz']) },
                   { ...leer, miliz: 1 }, 'fremde Schluessel werden uebergangen');
});

test('In eine Zeile passen mehrere Einheiten nebeneinander', () => {
  const k = krieg();
  k.aufstellung = [{ gattung: 'kavallerie', zeile: 10, spalte: 5 }];
  const z = A.zustandAus(k);
  assert.ok(A.klick(z, 10, 8).setzen, 'derselben Zeile, weiter links');
  assert.ok(A.klick(z, 10, 15).setzen, 'und weiter rechts');
});

test('Der Angreifer darf nicht ins Feindesland stellen', () => {
  const z = A.zustandAus(krieg(true));
  assert.equal(A.spalteEinpassen(z, 30), 18, 'nach rechts bis zur Grenze');
  assert.equal(A.spalteEinpassen(z, -5), 0, 'nach links bis zum Rand');
  const v = A.zustandAus(krieg(false));
  assert.equal(A.spalteEinpassen(v, 5), 21, 'der Verteidiger nicht nach links');
  assert.equal(A.spalteEinpassen(v, 99), A.SPALTEN - 2);
});

test('Die oberste und die unterste Zeile bleiben frei', () => {
  const z = A.zustandAus(krieg());
  assert.ok(!A.feldFrei(z, 0, 13), 'Zeile 0 ist gesperrt');
  assert.ok(!A.feldFrei(z, A.ZEILEN - 1, 13), 'die letzte Zeile auch');
  assert.ok(A.feldFrei(z, 1, 13));
});

test('Das Anzeigefeld setzt jede Einheit in ihre eigene Spalte', () => {
  const k = krieg();
  k.aufstellung = [{ gattung: 'kavallerie', zeile: 9, spalte: 4 },
                   { gattung: 'artillerie', zeile: 9, spalte: 15 }];
  const feld = A.anzeigeFeld(A.zustandAus(k));
  assert.equal(feld[9 * A.SPALTEN + 4], A.zeichenPaar('kavallerie', true)[0]);
  assert.equal(feld[9 * A.SPALTEN + 15], A.zeichenPaar('artillerie', true)[0]);
});

test('Die Spalte des Feldherrn folgt dem Grenzverlauf', () => {
  const k = krieg();
  k.grenzspalte = Array.from({ length: A.ZEILEN }, (_, r) => 19 + (r % 3));
  const z = A.zustandAus(k);
  for (const zeile of [0, 1, 2, 40]) {
    assert.equal(A.feldherrSpalte(z, zeile),
      Math.min(18, k.grenzspalte[zeile] - A.FELDHERR_ABSTAND));
  }
  const v = A.zustandAus({ ...krieg(false), grenzspalte: k.grenzspalte });
  assert.equal(A.feldherrSpalte(v, 0), Math.max(21, k.grenzspalte[0] + A.FELDHERR_ABSTAND));
});

test('Ohne Grenzverlauf bleibt es bei der Startspalte', () => {
  const z = A.zustandAus(krieg());
  assert.equal(A.feldherrSpalte(z, 5), 13);
});
