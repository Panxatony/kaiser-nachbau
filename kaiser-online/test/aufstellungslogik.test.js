import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../client/aufstellungslogik.js';

/** Ein Krieg wie ihn der Server schickt: leeres Gelände, ein paar Hindernisse. */
function krieg(istAngreifer = true, hindernisse = []) {
  const feld = new Array(A.ZEILEN * A.SPALTEN).fill(32);
  const spalte = istAngreifer ? 13 : 26;
  for (const r of hindernisse) feld[r * A.SPALTEN + spalte] = 107;   // Baum auf der Linie
  return {
    id: 'a->b', istAngreifer, spalte, feld,
    einheiten: ['kavallerie', 'kavallerie', 'artillerie', 'infanterie', 'infanterie', 'miliz'],
    aufstellung: []
  };
}

test('Zustand entsteht aus der Kriegssicht', () => {
  const z = A.zustandAus(krieg());
  assert.equal(z.vorrat.length, 6);
  assert.equal(z.gesetzt.length, 0);
  assert.equal(z.gewaehlt, 'kavallerie');
  assert.deepEqual(A.offeneEinheiten(z), { kavallerie: 2, artillerie: 1, infanterie: 2, miliz: 1 });
});

test('Bereits gesetzte Einheiten kommen aus dem Vorrat', () => {
  const k = krieg();
  k.aufstellung = [{ gattung: 'kavallerie', zeile: 3 }];
  const z = A.zustandAus(k);
  assert.equal(z.gesetzt.length, 1);
  assert.equal(z.vorrat.length, 5);
  assert.equal(z.vorrat.filter(g => g === 'kavallerie').length, 1);
});

test('Klick setzt eine Einheit und der Vorrat schrumpft', () => {
  const z = A.zustandAus(krieg());
  const e = A.klick(z, 10);
  assert.ok(e.geaendert);
  assert.deepEqual(z.gesetzt, [{ gattung: 'kavallerie', zeile: 10, spalte: 13 }]);
  assert.equal(z.vorrat.length, 5);
});

test('Ein zweiter Klick nimmt die Einheit zurueck', () => {
  const z = A.zustandAus(krieg());
  A.klick(z, 10);
  A.klick(z, 10);
  assert.equal(z.gesetzt.length, 0);
  assert.equal(z.vorrat.length, 6);
});

test('Auf besetztes Gelaende laesst sich nichts stellen', () => {
  const z = A.zustandAus(krieg(true, [5]));
  const e = A.klick(z, 5);
  assert.equal(e.geaendert, false);
  assert.match(e.fehler, /kein Platz/);
  assert.equal(z.gesetzt.length, 0);
});

test('Ist eine Gattung aufgebraucht, wird die naechste gewaehlt', () => {
  const z = A.zustandAus(krieg());
  A.klick(z, 1);
  assert.equal(z.gewaehlt, 'kavallerie', 'noch eine Schwadron übrig');
  A.klick(z, 2);
  assert.equal(z.gewaehlt, 'artillerie', 'jetzt die nächste Gattung');
});

test('Ohne Vorrat passiert nichts mehr', () => {
  const z = A.zustandAus(krieg());
  A.restVerteilen(z);
  assert.equal(z.vorrat.length, 0);
  const e = A.klick(z, 60);
  assert.equal(e.geaendert, false);
});

test('Rest verteilen belegt lauter verschiedene freie Zeilen', () => {
  const z = A.zustandAus(krieg(true, [0, 1, 2, 3, 4]));
  A.klick(z, 40);
  const e = A.restVerteilen(z);
  assert.ok(e.geaendert);
  assert.equal(z.vorrat.length, 0);
  assert.equal(z.gesetzt.length, 6);
  const zeilen = z.gesetzt.map(x => x.zeile);
  assert.equal(new Set(zeilen).size, 6, 'keine Zeile doppelt');
  for (const r of zeilen) assert.ok(!(r >= 0 && r <= 4), `Zeile ${r} ist blockiert`);
});

test('Alles zuruecknehmen stellt den Vorrat wieder her', () => {
  const z = A.zustandAus(krieg());
  A.restVerteilen(z);
  A.alleZurueck(z);
  assert.equal(z.gesetzt.length, 0);
  assert.equal(z.vorrat.length, 6);
});

test('Zeilenberechnung aus der Mausposition', () => {
  // Feld 76 Zeilen, dargestellt 1216 Pixel hoch, beginnt bei y = 100
  assert.equal(A.zeileAusKlick(100, 100, 1216), 0);
  assert.equal(A.zeileAusKlick(100 + 16, 100, 1216), 1);
  assert.equal(A.zeileAusKlick(100 + 1215, 100, 1216), 75);
  assert.equal(A.zeileAusKlick(99, 100, 1216), -1, 'oberhalb');
  assert.equal(A.zeileAusKlick(100 + 1216, 100, 1216), -1, 'unterhalb');
  assert.equal(A.zeileAusKlick(200, 100, 0), -1, 'ohne Hoehe');
});

test('Das Anzeigefeld traegt die eigenen Zeichen', () => {
  const z = A.zustandAus(krieg(true));
  A.klick(z, 7);                                   // Kavallerie des Angreifers
  const feld = A.anzeigeFeld(z);
  assert.equal(feld[7 * A.SPALTEN + 13], 227);
  assert.equal(feld[7 * A.SPALTEN + 14], 228);

  const v = A.zustandAus(krieg(false));
  A.klick(v, 7);
  const feldV = A.anzeigeFeld(v);
  assert.equal(feldV[7 * A.SPALTEN + 26], 109, 'Verteidiger benutzt die untere Zeichensatzhälfte');
  assert.equal(feldV[7 * A.SPALTEN + 27], 110);
});

// --------------------------------------------------- sichtbare Aufstellung

/** Ein Feld ohne Hindernisse. */
const leeresFeld = () => new Array(A.ZEILEN * A.SPALTEN).fill(32);

test('Die Gattung wird nicht gewaehlt, sie kommt der Reihe nach', () => {
  // BASIC-Zeile 354: immer die niedrigste noch vorhandene Gattung
  const z = A.zustandAus({
    id: 1, istAngreifer: true, spalte: 13,
    feld: leeresFeld(), einheiten: ['infanterie', 'miliz', 'kavallerie', 'artillerie']
  });
  assert.equal(z.gewaehlt, 'kavallerie');
  A.klick(z, 5);
  assert.equal(z.gewaehlt, 'artillerie', 'nach der Kavallerie die Artillerie');
  A.klick(z, 7);
  assert.equal(z.gewaehlt, 'infanterie');
  A.klick(z, 9);
  assert.equal(z.gewaehlt, 'miliz', 'die Miliz zuletzt');
  A.klick(z, 11);
  assert.equal(z.gewaehlt, null);
  assert.deepEqual(z.gesetzt.map(e => e.gattung),
    ['kavallerie', 'artillerie', 'infanterie', 'miliz']);
});

test('Eine zurueckgenommene Einheit kommt wieder als naechste dran', () => {
  const z = A.zustandAus({
    id: 1, istAngreifer: true, spalte: 13,
    feld: leeresFeld(), einheiten: ['kavallerie', 'infanterie']
  });
  A.klick(z, 5);
  assert.equal(z.gewaehlt, 'infanterie');
  A.klick(z, 5);            // dieselbe Zeile nochmal: zurueck
  assert.equal(z.gewaehlt, 'kavallerie', 'die Kavallerie steht wieder vorne');
});

test('Das Anzeigefeld zeigt auch die Truppen des Gegners', () => {
  // Im Original stehen beide Parteien auf demselben Bildschirm, Zeile 292-295
  const z = A.zustandAus({
    id: 1, istAngreifer: true, spalte: 13,
    feld: leeresFeld(), einheiten: ['kavallerie'],
    gegnerSpalte: 26, gegnerEinheiten: ['artillerie', 'miliz'],
    gegnerAufstellung: [{ gattung: 'artillerie', zeile: 3 }]
  });
  A.klick(z, 3);
  const feld = A.anzeigeFeld(z);
  const [meinLinks] = A.zeichenPaar('kavallerie', true);
  const [seinLinks] = A.zeichenPaar('artillerie', false);
  assert.equal(feld[3 * A.SPALTEN + 13], meinLinks, 'meine Kavallerie steht da');
  assert.equal(feld[3 * A.SPALTEN + 26], seinLinks, 'seine Artillerie auch');
});

test('Die Tafel zaehlt beide Seiten', () => {
  assert.deepEqual(A.zaehlen(['miliz', 'miliz', 'kavallerie']), { miliz: 2, kavallerie: 1 });
  assert.deepEqual(A.zaehlen([]), {});
  assert.deepEqual(A.zaehlen(null), {});
});

// ------------------------------------------- mehrere Einheiten je Zeile

test('In eine Zeile passen mehrere Einheiten nebeneinander', () => {
  // Im Original ist der Aufstellcursor zweidimensional beweglich,
  // Zeile 368, 370, 384 und 385.
  const z = A.zustandAus(krieg());
  assert.ok(A.klick(z, 10, 5).geaendert, 'erste in Spalte 5');
  assert.ok(A.klick(z, 10, 10).geaendert, 'zweite in Spalte 10');
  assert.ok(A.klick(z, 10, 15).geaendert, 'dritte in Spalte 15');
  assert.equal(z.gesetzt.filter(e => e.zeile === 10).length, 3);
  assert.deepEqual(z.gesetzt.map(e => e.spalte), [5, 10, 15]);
});

test('Zwei Einheiten dürfen sich nicht überlappen', () => {
  // Eine Einheit belegt zwei Felder, also braucht die naechste zwei Abstand
  const z = A.zustandAus(krieg());
  A.klick(z, 10, 5);
  const e = A.klick(z, 10, 6);
  assert.equal(e.geaendert, true, 'Klick auf die Nachbarzelle nimmt zurück');
  assert.equal(z.gesetzt.length, 0);
});

test('Der Angreifer darf nicht ins Feindesland stellen', () => {
  const z = A.zustandAus(krieg(true));
  assert.equal(A.spalteEinpassen(z, 30), 18, 'nach rechts bis zur Grenze');
  assert.equal(A.spalteEinpassen(z, -5), 0, 'nach links bis zum Rand');
  const v = A.zustandAus(krieg(false));
  assert.equal(A.spalteEinpassen(v, 0), 21, 'der Verteidiger bleibt rechts');
  assert.equal(A.spalteEinpassen(v, 99), 38);
});

test('Die oberste und die unterste Zeile bleiben frei', () => {
  // Zeile 98 und 103 des Originals
  const z = A.zustandAus(krieg());
  assert.equal(A.klick(z, 0, 13).geaendert, false, 'Zeile 0 gesperrt');
  assert.equal(A.klick(z, A.ZEILEN - 1, 13).geaendert, false, 'letzte Zeile gesperrt');
  assert.ok(A.klick(z, 1, 13).geaendert, 'Zeile 1 geht');
});

test('Das Anzeigefeld setzt jede Einheit in ihre eigene Spalte', () => {
  const z = A.zustandAus(krieg());
  A.klick(z, 10, 4);
  A.klick(z, 10, 12);
  const feld = A.anzeigeFeld(z);
  const [kavL] = A.zeichenPaar('kavallerie', true);   // zwei Schwadronen im Vorrat
  assert.equal(feld[10 * A.SPALTEN + 4], kavL);
  assert.equal(feld[10 * A.SPALTEN + 12], kavL);
  assert.equal(feld[10 * A.SPALTEN + 8], 32, 'dazwischen bleibt Platz');
});

test('Rest verteilen folgt dem Grenzverlauf', () => {
  // Ein Grenzverlauf wie ihn der Server schickt: er maeandert um Spalte 20.
  const k = krieg();
  k.grenzspalte = Array.from({ length: A.ZEILEN }, (_, r) => 19 + (r % 3));
  const z = A.zustandAus(k);
  A.restVerteilen(z);
  assert.equal(z.vorrat.length, 0);
  for (const e of z.gesetzt) {
    assert.equal(e.spalte, Math.min(18, k.grenzspalte[e.zeile] - A.FELDHERR_ABSTAND),
      `Zeile ${e.zeile}: grenznah statt Startspalte`);
  }
});

test('Der Verteidiger wird auf der anderen Seite grenznah gesetzt', () => {
  const k = krieg(false);
  k.grenzspalte = Array.from({ length: A.ZEILEN }, (_, r) => 19 + (r % 3));
  const z = A.zustandAus(k);
  A.restVerteilen(z);
  for (const e of z.gesetzt) {
    assert.equal(e.spalte, Math.max(21, k.grenzspalte[e.zeile] + A.FELDHERR_ABSTAND));
  }
});

test('Ohne Grenzverlauf bleibt es bei der Startspalte', () => {
  const z = A.zustandAus(krieg());
  A.restVerteilen(z);
  for (const e of z.gesetzt) assert.equal(e.spalte, 13);
});
