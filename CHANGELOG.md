# Änderungen

Alles Bemerkenswerte an diesem Nachbau, neueste Fassung zuoberst. Die Form
folgt [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), die Nummern
[Semantic Versioning](https://semver.org/lang/de/).

Regeländerungen stehen dabei getrennt von allem anderen, denn sie sind das
Heikelste: eine Zahl, die sich ändert, verändert eine Partie, die jemand seit
sechzig Jahren spielt. Wo eine Regel vom Original abweicht, steht es dabei.

## [Unveröffentlicht]

### Regeln

- **Fassung 2026, achte Änderung: ein Wetter für das ganze Reich.** Im
  Original würfelt jeder Fürst Wetter und Fäule für sich (Zeile 466 und 470).
  Jetzt gilt beides im ganzen Reich; in einem von fünf Jahren liegt das
  Wetter eines Fürsten eine Stufe daneben. *Grund:* zwei Fürsten mit
  derselben Strategie lagen nach 50 Jahren im Mittel 3,2 Titelstufen
  auseinander, jetzt 1,5; Runden mit vier oder mehr Stufen Abstand fallen von
  43 auf 12 Prozent. Der mittlere Titel bleibt gleich (5,9 und 5,7) — das
  Spiel wird gerechter, nicht leichter. Nachzumessen mit
  `werkzeuge/wettermessung.mjs`. *Original 1984* bleibt unberührt.
- **Die Fürstentümer werden beim Start verlost**, nicht mehr nach der
  Reihenfolge des Beitritts vergeben — aus allen neun und aus dem Startwert
  der Runde. Die Länder der Spieler liegen dabei immer aneinander; zu zweit
  sind es stets zwei Nachbarn, die einander direkt angreifen können. Weicht vom Original ab, das nach Sitzreihenfolge vergibt (Zeile
  869 bis 878), und gilt in beiden Regelwerken. *Grund:* die Lagen sind nicht
  gleichwertig (fünf Nachbarn oder drei), und eine Zweierrunde war immer
  Preussen gegen Hessen. Laufende Runden behalten ihre Länder.

- **Das Schlachtfeld folgt jetzt dem Original** (BASIC-Zeile 404 bis 423), in
  beiden Regelwerken. Der Nachbau hatte es vereinfacht:
  - Jede **Hauptstadt ist ummauert**. Die Linie zur Grenze lässt sich
    durchbrechen (und verdoppelt dabei die Stoßkraft), Ecken und Längsseiten
    nicht. Bisher lief man ungehindert bis an Palast und Kathedrale.
  - In der Stadt stehen **Märkte, auch wenn der Fürst keine besitzt**; die
    übrigen Märkte und die Mühlen liegen in festen Spalten am eigenen Rand.
  - Der Palast hat vier Zeichen statt zwei, und die Bauten des Verteidigers
    stehen zwei Spalten weiter rechts.
  - Wer einen Zweikampf gewinnt, rückt noch ein Feld vor, bevor seine
    Stoßkraft geprüft wird. Artillerie hinterlässt Krater und räumt Bäume weg;
    von der Mauer sprengt sie nur die Linie, nicht die Ecken.
  - Trifft die Artillerie des Verteidigers Kavallerie oder Artillerie, kostet
    das den Angreifer keine Moral — eine Unsymmetrie des Originals (Zeile 200
    gegen 248).

  - **Aufstellen darf man bis an die Grenze**, und die läuft in jeder Zeile
    anders. Bisher endete der Bereich fest in Spalte 18 und 21; je nach
    Zeile sind es jetzt bis zu zwei Spalten mehr oder drei weniger. Die Regel
    stammt aus der Maschinenroutine hinter `SYSm,33`, die dafür disassembliert
    wurde: sie erkennt genau fünf Zeichen als Grenze.

  *Gemessen* an 400 Schlachten gleich starker Heere: das Kräfteverhältnis
  bleibt (Angreifer verliert im Mittel 2.362 statt 2.431 Hektar), aber der
  Schaden verlagert sich — 1,37 statt 1,95 zerstörte Märkte, 0,26 statt 0,18
  Palastteile. Nachzumessen mit `werkzeuge/schlachtmessung.mjs`.

### Behoben

- **Spielernamen standen an sechs Stellen ohne Maskierung im HTML** (aus 18
  Meldungen von CodeQL). Ausnutzbar war es nicht, weil der Server Namen nur
  aus Buchstaben, Ziffern, Leerzeichen, Punkt und Bindestrich zulässt — aber
  nur diese eine Prüfung stand dazwischen. Jetzt maskiert der Client überall
  selbst. Außerdem schreibt die Aufzeichnung der Schlacht nur noch auf echte
  Feldstellen, und die Prüfseiten laden keine Adresse aus der Abfragezeile.

### Werkzeuge und Betrieb

- `AGENTS.md`: was man wissen muss, bevor man hier etwas ändert oder
  ausrollt — die verbindlichen Regeln, der Aufbau der Systeme, die
  Standardabläufe und die Fehler, die in diesem Projekt schon gemacht
  wurden, jeweils mit Ursache und richtigem Weg. `CLAUDE.md` verweist darauf.
  Die Angaben einer bestimmten Installation stehen bewusst nicht darin.
- `nodemailer` auf 10.6.1 angehoben. Die Fassung 10.0.3 hatte acht gemeldete
  Lücken im Adressparser, zwei davon schwer: quadratisches Backtracking,
  mit dem eine lange Adresszeile den Versand lahmlegt, und Parserfehler, bei
  denen Anzeigetext zum Empfänger werden kann. Betroffen war nur der
  Mailversand für Einladungen.
- `scripts/ausrollen.sh` rollt den Server aus und **kann den Ordner `daten`
  nicht mitschicken**: es überträgt eine feste Liste, lässt vorher die Tests
  laufen, zeigt die Partien, die auf dem Server gerade laufen, und sieht
  danach nach, ob der Dienst wieder steht.

## [1.0.0] – 2026-09-13

Die erste Fassung, die sich zu veröffentlichen lohnt: das Spiel ist
vollständig, läuft öffentlich und wird gespielt.

### Das Spiel

- Alle Bilder des Originals: An- und Verkauf mit Kornspeicher, Statistik,
  Staatseinnahmen, Landübersicht, Staatsausgaben, Militär, Spielstand,
  Reichskarte, Krönung, Amtsenthebung, Bankrott und Abspann.
- Bis zu neun Fürsten ab dem Jahr 1700, **parallele Züge**: alle planen ihr
  Jahr gleichzeitig und treffen erst in der Diplomatiephase aufeinander.
- Krieg auf 76 × 40 Zeichen, mit Diplomatie, geliehenen Truppen,
  Angriffswegen und der Schlacht als abspielbarer Aufzeichnung.
- Konten mit Einladung per Mail, Lobby, Verwaltungsoberfläche, Ruhmeshalle.
- Zeichensätze, Titelbild, Abspannbild und beide SID-Stücke werden aus einer
  **eigenen** `kaiser.d64` erzeugt; ohne sie läuft das Spiel schmucklos
  weiter.

### Regeln

- **Zwei Regelwerke zur Wahl.** *Original 1984* ist Zeile für Zeile aus dem
  entlisteten BASIC nachgebaut. *Fassung 2026* ändert sieben Stellen, an denen
  Messungen gezeigt haben, dass das Spiel seine Spannung verliert; jede
  Änderung steht in `server/regelwerk.js` mit dem Befund, der zu ihr geführt
  hat.
- **Fassung 2026, neu in dieser Ausgabe:** beim Titelaufstieg zählen die
  Bauwerke zum Vermögen, solange die Kasse über null steht — bewertet mit den
  Beträgen, die das Original beim Bankrott dafür erlöst. Die Schwelle steigt
  außerdem mit dem Rang: 9.999 für die erste Beförderung, danach 10.000 mehr
  je Stufe. Für die Kaiserwürde bleiben es 100.000 Taler in bar.
  *Grund:* die feste Hürde aus Zeile 740 bremste einen Spieler, der alles
  verbaut, in 15,9 von 60 Jahren, einen Sparer in keinem einzigen.
- **Die Aufstellung im Krieg folgt jetzt dem Original:** beide Seiten setzen
  abwechselnd je eine Einheit, der Überschuss der stärkeren Seite zuerst
  (Zeile 292 bis 295), und sehen einander dabei zu. Gesetzt ist gesetzt — das
  Original kennt kein Zurücknehmen.
- **Der Feldherr** stellt nicht aufgestellte Einheiten drei Spalten vor der
  feindlichen Grenze auf statt in der Startspalte des Cursors. Gemessen war
  diese Startspalte die schlechteste Stellung des Feldes. Gilt in beiden
  Regelwerken, weil es keine Balancefrage ist, sondern eine Falle.

### Behoben

- **Die gewählte Spalte kam nie beim Server an.** Die Aufstellung übernahm nur
  Gattung und Zeile; in der Schlacht landete jede von Hand gesetzte Einheit in
  der Startspalte. Außerdem ließ derselbe Code nur eine Einheit je Zeile durch.
- **Die Truppen des Gegners waren unsichtbar**, obwohl das Handbuch
  ausdrücklich sagt, dass beide Seiten einander beim Aufstellen zusehen.
- **Das Schlachtfeld war nach einem Neustart des Servers schwarz**: das
  Schlussbild wurde nicht mitgesichert.
- **Rundennamen konnten Skript einschleusen** (von CodeQL gefunden,
  nachgestellt): der Name ging ungeprüft durch den Server und wurde im
  Browser als HTML eingesetzt. Jetzt prüft der Server die Zeichen, und der
  Client maskiert jeden Menschentext beim Einsetzen.
- **Die Pfeile an den Zahlenfeldern wirkten in Safari nicht.** Jedes Zahlenfeld
  hat jetzt eigene Knöpfe und einen eigenen Griff für die Pfeiltasten.
- **Ein fremder Zug warf das halb ausgefüllte Formular weg**, weil der
  Planungsbereich bei jeder Aktion neu gebaut wurde.
- `npm test` lief auf Node 22 und neuer nicht mehr.

### Anzeige

- Das Schlachtfeld passt ganz ins Fenster, ohne zu rollen.
- Der Jahresbericht nennt die zerstörten Bauwerke, Einwohner und Staatskasse
  und die Prämie für die überlebenden Soldaten (Zeile 313 bis 329).
- Das Erntebild nennt die **bestellte Fläche**. Das Original zeigt sie nicht;
  ohne sie ist aber nicht zu sehen, warum eine Ernte klein bleibt, obwohl das
  Land groß ist.
- Die Marktseite nennt neben dem Kauf- auch den Verkaufspreis: das Original
  rechnet den Verkauf mit `c8/1111` statt `c8/1000`, der Händler behält also
  zehn Prozent.
- Ein Browserfenster, das seit Stunden offen steht, merkt jetzt, dass es
  veraltet ist, und bittet ums Neuladen.

### Texte

- **Erklärt wird nur, was ein Spieler von 1984 auch wissen konnte**: was auf
  dem C64-Bildschirm stand oder im gedruckten Handbuch steht. Formeln,
  Schwellen und verborgene Werte wie die Moral bleiben verborgen. Die Regel
  und der vollständige Befund stehen in `TEXTE.md`.

### Werkzeuge und Betrieb

- `python3 aufbauen.py kaiser.d64` erzeugt in einem Zug alles, was der Browser
  braucht. Der Entpacker benennt die Dateien nach ihrer Ladeadresse, weil die
  Namen im Inhaltsverzeichnis der kursierenden Abbilder bloße Grußbotschaften
  sind.
- CodeQL für JavaScript und Python, Dependabot, Secret Scanning, Tests auf
  Node 20, 22 und 24.
- `SECURITY.md` mit dem Meldeweg, MIT-Lizenz, und eine Betriebsanleitung ohne
  die Adressen einer bestimmten Installation.

[Unveröffentlicht]: https://github.com/Panxatony/kaiser-nachbau/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Panxatony/kaiser-nachbau/releases/tag/v1.0.0
