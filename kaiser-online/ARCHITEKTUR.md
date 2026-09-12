# Kaiser Online – Client-Server-Architektur

Browser-Mehrspielerfassung des C64-Spiels *Kaiser* (CCD Wiesbaden, Ariolasoft 1984) mit
**parallelen Zügen**: alle Spieler planen ihr Jahr gleichzeitig, die Abrechnung
erfolgt gemeinsam.

## 1. Überblick

```
Browser (Client)                    Node.js (Server)
─────────────────                   ─────────────────
index.html   Aufbau                 index.js    HTTP + WebSocket
style.css    C64-Optik              game.js     Runden und Phasen
app.js       Anzeige und Aktionen   rules.js    Spielregeln
c64.js       Zeichensatz            battle.js   Schlacht
assets/      Originalgrafik         data.js     Originaldaten

        ──── WebSocket (JSON) ────►   Aktionen
        ◄─── WebSocket (JSON) ────    Zustand
```

Der Server ist die **einzige Quelle der Wahrheit**. Der Client hält keinen
Spielzustand, sondern zeigt nur an, was der Server schickt, und sendet Aktionen.
Alle Zufallswerte zieht der Server. Damit ist kein Client in der Lage, Ernte,
Preise oder Schlachtausgänge zu beeinflussen.

## 2. Dateien

| Datei | Aufgabe |
|-------|---------|
| `server/index.js` | Liefert die Clientdateien aus und betreibt den WebSocket-Server. Führt Anmeldung, Lobby und Spielaktionen zusammen. |
| `server/konten.js` | Konten, Sitzungen, Verwalterrollen, Sperren, Bremse für die Registrierung. |
| `server/lobby.js` | Verzeichnis der Spielrunden: anlegen, beitreten, verlassen, Übersicht. |
| `server/post.js` | Einladungen per Mail: Kennwort würfeln, Brief setzen, versenden. |
| `server/game.js` | Klasse `Spiel`: Spielerverwaltung, Phasenautomat, Aktionsverarbeitung, Auswertung, spielerbezogene Sicht. |
| `server/rules.js` | Alle Spielregeln als reine Funktionen, jede mit Verweis auf die BASIC-Zeile des Originals. Enthält den deterministischen Zufallsgenerator. |
| `server/battle.js` | Schlachtfeld (76 × 40 Zeichen), Aufstellung, Marsch, Zweikampf, Artillerie, Abrechnung. |
| `server/karte.js` | Die Reichskarte, im Original "Karte malen": 74 × 11 Zeichen aus Vermögen, Land, Palast, Kathedrale, Märkten, Mühlen, Wald und Einwohnern. |
| `server/data.js` | Regionen, Titel, Angriffswege und Farbschemata aus den DATA-Zeilen des Originals. |
| `server/regelwerk.js` | Die beiden Regelwerke *Original 1984* und *Fassung 2026*, mit dem Befund zu jeder Änderung. |
| `server/speicher.js` | Sichert Spielstände als JSON und stellt sie nach einem Neustart wieder her. |
| `client/app.js` | Verbindung, Anzeige aller Bildschirme, Aktionsversand. |
| `client/c64.js` | Zeichnet die originalen C64-Zeichensätze auf ein Canvas. |
| `client/schlachtfeld.js` | Zeichnet das Schlachtfeld und spielt eine Schlacht als Animation nach. |
| `client/aufstellungslogik.js` | Reine Logik der Truppenaufstellung, ohne Browserbezug und deshalb testbar. |
| `client/hilfe.js` | Der Hilfetext zu jedem Planungsschritt, mit den eigenen Zahlen des Spielers. |
| `client/kornspeicher.js` | Der Kornspeicher aus Bild 1, nachgezeichnet nach den Sprite-Bloecken 16 und 17. |
| `client/reichskarte.js` | Übersicht der neun Fürstentümer und ihrer Grenzen. |
| `client/zeremonie.js` | Die Vollbildschirme: Titelverleihung, Krönung, Bankrott, Amtsenthebung, Tod. |
| `client/klang.js` | Die Geräusche, umgerechnet aus den SID-Werten des Originals. |
| `client/sid.js` | 6502-Kern und SID-Nachbildung, spielt die Originalmusik über Web Audio. |
| `client/assets/` | Titelbild, Abspannbild und Zeichensätze aus dem Original-Image. |
| `test/ablauf.test.js` | Integrationstests für Phasen, Zugreihenfolge, Krieg und Fristablauf. |
| `test/karte.test.js` | Prüft die Reichskarte gegen die Zeichen und Abstände der BASIC-Zeilen 107 bis 147. |
| `test/lebenszeit.test.js` | Prüft die Altersschwäche: Todesjahr, Wurf, Ausscheiden, Kriegsverbot. |
| `test/regelwerk.test.js` | Prüft beide Regelwerke gegeneinander, Änderung für Änderung. |

## 3. Anmeldung und Lobby

Vor dem Spiel steht die Anmeldung. Ein Konto ist ein Fürstenname und eine
Kennwort. Das Kennwort wird mit `scrypt` und einem eigenen Salz gestreut
abgelegt, nie im Klartext und nie an einen Client geschickt. Nach acht
Fehlversuchen ist der Name fünf Minuten gesperrt. Auch bei unbekanntem Namen
wird gerechnet, damit die Antwortzeit nicht verrät, ob es das Konto gibt.

Nach der Anmeldung bekommt der Client eine **Sitzungskennung**, die 30 Tage
gilt und im `localStorage` liegt. Beim nächsten Besuch meldet er sich damit
stumm wieder an.

### Bremse für die offene Registrierung

Damit sich niemand beliebig viele Konten anlegen kann, gilt:

| Grenze | Wert |
|--------|------|
| Konten je Herkunftsadresse und Stunde | 3 |
| Konten je Herkunftsadresse und Tag | 10 |
| Konten insgesamt je Stunde | 20 |
| Konten überhaupt | 200 |

Hinter einem Proxy sieht der Server für alle dieselbe Adresse. Deshalb liest er
`X-Forwarded-For`, aber **nur wenn die Verbindung von einer Adresse kommt, die
in `KAISER_PROXY` steht**. Ohne diese Einschränkung könnte jeder den Kopf
fälschen und die Bremse aushebeln. Ist die Variable nicht gesetzt, zählt immer
die direkte Adresse.

Die Verwaltung umgeht die Bremse und kann sie ganz schließen: dann legt nur
noch sie selbst Konten an.

### Verwaltung

Das **erste angelegte Konto wird Verwalter**, damit der Dienst ohne Handgriff
in Betrieb geht. Verwalter können:

- Konten anlegen, auch weitere Verwalter,
- das Kennwort eines Kontos zurücksetzen; die laufenden Sitzungen dieses
  Kontos werden dabei beendet,
- Konten sperren und entsperren; eine Sperre wirft die Sitzungen sofort weg,
- die Verwaltungsrolle geben und entziehen,
- Konten löschen; Plätze in noch nicht gestarteten Runden werden freigegeben,
- die offene Registrierung ein- und ausschalten und den Stand der Bremse sehen.

Der **letzte Verwalter ist geschützt**: er lässt sich nicht löschen, nicht
sperren und nicht zurückstufen. Niemand kann sich selbst löschen oder sperren.

Die **Lobby** zeigt alle Spielrunden mit Namen, Stand, belegten und freien
Plätzen. Eine Runde hat bis zu neun Plätze, einen je Region. Von dort aus kann
man:

- eine **neue Runde eröffnen** und dabei Anrede und die beiden Zeitvorgaben
  festlegen,
- einer offenen Runde **beitreten**,
- eine Runde, in der man einen Platz hat, **öffnen** oder den Platz **aufgeben**,
- zwischen Runde und Lobby hin und her wechseln, ohne den Platz zu verlieren.

Das **Fürstentum wird nicht gewählt, sondern vergeben**. Wer zuerst am Tisch
sitzt, regiert Preussen, der zweite Hessen und so fort. Im Original ist die
Spielernummer zugleich das Fürstentum (Zeile 869 bis 878), und die Lobby hält
sich daran. Das ist keine Kosmetik: die Region bestimmt, wer Nachbar ist und
welche Wege ein Heer nehmen muss. Wird ein Platz frei, fällt er dem nächsten
Beitretenden zu.

Der Platz gehört dem Konto, nicht der Verbindung. Wer den Browser schließt,
bleibt in der Runde. Eine Runde, die niemand mehr belegt, wird entfernt.
Laufende Runden nehmen niemanden mehr auf und lassen sich nicht verlassen.

Eine offene Runde hat einen Direktlink der Form `/?runde=abendrunde`, der sich
als Lesezeichen ablegen lässt.

## 4. Phasenautomat

```
        ┌──────────── alle fertig oder Frist abgelaufen ────────────┐
        │                                                           │
        ▼                                                           │
   ┌─────────┐  Kriegserklärung?  ┌──────────────┐            ┌──────────────┐
   │ PLANUNG │ ──── ja ─────────► │  DIPLOMATIE  │ ─────────► │  AUSWERTUNG  │
   └─────────┘                    └──────────────┘            └──────────────┘
        ▲    └──── nein ──────────────────────────────────────────►    │
        │                                                              │
        └───────────────── Jahr + 1, neue Runde ◄──────────────────────┘
```

### Phase A – Planung (parallel)

Jeder Spieler durchläuft für sich:

1. **Ernte und Preise** werden zu Rundenbeginn serverseitig gewürfelt.
2. **Markt**: Korn und Land kaufen oder verkaufen.
3. **Korn verteilen** (20 % bis 80 % der Reserve). Löst sofort die
   Bevölkerungsentwicklung aus.
4. **Steuern** setzen und einziehen.
5. **Staatseinkäufe**: Markt, Mühle, Palast, Kathedrale.
6. **Militär**: Truppen rekrutieren, Söldner anwerben, Manöver.
7. **Krieg erklären** (nur vorgemerkt) und **Zug beenden**.

Die Schritte 3 und 4 sind Reihenfolgeschranken: ohne verteiltes Korn keine
Einkäufe. Alles andere ist frei kombinierbar. Da kein Schritt von anderen
Spielern abhängt, kann jeder in seinem eigenen Tempo arbeiten und bekommt
sofort Rückmeldung.

Läuft die Frist ab, führt der Server für Säumige einen **Auto-Zug** aus:
Korn in Höhe des Bedarfs verteilen, Steuern einziehen, sonst nichts.

### Phase B – Diplomatie (nur bei Krieg)

Zu Beginn dieser Phase erzeugt der Server für jeden Krieg das **Schlachtfeld**.
Es hängt nur von den Gebäuden der beiden Beteiligten ab, nicht von den
Bündnissen, und kann deshalb schon jetzt entstehen. Angreifer und Verteidiger
bekommen es zugeschickt und **stellen ihre Truppen von Hand auf**: eine
Truppengattung wählen, dann auf die gewünschte Zeile klicken. Der Angreifer
stellt in Spalte 13 auf, der Verteidiger in Spalte 26, wie im Original.

Jeder sieht dabei nur die eigene Aufstellung; die des Gegners bleibt bis zur
Schlacht verborgen. Nicht gesetzte Einheiten und die Truppen von Verbündeten
verteilt der Server am Ende selbst auf freie Zeilen.

Alle Kriegserklärungen werden gleichzeitig aufgedeckt. Unbeteiligte wählen je
Krieg eine Haltung:

| Wert | Haltung |
|------|---------|
| 0 | Neutral |
| 1 | Hilfe für den Angegriffenen |
| 2 | Durchmarsch gewähren |
| 3 | Durchmarsch und Hilfe für den Angreifer |

Ohne Antwort gilt **Neutral**. Gegenseitige Kriegserklärungen werden zu einer
einzigen Schlacht zusammengefasst, da das Original ohnehin Angriff und
Gegenangriff kennt.

### Phase C – Auswertung (ohne Eingaben)

1. Kriege in zufälliger Reihenfolge: Weg suchen, Hilfstruppen zuschlagen,
   Schlacht rechnen, Land und Verluste verbuchen, geliehene Truppen
   zurückgeben oder entschädigen.
2. Je Spieler: Bankrottprüfung, Titelaufstieg, dann Zinsen **oder**
   Altersschwäche.
3. Jahresbericht an alle, Jahr + 1, neue Runde.

## 4a. Die beiden Regelwerke

Beim Eröffnen einer Runde wählt man zwischen **Original 1984** und
**Fassung 2026**. Die Wahl gilt für die ganze Partie und wird mitgesichert.

*Original 1984* ist der Nachbau, Zeile für Zeile aus dem BASIC.

*Fassung 2026* ändert sechs Stellen, an denen Messungen gezeigt haben, dass das
Spiel seine Spannung verliert. Jede Änderung steht in `server/regelwerk.js` mit
dem Befund, der zu ihr geführt hat:

| Änderung | Befund im Original |
|---|---|
| Zinsen nur auf Kapital bis zur Bonität | wer nichts tut, hat Anno 1759 2,6 Millionen Taler; bei einer Million sind 99 % des Einkommens Zinsen |
| Moral kehrt zur Mitte zurück | im Original fällt sie auf 0,01 und macht den festen Manöverbonus beliebig mächtig |
| Manöver mit fallendem Ertrag, Moral bis 2 | 772 Manöver in einem Jahr sind bezahlbar und bringen die Moral auf 78 |
| Heimvorteil für den Verteidiger | bei gleicher Stärke gewinnt der Angreifer 58 von 60 Schlachten |
| Schlachtausgang streut und kostet auch den Sieger | 12 gegen 20 Einheiten verliert 59 von 60, 32 gegen 20 gewinnt 60 von 60 |
| Das Reich hat 30.000 Hektar je Fürstentum | Land entsteht aus dem Nichts, deshalb ist Krieg nie nötig |

Alles andere ist in beiden Fassungen gleich: Wetter, Ernte, Kornkreislauf,
Bevölkerung, die zwölf Kennzahlen des Titelaufstiegs und das gemeinsame
Todesjahr.

**Altersschwäche.** Jeder Regent bekommt zu Spielbeginn dasselbe Todesjahr
1760. Ist es erreicht, gibt es keine Zinsen mehr, sondern einen Wurf: mit der
einen Hälfte lebt er ein Jahr länger, mit der anderen stirbt er. Ein
verstorbener Regent ist dauerhaft draußen, kann nicht mehr angegriffen werden
und wer sein Todesjahr erreicht hat, zieht auch nicht mehr selbst in den
Krieg. Sind alle tot, endet die Runde ohne Kaiser.

Auf dem vorliegenden Diskettenabbild fehlt der Sterbefall: es ist eine
bearbeitete Fassung, deren Inhaltsverzeichnis die Änderung *ewiges leben*
nennt. Dass die Regel vorgesehen war, steht an drei anderen Stellen im
Programm und im gedruckten Handbuch; Einzelheiten in `SPIELMECHANIK.md`.
Was davon der Spieler zu sehen bekommt, regelt `../TEXTE.md`: angezeigt und
erklärt wird nur, was auch auf dem C64-Bildschirm stand oder im Handbuch steht.
Verborgene Werte wie Moral, Todesjahr oder die Kennzahl des Titelaufstiegs
gehen darum nicht einmal über die Leitung.

## 5. Nachrichtenformat

**Client → Server**

| Nachricht | Felder | Wann |
|-----------|--------|------|
| `registrieren` | `name`, `kennwort` | ohne Anmeldung |
| `anmelden` | `name`, `kennwort` | ohne Anmeldung |
| `sitzung` | `kennung` | ohne Anmeldung, für den stillen Wiedereinstieg |
| `abmelden` | – | angemeldet |
| `lobby` | – | angemeldet |
| `spielAnlegen` | `name`, `regelwerk`, `weiblich`, `planungsSekunden`, `diplomatieSekunden` | angemeldet |
| `spielBeitreten` | `spielId`, `weiblich` | angemeldet |
| `spielOeffnen` | `spielId` | angemeldet, Platz vorhanden |
| `spielVerlassen` | `spielId` | angemeldet, Runde noch nicht gestartet |
| `starten` | – | in einer Runde |
| `einstellungen` | `planungsSekunden`, `diplomatieSekunden` | in einer Runde, vor dem Start |
| `aktion` | `aktion`, `daten` | in einer Runde |
| `zustand` | – | in einer Runde |
| `verwaltung` | – | nur Verwalter |
| `nutzerAnlegen` | `name`, `kennwort`, `admin` | nur Verwalter |
| `nutzerKennwortSetzen` | `name`, `kennwort` | nur Verwalter |
| `nutzerSperren` | `name`, `gesperrt` | nur Verwalter |
| `nutzerAdmin` | `name`, `admin` | nur Verwalter |
| `nutzerLoeschen` | `name` | nur Verwalter |
| `nutzerEinladen` | `name`, `email`, `admin` | nur Verwalter |
| `nutzerErneutEinladen` | `name`, `email` | nur Verwalter |
| `postPruefen` | – | nur Verwalter |
| `eigenesKennwortAendern` | `alt`, `neu` | angemeldet |
| `registrierungSetzen` | `offen` | nur Verwalter |

Spielaktionen: `kornKaufen`, `kornVerkaufen`, `landKaufen`, `landVerkaufen`,
`kornVerteilen`, `steuernSetzen`, `steuernEinziehen`, `bauen`, `truppenKaufen`,
`manoever`, `kriegErklaeren`, `kriegZuruecknehmen`, `zugBeenden` sowie in der
Diplomatiephase `haltung`, `aufstellung`, `bereit`.

**Server → Client**

| Nachricht | Inhalt |
|-----------|--------|
| `angemeldet` | `kennung`, `konto` (Name, Anrede, Anlagedatum, Verwalterrolle) |
| `abgemeldet` | keine gültige Sitzung, der Client zeigt die Anmeldung |
| `lobby` | `konto`, `runden`, `regionen` |
| `zustand` | vollständige Spielsicht für genau diesen Spieler |
| `ergebnis` | Rückmeldung zu einer Aktion |
| `verwaltung` | `konten`, `bremse` (nur an Verwalter) |
| `hinweis` | kurze Erfolgsmeldung, etwa nach dem Anlegen eines Kontos |
| `fehler` | Klartext; mit `feld: 'anmeldung'`, wenn er zur Anmeldemaske gehört |

Der Server schickt nach jeder Änderung von sich aus: Beteiligte einer Runde
bekommen `zustand`, alle anderen Angemeldeten `lobby`. Ein Zeitgeber prüft
jede Sekunde die Fristen.

Ohne gültige Sitzung wird ausser Anmeldung und Registrierung nichts bedient.

## 6. Sichtbarkeit

`sichtFuer(spielerId)` liefert:

- **öffentlich** für alle Spieler: Name, Titel, Region, Punkte, Soldaten, Land,
  Kasse, Einwohner, Fertigstatus. Das entspricht der Spielstandtabelle des
  Originals.
- **privat** nur für den eigenen Spieler: Kornreserve, Moral, Marktlage,
  Steuervorschau, Truppenpreise, Meldungen, vorgemerkte Kriegserklärung.

Kriegserklärungen bleiben bis zur Diplomatiephase geheim.

## 7. Wiedereinstieg und mehrere Runden

Der Client merkt sich nur die Sitzungskennung. Beim Neuladen meldet er sich
damit an und landet in der Lobby oder, wenn die Adresse eine Runde nennt,
gleich darin. Der Server hält beliebig viele Runden parallel.

Der Platz in einer Runde gehört dem Konto. Wer die Seite schließt, bleibt
drin; bei Fristablauf bekommt er den Auto-Zug.

## 8. Schlacht-Animation

Während der Schlacht zeichnet der Server jede Änderung am Schlachtfeld auf.
Der Bericht enthält deshalb neben dem Endzustand auch:

- `startbild`: das Feld unmittelbar nach der Aufstellung,
- `aufzeichnung`: eine Liste von Einzelbildern; jedes ist eine flache Folge aus
  Feldindex und neuem Zeichen.

Ein Einzelbild entsteht bei jedem Marschschritt, jedem Zweikampf, jedem Brand
und jedem Artillerieschuss. Eine große Schlacht kommt auf etwa 300 bis 400
Einzelbilder und rund 30 KB. Der Client spielt sie mit `Nachspieler` ab und
zeichnet dabei nur die geänderten Kacheln neu. Abspielen, Einzelschritt,
Zeitleiste und Tempo sind bedienbar.

Die Aufzeichnung ist verlustfrei: spielt man alle Einzelbilder auf das
Ausgangsbild, ergibt sich exakt der Endzustand des Servers. Ein Test prüft das.

## 9. Persistenz

Unter `daten/` liegen zwei Dinge nebeneinander:

| Pfad | Inhalt |
|------|--------|
| `daten/konten.json` | Konten und gültige Sitzungen |
| `daten/spiele/<spielId>.json` | je eine laufende Runde |

Die Trennung ist Absicht: die Lobby liest den Ordner `spiele` vollständig ein,
und die Kontendatei darf dabei nicht als Spielstand missverstanden werden.

Nach jeder Zustandsänderung schreibt der Server die laufende Partie. Beim
Start liest die Lobby alle Runden ein und setzt sie an derselben Stelle fort. Die
Zufallsgeneratoren werden dabei aus `seed` und `rundenNr` neu erzeugt, sodass
die Marktlage der laufenden Runde erhalten bleibt.

Das Verzeichnis lässt sich über die Umgebungsvariable `KAISER_DATEN` verlegen.
Die Felddaten abgeschlossener Schlachten werden nicht mitgesichert, weil sie
nur für die Anzeige des letzten Jahresberichts gebraucht werden.

## 10. Grafik aus dem Original

`client/assets/` enthält die aus dem Diskettenimage gewonnenen Daten:

| Datei | Inhalt |
|-------|--------|
| `title.png` | Titelbild, 320 × 200, aus dem Multicolor-Bitmap in `ml_6000.prg` |
| `outro.png` | Abspannbild (Thronsaal) aus `karte_57be.prg` |
| `charset.png` | beide Zeichensätze aus `ml_e000.prg`, 256 Zeichen |
| `charset_map.png` | nur der Kartensatz, 128 Zeichen, Index = Screencode |

Das Schlachtfeld benutzt `charset_map.png`. Auf dem C64 liegt der aktive Satz
bei `$F000` und eine invertierte Kopie bei `$F400`; deshalb sind die Zeichen der
zweiten Kriegspartei um 128 erhöht. Der Client bildet das nach: Codes ab 128
werden als Inversschrift des Zeichens `code - 128` gezeichnet. Einzelheiten
stehen in `../GRAFIK.md`.

## 11. Einladungen per Mail

`server/post.js` verschickt Einladungen über einen SMTP-Server. Die
Zugangsdaten kommen ausschließlich aus Umgebungsvariablen und stehen nirgends
im Quelltext. Fehlt eine davon, ist der Versand abgeschaltet und das Spiel
läuft ohne ihn weiter.

Ablauf: die Verwaltung gibt Namen und Mailadresse an, der Server würfelt ein
Kennwort aus zwei sprechbaren Silbenwörtern und vier Ziffern, legt das Konto
an und verschickt den Brief. Das Kennwort steht nur in der Mail, weder in der
Antwort an die Verwaltung noch im Protokoll.

Der Brief nennt **kein bestimmtes Fürstentum**. Die Region wird erst beim
Beitritt zu einer Runde gewählt; eine Zusage im Brief wäre eine, die das Spiel
nicht hält.

Am Konto steht, wann zuletzt eingeladen wurde und ob das Kennwort seither
geändert wurde. Solange nicht, sieht der Spieler in der Lobby einen Hinweis.
Eine erneute Einladung würfelt ein neues Kennwort und macht die alte wertlos.

## 12. Musik

`client/sid.js` spielt die Originalmusik aus dem Diskettenimage. Das Modul
enthält einen 6502-Prozessorkern und eine Nachbildung des SID-Klangchips mit
drei Stimmen, den vier Wellenformen und der ADSR-Hüllkurve. Es führt die
Musikroutine des Spiels aus, genau wie der C64 es tat, und gibt das Ergebnis
über einen AudioWorklet aus.

Die Musik liegt als PSID-Datei in `client/assets/`:

| Datei | Herkunft | Init | Play | Länge |
|-------|----------|------|------|-------|
| `kaiser_titel.sid` | `ml_6000.prg`, Bereich `$8000` | `$81BA` | `$802F` | 33,5 s |
| `kaiser_abspann.sid` | `karte_57be.prg`, Bereich `$8000` | `$81BD` | `$8032` | rund 237 s |

Der Knopf in der Kopfzeile lädt das Modul erst beim ersten Druck nach, weil
Browser Tonausgabe nur nach einer Nutzeraktion erlauben. Das Titelstück hat
keine eigene Schleife; der Client startet es nach 2688 Aufrufen neu, damit es
durchläuft. Fehlt das Modul oder die Datei, wird der Knopf abgeschaltet und
alles andere läuft weiter.

Das analoge Filter des SID ist nicht nachgebildet. Beide Stücke schalten es
nicht ein, es fehlt also nichts. Einzelheiten stehen in `../MUSIK.md`.

## 13. Entwicklungsmodus

Wird der Server mit `KAISER_DEMO=1` gestartet, ist zusätzlich die Aktion
`demoAufruesten` freigeschaltet. Sie setzt Titel, Truppen, Gebäude und Kasse
eines Spielers in einem Schritt, damit sich Krieg und Schlacht prüfen lassen,
ohne vierzig Jahre aufzubauen. Ohne die Umgebungsvariable wird sie abgewiesen.
