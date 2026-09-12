# Betrieb

Wie man den Dienst dauerhaft laufen lässt, hinter einem Webserver, mit
Einladungen per Mail. Die Anleitung ist allgemein gehalten; die eigenen
Adressen, Namen und Pfade stehen sinnvollerweise in einer eigenen Datei
daneben (`BETRIEB.lokal.md`, nicht im Repo).

## Dienst

Der Server ist ein einzelner Node-Prozess ohne Datenbank. Eine systemd-Unit
genügt:

```ini
[Unit]
Description=Kaiser
After=network.target

[Service]
Type=simple
User=kaiser
WorkingDirectory=/opt/kaiser
ExecStart=/usr/bin/node server/index.js
Environment=PORT=8420
Environment=HOST=127.0.0.1
# Nur nötig hinter einem Proxy, siehe unten:
# Environment=KAISER_PROXY=10.0.0.1
# Zugangsdaten für den Mailversand, das Minus erlaubt den Start ohne die Datei:
EnvironmentFile=-/etc/kaiser/mail.env
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl status kaiser
sudo systemctl restart kaiser
journalctl -u kaiser -f
```

Ist der Port belegt, meldet der Server das im Klartext und beendet sich, statt
mit einem Stapelauszug abzustürzen.

## Aktualisieren

```bash
tar czf - server client package.json | \
  ssh <server> 'cd /opt/kaiser && tar xzf -'
sudo systemctl restart kaiser
```

**Der Ordner `daten` darf nie mitgehen.** Dort liegen Konten, Sitzungen,
Spielstände und die Ruhmeshalle des Servers; der gleichnamige Ordner auf dem
Entwicklungsrechner enthält Proberunden und Testkonten. Wird er mitgeschickt,
überschreibt er den Betrieb. Genau das ist einmal passiert: sechs Proberunden
landeten in der Lobby und die Ruhmeshalle war voll mit Namen aus Simulationen.
Die Konten haben es nur überlebt, weil der Dienst seinen Stand beim Beenden
zurückschreibt und der Neustart nach dem Entpacken kam.

Braucht eine Änderung neue Pakete, zusätzlich `npm install --omit=dev`.

**Laufende Partien:** Vor dem Ausrollen `daten/spiele/` ansehen. Eine
Regeländerung, die einen laufenden Stand beeinflusst, gehört nicht
klammheimlich in eine Runde, die jemand seit sechzig Jahren spielt.

## Daten

| Pfad | Inhalt |
|------|--------|
| `daten/konten.json` | Konten, Einstellungen und gültige Sitzungen |
| `daten/spiele/*.json` | je eine laufende Spielrunde |
| `daten/ruhmeshalle.json` | die gekrönten Kaiser |

Die Trennung ist wichtig: die Lobby liest den Ordner `spiele` vollständig ein.
Liegt dort etwas, das kein Spielstand ist, wird es übergangen und protokolliert.

Die Kennwörter der Konten liegen nur als `scrypt`-Streuwert mit eigenem Salz
vor. Ein Auslesen der Datei gibt sie nicht preis, ein Verlust der Datei kostet
aber alle Konten. Ein Backup dieses einen Ordners genügt.

## Hinter nginx

```nginx
location / {
    proxy_pass http://127.0.0.1:8420;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Host $host;
}
```

`$connection_upgrade` kommt aus der üblichen `map`-Anweisung im http-Block.

### WebSocket prüfen

Das Spiel läuft vollständig über WebSocket. Beim Prüfen mit curl **unbedingt
`--http1.1` angeben**:

```bash
curl -s -i --http1.1 \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  https://<domain>/
```

Ohne den Schalter handelt curl mit dem vHost HTTP/2 aus, und dort gibt es den
Upgrade-Mechanismus nicht: man bekommt eine 200 statt der 101 und hält das
fälschlich für einen Fehler. Browser machen es von selbst richtig, sie holen
die Seite über HTTP/2 und den WebSocket über eine eigene HTTP/1.1-Verbindung.

### KAISER_PROXY nicht vergessen

Hinter einem Proxy sieht der Dienst für alle Spieler dieselbe Adresse, nämlich
die des Proxys. Ohne Gegenmaßnahme würde die Bremse gegen massenhaft angelegte
Konten nach drei Konten **alle weiteren abweisen**, egal woher sie kommen.

```
Environment=KAISER_PROXY=<adresse des proxys>
```

Nur von dieser Adresse wird `X-Forwarded-For` geglaubt. Kommt eine Verbindung
direkt, zählt ihre echte Adresse, und der Kopf wird ignoriert. Das ist Absicht:
sonst könnte jeder den Kopf fälschen und die Bremse aushebeln.

Ändert sich die Adresse des Proxys, muss der Wert mitgeändert werden. Das ist
eine Kopplung über zwei Systeme hinweg, und sie bricht, **ohne dass etwas
sichtbar ausfällt**: die Seite läuft weiter, nur die Herkunftsgrenzen zählen
falsch. Ein Hinweis gehört deshalb auch auf die Seite des Proxys.

## Konten und Verwaltung

Das **erste angelegte Konto wird Verwalter**. Auf einem frischen Server gilt
also: wer sich zuerst registriert, hat die Verwaltung. Nach der Inbetriebnahme
sollte man das gleich tun und danach die offene Registrierung schließen
(`einstellungen.registrierungOffen` in `daten/konten.json`, oder der Knopf in
der Verwaltung).

Verwalter finden in der Lobby den Knopf *Verwaltung*: Konten anlegen, sperren,
löschen, Kennwort zurücksetzen, weitere Verwalter ernennen, offene
Registrierung ein- und ausschalten.

Gegen massenhaft angelegte Konten gilt eine Bremse: 3 Konten je
Herkunftsadresse und Stunde, 10 je Tag, 20 insgesamt je Stunde, 200 überhaupt.

## Einladungen per Mail

Die Zugangsdaten gehören in eine Datei, die nur root lesen kann, etwa
`/etc/kaiser/mail.env` mit Rechten 0600:

```
KAISER_SMTP_HOST="mail.example.org"
KAISER_SMTP_PORT="587"
KAISER_SMTP_USER="kaiser@example.org"
KAISER_SMTP_KENNWORT="..."
KAISER_SMTP_VON="Kaiser <kaiser@example.org>"
KAISER_ADRESSE_WEB="https://<domain>/"
```

Die Werte stehen in Anführungszeichen. Ohne sie bricht ein
`. /etc/kaiser/mail.env` an der Absenderzeile ab, weil dort Leerzeichen und
spitze Klammern vorkommen. Systemd käme damit zurecht, ein Mensch mit einer
Shell nicht.

Prüfen, was der laufende Dienst sieht, ohne das Kennwort auszugeben:

```bash
PID=$(systemctl show kaiser -p MainPID --value)
sudo tr '\0' '\n' < /proc/$PID/environ | grep -E 'KAISER_SMTP_(HOST|PORT|USER|VON)|KAISER_ADRESSE_WEB'
```

In der Verwaltung gibt es den Knopf *Mailserver prüfen*, der eine Verbindung
aufbaut, ohne etwas zu verschicken. Ohne Mailzugang funktioniert alles andere
weiter; Einladungen muss man dann von Hand weitergeben.

## Entwicklungsmodus

`KAISER_DEMO=1` schaltet die Aktion `demoAufruesten` frei, die Titel und
Truppen sofort setzt. Für einen öffentlich erreichbaren Dienst sollte die
Variable ungesetzt bleiben.
