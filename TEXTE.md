# Was der Nachbau erklären darf

Der Nachbau soll sich anfühlen wie das Original, und dazu gehört, was man
**nicht** weiß. Kaiser von 1984 erklärt seine Rechnungen nicht. Wer erfahren
will, was eine Mühle bringt oder wie viel Korn nächstes Jahr fehlt, muss es
ausprobieren. Ein Nachbau, der die Formeln danebenschreibt, nimmt dem Spiel
diese Reise.

**Die Regel**: In den Spieltexten steht nur, was ein Spieler von 1984 auch
wissen konnte.

## Die drei Quellen

| Quelle | Was sie hergibt | Wo sie liegt |
|---|---|---|
| **Der C64-Bildschirm** | 225 Textzeilen im BASIC, von „Nötiges Korn“ bis „ZU VIELE SOLDATEN !“. Alles, was das Programm je anzeigt. | `extracted/main_game.bas`, Zeichenketten in den `PRINT`-Anweisungen |
| **Das gedruckte Handbuch** | 16 Seiten. Bedienung, Baukosten, Truppengattungen, Diplomatie, Spielziel, Lebenserwartung, und ab Seite 15 „Wege zum Triumph“ mit den einzigen Ratschlägen, die es je gab. | `kaiser_anl/` (nicht im Git-Repo) |
| **Die Kurzanleitung** | Drei Zahlen, die das Handbuch nicht nennt: ein Markt und eine Mühle je 1.000 Hektar, Absetzung unter 500 Einwohnern. | `kaiser_anl/…Kurzanleitung.txt` |

Alles andere ist verborgene Mechanik und bleibt verborgen: die Ernteformel,
der Kornbedarf, die Zusammensetzung der Steuern, der Zinssatz, die Moral, die
Kennzahlen des Titelaufstiegs, die Schwellen, an denen Bauwerke verfallen.

**Die Ausnahme** sind unsere eigenen Zutaten. Fristen, Verwalter, Feldherr, die
beiden Regelwerke und die Übersichtskarte gibt es im Original nicht, also kann
sie auch niemand erraten. Sie werden erklärt und als unsere Zutat benannt.

## Was das Handbuch ausdrücklich sagt

Diese Angaben dürfen im Spiel stehen, weil sie gedruckt vorlagen:

* **Kornspeicher** zeigt 80 Prozent der Reserve; Vertrag über 20 bis 80 Prozent
  Ausgabe; zu wenig Korn heißt, ein Teil der Bevölkerung verhungert (S. 7–8).
* **Ein Hektar je Einwohner** (S. 9).
* **Baukosten**: Markt 1.000, Mühle 2.000, Palastteil 5.000 (16 Teile),
  Kathedralenteil 9.000 (14 Teile); 1.000 ha für Markt und Mühle, 13.000 ha für
  den Palast, 25.000 ha für die Kathedrale (S. 11).
* **Truppengattungen** und **Söldner**, fast wörtlich übernommen (S. 11–12).
* **Manöver** verbessert den Kampfwert, kostet nach Truppenzahl, beliebig oft
  im Jahr (S. 12).
* **Zinsen, Bonität** (10.000 Taler zu Beginn, je Titel 10.000 mehr),
  **Pfändung**, **Todesjahr** ungefähr 1760 bis 1768 und für alle gleich (S. 13).
* **Spielziel**: fünf Städte aus je fünf Märkten und drei Mühlen, 25.000 ha,
  100.000 Taler, Palast, Kathedrale (S. 14).
* **Diplomatie** und Angriffswege (S. 14).
* **Zehn Prozent Provision bei jeder Verkaufsaktion**, Kornpreise etwa 20 bis
  430, Landpreise etwa 16 bis 70 (S. 15).
* Die Ratschläge zu Kornkauf, Kornausgabe, Steuern als König, Aufbau mit
  Mühlen und Märkten, Aufstellung nahe der Grenze (S. 15–16).

## Der Audit vom 12.09.2026

Durchgegangen wurden die Hilfeseiten, die Planungsbilder, die Statusleiste, die
Kartenlegende und die Servermeldungen. Entfernt wurde:

| Wo | Was dort stand | Warum |
|---|---|---|
| Hilfe 1 | Die Ernteformel: kleinster Wert aus Land, Fünffachem der Einwohner minus hundert je Mühle, Doppeltem der Reserve, mal Wetter | Der Bildschirm nennt nur das Wetter im Klartext |
| Hilfe 1 | „zwischen einem und fünfzig Prozent“ verfaulen | Der Bildschirm nennt den Anteil dieses Jahres, nicht die Spanne |
| Hilfe 2 | „höchstens das Dreifache des Jahresbedarfs, also 34.650 Maß“ | Das Original meldet erst beim Anstoßen „VORRÄTE ERSCHÖPFT!“ |
| Hilfe 3 | „Der Bedarf steigt mit Einwohnern, Soldaten, Ansehen, Handel und Wohlstand“ | Verborgene Formel |
| Hilfe 3 | „Unter der Hälfte des Bedarfs stirbt ein entsprechender Anteil“ | Verborgene Formel |
| Hilfe 4 | „Jeder Markt bringt 127 bis 254 Taler, jede Mühle 250 bis 500“ | Der Bildschirm nennt den Betrag dieses Jahres |
| Hilfe 4 | „Sold: drei Taler je Soldat, zwölf je Söldner“ | Desgleichen |
| Hilfe 4 | „Unter 382 Einwohner kann Ihr Volk nicht fallen“ | Steht nirgends |
| Hilfe 4, 5 | „Steuerlast über neunzig Prozent“ | Verborgene Schwelle |
| Hilfe 5 | Welche Kennzahl an welcher Steuer hängt | Verborgene Formel; das Bild zeigt nur die Beträge |
| Hilfe 6 | „Jede Mühle zieht hundert Menschen von der Feldarbeit ab“ | Verborgene Formel |
| Hilfe 6 | „Unter 12.000 Hektar fällt der Palast, unter 24.000 die Kathedrale“ | Der Bildschirm meldet nur den Verlust |
| Hilfe 7 | „auf jeden Soldaten müssen mehr als sieben Einwohner kommen“ | Das Original meldet nur „ZU VIELE SOLDATEN !“ |
| Hilfe 7 | „Krieg ab dem Titel Baron“ | Das Original meldet nur „ES IST NOCH ZU FRÜH!“ |
| Hilfe 7, 8 | Die Moral: Stand, Wirkung, Verfall um ein Zehntel | Im Original gibt es dafür kein einziges Wort |
| Hilfe 8 | „Ihre Kasse wächst um zehn Prozent“ | Das Handbuch sagt nur, dass Zinsen berechnet werden |
| Hilfe 8 | „zwölf Kennzahlen, jede höchstens siebzehn Punkte“ | Verborgene Rechnung |
| Statusleiste | Moral und Aufstiegspunkte | Beides unsichtbar im Original; dafür stehen jetzt die **Punkte** da, die die Spielstandtabelle des Originals zeigt |
| Militärbild | „Moral 1,00“, „Manöver (… Taler, Moral +0,1)“, „dafür mehr Geld und Moral“ | Desgleichen |
| Einkaufsbild | „Palast und Kathedrale bringen Ansehen und zählen für den Titelaufstieg“ | Ansehen ist verborgen; dass beide für die Kaiserwürde nötig sind, steht im Handbuch |
| Kartenlegende | „je Feld 6.000 Taler“, „je Feld 500 Hektar“, „je Feld 300 Einwohner“ | Der Maßstab der Karte steht nirgends. Die Zeichen werden weiter benannt, damit man sie zuordnen kann |

Geblieben ist, was oben unter „Was das Handbuch ausdrücklich sagt“ steht, dazu
alle Zahlen, die ohnehin auf dem Bildschirm stehen: Kornreserve, nötiges Korn,
Preise, Landbesitz, Vermögen, Einwohner, Soldaten, Truppenpreise, Steuerbeträge,
Baukosten, Bestände.

### Eigene Zutaten, die dennoch angezeigt werden

* **Die bestellte Fläche** im Bild „Ernte und Preise". Das Original zeigt sie
  nicht. Sie ist aber eine Zahl, keine Formel, und ohne sie ist nicht zu sehen,
  warum eine Ernte klein bleibt, obwohl das Land groß ist. In der Runde
  *SirNormi* hat genau das eine Partie entschieden: 22.166 Hektar Besitz,
  davon 3.445 bestellt, weil 17 Mühlen 1.700 der 2.389 Einwohner banden. Wer
  das nicht sieht, kann es auch nicht lernen. Warum die Fläche begrenzt ist,
  sagen wir weiterhin nicht — das bleibt zu entdecken.

### Offene Ermessensfragen

* **„Taler je 1000 Maß“**: Das Original schreibt nur „Kornpreis 97 Taler“ und
  lässt die Bezugsmenge offen; sie steckt in Zeile 497 (`q*c8/1000`). Wir nennen
  sie, weil eine Zahl ohne Bezug keine Auskunft ist. Die zehn Prozent Provision
  daneben stehen ausdrücklich im Handbuch.
* **Der Preis eines Manövers** steht bei uns auf dem Knopf. Das Original zeigt
  Truppenpreise an, den Manöverpreis nicht.
* **„Wegen schlechter Landpolitik“** nennt bei uns den Grund der Amtsenthebung;
  das Original sagt nur „Wegen schlechter politik“.
* **Die Moral in der Beschreibung der Fassung 2026**: Wer das Regelwerk wählt,
  muss wissen, was er wählt. Die Beschreibung nennt die Moral darum beim Namen
  und sagt zugleich, dass sie im Spiel unsichtbar bleibt.

## Was zu tun ist, wenn ein neuer Text entsteht

1. Steht die Angabe auf dem C64-Bildschirm? Dann darf sie stehen.
2. Steht sie im Handbuch? Dann darf sie stehen, und wenn es ein Rat ist, gehört
   sie in einen Kasten „Aus dem Handbuch“.
3. Ist es unsere eigene Zutat? Dann muss sie erklärt und als unsere benannt
   werden.
4. Sonst: weglassen. Auch wenn es hilfreich wäre. Besonders dann.
