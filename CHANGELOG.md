# Änderungen

Alles Bemerkenswerte an diesem Nachbau, neueste Fassung zuoberst. Die Form
folgt [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), die Nummern
[Semantic Versioning](https://semver.org/lang/de/).

Regeländerungen stehen dabei getrennt von allem anderen, denn sie sind das
Heikelste: eine Zahl, die sich ändert, verändert eine Partie, die jemand seit
sechzig Jahren spielt. Wo eine Regel vom Original abweicht, steht es dabei.

## [Unveröffentlicht]

Noch nichts.

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
