# Werkzeuge

Kleine Hilfsprogramme für Entwicklung und Prüfung. Sie gehören nicht zum Spiel
und sprechen den laufenden Server über dieselbe WebSocket-Schnittstelle an wie
ein Browser.

Seit der Lobby braucht jede Verbindung ein Konto. Die Werkzeuge melden sich mit
dem Kennwort `werkzeug` an und legen das Konto bei Bedarf selbst an. Im
Browser kann man sich mit denselben Namen und dieser Kennwort anmelden, um
zuzusehen. Die gemeinsame Grundlage dafür steht in `verbindung.mjs`.

Runden werden über ihren **Namen** angesprochen, nicht über eine Kennung.

| Datei | Zweck |
|-------|-------|
| `sim.mjs` | Langzeitsimulation ohne Server. Spielt einen Fürsten mit vorsichtiger Strategie bis zum Kaiser und zeigt jeden Titelaufstieg. Prüft, ob das Spiel gewinnbar bleibt. |
| `kriegsdemo.mjs` | Legt eine Demorunde mit drei Spielern an, baut sie bis zum Titel Baron auf und führt dann Krieg. Danach lässt sich der Jahresbericht samt Schlachtfeld im Browser ansehen. |
| `verbindung.mjs` | Gemeinsame Hilfe: anmelden, Lobby holen, Runde anlegen oder betreten. |
| `peek.mjs` | Ohne Argument die Lobby, mit Rundennamen der Stand dieser Runde. |
| `aufstelldemo.mjs` | Bringt eine Runde in einem Schritt bis in die Diplomatiephase mit offener Truppenaufstellung. Mit `--schlacht` wird die Schlacht gleich ausgetragen. Braucht einen Server mit `KAISER_DEMO=1`. |
| `setzen.mjs` | Setzt für einen Spieler eine vollständige Aufstellung, um die Anzeige zu prüfen. |
| `bereit.mjs` | Bestätigt für alle genannten Spieler die Diplomatiephase. |
| `schlachtDump.mjs` | Schreibt die letzte Schlacht einer Runde als JSON für die Animationsprüfung. |

Benutzung, jeweils bei laufendem Server:

```bash
node werkzeuge/sim.mjs                    # ohne Server, reine Regelsimulation
node werkzeuge/peek.mjs                   # zeigt die Lobby
node werkzeuge/peek.mjs Abendrunde        # zeigt eine Runde
node werkzeuge/kriegsdemo.mjs Abendrunde  # spielt eine Runde bis zum Krieg
```

Eine Schlacht in einem Schritt vorbereiten, ohne vierzig Jahre aufzubauen:

```bash
KAISER_DEMO=1 npm start                         # in einem zweiten Fenster
node werkzeuge/aufstelldemo.mjs Probe           # bis zur Aufstellung
node werkzeuge/setzen.mjs Probe KARL            # Aufstellung setzen
node werkzeuge/bereit.mjs Probe KARL MARIA OTTO
node werkzeuge/schlachtDump.mjs Probe KARL client/schlacht_probe.json
```

Im Browser danach als `KARL` mit dem Kennwort `werkzeug` anmelden und die
Runde `Probe` öffnen.

Die Aktion `demoAufruesten`, die `aufstelldemo.mjs` benutzt, ist nur
freigeschaltet, wenn der Server mit `KAISER_DEMO=1` gestartet wurde.

## Prüfseiten im Browser

| Seite | Zweck |
|-------|-------|
| `zeichentest.html` | Beide Zeichensätze, normal und als Inversschrift. |
| `animationstest.html` | Spielt eine gesicherte Schlacht an vier Zeitpunkten nach und vergleicht den Endzustand mit dem Feld des Servers. |
| `musiktest.html` | Rechnet die Musik offline durch und zeigt Kennzahlen, Wellenform und Spektrum. Mit `?datei=assets/kaiser_abspann.sid` für das zweite Stück. |
| `musikeinbindung.html` | Geht genau den Weg, den der Musikknopf im Spiel geht, und prüft Ton und Schleife. |

Aufruf zum Beispiel `http://localhost:8420/animationstest.html?datei=schlacht_probe.json`.
