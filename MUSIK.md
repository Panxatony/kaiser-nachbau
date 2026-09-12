# Musik aus "Kaiser" (CCD Wiesbaden / Ariolasoft, 1984)

Beide SID-Stuecke des Spiels sind gefunden, als PSID-Dateien exportiert und
im Browser abspielbar. Alle Adressen unten stammen aus dem Disassemblat der
Originaldateien, nicht aus Vermutungen.

---

## 1. Titelmusik -- `extracted/ml_6000.prg`

Die Datei laedt nach `$6000`. Ab `$8000` (Dateiversatz 8192) steht der
Musiktreiber, ab `$8243` die Notendaten.

| Was | Adresse |
|---|---|
| Init | **`$81BA`** |
| Play (urspruenglich IRQ-Handler an `$0314/$0315`) | **`$802F`** |
| Frequenztabelle niederwertig | `$80D8` (96 Bytes) |
| Frequenztabelle hoeherwertig | `$8138` (96 Bytes) |
| Notendaten Stimme 1 | `$8243`-`$8318` (214 Bytes, 107 Eintraege) |
| Notendaten Stimme 2 | `$8319`-`$83BA` (162 Bytes, 81 Eintraege) |
| Notendaten Stimme 3 | `$83BB`-`$840F` (85 Bytes, 42 Eintraege) |
| Abschaltroutine (stellt IRQ-Vektor zurueck) | `$8233` |
| Gesamter Musikbereich | `$8000`-`$840F` (1040 Bytes) |

Belege aus dem Disassemblat (Init `$81BA`):

```
81BA  78        SEI
81BB  A9 7F     LDA #$7F
81BD  8D 0D DC  STA $DC0D      ; CIA-1-Interrupts aus
81C0  A9 2F     LDA #$2F       ; IRQ-Vektor auf $802F ...
81C2  8D 14 03  STA $0314
81C5  A9 80     LDA #$80
81C7  8D 15 03  STA $0315
81CA  A9 43 ... 8D B5 80       ; Zeiger Stimme 1 := $8243  (selbstaendernder Code in $80B4)
81D4  A9 19 ... 8D C1 80       ; Zeiger Stimme 2 := $8319  (in $80C0)
81DE  A9 BB ... 8D CD 80       ; Zeiger Stimme 3 := $83BB  (in $80CC)
81E8  A9 00 8D 04 DC / A9 30 8D 05 DC   ; CIA-Timer A = $3000
81F2  A0 19 / 99 FF D3         ; SID $D400-$D418 loeschen
8207  A9 08 -> $D403/$D40A/$D411 ; Pulsweite (hoeherwertig) = 8  -> 50 % Rechteck
8212  A9 41 -> $02C3           ; Kontrollwert = $41 = Rechteck + Gate
8217  A9 88 -> $D406/$D40D/$D414 ; Sustain 8 / Release 8   (Attack/Decay = 0)
8222  A9 0F -> $D418           ; Lautstaerke 15, kein Filter
822A  A9 81 -> $DC0D / A9 11 -> $DC0E ; Timer A starten, IRQ freigeben
```

* Datenformat je Stimme: Paare `(Dauer in Ticks, Notenindex 0..95)`.
  Index 95 hat Frequenz `$0000` und ist die Pause.
* Taktgeber: CIA-1 Timer A, Latch `$3000` -> `985248 / 12289 = 80,17 Aufrufe/s`.
  Ein Byte `Dauer = 0` in Stimme 3 springt nach `$8198` und laedt dort einen
  neuen Timerwert (Tempowechsel). In den Daten der Titelmusik kommt das nicht vor.
* Laenge: Stimme 1 und Stimme 2 summieren sich auf **exakt 2688 Ticks**,
  Stimme 3 ebenfalls (14 x 192 Ticks Pause). Das sind **33,5 s**. Danach
  laufen die Zeiger der Stimmen 1 und 2 in fremde Daten -- das Stueck kennt
  keine eigene Schleife, es wurde vom Spiel per `$8233` abgeschaltet.
  Der Browser-Player wiederholt deshalb nach 2688 Aufrufen.

---

## 2. Abspannmusik -- `extracted/karte_57be.prg`

Die Datei laedt nach `$57BE`. Ab `$8000` steht derselbe Treiber (um 3 Bytes
verschoben), ab `$825B` die Notendaten.

| Was | Adresse |
|---|---|
| Init | **`$81BD`** |
| Play (urspruenglich IRQ-Handler) | **`$8032`** |
| Frequenztabelle niederwertig / hoeherwertig | `$80DB` / `$813B` |
| Notendaten Stimme 1 | `$825B`-`$875C` (641 Eintraege) |
| Notendaten Stimme 2 | `$875D`-`$8BAE` (553 Eintraege) |
| Notendaten Stimme 3 | `$8BAF`-`$95F2` (1313 Eintraege, Endekennung `$00` bei `$95F1`) |
| Abschaltroutine | `$8236` |
| Gesamter Musikbereich | `$8000`-`$95FE` (5631 Bytes) |

Unterschiede zur Titelmusik:

* Kontrollwert `$21` = **Saegezahn** + Gate (statt Rechteck).
* `$D405/$D40C/$D413 = $11` -> Attack 1, Decay 1; `$D406/... = $88` wie oben.
* CIA-Timer-Latch `$5000` -> `985248 / 20481 = 48,10 Aufrufe/s`.
* Statt der Tempowechsel-Routine steht bei `$819B` eine Ende-Erkennung:
  `Dauer == 0` in Stimme 3 -> `JSR $8236` (IRQ-Vektor zurueck) und
  `STA $D418` mit A = 0 (Lautstaerke aus).
* Laenge: alle drei Stimmen summieren sich auf 11423/11424 Ticks =
  **rund 237 s (knapp 4 Minuten)**.

---

## 3. Gemeinsames

* Der Play-Einsprung ist bei beiden Stuecken ein **IRQ-Handler**, kein
  gewoehnliches Unterprogramm: er endet mit `JMP $03D4`. `$03D4` liegt im
  Lader (`extracted/loader_033c.prg`, `$033C`-`$03FC`) und zaehlt dort nur die
  Jiffy-Uhr `$A0/$A1/$A2` hoch, bevor er nach `JMP $EA34` in den Kernal geht.
  Fuer die PSID-Dateien wird jedes `JMP $03D4` (`4C D4 03`) durch
  `RTS NOP NOP` (`60 EA EA`) ersetzt -- gleiche Laenge, keine Verschiebung.
  Betroffene Stellen: Titel `$8044`, `$806D`; Abspann `$8047`, `$8070`, `$81A5`.
* Benutzte SID-Register: `$D400/$D401`, `$D403`, `$D404`, `$D406` (Stimme 1),
  `$D407/$D408`, `$D40A`, `$D40B`, `$D40D` (Stimme 2),
  `$D40E/$D40F`, `$D411`, `$D412`, `$D414` (Stimme 3), `$D418`.
  **Die Filterregister `$D415`-`$D417` werden nie beschrieben, und `$D418`
  bekommt nur `$0F` bzw. `$00`** -- das Filter ist also in beiden Stuecken aus.
* Ring-Modulation (Bit 2) und Sync (Bit 1) des Kontrollregisters sind in
  beiden Stuecken immer 0.

---

## 4. Die .sid-Dateien

Erzeugt von `extract_sid.py` (Aufruf: `python3 extract_sid.py`).

```
musik/kaiser_titel.sid     1166 Bytes
musik/kaiser_abspann.sid   5757 Bytes
```

Aufbau (PSID Version 2, Kopf 124 Bytes = `$7C`):

| Feld | Titel | Abspann |
|---|---|---|
| magicID | `PSID` | `PSID` |
| version | 2 | 2 |
| dataOffset | `$007C` | `$007C` |
| loadAddress (Kopf) | `$0000` (echte Adresse steht als erste 2 Bytes im Datenteil) | dito |
| tatsaechliche Ladeadresse | `$8000` | `$8000` |
| initAddress | `$81BA` | `$81BD` |
| playAddress | `$802F` | `$8032` |
| songs / startSong | 1 / 1 | 1 / 1 |
| speed | 1 (Bit 0 gesetzt = CIA-Timer, nicht 50 Hz Raster) | 1 |
| name | `Kaiser` | `Kaiser (Abspann)` |
| author | `CCD Wiesbaden` | `CCD Wiesbaden` |
| released | `1984 Ariolasoft` | `1984 Ariolasoft` |
| flags | `$0014` (PAL, SID 6581) | `$0014` |
| Nutzdaten | 1040 Bytes `$8000`-`$840F` | 5631 Bytes `$8000`-`$95FE` |

`extract_sid.py` liest die Koepfe nach dem Schreiben wieder ein und gibt alle
Felder aus. Ein externer Player (`sidplayfp`, `sidplay2`) ist auf diesem
Rechner **nicht installiert**, ein Test damit konnte deshalb nicht laufen.
Geprueft wurde stattdessen mit dem eigenen Player (siehe Abschnitt 6).

---

## 5. Der Browser-Player `kaiser-online/client/sid.js`

Ein eigenstaendiges ES-Modul ohne Abhaengigkeiten. Enthaelt:

* **6502-Kern** (`Cpu6502`) mit allen dokumentierten Befehlen. Undokumentierte
  Opcodes kommen im Musikcode nicht vor und werden als NOP behandelt.
* **SID-Nachbildung** (`SidChip`): drei Stimmen mit 24-Bit-Phasenakkumulator,
  Wellenformen Dreieck, Saegezahn, Rechteck (mit Pulsweite) und Rauschen
  (23-Bit-Schieberegister wie im Original), ADSR-Huellkurve mit den
  Original-Zaehlerperioden und der exponentiellen Annaeherung fuer
  Decay/Release. Vierfache Ueberabtastung je Ausgabewert.
* **Umgebung** (`SidMotor`): 64 KB RAM, Schreibzugriffe auf `$D400`-`$D7FF`
  gehen an den SID, `$DC00`-`$DCFF` an einen CIA-Zeitgeber. Die Play-Routine
  wird nach `Latch + 1` Taktzyklen erneut aufgerufen; der Latchwert wird nach
  jedem Aufruf neu gelesen, damit Tempowechsel im Stueck wirken.
* **Web Audio**: bevorzugt ein `AudioWorklet` (der Prozessorquelltext wird
  zur Laufzeit aus den Klassen zusammengesetzt und als Blob geladen),
  sonst ein `ScriptProcessorNode`. 44100 Hz.

### Was der Player nicht kann

* **Kein Filter.** Die Register `$D415`-`$D417` werden ignoriert. Fuer diese
  beiden Stuecke geht dabei nichts verloren, sie schalten das Filter nie ein.
* **Kein Ring, kein Sync.** Beide Stuecke benutzen nur die Kontrollwerte
  `$41` und `$21`; die entsprechenden Bits sind immer 0.
* **Kombinierte Wellenformen** werden nur grob als bitweises UND angenaehert
  (kommen hier nicht vor).
* Der Ausgang laeuft durch eine einfache Gleichspannungssperre (Hochpass),
  so wie beim echten C64 der Koppelkondensator. Ohne sie erzeugen die
  Pausen-Noten (Frequenz 0, Rechteck bleibt unten) einen Gleichanteil.

### Einbinden

```js
import * as musik from './sid.js';

// Titelmusik, wiederholt sich nach 2688 Play-Aufrufen (= 33,5 s)
await musik.musikLaden('assets/kaiser_titel.sid', { neustartNachAufrufen: 2688 });

// Abspann, startet neu sobald das Stueck sich selbst beendet
// await musik.musikLaden('assets/kaiser_abspann.sid', { neustartNachAufrufen: -1 });

document.querySelector('#start').onclick = async () => {
  await musik.abspielen();       // muss aus einer Benutzeraktion kommen
  musik.lautstaerke(0.5);        // 0.0 bis 1.0
};
musik.anhalten();
```

Weitere Ausfuhren, vor allem zum Pruefen:

| Funktion | Zweck |
|---|---|
| `musikLaden(pfad, optionen)` | .sid per `fetch` laden, liefert die Kopfdaten |
| `musikSetzen(arrayBuffer, optionen)` | dasselbe ohne Netz (Tests, Node) |
| `abspielen()` / `anhalten()` / `lautstaerke(w)` | Wiedergabe |
| `information()` | Kopfdaten des geladenen Stuecks |
| `rendern(sekunden, rate)` | erzeugt `Float32Array` ohne Web Audio |
| `workletKnoten(kontext)` | AudioWorkletNode in einem beliebigen Kontext, auch `OfflineAudioContext` |
| `psidLesen(rohdaten)` | PSID-Kopf auswerten |

Die .sid-Dateien liegen fuer den Client zusaetzlich unter
`kaiser-online/client/assets/kaiser_titel.sid` und `.../kaiser_abspann.sid`.

---

## 6. Nachweis, dass wirklich Ton entsteht

Testseite: `kaiser-online/client/musiktest.html`
(mit `?datei=assets/kaiser_abspann.sid` fuer das zweite Stueck).
Sie rendert 12 s in einem `OfflineAudioContext` **ueber genau den
AudioWorklet, den auch `abspielen()` benutzt**, misst den Klang, zeichnet
Wellenform, Gesamtverlauf und Spektrum und bietet das Ergebnis als WAV an.

Gemessen mit headless Chromium (`--headless=new`, ueber das
DevTools-Protokoll gesteuert, damit der Screenshot erst nach dem Rendern
faellt -- mit `--virtual-time-budget` allein wird zu frueh ausgeloest):

| | Titelmusik | Abspannmusik |
|---|---|---|
| Weg | OfflineAudioContext + AudioWorklet | dito |
| Effektivwert (RMS) | 0,2503 | 0,1107 |
| Minimum / Maximum | -0,8516 / +0,8311 | -0,7240 / +0,4946 |
| Nulldurchgaenge in 12 s | 7727 | 8622 |
| Werte nahe null | 0,00 % | 0,00 % |

Weitere Belege:

* Die vom Browser gerenderten Werte sind **bitgenau identisch** mit dem, was
  dasselbe Modul unter Node liefert (529200 Werte verglichen, groesste
  Abweichung 0).
* FFT der WAV-Datei (reines Python, ohne numpy) je 0,25 s zeigt **wechselnde
  Tonhoehen**, keinen Dauerton: Titel z.B. G4 392 Hz -> C5 -> A4 -> F4 ...,
  dazu ab 0,3 s der Bass C3 131 Hz.
* Die gemessenen Grundfrequenzen stimmen mit den Notendaten ueberein:
  Stimme 1 beginnt mit Index 55 -> `$1A14` = 6676 -> `6676 * 985248 / 2^24`
  = **392,1 Hz**, gemessen 388 Hz (FFT-Aufloesung 43 Hz).
  Stimme 2 setzt nach 24 Ticks ein (0,30 s) mit Index 36 -> 130,8 Hz,
  gemessen ab dem Fenster bei 0,50 s.
* Beim Abspann sind bei **3,50 s alle drei Stimmen still** -- genau dort
  enden laut Daten Stimme 1 (72+18+5+1+72 = 168 Ticks) und Stimme 2
  (168 Ticks) gleichzeitig. Die Messung zeigt an dieser Stelle "(still)".
* Die gezeichnete Wellenform zeigt beim Titel ein sauberes Rechteck, beim
  Abspann einen sauberen Saegezahn; das Spektrum zeigt diskrete Harmonische
  (Titel: nur ungerade Vielfache, wie bei 50 % Rechteck; Abspann: alle
  Vielfachen, wie beim Saegezahn) und kein Rauschen.
