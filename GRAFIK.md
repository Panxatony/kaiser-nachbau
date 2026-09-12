# Grafikdaten von "Kaiser" (CCD Wiesbaden / Ariolasoft, 1984) – C64-Diskette `kaiser.d64`

Alle Angaben sind aus den Originaldateien verifiziert (Disassemblat der ML-Teile,
detokenisierte BASIC-Loader) und durch gerenderte Testbilder geprüft.
Das Extraktionsskript ist `extract_assets.py`.

## 1. Dateiübersicht

| Datei (extrahiert)      | Original-Name auf D64  | Lade­adresse | Größe (Daten) | Inhalt |
|-------------------------|------------------------|--------------|---------------|--------|
| `kaiser.prg`            | `kaiser`               | `$0801`      | 3594          | Boot: Cracker-Intro (HPG SOFT&CRACK), gepackt; lädt `data` |
| `data.prg`              | `data`                 | `$0801`      | 362           | BASIC-Lader, lädt der Reihe nach alle ML-Teile |
| `loader_033c.prg`       | `U……I`                 | `$033C`      | 193           | Raster-IRQ (3 Bildschirmzonen) + SYS-Dispatcher `SYS 901` |
| `ml_a001.prg`           | `▌ verbesserte ▌`      | `$A001`      | 3185          | Haupt-ML: Sprungtabelle mit 34 Kommandos (Grafik, Sound, Zeichensätze) |
| `ml_c000.prg`           | `▌ version vom  ▌`     | `$C000`      | 1728          | ML-Init (wird später vom Karten-Bildschirm-RAM überschrieben) |
| `ml_e000.prg`           | `▌  28.07.1985  ▌`     | `$E000`      | 2047          | **Zwei Zeichensätze** zu je 128 Zeichen |
| `ml_6000.prg`           | `▌--------------▌`     | `$6000`      | 9232          | **Titelbild** + Sprite + SID-Musik |
| `neue_merkmale_0801.prg`| `▌neue merkmale ▌`     | `$0801`      | 1021          | Zeigt den Titelbildschirm an, lädt das Hauptprogramm |
| `main_game_0801.prg`    | `J……K`                 | `$0801`      | 31058         | Hauptprogramm (BASIC), detokenisiert in `main_game.bas` |
| `ewiges_leben_0801.prg` | `▌- ewiges leben▌`     | `$0801`      | 1175          | Abspann-Programm, lädt `- karte nur` |
| `karte_57be.prg`        | `▌- karte nur   ▌`     | `$57BE`      | 15937         | **Abspannbild (Thronsaal)** + Sprites + ML + SID-Musik |

Ladereihenfolge: `kaiser` → `data` → `U……I` ($033C) → `ml_a001` → `ml_c000` →
`ml_e000` → `ml_6000` → `neue merkmale` → `main_game`.

## 2. Grafikmodus beider Bildschirme

Beide Vollbilder sind **C64-Multicolor-Bitmap** (160×200 logische Pixel, als
320×200 mit doppelt breiten Pixeln dargestellt).

Die Anzeigeroutine ist in beiden Dateien identisch
(`ml_a001` ab `$AACC` = Kommando 30, `karte_57be` ab `$7F89` = `SYS 32649`):

```
D011 |= $20 (Bitmap)      D016 |= $10 (Multicolor)
DD00 = %10  -> VIC-Bank 1 = $4000-$7FFF
D018 = $78  -> Video-Matrix $5C00, Bitmap $6000
```

Die Routine erwartet vier Parameter und **füllt Screen- und Farb-RAM
flächendeckend mit je einem konstanten Wert**:

```
SYS <adr>, <D020>, <D021>, <Farb-RAM-Füllwert>, <Screen-RAM-Füllwert>
```

> **Wichtig:** Es gibt in keiner Datei ein 1000-Byte-Farb-RAM-Bild und kein
> 1000-Byte-Screen-RAM-Bild für diese Bilder. Die gesamte Farbgebung entsteht
> aus vier konstanten Werten. Die Suche nach einem Farb-RAM-Block war also
> ergebnislos, weil es keinen gibt – das ist kein Näherungswert, sondern der
> Originalzustand.

Bitpaar-Zuordnung im Multicolor-Bitmap:

| Bitpaar | Farbquelle |
|---------|------------|
| `00` | Hintergrundfarbe `$D021` |
| `01` | Screen-RAM, oberes Nibble |
| `10` | Screen-RAM, unteres Nibble |
| `11` | Farb-RAM `$D800` |

## 3. Titelbildschirm – `ml_6000.prg` (Ladeadresse `$6000`)

| Datei-Offset | Adresse       | Länge | Inhalt |
|--------------|---------------|-------|--------|
| 0 – 7999     | `$6000–$7F3F` | 8000  | **Multicolor-Bitmap** (Krone, gekreuzte Schwerter, Schriftzug KAISER, Burg im Hintergrund) |
| 8000 – 8063  | `$7F40–$7F7F` | 64    | Sprite (Kugel, 24×14 px), Sprite-Block **253** |
| 8064 – 8191  | `$7F80–$7FFF` | 128   | ungenutzt (`$00`) |
| 8192 – 9231  | `$8000–$840F` | 1040  | SID-Musikroutine (Init `$81BA`, Stop `$8233`) + Musikdaten |

Farben (aus `neue_merkmale_0801.prg`, Zeile 33: `SYSm,30,7,6,7,16`):

| Register / Quelle | Wert | Bedeutung |
|-------------------|------|-----------|
| `$D020` Rahmen    | 7    | gelb |
| `$D021` Hintergr. | 6    | blau (Bitpaar `00`) |
| Farb-RAM `$D800`  | 7    | gelb (Bitpaar `11`) |
| Screen-RAM `$5C00`| `$10`| Bitpaar `01` = 1 (weiß), Bitpaar `10` = 0 (schwarz) |

Zusätzlich wird Sprite 0 (Zeiger `POKE 24568,253`, also `$5FF8`) in Gelb über
das Bild animiert (rollende Kugel), Musik läuft über `SYS 33210` / `SYS 33331`.

→ `kaiser-online/client/assets/title.png` (320×200, Scale 1, RGB)

## 4. Abspannbildschirm – `karte_57be.prg` (Ladeadresse `$57BE`)

| Datei-Offset   | Adresse       | Länge | Inhalt |
|----------------|---------------|-------|--------|
| 0 – 1          | `$57BE–$57BF` | 2     | Füllbytes |
| 2 – 1089       | `$57C0–$5BFF` | 1088  | Sprite-Blöcke **95–111** (Krone, Kronenband, Fackel-/Flammenanimation, 4 Text-Sprite-Puffer) |
| 1090 – 2089    | `$5C00–$5FE7` | 1000  | Screen-RAM (wird beim Bildaufbau komplett mit `$2A` überschrieben) |
| 2090 – 2113    | `$5FE8–$5FFF` | 24    | Sprite-Zeiger (`$5FF8` ff. = Sprite 0–7) |
| **2114 – 10113** | `$6000–$7F3F` | 8000 | **Multicolor-Bitmap** (König auf dem Thron im Thronsaal) |
| 10114 – 10239  | `$7F40–$7FBD` | 126   | ML: BASIC-Parameterholer, PETSCII→Screencode, Füllroutine |
| 10240 – 15936  | `$7FBE–$95FE` | 5697  | Bildaufbau (`SYS 32649` = `$7F89`), Sprite-Zeichenroutine (`SYS 32793`), SID-Musik |

Farben (aus `ewiges_leben_0801.prg`, Zeile 13: `SYS32649,0,7,0,42`):

| Register / Quelle | Wert  | Bedeutung |
|-------------------|-------|-----------|
| `$D020` Rahmen    | 0     | schwarz |
| `$D021` Hintergr. | 7     | gelb (Bitpaar `00`) |
| Farb-RAM `$D800`  | 0     | schwarz (Bitpaar `11`) |
| Screen-RAM `$5C00`| `$2A` | Bitpaar `01` = 2 (rot), Bitpaar `10` = 10 (hellrot) |

Der 960-Byte-Lauf mit Werten < 16 ab Offset 2434 (`$6140`) ist **kein Farb-RAM**,
sondern schlicht der leere obere Bildbereich der Bitmap (Zeilen 1–3).

→ `kaiser-online/client/assets/outro.png` (320×200, Scale 1, RGB)

## 5. Zeichensätze – `ml_e000.prg` (Ladeadresse `$E000`)

Die Datei ist 2047 Byte lang (das letzte Byte fehlt auf der Diskette) und
enthält **zwei** komplette Zeichensätze zu je 128 Zeichen à 8 Byte:

| Datei-Offset | Adresse       | Zeichensatz |
|--------------|---------------|-------------|
| 0 – 1023     | `$E000–$E3FF` | **fetter Satz**: Schrift auf 0–95, Spielgrafiken auf 96–127 |
| 1024 – 2046  | `$E400–$E7FF` | **schmaler Satz** für das Schlachtfeld |

Umschaltung zur Laufzeit über `ml_a001`:

* Kommando 13 (`$A48F`, `SYSm,13`) kopiert `$E000→$F000` → Text-Zeichensatz aktiv
* Kommando 24 (`$A93D`, `SYSm,24`) kopiert `$E400→$F000` → Karten-Zeichensatz aktiv
* `$A466` erzeugt anschließend nach `$F400` eine **invertierte Kopie**
  (Zeichen 128–255 = Zeichen 0–127 invers). Deshalb wird der zweite Spieler
  auf der Karte mit `Zeichen + 128` dargestellt (`ar = 128*fa` in `main_game.bas`).
* `$D018 = $3C` (Video-Matrix `$CC00`, Zeichensatz `$F000`)

Kommando 24 schaltet außerdem den **Multicolor-Textmodus** ein
(`$D016 = $D8`, `$D022 = 7` gelb, `$D023 = 5` grün). Das gilt **nur für das
Schlachtfeld**; die Reichskarte läuft hires (`$D016 = $C8`, gesetzt von
Kommando 13). Im Schlachtfeld ist ein Zeichen also 4 doppelt breite Pixel, und
je zwei Bits wählen eine Farbe: 00 Hintergrund (dort schwarz), 01 gelb,
10 grün, 11 die Farbe der Zelle im Farb-RAM.

Die Scrollroutine `$A9AC` setzt diese Zellfarbe nach dem obersten Bit des
Feldwerts: gesetzt heißt Angreifer und Farbe 10 (hellrot), sonst Verteidiger
und Farbe 14 (hellblau). Das Zeichen selbst ist der Wert **ohne** dieses Bit
(`AND #$7F`). Es ist also keine Inversschrift, sondern beide Parteien haben
eigene Zeichen, die sich zusätzlich in der Farbe unterscheiden.

Der Kartenbildschirm selbst ist ein 40×76-Zeichen-Puffer ab `$C000`
(`e = 49152` in `main_game.bas`); der Raster-IRQ blendet daraus ein Fenster in
die Video-Matrix `$CC00` ein (`SYSm,26,<offset>` scrollt).

Zeichenindex = Byte-Offset / 8 innerhalb des jeweiligen 1024-Byte-Blocks;
der Index entspricht dem **C64-Screencode**.

### 5.1 Zeichenbelegung (gilt für beide Zeichensätze)

| Screencode | Zeichen |
|------------|---------|
| 0          | `@` (Text) bzw. Grenz-/Fluss-Endstück (Karte) |
| 1 – 26     | `a` – `z` |
| 27 – 31    | Grafik (siehe unten); im Text-Satz `↓ → ] † +` |
| 32         | Leerzeichen |
| 33 – 47    | `! " # $ % & ' ( ) * + , - . /` bzw. Grafik |
| 48 – 57    | `0` – `9` |
| 58 – 63    | `: ; < = > ?` bzw. Grafik |
| 64         | `ß` |
| 65 – 90    | `A` – `Z` |
| 91 – 96    | `Ü ü Ö ö Ä ä` |
| 97 – 127   | Spielgrafiken |
| 128 – 255  | zur Laufzeit erzeugte Invers-Zeichen von 0 – 127 |

PETSCII→Screencode-Umrechnung für die `{$xx}`-Notation in `main_game.bas`:
`$A0–$BF → $60–$7F`, `$C0–$DE → $40–$5E`, `$FF → $5E`.
Also `{$a0}`=ä (96), `{$c0}`=ß (64), `{$db}`=Ü (91), `{$dc}`=ü (92),
`{$dd}`=Ö (93), `{$df}`=Ä (95), `{$ff}`=ö (94).

### 5.2 Spielgrafiken (Karten-Zeichensatz `$E400`)

Legende aus `extracted/main_game.bas`, Zeilen 432–440, umgerechnet in Screencodes
und optisch verifiziert:

| Symbol | Screencodes | Aufbau |
|--------|-------------|--------|
| **Markt** | oben `29,30` / unten `27,28` | 2×2 Zeichen, Marktbude mit Vordach |
| **Mühle** | `115,116` | 2×1, Windmühle mit Flügeln |
| **Palast** | oben `34,35,36` / unten `60,61,62` | 3×2, Palast mit zwei Türmen |
| **Kathedrale** | oben `42,31,42` / unten `37,38,39` | 3×2, drei Türme mit Kreuzen |
| **Kavallerie** | `99,100` (rot) · `109,110` (blau) | 2×1, Reiter |
| **Artillerie** | `101,102` (rot) · `113,114` (blau) | 2×1, Kanone |
| **Infanterie** | `103,104` | 2×1 |
| **Miliz** | `105,106` | 2×1, Bauer mit Sense |
| **Ruine** | `97,98` | 2×1, Mauerreste |
| **Bäume** | `107,108` (Nadelbaum) · `117,118` (Laubbaum) | je 2×1 |
| **Fluss** | `123, 111, 111, 119` | waagerechter Lauf mit Endstücken |
| **Grenze** | `120, 111, 111, 0` | waagerechter Lauf mit Endstücken |
| **Cursor** | `121,122` | 2×1, Andreaskreuz |

`111` ist das gemeinsame waagerechte Mittelstück von Fluss und Grenze;
`0`, `119`, `120`, `123` sind die vier Eck-/Endstücke.

Verwendung im Hauptprogramm (`main_game.bas`, Kartenaufbau ab Zeile 405,
Bildschirm-RAM ab `e = 49152` = `$C000`):

* Z. 414/416: Markt setzen (`29+ar,30+ar` bzw. `27+ar,28+ar`)
* Z. 421: Mühlen (`115+ar,116+ar`)
* Z. 427/429: Bäume (`107,108` bzw. `117,118`)
* Z. 376–378: Einheiten – `b=1`→Kavallerie `109,110`, `b=2`→Artillerie `113,114`,
  `b=3`→Infanterie `103,104`, `b=4`→Miliz `105,106`
* Z. 359/373: Cursor (`121,122` bzw. invers `249,250`)
* `ar = 128*fa` schaltet auf die Invers-Zeichen des zweiten Spielers um.
* Leeres Gelände ist Screencode 32 (Leerzeichen).

### 5.3 Die Reichskarte: Kacheln aus dem fetten Satz

Die Karte benutzt **weder** den schmalen Satz **noch** Multicolor. Sie hat
einen eigenen Zeichensatz, den die Routine `$A3AA` zur Laufzeit bei `$E800`
erzeugt: sie nimmt die Grafikzeichen 96 bis 127 des fetten Satzes und
verdoppelt jedes waagerecht und senkrecht. Aus einem Zeichen werden vier, und
die vier bilden zusammen eine **Kachel von 16 mal 16 Pixeln**. Daher die zwei
Pixel dicken Striche und der glatte Zaun.

Ein Wert im Kartenpuffer ab `$C000` ist deshalb keine Zeichennummer, sondern
ein Kachelindex:

| Größe | Rechnung |
|-------|----------|
| Kachel | `Wert AND 63`, Quellzeichen `96 + Kachel` |
| Bildschirmzeichen | `Kachel * 4` bis `Kachel * 4 + 3` |
| Farbe | Tabelle `$02C7` nach `Wert / 64` |

Die Farbtabelle setzt `$A3F2`:

| Wertebereich | Farbe | was dort steht |
|--------------|-------|----------------|
| 0 – 63       | 7 gelb     | Vermögen, Palast, Kathedrale |
| 64 – 127     | 13 hellgrün | Zaun, Stadtmauern, Bäume |
| 128 – 191    | 2 rot      | Marktplätze und Häuser |
| 192 – 255    | 6 blau     | Mühlen, Einwohnerbalken |

Deshalb braucht es nirgends eine Liste, welches Zeichen welche Farbe bekommt:
sie ergibt sich aus dem Zahlenbereich. Ein Vermögen (31) ist gelb, dieselbe
Kachel mit Schulden (159) rot.

Die Kacheln 32 und 33 fallen aus dem Schema: sie entstehen aus Zeichen 103,
einmal ganz und einmal nur zur Hälfte. Das ist der Einwohnerbalken (224/225).

Das Bild zeigt 20 Pufferspalten mal 11 Zeilen als 40 mal 22 Zeichen und
scrollt waagerecht mit dem Joystick. `SYSm,15,a,s` nimmt den größten
waagerechten Versatz und den Joystickport.

Die Grundfarbe hängt am Wetter des Jahres: Zeile 466 würfelt `c5` von 1 bis 5,
Zeile 107 holt damit über `g=c5+5` ein Farbschema aus den DATA-Zeilen 969 bis
973. Dürre färbt den Boden braun, gutes Wetter grün.

→ `kaiser-online/client/assets/charset.png` – 128×128, 16×16 Raster,
weiß auf transparent. Zeilen 0–7 = Text-Zeichensatz (Screencode 0–127),
Zeilen 8–15 = Karten-Zeichensatz (Screencode 0–127).
→ `kaiser-online/client/assets/charset_karte.png` – 128×64, der fette Satz
`$E000`. Daraus baut der Client die Kacheln der Reichskarte.
→ `kaiser-online/client/assets/charset_map.png` – 128×64, der schmale Satz
`$E400` für das Schlachtfeld, Index = Screencode.
