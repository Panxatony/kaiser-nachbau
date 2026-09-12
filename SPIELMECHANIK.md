# Kaiser (C64, 1984) – Spielmechanik für den Online-Nachbau

Quelle: `extracted/main_game.bas` (detokenisiertes BASIC-Hauptprogramm, 857 Zeilen,
"verbesserte Version vom 28.07.1985 by Sir Aliba"). Zeilenangaben beziehen sich auf
die BASIC-Zeilennummern. `RND` = Zufallszahl in [0,1). `INT` = abrunden.

---

## 1. Dateien auf der Diskette

| Datei (bereinigt)          | Ladeadr. | Inhalt |
|----------------------------|----------|--------|
| `kaiser.prg`               | $0801    | Boot: gepacktes Cracker-Intro, lädt `data` |
| `data.prg`                 | $0801    | BASIC-Loader, lädt alle Teile nach |
| `loader_033c.prg`          | $033C    | Raster-IRQ und der Dispatcher hinter `SYS 901` |
| `ml_a001.prg`              | $A001    | Haupt-Maschinencode: 34 Kommandos (Cursor, Joystick, Sound, Scrolling, Zeichensätze) |
| `ml_c000.prg`              | $C000    | Init-Code, wird später überschrieben |
| `ml_e000.prg`              | $E000    | **zwei** Zeichensätze zu je 128 Zeichen: Textschrift und Kartenschrift |
| `ml_6000.prg`              | $6000    | Titelbild als Multicolor-Bitmap, ein Sprite und die SID-Musik |
| `karte_57be.prg`           | $57BE    | Abspannbild (Thronsaal) mit Sprites, Maschinencode und Musik |
| `neue_merkmale_0801.prg`   | $0801    | BASIC: zeigt das Titelbild, lädt das Hauptspiel |
| `ewiges_leben_0801.prg`    | $0801    | BASIC: Abspann für den Sieger |
| `main_game_0801.prg`       | $0801    | **Hauptspiel (BASIC)** → `main_game.bas` |
| `sir_aliba.seq`            | –        | Bestenliste: Name des letzten Kaisers |

Die Datei-Einträge mit `─`-Rahmen im Directory sind nur Directory-Art (Intro-Text der Cracker-Gruppe).

Die ML-Routinen werden per `SYS m,nr,...` (m=901) aufgerufen und sind reine I/O-Helfer
(Joystick lesen in PEEK(715)=Richtung 1=hoch,2=rechts,3=runter,4=links, PEEK(716)=Knopf;
Sound; Bildschirm-Scrolling). Für die Spielregeln sind sie ohne Belang.

Die Grafikdaten sind in `GRAFIK.md` mit allen Offsets beschrieben, der lauffähige
Nachbau in `kaiser-online/` mit der Architektur in `kaiser-online/ARCHITEKTUR.md`.

---

## 2. Spielzustand pro Spieler (Index c)

| Var    | Bedeutung                              | Startwert |
|--------|----------------------------------------|-----------|
| `a`    | Land in Hektar                          | 15000 |
| `b`    | Staatskasse in Talern (kann negativ)    | 10000 |
| `c`    | Einwohner                               | 2000 |
| `p`    | Kornreserve in Maß                      | 10000 |
| `t`    | Titelstufe 1..8 (9 = Kaiser = Sieg)     | 1 |
| `zo`   | Zoll %                                  | 25 |
| `r`    | Mehrwertsteuer %                        | 10 |
| `l`    | Einkommensteuer %                       | 5 |
| `d`    | Justiz 1 sehr fair, 2 bescheiden, 3 hart, 4 gierig | 2 |
| `e`    | Märkte                                  | 0 |
| `f`    | Mühlen                                  | 0 |
| `g`    | Palast-Teile (max 16)                   | 0 |
| `h`    | Kathedralen-Teile (max 14)              | 0 |
| `u`    | Schwadronen Kavallerie                  | 0 |
| `s`    | Batterien Artillerie                    | 0 |
| `j`    | Kompanien Infanterie                    | 1 |
| `q`    | Miliz-Einheiten (abgeleitet aus Gebäuden) | 1 |
| `i`    | Soldaten gesamt = 20·(u+s+j+q)          | 20 |
| `w`    | davon Söldner (Soldaten-Zahl)           | 0 |
| `o`    | Moral / Kampfkraft (Faktor)             | 1.0 |
| `v`    | "Punkte" (Ansehen; wächst durch Zuwanderung) | 4 |
| `m`    | Handel/Bürgertum-Zähler (Steuerbasis)   | 5 |
| `ws`   | Wohlstand-Zähler (Steuerbasis)          | 25 |
| `n`    | Gebäude-Bonus (Steuerbasis)             | 1 |
| `k`    | Jahr, ab dem keine Zinsen mehr fließen ("Lebenszeit") | 1760 |
| `b8`   | Jahr, bis zu dem der Spieler suspendiert ist | 1700 |
| Name, Geschlecht (m/w), Region                 | Eingabe |

Globaler Zustand: Jahr `ze` (Start 1700), Spielerzahl 1–9.
Regionen nach Spielerindex: 1 Preußen, 2 Hessen, 3 Bayern, 4 Böhmen, 5 Sachsen,
6 Mähren, 7 Tirol, 8 Die Pfalz, 9 Flandern.

Titel (m/w): Herr/Frau, Baron/Baronin, Landgraf/Landgräfin, Markgraf/Markgräfin,
Fürst/Fürstin, Herzog/Herzogin, Kurfürst/Kurfürstin, König/Königin, Kaiser/Kaiserin.
Anrede: `<Titel> <Name> VON <Region>`.

---

## 3. Ablauf eines Zuges (Zeile 463 ff.)

Spieler reihum; nach dem letzten Spieler `ze += 1`. Ein Spieler wird übersprungen,
wenn `b8 > ze` (suspendiert) oder `k < 1700` (kommt praktisch nicht vor).

### 3.1 Ernte und Preise (466–472)

```
wetter  = 1..5 zufällig          (1 Dürre, 2 Regen, 3 normal, 4 gut, 5 Rekord)
d       = min(Land, max(0,(Einwohner - Mühlen*100)*5), Korn*2)
ernte   = d * (wetter - 0.5)
Korn   += INT(ernte)
bedarf  = |INT(v*100 + m*40 + ws*30 + Einwohner*5 + Soldaten*10)|      (Zeile 620)
ratio   = clamp(bedarf/ernte, 0.8, 2)   (2 falls ernte < 1)
landpreis = INT(10 * ((3*wetter + 12 + RND*12)/10) * ratio) / 10       (Taler je ha)
verfault  = 1..50 %  → Korn = INT(Korn * (1 - verfault/100))
kornpreis = INT((20 - 3*wetter + RND*10) * 8 * ratio)                  (Taler je 1000 Maß)
```
Anzeige: Kornreserve, nötiges Korn, Kornpreis, Landpreis (angezeigt ×10, also je 10 ha),
Landbesitz, Vermögen, plus eine Balkenanzeige Reserve/Bedarf.

### 3.2 Markt (487–505)

- Korn kaufen: max. `3*bedarf` netto pro Zug; Kosten `INT(q * kornpreis / 1000)`.
- Korn verkaufen: Erlös `INT(q * kornpreis / 1111)` (≈10 % Spanne).
- Land kaufen: Kosten `q * landpreis`.
- Land verkaufen: mindestens 1 ha behalten; Erlös `q * landpreis * 0.9`.
Beliebig oft, dann "Knopf" = weiter.

### 3.3 Kornverteilung ans Volk (506–535)

Abgabe `z` zwischen 20 % und 80 % der Reserve (Optionen: Max, Min, Bedarf, Zahl).
`Korn -= z`.

Fall A – genug (`z >= bedarf-1`):
```
geboren   = INT((RND*7+1) * Einw/100)                   Einw += geboren
gestorben = INT((RND*3+1) * Einw/100)                   Einw -= gestorben  (Einw min. 382)
if RND*20+1 > MwSt  : v += INT(RND*2)      (0..1)
if RND*20+1 > ESt   : m += INT(RND*3)      (0..2)
if z > bedarf*(1.1+RND*0.4):                            (Einwanderung)
    d = (z-bedarf)/bedarf*10 * (Einw/1000) * (RND*65+2); d = min(d, Einw/10)
    d = INT((RND*d+2) * (1.1-MwSt/100)*(1.1-Zoll/100)*(1.1-ESt/100) / 2)
    Einw += d;  ws += min(50, RND*d/5+1);  v += 1;  m += 2
if Justiz > 2 or (90 - Zoll - MwSt - ESt) < 0:          (Abwanderung, 630)
    weg = INT((2+RND) * Einw/100 * (Justiz-2)^2);  Einw -= weg
```
Fall B – zu wenig (`z < bedarf-1`):
```
mangel    = clamp((bedarf-z)/bedarf*100 - 9, 0, 65)
geboren   = INT((RND*3+1) * Einw/100)
gestorben = INT((RND*(mangel+8)+1) * Einw/100);  falls z/bedarf < 0.5: gestorben = INT((1-z/bedarf)*Einw)
(Einw bleibt >= 382); danach Abwanderung wie oben (immer geprüft)
```

### 3.4 Einnahmen aus Gebäuden, Sold (536–542)

```
Kasse += Märkte * INT(127 + RND*127)
Kasse += Mühlen * INT(250 + RND*250)
Kasse -= Soldaten*3 + Söldner*12          (Sold)
```

### 3.5 Steuern (543–570, 633–637)

Zufallsfaktoren pro Zug (`E = Einwohner/100`):
```
f3 = E/(RND*3000+2500);  f4 = E/(RND*4000+2000);  f5 = E/(RND*2000+3000)
f6 = E/(RND*3000+2500)*100;  f7 = INT(70 + RND*82)
basis = f7 - Zoll - MwSt - ESt
Zoll_einn  = INT( INT((v*180 + Titel*75 + ws*20)*basis/100 + n*100) * Zoll * f3 )
MwSt_einn  = INT( INT((v*50 + ws*75 + n*10)*basis*(5-Justiz)/200) * MwSt * f4 )
ESt_einn   = INT( INT(v*250 + n*20 + 10*Justiz*v*basis/100) * ESt * f5 )
Justiz_einn= INT( (Justiz*300 - 500) * Titel * f6 )
Titel 8 (König): Zoll_einn *3, ESt_einn *2
```
Der Spieler kann Zoll/MwSt/ESt (0–99) und Justiz beliebig ändern; die Anzeige
rechnet mit denselben Zufallsfaktoren neu. Bei Bestätigung: Kasse += Summe.

### 3.6 Amtsenthebung (571, 766–768)

Wenn `Land < Einwohner` oder `Einwohner < 500`: Spieler setzt 1 Jahr aus
(`b8 = ze+2`), bei Einwohnermangel wird Einwohner = 500. Zug endet sofort
(Sprung zu 3.9 ohne Einkäufe).

### 3.7 Gebäudeverlust bei Landmangel (697–717)

`d = INT(Land/1000)`: Märkte und Mühlen werden auf `d` gekappt; `d < 12` → Palast
komplett weg; `d < 24` → Kathedrale komplett weg.

### 3.8 Staatseinkäufe (572–600)

Einheitenpreise pro Zug: `kp = 3680+INT(RND*511)` Kavallerie, `ap = 2300+INT(RND*511)`
Artillerie, `ip = 1500+INT(RND*256)` Infanterie.

| Kauf              | Preis | Bedingung                          | Nebeneffekt |
|-------------------|-------|------------------------------------|-------------|
| Marktplatz        | 1000  | Märkte < Land/1000 − 1             | n += 1 |
| Kornmühle         | 2000  | Mühlen < Land/1000 − 1             | n = n/4 (so im Code) |
| Palast (Teil)     | 5000  | Land ≥ 13000, Teile < 16           | n += 0.5 |
| Kathedrale (Teil) | 9000  | Land ≥ 25000, Teile < 14           | n += 1, m += 1+INT(RND*6) |
| Militär           | –     | Untermenü (3.8.1)                  | |
| Spielstand        | –     | Tabelle: Punkte(v), Soldaten, Land, Geld, Einwohner aller Spieler | |
| Karte malen       | –     | grafische Reichsübersicht (kosmetisch) | |
| Ende des Zuges    |       |                                    | |

Nach jedem Kauf: Armee neu berechnen (3.10).

#### 3.8.1 Militär (641–693)

- **Soldaten rekrutieren**: Preis Kav `kp+600`, Art `ap+400`, Inf `ip+200`.
  Nur erlaubt wenn `Einwohner/(Soldaten − Söldner + 1) > 7`, sonst "zu viele Soldaten".
  Einwohner −= 20.
- **Söldner anwerben**: Preis Kav `kp+600+INT(kp/2)`, Art `ap+400+INT(ap/2)`,
  Inf `ip+200+INT(ip/2)`. Keine Einwohnergrenze. Söldner += 20.
- Moralanpassung beim Kauf (667–669), `S` = Soldaten vor Kauf, `b` = 0 Rekrut / 1 Söldner:
  `o = o*(S+20)/(S+20-30*b)`, dann `o = (o*(S/20-1)+1)/(S/20)` (Mittelung mit Moral 1 der neuen Einheit).
- **Manöver**: Kosten `4*Soldaten + 1000`, Moral += 0.1.
- **Krieg führen**: erst ab Titel 2. Ziel wählen (siehe Kapitel 4). Krieg beendet den Zug.

### 3.9 Zugende (601–613, 695, 718)

**Bankrott-Prüfung** (bei jeder Kassenanzeige): wenn `Kasse < −10000·Titel·(0.8..1.3)`:
Gebäude werden verkauft (Kathedrale 2500/Teil, Palast 1500/Teil, Mühle 1000, Markt 500),
Söldner halbiert, Moral halbiert, Land über 3000 ha zu `0.8·landpreis` verkauft;
ist die Kasse danach positiv, wird alles Geld in Land getauscht (Kasse = 0);
`k −= 2`. Meldung "Sie sind leider Bankrott".

**Titelaufstieg** (603–607, 740–752): Punktzahl
```
P = Σ min(17, INT(x)) für x in
    [Märkte, Palast, Kathedrale, Mühlen, Kasse/5000, Land/6000, ws/50, v/5,
     Soldaten/50, m/10, Einwohner/2000, n/5]
stufe = min(9, INT(P/9))
```
Wenn `Titel < stufe` und Kasse ≥ 9999, dann Titel += 1 – mit Zusatzbedingungen:
Titel > 6 braucht Palast = 16; Titel > 7 braucht Kathedrale ≥ 14, Mühlen ≥ 15, Märkte ≥ 25;
Titel 8 → 9 braucht Kasse ≥ 100000. Titel 9 = **Kaiser = Spielsieg**
(Name wird als "letzter Kaiser des HRR" gespeichert).

**Zeitstrafe**: Dauert der Zug ≥ 120 s, `k −= 1..3` (min `ze+1`).

**Aufstellung**: Der Cursor ist zweidimensional beweglich (Zeile 368, 370, 384,
385). Startplatz ist Spalte 13 für den Angreifer und 26 für den Verteidiger,
aber jede Seite darf bis an den eigenen Rand und bis an die Grenze wandern. In
eine Zeile passen mehrere Einheiten nebeneinander; Zeile 0 und 75 sind gesperrt
(Zeile 98 und 103).

*Abweichung des Nachbaus*: Das Original hat keinen Feldherrn — dort stellt jeder
selbst auf, und der Cursor wartet in Spalte 13 beziehungsweise 26. Bei uns kann
eine Frist verstreichen, und wer nichts tut, bekam bisher alles in genau diese
Startspalte gesetzt. Das ist die schlechteste Stellung des Feldes: bei gleich
starken Heeren (je 40 Schlachten) siegt ein grenznaher Angreifer gegen einen
Verteidiger auf Spalte 26 in 31 Fällen, stehen beide grenznah in 2, steht der
Angreifer auf Spalte 13 gegen einen grenznahen Verteidiger in 1. Der Feldherr
stellt darum drei Spalten vor der Grenze auf — dasselbe Maß, mit dem das
Original in Zeile 420 bis 423 eigenes Gebiet von der Grenze abgrenzt. Das gilt
in beiden Regelwerken, denn es ist keine Balance-Frage, sondern eine Falle.
Von Hand kommt man noch etwas dichter heran; das bleibt der Lohn fürs
Selbstaufstellen.

**Wellenangriff**: `z` und die Grenzmarke `f3` werden **einmal je Zeile**
gesetzt (Zeile 148 und 153), nicht je Einheit. Fällt eine Einheit im Zweikampf,
wandert ihre Reststärke über `z=z+b` (Zeile 177) in den gemeinsamen Topf, und
die nächste Einheit derselben Zeile fängt damit an. Das erhöht über
`RND*(c7+b+z)>c7` ihre Siegchance und geht in die Stoßkraft gegen Gebäude und
Gräben ein. Ebenso zählt jeder Marschschritt Land, sobald **irgendeine**
Einheit der Zeile die Grenze überschritten hat.

**Zinsen und Altersschwäche** (612, 613, 718): wenn `ze < k`:
`Kasse = INT(Kasse*1.1)` (auch bei Schulden!), `Moral *= 0.9`.

Ist `ze >= k`, das Todesjahr also erreicht, wird nicht gerechnet, sondern
gewürfelt: `718 IFINT(RND(0)*2)=0THENk(c)=k(c)+1`. Mit der einen Hälfte lebt
der Regent ein Jahr länger, mit der anderen stirbt er. **Der Sterbefall selbst
stand in den Zeilen 719 bis 725, die auf dieser Diskette fehlen.** Sie ist eine
bearbeitete Fassung; ihr Inhaltsverzeichnis nennt die Änderung *ewiges leben*.
Dass der Tod vorgesehen war, steht an drei Stellen im übrigen Programm:

* `464 IFk(c)<1700ORb8(c)>zeTHEN463` – ein Regent mit `k < 1700` wird für immer
  übersprungen. Das ist der Zustand "tot".
* `685 IFk(h)>1700THEN687` sonst `686 "DAS GEHT NICHT!"` – ein solcher Regent
  lässt sich nicht mehr angreifen.
* `687 GOSUB609:IFze<k(c)THEN...GOTO251` sonst `688 ...GOTO718` – wer sein
  Todesjahr erreicht hat, zieht nicht mehr in den Krieg; stattdessen wird sein
  letztes Jahr ausgewürfelt.

Das Handbuch beschreibt die Regel ebenfalls: das Todesjahr wird zu Spielbeginn
für alle gleich festgelegt und liegt ungefähr zwischen 1760 und 1768.
Der Nachbau hat sie wieder eingebaut.

### 3.10 Armee-Neuberechnung (760–764)

```
Miliz  = min(INT(Märkte/5)*2, INT(Mühlen/3)*2) + INT((Palast+Kathedrale)/2)
Soldaten = (Kav + Art + Inf + Miliz) * 20
Söldner = clamp(Söldner, 0, Soldaten - Miliz*20)
Falls Soldaten < 20: Soldaten = 20, Inf = 1, Kav = Art = 0
```

---

## 4. Krieg (251–352, 395–460)

### 4.1 Angriffswege

Nachbarschaftsgraph der 9 Regionen (aus den DATA-Zeilen 946–963, Einträge mit 2 Ziffern):

| Region      | Nachbarn |
|-------------|----------|
| 1 Preußen   | Hessen, Böhmen, Sachsen, Mähren, Flandern |
| 2 Hessen    | Preußen, Bayern, Sachsen, Pfalz, Flandern |
| 3 Bayern    | Hessen, Böhmen, Sachsen, Tirol, Pfalz |
| 4 Böhmen    | Preußen, Bayern, Sachsen, Mähren, Tirol |
| 5 Sachsen   | Preußen, Hessen, Bayern, Böhmen |
| 6 Mähren    | Preußen, Sachsen, Tirol |
| 7 Tirol     | Bayern, Böhmen, Mähren |
| 8 Pfalz     | Hessen, Bayern, Flandern |
| 9 Flandern  | Preußen, Hessen, Pfalz |

Die DATA-Listen enthalten zusätzlich vorberechnete Pfade (erste Ziffer Angreifer,
letzte Ziffer Ziel, dazwischen Transitregionen). Der erste Pfad, dessen Transitregionen
alle "Durchmarsch" gewähren, wird genommen. Regionen ohne Spieler sind neutral (Zeile 264) und sperren damit den Durchmarsch.

### 4.2 Bündnisse (bei ≥ 3 Spielern)

Jeder andere Spieler wählt: **Durchmarsch** (2), **Durchmarsch + Hilfe für Angreifer** (3),
**Hilfe für Verteidiger** (1), **Neutral** (0). Ein Helfer braucht selbst einen Pfad zum
Zielgebiet, dessen Transitregionen nicht "gegnerisch" sind; sonst wird er auf
Durchmarsch/Neutral zurückgestuft. Gibt es keinen Weg: "Alle Wege versperrt", Krieg entfällt.

- Moral des Angreifers `o *= 2 / len(pfad)` (direkter Nachbar: unverändert).
- Helfer-Truppen (Kav/Art/Inf) werden der Seite zugeschlagen; Moral gewichtet:
  `o_seite = (S_seite*o_seite + S_helfer*o_helfer)/(S_seite+S_helfer)`.
- Nach dem Krieg werden geliehene Einheiten zurückgegeben; fehlende Einheiten werden
  entschädigt: 2000 Taler je Kavallerie, 1300 je Artillerie, 900 je Infanterie.

### 4.3 Schlachtfeld

Raster 76 Zeilen × 40 Spalten (scrollbar). Links Angreifer, rechts Verteidiger, dazwischen
eine mäandernde Grenze um Spalte 19–21. Pro Seite werden gezeichnet: Palast (ab 5 bzw. 11
Teilen größer), Kathedrale (ab 1/6/11 Teilen), Märkte (pro Markt ein Symbol), Mühlen,
zufällig Bäume, Ruinen, Flüsse.

**Aufstellung**: Die Seite mit mehr Soldaten stellt zuerst, bis Gleichstand, dann
abwechselnd je eine Einheit. Angreifer stellt in Spalte 13, Verteidiger in Spalte 26,
Zeile frei wählbar. Miliz kann aufgestellt werden, greift aber nicht an (verteidigt nur).

**Angriffsphase** (Zeilen 0→75, dann Gegenangriff des Verteidigers 75→0, gespiegelt):
pro Zeile marschieren Kavallerie und Infanterie auf den Gegner zu, Artillerie schießt.

**Marsch** (158–185): Stärke `b = 2·o` (Kavallerie) bzw. `1·o` (Infanterie), Reichweite
19 bzw. 13 Felder, Momentum `z = 0` pro Zeile. Je Feld:
- Baum: `b *= 0.95` (Ruinen **nicht**, Zeile 68 nennt nur die Baumpaare); Fluss: `b *= 0.6`.
- Gegnerische Einheit: Verteidigungswert `c7 = o_gegner · {Inf 1, Miliz 1.5, Kav 5, Art 0.6}`.
  Wenn `RND·(c7 + b + z) > c7`: Gegner vernichtet, `b −= c7`, `z = 0`, weiter.
  Sonst: eigene Einheit vernichtet, `z += b` (nächste Einheit derselben Zeile profitiert), Ende.
- Markt/Mühle: `z += b; b = z − 0.3 − (Mühle ? 0.25 : 0)`; wenn `b < 0`: Halt, sonst Gebäude → Ruine, `z = 0`.
- Grenzwall/Fluss jenseits der Grenze: `z += b; b = 2z − 0.4`; wenn `b < 0`: Halt.
- Palast-/Kathedralenteil: Schaden `2·b/2` (Palast) bzw. `2·b/3` (Kathedrale) Teile, Halt.
- Nach Überschreiten der Grenze bringt jedes weitere Feld `INT(Land_gegner/800)` ha Landgewinn.
- Ende bei Reichweite 0, `b ≤ 0` oder Spielfeldrand.

**Artillerie** (186–202): `b = min(1.5, o)`; je Schuss trifft ein zufälliges Feld
16–21 Felder entfernt in derselben Zeile: Einheit vernichtet (Gegnermoral −0.02),
Markt/Mühle → Ruine, Palast/Kathedrale −1 Teil, Wall gesprengt (Fluesse bleiben stehen, Zeile 197 und 245). Danach `b −= 0.3`,
solange `b > 0` weiter (max. 5 Schuss).

### 4.4 Abrechnung (303–352)

```
Landgewinn f4 = Summe der Felder im Feindgebiet · INT(Land_gegner/800), gekappt auf Land_gegner−1
           (negativ, wenn der Gegenangriff mehr gewinnt; gekappt auf −(Land_angreifer−1))
Angreifer: Land += f4;  Verteidiger: Land −= f4
Prämie an Soldaten (Angreifer zahlt): Soldaten · INT(log10(|f4|+1)) · 2 Taler
Verluste je Seite: Kav/Art/Inf −= vernichtete Einheiten; Märkte, Mühlen, Palast-, Kathedralenteile −= Treffer
Miliz = INT(Märkte/5)*3;  Soldaten = 20·(Kav+Art+Inf)
Einwohnerverlust  = INT(Einwohner/2/Land · verlorenes_Land)
Kassenverlust     = INT(Kasse/Land · verlorenes_Land)   (nur bei positiver Kasse)
```

---

## 5. Online-Nachbau mit parallelen Zügen

Ziel: Alle Spieler planen ihren Zug gleichzeitig. Erst wenn alle bestätigt haben
(oder ein Timer abläuft), wertet der Server die Runde aus, führt Kriege durch und
schaltet auf das nächste Jahr.

### 5.1 Was parallel geht und was warten muss

Alle Schritte aus Kapitel 3 betreffen nur den eigenen Spieler und hängen nicht von
den Zügen der anderen ab. Sie können deshalb **sofort während der Planung** serverseitig
ausgeführt werden (inkl. Zufallswürfe), so dass der Spieler wie im Original direkt
Rückmeldung bekommt (Geburten, Einwanderer, Einnahmen, Gebäudeverlust):

| Schritt                                   | Zeitpunkt |
|-------------------------------------------|-----------|
| Wetter, Ernte, Preise (3.1)               | Rundenstart, pro Spieler gewürfelt |
| Markt (3.2)                               | Planung, sofort |
| Kornverteilung + Bevölkerung (3.3)        | Planung, sofort (Zufall serverseitig) |
| Gebäudeeinnahmen, Sold (3.4)              | Planung, sofort |
| Steuern setzen + Einnahmen (3.5)          | Planung, sofort |
| Amtsenthebung, Gebäudeverlust (3.6, 3.7)  | Planung, sofort |
| Einkäufe, Rekrutierung, Manöver (3.8)     | Planung, sofort |
| Kriegserklärung                           | Planung: nur **vormerken** (Ziel) |
| Bündnisse (4.2)                           | Auswertung: eigene Phase |
| Schlachten (4.3, 4.4)                     | Auswertung |
| Bankrott, Titel, Zinsen, Zeitstrafe (3.9) | Auswertung, nach den Kriegen |
| Jahreswechsel                             | Auswertung, Ende |

Damit bleibt die Spielmechanik identisch; nur die Reihenfolge der Kriege ändert sich.

### 5.2 Rundenablauf

```
Phase A  PLANUNG      (parallel, Timer z.B. 5 min)
         jeder Spieler: Markt → Korn → Steuern → Einkäufe/Militär → "Zug beenden"
         optional: Kriegserklärung gegen Spieler X (wird erst in Phase B sichtbar)
         Timeout → Auto-Zug: Korn = Bedarf, Steuern unverändert, keine Einkäufe

Phase B  DIPLOMATIE   (nur wenn mindestens eine Kriegserklärung vorliegt, Timer z.B. 2 min)
         alle Kriegserklärungen werden aufgedeckt
         jeder nicht beteiligte Spieler wählt je Krieg: Durchmarsch / Durchmarsch+Hilfe /
           Hilfe Verteidiger / Neutral   (Timeout → Neutral)
         Angreifer und Verteidiger stellen ihre Truppen auf (oder Auto-Aufstellung)

Phase C  AUSWERTUNG   (Server, ohne Eingaben)
         1. Kriege in Reihenfolge abwickeln (5.3)
         2. Rückgabe/Entschädigung geliehener Truppen
         3. je Spieler: Bankrott-Prüfung, Titelaufstieg, Zinsen
         4. Jahresbericht an alle, Jahr += 1, zurück zu Phase A
```

Vorschlag zur Vermeidung von Phase B in den meisten Runden: Spieler können in Phase A
eine **Standardhaltung** je Mitspieler hinterlegen ("Durchmarsch gewähren: ja/nein",
"Hilfe für: niemand / Spieler X"). Phase B ist dann nur eine kurze Bestätigung mit
Timeout.

### 5.3 Mehrere Kriege in einer Runde

Im Original gibt es pro Zug höchstens einen Krieg; bei parallelen Zügen können mehrere
Erklärungen zusammenkommen. Regeln, die zur Vorlage passen:

- **Gegenseitige Erklärung A↔B**: eine einzige Schlacht. Das Original hat ohnehin
  Angriff + Gegenangriff, also greifen beide Seiten in ihrer Phase an. Landgewinn
  wird wie in 4.4 saldiert. Moral-Malus für Pfadlänge entfällt für beide nur bei
  direkter Nachbarschaft.
- **Ein Ziel, mehrere Angreifer**: Schlachten nacheinander in zufälliger Reihenfolge
  (oder nach Moral × Soldaten absteigend). Jede Schlacht rechnet mit dem aktuellen
  Zustand des Verteidigers, Verluste addieren sich.
- **Angreifer wird selbst angegriffen**: Reihenfolge zufällig; ein Spieler kann in einer
  Runde nur eine eigene Kriegserklärung abgeben.
- **Hilfstruppen** können pro Runde nur einer Seite eines Krieges geliehen werden.
- **Pfadsuche** (4.1) wie im Original mit den Durchmarsch-Entscheidungen aus Phase B.

### 5.4 Schlacht ohne Joystick

Für eine erste Version: Auto-Aufstellung (Einheiten gleichmäßig über die Zeilen
verteilt, Artillerie hinten, Miliz vor Gebäuden) und Abwicklung der Formeln aus 4.3
Zeile für Zeile. Das Ergebnis wird als Animation/Replay im Jahresbericht gezeigt.
Manuelle Aufstellung (Phase B) kann später ergänzt werden.

### 5.5 Technik

- **Server-autoritativ**: Spielzustand (Kapitel 2) liegt nur auf dem Server; Clients
  senden Aktionen (`buyGrain`, `distributeGrain`, `setTaxes`, `buy`, `recruit`,
  `declareWar`, `setStance`, `deploy`, `endTurn`). Alle Zufallswerte zieht der Server.
- **Rundenstatus**: `phase` (planning/diplomacy/resolution), `deadline`, je Spieler
  `committed`. Wechsel, sobald alle `committed` oder `deadline` erreicht.
- **Push**: WebSocket (z.B. Node/TypeScript mit Socket.IO oder Python/FastAPI) für
  Phasenwechsel, "Spieler X ist fertig", Jahresbericht.
- **Persistenz**: Spielstand nach jeder Phase speichern (Reconnect, Spiele über Tage).
- **Zeitstrafe und Zinsen**: `k`-Strafe (120 s) durch Phasen-Timer ersetzen; Zinsen
  (Kasse × 1,1) beibehalten oder nur auf positive Kasse anwenden.
- **Bekannte Eigenheiten des Originals** (bewusst entscheiden, ob übernehmen):
  Mühlenkauf setzt `n = n/4` statt `n += 1`; Miliz nach dem Krieg nur aus Märkten;
  Variable `di` (Zeile 489) ist toter Code.
- **Fehler des Originals**: `649 IFj=4THENGOSUB674` ruft eine Routine auf, die
  sich nicht immer sauber mit RETURN beendet. Sie verlässt sich stattdessen auf
  `SYSm,4` und `SYSm,5`, die den BASIC-Stack von Hand aufräumen (Zeilen 675,
  687, 688). Passt das nicht zur wirklichen Stacktiefe, sammeln sich
  Rücksprungadressen an und das Spiel stürzt im Krieg ab. Diese Diskette
  umgeht das mit dem Vermerk *kein absturz beim krieg*; die Excess-Fassung von
  2019 behebt es. Ein Nachbau ohne GOSUB-Stack ist davon nicht betroffen, muss
  aber die Regeln aus den Zeilen 685 bis 688 trotzdem übernehmen.
- **Texte/Grafik**: Menütexte, Zeichensatz und Sprites sind urheberrechtlich geschützt;
  für einen Nachbau eigene Grafik und Formulierungen verwenden. Die Regeln und
  Formeln in diesem Dokument sind frei nutzbar.
