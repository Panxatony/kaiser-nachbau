# Hinweise für Mitarbeitende und Agenten

**Zweck:** Was man wissen muss, bevor man an diesem Nachbau etwas ändert oder
ausrollt — die verbindlichen Regeln, der Aufbau der Systeme, die
Standardabläufe und die Fehler, die hier schon gemacht wurden.

**Ansprechpartner:** Lars „Panxatony" Vonhof-Hunold (Urheber, Betreiber,
Entscheider in allen Fragen von Regeln, Sichtbarkeit und Betrieb).

**Stand:** 01.11.2026

Die Angaben dieser einen Installation — Rechnernamen, Adressen, Pfade,
Mailkonto — stehen **nicht hier**, sondern in `AGENTS.lokal.md` daneben. Diese
Datei wird in das öffentliche Repository ausgeliefert, jene nicht. Dieselbe
Trennung gilt für `kaiser-online/BETRIEB.md` und `BETRIEB.lokal.md`.

---

## 1. Verbindliche Regeln

### Was nie getan werden darf

* **Kein Byte des Originals ins Repository.** Nicht das Diskettenabbild, nicht
  die entpackten Programmdateien, nicht Zeichensätze, Bilder, Musik, nicht der
  Handbuchscan. Alles davon steht in `.gitignore`; wer eine neue Datei anlegt,
  prüft das vorher. Das Spiel läuft ohne diese Dateien vollständig, nur
  schmucklos — und muss das auch weiterhin tun.
* **Den Ordner `daten` nie ausrollen.** Dort liegen auf dem Server Konten,
  Sitzungen, Spielstände und die Ruhmeshalle; auf dem Entwicklungsrechner
  dagegen Proberunden und Testkonten. Benutze `scripts/ausrollen.sh`, das kann
  es nicht.
* **Nie von Hand ins öffentliche Repository kopieren.** Nur über
  `./veroeffentlichen.sh`, das vorher auf Originalmaterial und eigene Adressen
  kontrolliert.
* **Auf dem Proxyhost nichts von Hand ändern.** Der vHost wird per Ansible
  verwaltet; eine Handänderung ist beim nächsten Lauf weg.
* **Keine Zugangsdaten in das Repository**, auch nicht in Beispielen, auch nicht
  gekürzt. Platzhalter wie `KAISER_SMTP_KENNWORT="..."` sind in Ordnung, echte
  Werte nicht.

### Was erst nach Freigabe geschieht

| Vorgang | Warum gefragt wird |
|---|---|
| Eine **Regeländerung** ausrollen, während Partien laufen | Am 11.09.2026 hat ein Ausrollen die Altersschwäche in eine Runde im Jahr 1760 gebracht. Der erste Wurf fiel gegen den Fürsten, sechzig Jahre Spiel waren zu Ende. Eine Regel, die den Spielstand beendet, ist keine Fehlerbehebung. |
| **Work Items und Issues schließen** | Ein geschlossenes Item sagt „hier ist nichts mehr zu tun". Das entscheidet der, dem das Projekt gehört. Ergebnis als Kommentar anhängen, Item offen lassen. |
| **Sichtbarkeit** des öffentlichen Repos ändern | Einmal öffentlich ist nicht rückholbar. |
| Die **offene Registrierung** einschalten | Sie ist bewusst geschlossen, kein vergessener Schalter. |
| **Pushen** überhaupt | Committen ja, pushen nur auf Bitte. |

Reine Anzeige-, Text- und Grafikänderungen sind von der ersten Zeile nicht
betroffen; die darf man ausrollen, ohne zu fragen.

### Wartung und Neustarts

* **Kein vereinbartes Wartungsfenster.** Ein Neustart des Dienstes dauert
  Sekunden und kostet nichts: der Dienst schreibt seinen Stand beim Beenden
  zurück, die Browser verbinden sich von selbst wieder. Trotzdem nicht mitten
  in einer Schlacht.
* **Kein automatischer Neustart des Rechners.** `unattended-upgrades` ist
  installiert, `Automatic-Reboot` steht auf dem Vorgabewert *false*. Die
  Paketläufe liegen nachts und morgens (`apt-daily`, `apt-daily-upgrade`);
  ein Kernelwechsel wirkt also erst, wenn jemand von Hand neu startet.
* `Restart=always` mit fünf Sekunden Abstand: ein abgestürzter Dienst kommt
  allein wieder. Wer ihn dauerhaft aus haben will, muss ihn stoppen, nicht
  abschießen.

### Kommunikationswege

* **Arbeitsstand und Aufgaben:** Work Items im privaten GitLab-Projekt. Issues
  im öffentlichen GitHub-Spiegel beschreiben nur, was Spieler merken.
* **Sicherheitslücken:** über die private Meldung von GitHub
  (*Security → Report a vulnerability*), nicht als öffentliches Issue. Siehe
  `SECURITY.md`.
* **Mail nach außen** verschickt das Spiel nur selbst, und nur Einladungen, von
  einem eigenen Absender. Es gibt keine Verteilerliste, keine Benachrichtigung
  an Dritte. Ohne Mailzugang läuft alles weiter, Einladungen gibt man dann von
  Hand weiter.
* **Spieler** erreicht man im Spiel oder persönlich, nicht über das Projekt.

---

## 2. Sicherheit

### Wo Zugangsdaten liegen

| Was | Wo | Rechte |
|---|---|---|
| SMTP-Zugang für Einladungen | `/etc/kaiser/mail.env` auf dem Spielserver | `0600`, nur root; die Unit liest sie über `EnvironmentFile=-`, das Minus erlaubt den Start ohne sie |
| Kennwörter der Spielerkonten | `daten/konten.json`, nur als `scrypt`-Streuwert mit eigenem Salz | gehört dem Dienstbenutzer |
| Zugang zu den Rechnern | SSH-Schlüssel des Betreibers, Netbird als Netz | — |
| Lokale Entwicklung | `kaiser-online/.env` (steht in `.gitignore`) | — |

### Was nicht ausgelesen wird

* **`/etc/kaiser/mail.env` nicht lesen.** Für die Frage „was sieht der laufende
  Dienst?" genügen die Umgebungsvariablen des Prozesses ohne die
  Kennwortzeile — der Befehl dafür steht in `BETRIEB.md`. In der Verwaltung
  gibt es außerdem den Knopf *Mailserver prüfen*, der eine Verbindung aufbaut,
  ohne etwas zu verschicken.
* **`daten/konten.json` nicht ausgeben.** Sie enthält die Konten echter
  Menschen samt Mailadressen und Sitzungen. Zum Zählen oder Nachsehen, ob eine
  Runde läuft, genügt `ls daten/spiele/`.
* Kennwörter von Spielern kann niemand nachsehen, auch der Verwalter nicht; es
  gibt nur Zurücksetzen.

### Bewusst getroffene Ausnahmen

* **Der Dienst läuft unter dem persönlichen Benutzerkonto**, nicht unter einem
  eigenen `kaiser`-Benutzer, wie `BETRIEB.md` es als Beispiel zeigt. Das ist
  für ein Freizeitprojekt auf einem eigenen Rechner hingenommen; die Unit ist
  dafür mit `ProtectSystem=strict`, `ProtectHome=read-only`,
  `NoNewPrivileges` und einem einzigen `ReadWritePaths` auf `daten`
  abgeriegelt.
* **`KAISER_PROXY`** nennt die Adresse des Reverse Proxy. Nur von dieser
  Adresse wird `X-Forwarded-For` geglaubt — sonst könnte jeder den Kopf
  fälschen und die Bremse gegen massenhaft angelegte Konten aushebeln.
* **`KAISER_DEMO=1`** schaltet eine Aktion frei, die Titel und Truppen sofort
  setzt. Auf einem öffentlich erreichbaren Dienst bleibt die Variable ungesetzt.
* **Das Diskettenabbild im Projekt ist eine bearbeitete Fassung**, kein
  unverändertes Original („ewiges leben", „karte nur auf wunsch"). Bei Zweifeln
  an einer Regel immer auch prüfen, ob der Cracker sie entfernt hat — im BASIC
  fehlen deshalb die Zeilen 719 bis 725, in denen der Sterbefall stand.

---

## 3. Topologie

Drei Rollen, alle Debian, Verbindung über Netbird. Namen, Adressen und Pfade
stehen in `AGENTS.lokal.md`.

| Rolle | Betriebssystem | Dienste |
|---|---|---|
| **Spielserver** | Debian 12 | Der Node-Dienst `kaiser.service` aus `/opt/kaiser`, Node 24, Port **8420**. Lauscht **nur auf der Netbird-Adresse**, nicht im lokalen Netz und nicht öffentlich. Keine Datenbank, der Zustand liegt in `daten/` als JSON. |
| **Reverse Proxy** | Debian 12 | nginx mit dem öffentlichen vHost, Zertifikat von Let's Encrypt über certbot, Weiterleitung auf den Spielserver über Netbird. Per Ansible verwaltet. |
| **Emulatorhost** | Debian 13 | VICE 3.9 (`x64sc`) mit ROMs, dazu `Xvfb`, `xdotool`, `scrot`, `petcat`, `c1541`. Dient zum Nachschlagen im Original, nicht dem Betrieb. |

**Netzweg:** Browser → HTTPS auf den Reverse Proxy → Netbird auf
`tcp/8420` des Spielservers. Der Zugriff ist durch eine eigene
Netbird-Richtlinie abgedeckt; fehlt sie, ist der öffentliche Zugang
unterbrochen, obwohl nginx und der Dienst laufen.

**Öffentlich** ist nur der vHost auf dem Proxy. Alles andere — Port 8420, das
GitLab-Projekt, die Entwicklungsrechner — ist intern. Das Spiel läuft
vollständig über WebSocket; beim Prüfen mit curl deshalb **`--http1.1`**
angeben, sonst handelt curl HTTP/2 aus, wo es kein Upgrade gibt, und man hält
eine 200 für einen Fehler.

**Repositorien:**

| Wo | Was |
|---|---|
| privates GitLab (`sexy-hosting-devops/kaiser`) | die vollständige Entwicklungsgeschichte, `origin` dieses Arbeitsbaums |
| öffentliches GitHub (`Panxatony/kaiser-nachbau`) | der Spiegel, **ohne Vorgeschichte**, gespeist aus `veroeffentlichen.sh` |

Die Vorgeschichte fehlt dort absichtlich: in alten Commits steckten
Netbird-Adressen und Ansible-Pfade.

---

## 4. Standardabläufe

### Entwickeln und prüfen

```bash
cd kaiser-online
npm test            # 193 Tests, laufen ohne Originalmaterial
npm start           # http://localhost:8420
```

Die Tests müssen **ohne** Diskettenabbild, Zeichensätze und Musik durchlaufen —
genau das belegt der Lauf in der CI auf Node 20, 22 und 24 jedes Mal.

Hilfsprogramme für Proben am laufenden Server stehen in
`kaiser-online/werkzeuge/` und sind in `werkzeuge/LIESMICH.md` erklärt:
`peek.mjs` zeigt Lobby und Runden, `sim.mjs` spielt ohne Server einen Fürsten
bis zum Kaiser, `kriegsdemo.mjs` und `aufstelldemo.mjs` bringen eine Runde in
einem Schritt bis zum Krieg.

### Ausrollen

```bash
KAISER_ZIEL=<rechner> ./scripts/ausrollen.sh          # zeigt laufende Partien, fragt
KAISER_ZIEL=<rechner> ./scripts/ausrollen.sh --pakete # zusätzlich npm install
```

Das Skript überträgt **nur** `server`, `client` und `package.json`, startet den
Dienst neu und sieht danach nach, ob er läuft. Der Ordner `daten` kann gar
nicht mitgehen. Von Hand ginge es so:

```bash
cd kaiser-online
tar czf - server client package.json | ssh <rechner> 'cd /opt/kaiser && tar xzf -'
ssh <rechner> 'sudo systemctl restart kaiser'
```

**Vorher** `ls /opt/kaiser/daten/spiele/` ansehen. Laufende Partien vertragen
keine stillen Regeländerungen (siehe Abschnitt 1).

### Veröffentlichen

```bash
./veroeffentlichen.sh "Nachricht"
git -C ~/Documents/kaiser-nachbau push
```

Das Skript räumt das Zielverzeichnis leer, entpackt dorthin `git archive HEAD`
— also nur, was `git ls-files` kennt — und kontrolliert die Kopie auf
Originalmaterial und auf die eigenen Adressen. Bei einem Treffer bricht es ab,
bevor etwas festgeschrieben wird. Es erinnert außerdem daran, wenn
`CHANGELOG.md` in den letzten fünf Commits nicht angefasst wurde.

**Jede veröffentlichte Änderung bekommt einen Changelog-Eintrag** unter
`[Unveröffentlicht]`, beim Release wandert der Abschnitt unter die neue Nummer.
Gegliedert wird nach dem, was ein Spieler merkt, und **Regeln stehen getrennt**,
mit dem Messbefund, der zu ihnen geführt hat — eine geänderte Zahl verändert
eine Partie, die jemand seit sechzig Jahren spielt.

Dependabot-Anfragen gehören **nicht** im Spiegel gemerged, sondern im
Hauptprojekt nachgezogen; der nächste Export räumt sie sonst weg.

### Nachkontrolle

```bash
ssh <rechner> 'systemctl is-active kaiser; ls /opt/kaiser/daten/spiele/'
curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/
```

Steht in `daten/ruhmeshalle.json` ein Name aus einer Simulation (STRATEGE, S,
KARL), ist er beim Ausrollen hereingekommen.

### Datensicherung

**Es gibt keine.** Der Ordner `daten` ist knapp 90 KB groß und enthält alles,
was nicht wiederherstellbar ist: Konten, Spielstände, Ruhmeshalle. Siehe
Abschnitt 6.

### Regeln belegen

Grundlage ist das entlistete BASIC des Hauptprogramms, 857 Zeilen, festgehalten
in `SPIELMECHANIK.md`; im Quelltext steht die Zeilennummer daneben. Im Zweifel
im Emulator und im gedruckten Handbuch nachschlagen, nicht raten.

Erklärt wird im Spiel nur, **was ein Spieler von 1984 auch wissen konnte**: was
auf dem C64-Bildschirm stand oder im Handbuch steht. Formeln, Schwellen und
verborgene Werte wie die Moral bleiben verborgen. Die Regel und der
vollständige Befund stehen in `TEXTE.md`. Eigene Zutaten — etwa die
Übersichtskarte der Fürstentümer — tragen einen Hinweis, dass das Original sie
nicht hat.

---

## 5. Bekannte Fallstricke

Fehler, die hier wirklich passiert sind, mit Ursache und richtigem Weg. Die
meisten davon sind meine eigenen.

| Fehler | Ursache | Richtiger Weg |
|---|---|---|
| **`daten` mit ausgerollt** (11.09.2026). Sechs Proberunden in der Lobby, die Ruhmeshalle voll mit Namen aus Simulationen. Die echten Konten haben es nur überlebt, weil der Dienst seinen Stand beim Beenden zurückschreibt und der Neustart nach dem Entpacken kam. | Der tar-Befehl wurde von Hand getippt. | `scripts/ausrollen.sh`. Danach `ls /opt/kaiser/daten/spiele/`. |
| **Regeländerung in eine laufende Partie** (11.09.2026). Die Altersschwäche kam ins Spiel, als der Fürst gerade 1760 erreicht hatte; der erste Wurf beendete sechzig Jahre. | Fehlerbehebung und Regeländerung nicht unterschieden. | Vor dem Ausrollen `daten/spiele/` ansehen und fragen. |
| **Messung mit doppelten Einheiten.** Die Probe rief `aufstellen()` und danach `schlacht()`, das selbst noch einmal aufstellt — jede Einheit stand zweimal auf dem Feld. Derselbe Fehler steckte in einem Test. | Die Schnittstelle lädt dazu ein. | Die Wunschliste an `schlacht()` übergeben. Und: eine Messung, die zu gut aussieht, erst nachrechnen, dann behaupten. |
| **Knöpfe ohne ihren Handler ausgeliefert.** Ein `cd kaiser-online && python3 …` scheiterte am `cd`, das `&&` übersprang den Patch, `node --check` lief trotzdem durch. Der Nutzer fand es im Spiel. | Nur die Syntax geprüft, nicht die Wirkung. | Nach dem Ausrollen die **ausgelieferte** Datei ansehen, nicht die lokale. |
| **Spielstand ohne Schlachtfeld gesichert.** Nach einem Neustart war das Schlachtfeld schwarz. | `speicher.js` ließ `feld` weg. | Was die Anzeige braucht, muss in den Spielstand. Mit Neustart prüfen, nicht nur im Speicher. |
| **Skript in Rundennamen** (von CodeQL gefunden). Der Name ging ungeprüft durch den Server und wurde im Browser als HTML eingesetzt. | Menschentext ohne Maskierung. | Server prüft die Zeichen, Client maskiert jeden Menschentext beim Einsetzen (`esc()` in `app.js`). |
| **`npm test` lief auf Node 22+ nicht.** | `node --test test/` statt `test/*.test.js`. | Steht so in `package.json`. |
| **Ein alter Browsertab spielte eine alte Fassung.** „Wir hatten noch Cache." | Kein Abgleich der Fassung. | Der Server schickt einen Fingerabdruck über alle Clientdateien mit jeder Nachricht; der Browser merkt, dass er veraltet ist. Beim Prüfen hart neu laden. |
| **`glab` meldet 404.** | Das GitLab ist selbst betrieben, `glab` sucht auf gitlab.com. | `GITLAB_HOST=<gitlab-host> glab issue list --repo sexy-hosting-devops/kaiser` |
| **curl meldet 200 statt 101** beim WebSocket-Test. | curl handelt mit dem vHost HTTP/2 aus, dort gibt es kein Upgrade. | `--http1.1` angeben. Browser machen es von selbst richtig. |
| **`KAISER_PROXY` veraltet.** Ändert sich die Adresse des Proxys, zählen die Herkunftsgrenzen falsch — und **nichts fällt sichtbar aus**, die Seite läuft weiter. | Kopplung über zwei Systeme. | Beim Ändern der Proxyadresse die Unit mitändern. Der Hinweis steht auch auf der Proxyseite. |
| **Dateinamen im Diskettenabbild sind Grußbotschaften**, keine Programmnamen. | Die kursierenden Abbilder sind gecrackt. | Der Entpacker benennt nach der Ladeadresse. |
| **Work Item zu früh geschlossen** (13.09.2026). Prompt kam eine Anschlussforderung. | Umsetzung mit Erledigung verwechselt. | Ergebnis als Kommentar, schließen darf der Nutzer. |

---

## 6. Offene Punkte

Noch nicht beauftragt, nur festgehalten.

* **Keine Datensicherung des Ordners `daten`.** Nachgesehen am 01.11.2026: auf
  dem Spielserver ist kein borg, restic, rsnapshot oder duplicity installiert,
  es gibt keinen Timer und keinen Cron-Eintrag dafür. Es sind 88 KB, die alle
  Konten, Spielstände und die Ruhmeshalle enthalten; Kennwörter wären
  unwiederbringlich, denn sie liegen nur als Streuwert vor. `BETRIEB.md` sagt
  „ein Backup dieses einen Ordners genügt" — eingerichtet ist es nicht.
* **Drei Work Items im GitLab sind offen und ungebaut** (Stand 01.11.2026):
  * **#1** Fürstentümer erst beim Start vergeben, nicht nach
    Beitrittsreihenfolge.
  * **#3** Spielslots sollen sich löschen lassen — die kleinste Arbeit, räumt
    die Lobby auf.
  * **#4** ein Wetter und eine Fäule für das ganze Reich, mit einem
    veränderlichen Anteil. Die Messungen liegen fertig vor und empfehlen **ein
    Drittel eigenen Anteil**: der Titelabstand zweier gleich spielender Fürsten
    fällt von 3,12 auf 1,30 Stufen, und die Runden, in denen einer abgehängt
    wird, von 51 auf 2 Prozent. Bei reinem Reichswetter wären es noch 32
    Prozent — ein bisschen eigene Streuung hält den Motor an. Als Schalter
    `wetterStreuung` (0 wäre reines Reichswetter, 1 das heutige Verhalten);
    bei genau einem Drittel entsteht kein Rundungsfehler, bei einem Viertel und
    der Hälfte schon, und der würde das ganze Spiel heimlich erleichtern.
  * Von den dreien hat **#4** den größten Hebel für die Fairness.
* **Der Spielserver trägt Reste alter Ausrollungen** (`README.md`,
  `ARCHITEKTUR.md`, `test/`, `werkzeuge/` in `/opt/kaiser`). Sie stören nicht,
  gehören aber nicht dorthin.
* **Debian 12 auf Spielserver und Proxy**, Debian 13 auf dem Emulatorhost. Ein
  Umstieg ist nicht geplant, nur zu wissen.
