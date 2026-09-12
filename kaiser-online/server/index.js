// HTTP-Server fuer die Clientdateien und WebSocket-Server fuer Lobby und Spiel.
//
// Ablauf einer Verbindung:
//   1. anmelden oder registrieren  -> Sitzungskennung
//   2. Lobby: Runden ansehen, anlegen, beitreten
//   3. Spiel: Aktionen einer Runde
// Ohne gueltige Sitzung wird nichts ausser Anmeldung und Registrierung bedient.

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { PHASEN } from './game.js';
import { sichern } from './speicher.js';
import { Konten } from './konten.js';
import { Lobby } from './lobby.js';
import * as post from './post.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.join(HIER, '..', 'client');
const PORT = Number(process.env.PORT || 8420);
// Bindeadresse. Ohne Angabe lauscht der Server auf allen Schnittstellen; auf
// einem Server sollte HOST auf die gewuenschte Adresse gesetzt werden,
// zum Beispiel auf die Netbird-Adresse.
const HOST = process.env.HOST || '0.0.0.0';
// Mit KAISER_DEMO=1 wird die Entwicklungsaktion 'demoAufruesten' freigeschaltet.
const DEMO = process.env.KAISER_DEMO === '1';
const DATEN = process.env.KAISER_DATEN || path.join(HIER, '..', 'daten');
// Adressen, deren X-Forwarded-For geglaubt wird. Hinter einem Proxy sieht der
// Server sonst fuer alle dieselbe Adresse, und die Bremse fuer die
// Registrierung waere wirkungslos. Umgekehrt darf der Kopf nur von einem
// bekannten Proxy kommen, sonst kann ihn jeder faelschen.
const PROXYS = new Set(
  (process.env.KAISER_PROXY || '').split(',').map(x => x.trim()).filter(Boolean)
);

const TYPEN = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.sid': 'application/octet-stream',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname === '/' ? '/index.html' : url.pathname;
  const datei = path.join(CLIENT, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!datei.startsWith(CLIENT)) { res.writeHead(403).end('Verboten'); return; }
  fs.readFile(datei, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Nicht gefunden'); return; }
    const endung = path.extname(datei);
    // Schriften und Bilder ändern sich kaum, Quelltext und Stilvorlage schon.
    // Ohne diese Angabe hält ein Browser die alte Fassung unbemerkt fest.
    const lange = ['.woff2', '.woff', '.png', '.sid', '.ico'].includes(endung);
    const marke = '"' + crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16) + '"';
    const kopf = {
      'Cache-Control': lange ? 'public, max-age=604800' : 'no-cache',
      'ETag': marke
    };
    // Die Prüfung muss VOR dem Senden der Kopfzeilen stehen
    if (req.headers['if-none-match'] === marke) {
      res.writeHead(304, kopf);
      res.end();
      return;
    }
    kopf['Content-Type'] = TYPEN[endung] || 'application/octet-stream';
    res.writeHead(200, kopf);
    res.end(buf);
  });
});

// ------------------------------------------------------------------ Zustand

const konten = new Konten(path.join(DATEN, 'konten.json'));
const lobby = new Lobby({ demo: DEMO });
const verbindungen = new Map();   // ws -> { kennung, konto, spielId, quelle }

/**
 * Ermittelt die Herkunftsadresse einer Verbindung.
 * X-Forwarded-For wird nur geglaubt, wenn die Verbindung von einem in
 * KAISER_PROXY genannten Proxy kommt.
 */
function quelleVon(req) {
  const direkt = (req.socket.remoteAddress || 'unbekannt').replace(/^::ffff:/, '');
  if (!PROXYS.has(direkt)) return direkt;
  const kopf = req.headers['x-forwarded-for'];
  if (!kopf) return direkt;
  // Der erste Eintrag ist der urspruengliche Client
  const erster = String(kopf).split(',')[0].trim().replace(/^::ffff:/, '');
  return erster || direkt;
}

function senden(ws, typ, daten) {
  if (ws.readyState === 1) ws.send(JSON.stringify({ typ, ...daten }));
}

/** Schickt einer Verbindung den passenden Bildschirm. */
function ansichtSenden(ws, v) {
  if (!v.konto) { senden(ws, 'abgemeldet', {}); return; }
  if (v.spielId) {
    const spiel = lobby.spiel(v.spielId);
    if (spiel && spiel.spielerVon(v.konto.name)) {
      senden(ws, 'zustand', { zustand: spiel.sichtFuer(v.konto.name) });
      return;
    }
    v.spielId = null;
  }
  senden(ws, 'lobby', lobby.sicht(konten.oeffentlich(v.konto)));
}

/** Schickt allen Beteiligten einer Runde den neuen Stand. */
function spielVerteilen(spiel) {
  if (spiel.gestartet) sichern(spiel);
  for (const [ws, v] of verbindungen) {
    if (v.spielId === spiel.id && v.konto) ansichtSenden(ws, v);
  }
}

/** Schickt allen, die in der Lobby stehen, die neue Uebersicht. */
function lobbyVerteilen() {
  for (const [ws, v] of verbindungen) {
    if (!v.spielId && v.konto) senden(ws, 'lobby', lobby.sicht(konten.oeffentlich(v.konto)));
  }
}

// Fristen pruefen
setInterval(() => {
  for (const spiel of lobby.spiele.values()) {
    if (!spiel.gestartet) continue;
    const vorher = `${spiel.jahr}/${spiel.phase}`;

    // Sicherheitsnetz: eine Runde, in der alle fertig sind, darf nicht
    // stehenbleiben, egal wie sie in den Zustand geraten ist.
    spiel.phasePruefen();

    if (spiel.frist && Date.now() >= spiel.frist) spiel.fristAbgelaufen();

    if (`${spiel.jahr}/${spiel.phase}` !== vorher) {
      spielVerteilen(spiel);
      lobbyVerteilen();
    }
  }
}, 1000);

// ------------------------------------------------------------------ WebSocket

const wss = new WebSocketServer({ server });
// Der WebSocket-Server reicht Fehler des HTTP-Servers weiter; ohne eigenen
// Behandler wuerde daraus ein unbehandeltes Ereignis.
wss.on('error', () => { /* wird unten am HTTP-Server gemeldet */ });

wss.on('connection', (ws, req) => {
  const v = { kennung: null, konto: null, spielId: null, quelle: quelleVon(req) };
  verbindungen.set(ws, v);

  ws.on('message', roh => {
    let n;
    try { n = JSON.parse(roh); } catch { return; }
    try { behandeln(ws, v, n); }
    catch (e) {
      console.error('Fehler bei', n && n.typ, e.message);
      senden(ws, 'fehler', { text: 'Der Server hat sich verschluckt: ' + e.message });
    }
  });

  ws.on('close', () => {
    const spiel = v.spielId ? lobby.spiel(v.spielId) : null;
    verbindungen.delete(ws);
    // Wer eine noch nicht gestartete Runde nur angesehen hat, bleibt drin:
    // der Platz gehoert zum Konto, nicht zur Verbindung.
    if (spiel) lobbyVerteilen();
  });
});

function behandeln(ws, v, n) {
  const { typ } = n;

  // ---- ohne Anmeldung erlaubt -------------------------------------------
  if (typ === 'registrieren') {
    // Im Entwicklungsmodus greift die Bremse nicht, sonst kommen die
    // Werkzeuge nach drei Konten nicht mehr durch.
    const e = konten.registrieren(n.name, n.kennwort, { quelle: v.quelle, ohneBremse: DEMO });
    if (e.fehler) {
      if (e.gebremst) console.log(`Registrierung gebremst fuer ${v.quelle}: ${e.fehler}`);
      senden(ws, 'fehler', { text: e.fehler, feld: 'anmeldung' });
      return;
    }
    if (e.ersterNutzer) console.log(`Erstes Konto ${e.konto.name} angelegt, es ist Verwalter.`);
    const a = konten.anmelden(n.name, n.kennwort);
    sitzungStarten(ws, v, a);
    return;
  }
  if (typ === 'anmelden') {
    const a = konten.anmelden(n.name, n.kennwort);
    if (a.fehler) { senden(ws, 'fehler', { text: a.fehler, feld: 'anmeldung' }); return; }
    sitzungStarten(ws, v, a);
    return;
  }
  if (typ === 'sitzung') {
    const konto = konten.konto(n.kennung);
    if (!konto) { senden(ws, 'abgemeldet', {}); return; }
    v.kennung = n.kennung;
    v.konto = konto;
    senden(ws, 'angemeldet', { kennung: n.kennung, konto: konten.oeffentlich(konto) });
    ansichtSenden(ws, v);
    return;
  }

  // ---- ab hier ist eine Sitzung noetig -----------------------------------
  if (!v.konto) { senden(ws, 'abgemeldet', {}); return; }

  if (typ === 'abmelden') {
    konten.abmelden(v.kennung);
    v.kennung = null; v.konto = null; v.spielId = null;
    senden(ws, 'abgemeldet', {});
    return;
  }
  if (typ === 'lobby') {
    v.spielId = null;
    senden(ws, 'lobby', lobby.sicht(konten.oeffentlich(v.konto)));
    return;
  }
  if (typ === 'spielAnlegen') {
    const e = lobby.anlegen(n.name, {
      planungsSekunden: n.planungsSekunden,
      diplomatieSekunden: n.diplomatieSekunden,
      regelwerk: n.regelwerk,
      von: v.konto.name
    });
    if (e.fehler) { senden(ws, 'fehler', { text: e.fehler }); return; }
    // Der Anlegende bekommt gleich einen Platz
    const b = lobby.beitreten(e.spiel.id, v.konto, { weiblich: n.weiblich });
    if (b.fehler) { senden(ws, 'fehler', { text: b.fehler }); lobbyVerteilen(); return; }
    konten.anredeMerken(v.konto.name, n.weiblich);
    senden(ws, 'hinweis', { text: `Sie regieren ${b.region}.` });
    v.spielId = e.spiel.id;
    ansichtSenden(ws, v);
    lobbyVerteilen();
    return;
  }
  if (typ === 'spielBeitreten') {
    const e = lobby.beitreten(n.spielId, v.konto, { weiblich: n.weiblich });
    if (e.fehler) { senden(ws, 'fehler', { text: e.fehler }); lobbyVerteilen(); return; }
    if (n.weiblich != null) konten.anredeMerken(v.konto.name, n.weiblich);
    senden(ws, 'hinweis', { text: `Sie regieren ${e.region}.` });
    v.spielId = e.spiel.id;
    ansichtSenden(ws, v);
    // Wer schon im Warteraum sitzt, soll den neuen Mitspieler sehen
    spielVerteilen(e.spiel);
    lobbyVerteilen();
    return;
  }
  if (typ === 'spielOeffnen') {
    // Eine Runde betreten, in der man schon einen Platz hat
    const spiel = lobby.spiel(n.spielId);
    if (!spiel || !spiel.spielerVon(v.konto.name)) { senden(ws, 'fehler', { text: 'Sie haben dort keinen Platz.' }); return; }
    v.spielId = spiel.id;
    ansichtSenden(ws, v);
    return;
  }
  if (typ === 'spielVerlassen') {
    const id = n.spielId || v.spielId;
    const e = lobby.verlassen(id, v.konto);
    if (e.fehler) { senden(ws, 'fehler', { text: e.fehler }); return; }
    v.spielId = null;
    senden(ws, 'lobby', lobby.sicht(konten.oeffentlich(v.konto)));
    // Die Verbleibenden im Warteraum sollen es merken; ist die Runde ganz weg,
    // werden sie in die Lobby zurueckgeschickt.
    const rest = lobby.spiel(id);
    if (rest) spielVerteilen(rest);
    else for (const [w, x] of verbindungen) {
      if (x.spielId === id && x.konto) { x.spielId = null; ansichtSenden(w, x); }
    }
    lobbyVerteilen();
    return;
  }

  // ---- Verwaltung, nur fuer Verwalter ------------------------------------
  if (typ === 'eigenesKennwortAendern') {
    const e = konten.eigenesKennwortAendern(v.konto.name, n.alt, n.neu);
    if (e.fehler) { senden(ws, 'fehler', { text: e.fehler }); return; }
    console.log(`${v.konto.name} hat die eigene Kennwort geaendert.`);
    senden(ws, 'hinweis', { text: 'Ihr Kennwort ist geändert. Bitte melden Sie sich neu an.' });
    abgemeldeteTrennen();
    return;
  }

  if (typ.startsWith('nutzer') || typ === 'verwaltung' || typ === 'registrierungSetzen') {
    if (!v.konto.admin) { senden(ws, 'fehler', { text: 'Das darf nur die Verwaltung.' }); return; }
    verwaltungBehandeln(ws, v, n, typ);
    return;
  }

  // ---- ab hier ist eine Runde noetig -------------------------------------
  const spiel = v.spielId ? lobby.spiel(v.spielId) : null;
  if (!spiel) { senden(ws, 'fehler', { text: 'Sie sind in keiner Runde.' }); ansichtSenden(ws, v); return; }

  if (typ === 'starten') {
    const e = spiel.starten();
    if (e.fehler) senden(ws, 'fehler', { text: e.fehler });
    spielVerteilen(spiel);
    lobbyVerteilen();
    return;
  }
  if (typ === 'einstellungen') {
    if (!spiel.gestartet) {
      if (n.planungsSekunden != null) spiel.planungsSekunden = Math.max(0, Number(n.planungsSekunden));
      if (n.diplomatieSekunden != null) spiel.diplomatieSekunden = Math.max(0, Number(n.diplomatieSekunden));
    }
    spielVerteilen(spiel);
    lobbyVerteilen();
    return;
  }
  if (typ === 'aktion') {
    const e = spiel.aktion(v.konto.name, n.aktion, n.daten || {});
    if (e.fehler) senden(ws, 'fehler', { text: e.fehler });
    else senden(ws, 'ergebnis', { aktion: n.aktion, ergebnis: e });
    spielVerteilen(spiel);
    return;
  }
  if (typ === 'zustand') { ansichtSenden(ws, v); return; }

  senden(ws, 'fehler', { text: 'Unbekannte Nachricht: ' + typ });
}

/** Verwaltungsnachrichten. Der Aufrufer hat schon geprueft, dass er darf. */
function verwaltungBehandeln(ws, v, n, typ) {
  const selbst = v.konto.name;

  if (typ === 'verwaltung') { verwaltungSenden(ws); return; }

  if (typ === 'registrierungSetzen') {
    const offen = konten.registrierungSetzen(!!n.offen);
    console.log(`${selbst} hat die offene Registrierung ${offen ? 'eingeschaltet' : 'ausgeschaltet'}.`);
    verwaltungSenden(ws);
    return;
  }

  if (typ === 'nutzerAnlegen') {
    const e = konten.nutzerAnlegen(n.name, n.kennwort, { admin: !!n.admin, von: selbst });
    if (e.fehler) { senden(ws, 'fehler', { text: e.fehler }); return; }
    console.log(`${selbst} hat das Konto ${e.konto.name} angelegt.`);
    senden(ws, 'hinweis', { text: `Konto ${e.konto.name} angelegt.` });
    verwaltungSenden(ws);
    return;
  }

  if (typ === 'nutzerEinladen') {
    if (!post.bereit()) { senden(ws, 'fehler', { text: 'Der Mailversand ist nicht eingerichtet.' }); return; }
    if (!post.adresseGueltig(n.email)) { senden(ws, 'fehler', { text: 'Diese Mailadresse sieht nicht richtig aus.' }); return; }
    const kennwort = post.kennwortWuerfeln();
    const e = konten.nutzerAnlegen(n.name, kennwort, {
      admin: !!n.admin, von: selbst, email: String(n.email).trim()
    });
    if (e.fehler) { senden(ws, 'fehler', { text: e.fehler }); return; }
    post.einladen({
      an: e.konto.email, name: e.konto.name, kennwort,
      weiblich: !!n.weiblich, vonWem: selbst
    }).then(r => {
      if (r.fehler) {
        // Das Konto steht, nur die Mail ging nicht raus. Beides melden.
        senden(ws, 'fehler', { text: `Konto ${e.konto.name} ist angelegt, aber ${r.fehler}` });
      } else {
        senden(ws, 'hinweis', { text: `Einladung an ${e.konto.email} verschickt.` });
      }
      verwaltungSenden(ws);
    });
    console.log(`${selbst} hat ${e.konto.name} eingeladen.`);
    verwaltungSenden(ws);
    return;
  }

  if (typ === 'nutzerErneutEinladen') {
    if (!post.bereit()) { senden(ws, 'fehler', { text: 'Der Mailversand ist nicht eingerichtet.' }); return; }
    const liste = konten.liste();
    const k = liste.find(x => nameGleich(x.name, n.name));
    if (!k) { senden(ws, 'fehler', { text: 'Dieses Konto gibt es nicht.' }); return; }
    const email = String(n.email || k.email || '').trim();
    if (!post.adresseGueltig(email)) { senden(ws, 'fehler', { text: 'Für dieses Konto ist keine brauchbare Mailadresse hinterlegt.' }); return; }
    // Ein neues Kennwort, damit die alte Einladung wertlos wird
    const kennwort = post.kennwortWuerfeln();
    const gesetzt = konten.kennwortSetzen(k.name, kennwort);
    if (gesetzt.fehler) { senden(ws, 'fehler', { text: gesetzt.fehler }); return; }
    konten.einladungVermerken(k.name, email);
    post.einladen({ an: email, name: k.name, kennwort, weiblich: k.weiblich, vonWem: selbst })
      .then(r => {
        senden(ws, r.fehler ? 'fehler' : 'hinweis',
          { text: r.fehler || `Neue Einladung an ${email} verschickt, die alte Kennwort gilt nicht mehr.` });
        verwaltungSenden(ws);
      });
    console.log(`${selbst} hat ${k.name} erneut eingeladen.`);
    abgemeldeteTrennen();
    verwaltungSenden(ws);
    return;
  }

  if (typ === 'postPruefen') {
    post.pruefen().then(r => {
      senden(ws, r.fehler ? 'fehler' : 'hinweis',
        { text: r.fehler || 'Der Mailserver antwortet, der Versand ist bereit.' });
    });
    return;
  }

  if (typ === 'nutzerKennwortSetzen') {
    const e = konten.kennwortSetzen(n.name, n.kennwort);
    if (e.fehler) { senden(ws, 'fehler', { text: e.fehler }); return; }
    console.log(`${selbst} hat das Kennwort von ${n.name} zurueckgesetzt.`);
    abgemeldeteTrennen();
    senden(ws, 'hinweis', { text: `Neues Kennwort gesetzt, ${e.sitzungenBeendet} Sitzung(en) beendet.` });
    verwaltungSenden(ws);
    return;
  }

  if (typ === 'nutzerSperren') {
    if (nameGleich(n.name, selbst) && n.gesperrt) {
      senden(ws, 'fehler', { text: 'Sich selbst zu sperren wäre unklug.' });
      return;
    }
    const e = konten.sperren(n.name, !!n.gesperrt);
    if (e.fehler) { senden(ws, 'fehler', { text: e.fehler }); return; }
    console.log(`${selbst} hat ${n.name} ${n.gesperrt ? 'gesperrt' : 'entsperrt'}.`);
    abgemeldeteTrennen();
    verwaltungSenden(ws);
    return;
  }

  if (typ === 'nutzerAdmin') {
    const e = konten.adminSetzen(n.name, !!n.admin);
    if (e.fehler) { senden(ws, 'fehler', { text: e.fehler }); return; }
    console.log(`${selbst} hat ${n.name} die Verwaltung ${n.admin ? 'gegeben' : 'entzogen'}.`);
    // Wer gerade verbunden ist, soll die neue Rolle sofort sehen
    for (const [w, x] of verbindungen) {
      if (x.konto && nameGleich(x.konto.name, n.name)) {
        senden(w, 'angemeldet', { kennung: x.kennung, konto: konten.oeffentlich(x.konto) });
        ansichtSenden(w, x);
      }
    }
    verwaltungSenden(ws);
    return;
  }

  if (typ === 'nutzerLoeschen') {
    if (nameGleich(n.name, selbst)) {
      senden(ws, 'fehler', { text: 'Das eigene Konto kann man hier nicht löschen.' });
      return;
    }
    // Aus allen noch nicht gestarteten Runden nehmen
    const name = String(n.name || '').toUpperCase();
    for (const spiel of lobby.spiele.values()) {
      if (!spiel.gestartet && spiel.spielerVon(name)) lobby.verlassen(spiel.id, { name });
    }
    const e = konten.loeschen(n.name);
    if (e.fehler) { senden(ws, 'fehler', { text: e.fehler }); return; }
    console.log(`${selbst} hat das Konto ${name} geloescht.`);
    abgemeldeteTrennen();
    senden(ws, 'hinweis', { text: `Konto ${name} gelöscht.` });
    verwaltungSenden(ws);
    lobbyVerteilen();
    return;
  }

  senden(ws, 'fehler', { text: 'Unbekannte Verwaltungsnachricht: ' + typ });
}

const nameGleich = (a, b) => String(a || '').toUpperCase() === String(b || '').toUpperCase();

function verwaltungSenden(ws) {
  senden(ws, 'verwaltung', {
    konten: konten.liste(),
    bremse: konten.bremsenStand(),
    post: post.stand()
  });
}

/**
 * Trennt Verbindungen, deren Sitzung nicht mehr gilt, etwa nach einer Sperre
 * oder einer neuen Kennwort.
 */
function abgemeldeteTrennen() {
  for (const [ws, v] of verbindungen) {
    if (!v.kennung) continue;
    if (!konten.konto(v.kennung)) {
      v.kennung = null; v.konto = null; v.spielId = null;
      senden(ws, 'abgemeldet', {});
    }
  }
}

function sitzungStarten(ws, v, a) {
  v.kennung = a.kennung;
  v.konto = a.konto;
  v.spielId = null;
  senden(ws, 'angemeldet', { kennung: a.kennung, konto: konten.oeffentlich(a.konto) });
  senden(ws, 'lobby', lobby.sicht(konten.oeffentlich(a.konto)));
}

// ------------------------------------------------------------------ Start

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} auf ${HOST} ist schon belegt. Läuft der Server bereits?`);
    console.error('Mit einem anderen Port starten: PORT=8421 npm start');
  } else {
    console.error('Der Server konnte nicht starten:', e.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Kaiser läuft auf http://${HOST}:${PORT}`);
  console.log(`Konten: ${konten.anzahl()}, Runden: ${lobby.spiele.size}`);
  if (DEMO) console.log('Entwicklungsmodus: die Aktion demoAufruesten ist freigeschaltet.');
});

// Beim Beenden alles sichern
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    lobby.allesSichern();
    konten.sichern();
    process.exit(0);
  });
}

export { lobby, konten };
