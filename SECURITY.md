# Sicherheit

Dies ist ein Freizeitprojekt, aber es ist ein Server mit Konten, Kennwörtern
und Sitzungen. Wenn jemand ihn ins offene Netz stellt, sind Lücken darin echte
Lücken. Meldungen sind deshalb willkommen.

## Eine Lücke melden

Bitte **nicht** über ein öffentliches Issue. Nutzen Sie die private Meldung von
GitHub:

> Reiter **Security** → **Report a vulnerability**

Damit ist die Meldung nur für Sie und mich sichtbar, bis sie behoben ist. Ich
antworte, so schnell ich kann — das hier ist ein Feierabendprojekt, rechnen Sie
mit Tagen, nicht mit Stunden. Wenn Sie einen Namen in den Dank schreiben
lassen wollen, sagen Sie Bescheid; wenn Sie lieber ungenannt bleiben, ebenso.

Gefixt wird auf `main`. Ältere Stände werden nicht gepflegt: es gibt keine
Versionen, nur den jeweils aktuellen Stand.

## Worum es geht

Betroffen ist alles, was in diesem Repository liegt:

* **`kaiser-online/server/`** — der Spielserver. Hier sind die interessanten
  Stellen: Anmeldung und Sitzungen (`konten.js`), die WebSocket-Schnittstelle
  und die Rechteprüfung je Aktion (`index.js`, `lobby.js`), das Ablegen der
  Spielstände (`speicher.js`) und der Mailversand für Einladungen (`post.js`).
* **`kaiser-online/client/`** — die Oberfläche. Vor allem: wird irgendwo Text
  von Mitspielern als HTML eingesetzt, wo er es nicht dürfte?
* **Die Python-Werkzeuge** im Wurzelverzeichnis, die ein fremdes
  Diskettenabbild einlesen.

Besonders gern gesehen sind Meldungen zu:

* Anmeldung, Sitzungen, Übernahme fremder Konten
* Aktionen, die ein Spieler auslösen kann, die ihm nicht zustehen — etwa in
  einer fremden Runde, für einen fremden Fürsten oder als Verwalter
* Daten anderer Spieler, die über die Leitung gehen, obwohl sie es nicht
  sollten (verdeckte Kriegserklärungen, fremde Spielstände)
* Einschleusen von Skript über Namen, Rundennamen oder andere Eingaben
* Pfade, die aus dem Datenverzeichnis herausführen
* Alles, womit sich der Server aus der Ferne lahmlegen lässt

## Was nicht dazugehört

* **Das Originalspiel von 1984.** Fehler des C64-Programms sind hier keine
  Lücken, sondern nachgebautes Verhalten. Wo wir bewusst abweichen, steht es
  in `SPIELMECHANIK.md`.
* **Spielbalance.** Dass sich mit Korn spekulieren lässt, ist kein Fehler,
  sondern das Spiel.
* **Eine Installation, die jemand anders betreibt.** Melden Sie die bitte dort.

## Was der Server tut, damit es gar nicht erst so weit kommt

* Kennwörter liegen nur als `scrypt`-Streuwert mit eigenem Salz je Konto vor.
* Sitzungen laufen ab und werden bei einer Kennwortänderung sämtlich verworfen.
* Gegen massenhaft angelegte Konten gilt eine Bremse je Herkunftsadresse. Hinter
  einem Proxy wird `X-Forwarded-For` **nur** von der in `KAISER_PROXY`
  genannten Adresse geglaubt, sonst zählt die echte Verbindung.
* Die Registrierung lässt sich schließen; dann legt nur die Verwaltung Konten
  an.
* Zugangsdaten für den Mailversand stehen in einer Datei außerhalb des
  Projekts, die nur root lesen darf. Im Repository liegen keine Geheimnisse,
  und Secret Scanning wacht darüber.
* Der Entwicklungsmodus `KAISER_DEMO`, der Titel und Truppen verschenkt, ist
  standardmäßig aus.

Wer den Server öffentlich stellt, sollte `kaiser-online/BETRIEB.md` lesen;
dort steht, was dabei zu beachten ist.

---

## In English

This is a hobby project, but it runs a server with accounts, passwords and
sessions. Please report vulnerabilities **privately** via GitHub: the
**Security** tab → **Report a vulnerability**, not as a public issue. Fixes go
to `main`; there are no released versions to back-port to. Expect an answer in
days rather than hours.

In scope: the game server (`kaiser-online/server/`), the browser client, and
the Python tools that read a disk image. Out of scope: bugs of the original
1984 game that the rebuild faithfully reproduces, game balance, and
installations run by other people.
