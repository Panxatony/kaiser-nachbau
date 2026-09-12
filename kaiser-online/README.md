# Kaiser Online

Browser-Mehrspielerfassung des C64-Spiels *Kaiser* (CCD Wiesbaden, Ariolasoft 1984).
Alle Spieler planen ihr Jahr gleichzeitig; abgerechnet wird gemeinsam.

## Starten

```bash
npm install
npm start
```

Dann `http://localhost:8420` im Browser öffnen.

| Variable | Bedeutung | Vorgabe |
|----------|-----------|---------|
| `PORT` | Port | 8420 |
| `HOST` | Bindeadresse | `0.0.0.0`, also alle Schnittstellen |
| `KAISER_DATEN` | Verzeichnis für Spielstände | `daten/` |
| `KAISER_DEMO` | `1` schaltet die Entwicklungsaktion frei | aus |
| `KAISER_PROXY` | Adressen, deren `X-Forwarded-For` geglaubt wird, durch Komma getrennt | leer |
| `KAISER_SMTP_HOST` | Mailserver für die Einladungen | leer, Versand aus |
| `KAISER_SMTP_PORT` | 587 mit STARTTLS oder 465 mit TLS | 587 |
| `KAISER_SMTP_USER` | Benutzername am Mailserver | leer |
| `KAISER_SMTP_PASS` | Kennwort am Mailserver | leer |
| `KAISER_SMTP_VON` | Absender, etwa `Kanzley <kaiser@example.org>` | aus `KAISER_SMTP_USER` |
| `KAISER_ADRESSE_WEB` | Adresse für den Link in der Einladung | `http://localhost:8420` |

Auf einem Server gehört `HOST` auf die Adresse, über die das Spiel erreichbar
sein soll, damit es nicht ungewollt im ganzen Netz lauscht.

Damit Mitspieler im Heimnetz teilnehmen können, genügt die Adresse des Rechners,
zum Beispiel `http://192.168.1.20:8420`.

## Spielen

1. **Anmelden.** Beim ersten Mal auf *Neues Konto* wechseln, Fürstennamen und
   ein Kennwort wählen. Der Name ist später Ihr Name im Spiel.
   **Das allererste Konto auf einem frischen Server wird Verwalter.**
   Das Kennwort schützt nur den Platz in den Runden, nehmen Sie keine, die
   Sie anderswo benutzen.
2. **Spielslot wählen.** In der Lobby stehen alle Runden mit ihren Plätzen.
   Dort können Sie eine neue Runde eröffnen oder einer offenen beitreten. Das
   Fürstentum wird nicht gewählt, sondern nach der Sitzreihenfolge vergeben,
   wie im Original: der erste Spieler regiert Preussen, der zweite Hessen.
   Der Platz gehört Ihrem Konto: Sie können den Browser schließen und später
   weiterspielen.
3. **Starten.** Im Warteraum sehen alle, wer schon dabei ist. Jeder Teilnehmer
   kann die Runde starten, sobald genug Leute da sind.
4. **Jahr planen.** Markt, Korn verteilen, Steuern, Einkäufe, Militär. Alle
   planen gleichzeitig.
5. Wer fertig ist, beendet seinen Zug und wartet auf die Mitspieler.
6. Liegt eine Kriegserklärung vor, folgt die Diplomatiephase. Unbeteiligte
   wählen ihre Haltung, die Kriegsparteien stellen ihre Truppen auf dem
   Schlachtfeld auf: Truppengattung wählen, dann auf die gewünschte Zeile
   klicken. Wer nichts aufstellt, dem verteilt der Feldherr die Truppen selbst,
   und zwar nahe der feindlichen Grenze.
7. Danach rechnet der Server die Runde ab. Der Jahresbericht zeigt die Schlacht
   als Animation, mit Zeitleiste, Einzelschritt und Tempowahl.

Ziel ist der Titel **Kaiser**. Er verlangt Palast und Kathedrale vollständig,
mindestens 15 Mühlen, 25 Märkte und 100.000 Taler.

Eine Runde hat einen Direktlink der Form `/?runde=abendrunde`, den Sie als
Lesezeichen ablegen können.

## Verwaltung

Das erste angelegte Konto ist Verwalter. In der Lobby erscheint für Verwalter
der Knopf **Verwaltung**. Dort lassen sich Konten anlegen, sperren, löschen,
Kennwörter zurücksetzen und weitere Verwalter ernennen.

### Spieler per Mail einladen

Sind die `KAISER_SMTP_*`-Variablen gesetzt, erscheint in der Verwaltung der
Abschnitt *Spieler einladen*. Sie geben Namen und Mailadresse an, der Server
würfelt ein sprechbares Kennwort, legt das Konto an und verschickt eine
Einladung. Das Kennwort steht nur in der Mail, weder die Verwaltung noch das
Protokoll bekommen es zu sehen.

Der Brief ist im Ton des 17. Jahrhunderts gehalten und nennt bewusst **kein**
bestimmtes Fürstentum: welche Region jemand bekommt, entscheidet sich erst
beim Beitritt zu einer Runde, und zwar nach der Sitzreihenfolge.

Solange das Kennwort aus der Einladung unverändert ist, sieht der Spieler in
der Lobby einen Hinweis, es zu ändern. Dafür gibt es dort den Knopf
*Kennwort ändern*. Die Verwaltung sieht in der Kontenliste, ob das schon
geschehen ist.

*Einladung erneut* würfelt ein neues Kennwort und verschickt es; die alte
Einladung wird damit wertlos.

Gegen massenhaft angelegte Konten gilt eine Bremse: höchstens 3 Konten je
Herkunftsadresse und Stunde, 10 je Tag, 20 insgesamt je Stunde und 200 Konten
überhaupt. Die Verwaltung umgeht sie und kann die offene Registrierung ganz
schließen; dann legt nur noch sie selbst Konten an.

Läuft der Dienst hinter einem Proxy, muss `KAISER_PROXY` dessen Adresse
enthalten. Sonst sieht der Server für alle Spieler dieselbe Adresse, und die
Bremse würde nach drei Konten alle weiteren abweisen.

## Musik

Der Knopf **♪ Musik** in der Kopfzeile spielt die Originalmusik des Spiels.
Sie wird nicht als Aufnahme abgespielt, sondern von einem 6502- und
SID-Nachbau in `client/sid.js` erzeugt, der die Musikroutine des Originals
ausführt. Das Titelstück läuft in einer Schleife.

## Entwicklungsmodus

```bash
KAISER_DEMO=1 npm start
```

schaltet zusätzlich die Aktion `demoAufruesten` frei, mit der sich Titel,
Truppen und Gebäude sofort setzen lassen. Damit prüft man Krieg und Schlacht,
ohne vierzig Jahre aufzubauen. Die Hilfsprogramme dafür stehen in
`werkzeuge/`, siehe `werkzeuge/LIESMICH.md`.

## Spielstände

Unter `daten/` liegen die Konten (`konten.json`) und die laufenden Runden
(`spiele/<runde>.json`). Beides wird nach jeder Änderung gesichert und nach
einem Neustart automatisch fortgesetzt. Ein anderes Verzeichnis lässt sich
über `KAISER_DATEN` setzen.

## Tests

```bash
npm test
```

## Direkteinstieg

`http://localhost:8420/?spielId=abend&name=KARL&weiblich=0`
tritt einer Runde ohne Formular bei. Praktisch für Lesezeichen.

## Aufbau

Siehe `ARCHITEKTUR.md`. Die Spielregeln stehen in `../SPIELMECHANIK.md`,
hergeleitet aus dem detokenisierten BASIC-Original in `../extracted/main_game.bas`.

## Grafik und Musik fehlen nach einem frischen Klon

Zeichensätze, Titelbild und Musik stammen aus dem Original und liegen deshalb
nicht im Repo. Ohne sie startet das Spiel trotzdem: statt des Titelbilds
erscheint ein Schriftzug, das Schlachtfeld zeigt einen Hinweis, und der
Musikknopf bleibt abgeschaltet. Wie man sie aus einer eigenen `kaiser.d64`
erzeugt, steht im README eine Ebene höher.

## Herkunft

Zeichensätze, Titel- und Abspannbild, die Musik und die deutschen Texte stammen
aus dem Original-Diskettenimage `kaiser.d64` und werden für den privaten
Gebrauch verwendet. Sie liegen nicht im Repo. Wie Grafik und Musik gewonnen
wurden, steht in `../GRAFIK.md` und `../MUSIK.md`.
