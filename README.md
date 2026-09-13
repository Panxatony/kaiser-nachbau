# Kaiser-Nachbau

Ein Nachbau des C64-Spiels *Kaiser* (CCD Wiesbaden, Ariolasoft 1984) als
Mehrspielerspiel im Browser. Bis zu neun Fürsten regieren ab dem Jahr 1700 je
ein deutsches Fürstentum, planen **gleichzeitig** ihr Jahr und treffen sich in
Diplomatie und Krieg. Wer zuerst fünf Städte, 25.000 Hektar, 100.000 Taler,
einen Palast und eine Kathedrale hat, wird zum Kaiser gekrönt.

Der Nachbau folgt dem Original Zeile für Zeile: dieselbe Ernte, dieselben
Steuern, dieselbe Schlacht auf 76 × 40 Zeichen, dieselben Titel. Wer will,
spielt stattdessen eine überarbeitete Fassung, in der Geld knapp bleibt und ein
Krieg ein Wagnis ist.

## Warum es das gibt

Als Kind saß ich mit meinen Freunden vor dem C64, und wir haben Kaiser gezockt.
Heute sind wir über das Land verteilt und sehen uns viel zu selten. Dieser
Nachbau ist eine Hommage an diese Zeit: dasselbe Spiel, dieselben Zahlen,
dieselben Bilder — nur sitzt jetzt jeder an seinem eigenen Rechner, und wir
können trotzdem gemeinsam in Nostalgie schwelgen.

Das ist auch der Grund, warum alle **gleichzeitig** planen statt reihum. Wer
sich verabredet, wartet nicht auf acht andere Züge; und wer erst abends Zeit
hat, plant sein Jahr, wenn es ihm passt. Geredet wird trotzdem wieder, nämlich
in der Diplomatiephase, wenn jemand Krieg erklärt hat.

> **Das Original gehört nicht dazu.** In diesem Repository liegt kein Byte des
> C64-Spiels: kein Diskettenabbild, kein Zeichensatz, kein Bild, keine Musik.
> Wer die Diskette besitzt, erzeugt sich das Nötige mit einem Befehl selbst.

## Schnellstart

```bash
cd kaiser-online
npm install
npm start
```

Dann `http://localhost:8420` öffnen. **Das erste angelegte Konto wird
Verwalter** und lädt die übrigen Spieler ein.

So läuft das Spiel vollständig, aber schmucklos: statt des Titelbilds steht ein
Schriftzug da, das Schlachtfeld und die Reichskarte zeigen einen Hinweis statt
der Zeichen, und der Musikknopf bleibt aus. Regeln, Lobby, Ablauf, Krieg und
Krönung sind alle da.

### Mit dem Original

Wer eine eigene `kaiser.d64` hat, legt sie ins Projektverzeichnis und lässt
einen Befehl laufen:

```bash
python3 aufbauen.py kaiser.d64
```

Das entpackt das Diskettenabbild, entlistet das BASIC, schneidet beide
Zeichensätze, das Titel- und das Abspannbild heraus und baut aus den beiden
Musikroutinen spielbare SID-Dateien. Danach sieht und klingt der Nachbau wie
das Original. Gebraucht werden nur Python 3 ohne weitere Pakete und Node 20
oder neuer.

Die vier Schritte lassen sich auch einzeln aufrufen; was sie tun und woher
jedes Byte stammt, steht in `GRAFIK.md` und `MUSIK.md`.

## Was hier liegt

| Verzeichnis | Inhalt |
|-------------|--------|
| `kaiser-online/` | Das Spiel: Server, Client, Tests. Siehe `kaiser-online/README.md` |
| `aufbauen.py` | Erzeugt aus einer eigenen `kaiser.d64` alles Nötige |
| `*.py` | Die einzelnen Werkzeuge dahinter: Diskette, BASIC, Grafik, Musik |

| Datei | Inhalt |
|-------|--------|
| `CHANGELOG.md` | Was sich von Fassung zu Fassung geändert hat, Regeländerungen eigens ausgewiesen |
| `SPIELMECHANIK.md` | Alle Spielregeln und Formeln, hergeleitet aus dem BASIC-Original |
| `TEXTE.md` | Was der Nachbau erklären darf: nur, was auf dem C64-Bildschirm stand oder im Handbuch steht |
| `GRAFIK.md` | Aufbau der Grafikdaten: zwei Zeichensätze, Titel- und Abspannbild |
| `MUSIK.md` | Die beiden SID-Stücke: Adressen, Aufbau, Wiedergabe im Browser |
| `SECURITY.md` | Wie man eine Sicherheitslücke meldet und was dazugehört |
| `kaiser-online/ARCHITEKTUR.md` | Client-Server-Aufbau, Nachrichtenformat, Phasen |
| `kaiser-online/BETRIEB.md` | Betrieb als Dienst hinter einem Webserver |

Die Dokumentation beschreibt das Original in eigenen Worten und nennt dazu die
Fundstellen. Sie enthält kurze Auszüge, soweit nötig, um eine Aussage zu
belegen, aber keine vollständigen Originaldateien.

## Tests

```bash
cd kaiser-online
npm test
```

181 Prüfungen, alle ohne Originalmaterial lauffähig. Sie decken die Regeln, den
Rundenablauf, die Schlacht, die Lobby und die Kontenverwaltung ab.

## Woher die Regeln stammen

Grundlage ist das entlistete BASIC des Hauptprogramms, 857 Zeilen. Jede Regel
im Nachbau ist auf ihre Zeile zurückgeführt und in `SPIELMECHANIK.md`
festgehalten; im Quelltext steht die Zeilennummer daneben. Wo das Programm
etwas anderes tut, als man erwartet — `INT` rundet ab, auch bei Schulden, eine
Stadtmauer verbraucht fünf Märkte, ein langer Anmarsch zehrt an der Truppe —,
steht es dort ebenfalls.

Nachgeschlagen wurde im Zweifel im Emulator und im gedruckten Handbuch von
1984. Erklärt wird im Spiel aber nur, was ein Spieler von damals auch wissen
konnte; die Regel dazu steht in `TEXTE.md`.

## Rechtliches

Der Code in `kaiser-online/`, die Werkzeuge und die Dokumentation sind eigene
Arbeit und stehen unter der MIT-Lizenz, siehe `LICENSE`.

*Kaiser* selbst gehört seinen Rechteinhabern. Dieses Repository enthält **kein**
Originalmaterial: keinen Originalcode, kein Diskettenabbild, keine Grafik,
keine Musik, kein Handbuch. Die Werkzeuge geben nichts heraus, was man nicht
schon besitzt: sie setzen eine eigene Kopie der Diskette voraus und schreiben
ihre Ergebnisse nur auf den eigenen Rechner.

Was aus dem Original übernommen ist und warum:

* **Die Spielregeln.** Regeln und Formeln sind als solche nicht geschützt; der
  Nachbau ist eine Neuimplementierung in JavaScript, keine Übersetzung des
  BASIC-Programms.
* **Kurze Bildschirmtexte** wie „DAS IST ZU VIEL!“ oder die Titelnamen. Ohne
  sie wäre es ein anderes Spiel; es sind einzelne Wörter und Sätze.
* **Auszüge aus dem Handbuch** in den Hilfetexten, jeweils als Zitat
  gekennzeichnet und mit Seitenangabe.

Wer damit ein Problem hat, möge sich melden; wir nehmen es heraus.

---

## English, in short

A browser multiplayer rebuild of the 1984 C64 game *Kaiser* (CCD Wiesbaden /
Ariolasoft). Up to nine princes rule a German principality from 1700 onwards,
plan their year simultaneously, and meet in diplomacy and war. Everything is in
German — the game, the code and the docs — because the original is.

**No original material is included.** The repository contains no disk image, no
character sets, no graphics and no music. Run `npm install && npm start` in
`kaiser-online/` and it plays without them, plainly. If you own the original
disk, `python3 aufbauen.py kaiser.d64` extracts what is needed from your own
copy, locally.

Why it exists: as a kid I played Kaiser with my friends in front of a C64. We
live scattered across the country now, so this is our way back to that table —
everyone at their own machine, all planning their year at the same time.

Code, tools and documentation are MIT-licensed. *Kaiser* itself belongs to its
rights holders.
