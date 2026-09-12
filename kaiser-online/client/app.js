// Client fuer Kaiser. Spricht ueber WebSocket mit dem Server; der Server ist die
// einzige Quelle der Wahrheit, der Client zeigt nur an und schickt Aktionen.

import { FARBEN, zeichen, zeichensatzLaden } from './c64.js';
import { zeichensatzBereit, feldZeichnen, zelleMalen, GRUND, Nachspieler, ZEILEN, SPALTEN, KACHEL }
  from './schlachtfeld.js';
import * as A from './aufstellungslogik.js';
import { hilfeZu } from './hilfe.js';
import { blaetterAus, kroneMalen } from './zeremonie.js';
import { kornspeicherMalen } from './kornspeicher.js';
import { reichskarteSvg, reichskarteErklaerung } from './reichskarte.js';
import * as Klang from './klang.js';

const $ = id => document.getElementById(id);
const REGIONEN = ['PREUSSEN', 'HESSEN', 'BAYERN', 'BÖHMEN', 'SACHSEN', 'MÄHREN', 'TIROL', 'DER PFALZ', 'FLANDERN'];
const zahl = n => Math.round(n).toLocaleString('de-DE');
const datum = t => t ? new Date(t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '';

/**
 * Maskiert Text, bevor er in eine Vorlage eingesetzt wird.
 *
 * Die Oberflaeche baut ihre Seiten aus Zeichenketten und setzt sie per
 * innerHTML ein. Alles, was von einem Menschen kommt -- Rundennamen,
 * Kontonamen, Mailadressen, Meldungen des Servers, in denen Namen stehen --
 * geht darum durch esc(). Ohne das koennte ein Mitspieler eine Runde
 * "<img src=x onerror=...>" nennen und damit in jedem fremden Browser Skript
 * ausfuehren, auch im Browser der Verwaltung. Der Server laesst solche Namen
 * inzwischen gar nicht mehr zu (ERLAUBTER_NAME in lobby.js); dies hier ist die
 * zweite Tuer, die nicht davon abhaengt, dass die erste zuhaelt.
 */
const esc = wert => String(wert ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

let ws = null;
let zustand = null;      // Spielsicht, wenn eine Runde offen ist
let lobbySicht = null;   // Lobbysicht, sonst
let verwaltung = null;   // Kontenliste, nur für Verwalter
let konto = null;        // angemeldetes Konto
let kennung = null;      // Sitzungskennung
let schlachtIndex = 0;
let registrierModus = false;
// Wunsch aus der Adresszeile gleich beim Start merken, weil die Adresse
// spaeter beim Wechsel der Bildschirme umgeschrieben wird.
const gewuenschteRunde = new URLSearchParams(location.search).get('runde');

// ------------------------------------------------------------------ Verbindung

function verbinden() {
  const protokoll = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${protokoll}://${location.host}`);
  ws.onopen = () => {
    const gespeichert = localStorage.getItem('kaiser.kennung');
    if (gespeichert) sende('sitzung', { kennung: gespeichert });
    else bildschirm('anmeldung');
  };
  ws.onmessage = ev => {
    const n = JSON.parse(ev.data);
    if (n.typ === 'angemeldet') {
      kennung = n.kennung; konto = n.konto;
      localStorage.setItem('kaiser.kennung', kennung);
      anmeldeFehlerVerstecken();
    } else if (n.typ === 'abgemeldet') {
      kennung = null; konto = null; zustand = null; lobbySicht = null; verwaltung = null;
      localStorage.removeItem('kaiser.kennung');
      bildschirm('anmeldung');
    } else if (n.typ === 'lobby') {
      lobbySicht = n; zustand = null;
      lobbyZeichnen();
      rundeAusAdresse();
    } else if (n.typ === 'zustand') {
      zustand = n.zustand; lobbySicht = null;
      zeichnen();
    } else if (n.typ === 'verwaltung') {
      verwaltung = n;
      verwaltungZeichnen();
    } else if (n.typ === 'hinweis') {
      hinweisZeigen(n.text);
    } else if (n.typ === 'fehler') {
      fehlerZeigen(n.text, n.feld);
    }
  };
  ws.onclose = () => {
    fehlerZeigen('Verbindung getrennt. Neuer Versuch in 3 Sekunden.');
    setTimeout(verbinden, 3000);
  };
}

function sende(typ, daten = {}) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ typ, ...daten }));
}
const aktion = (name, daten = {}) => sende('aktion', { aktion: name, daten });

/** Zeigt genau einen der drei Bildschirme. */
/** Hält die Adresszeile passend zur offenen Runde. */
function adresseSetzen(spielId) {
  const soll = spielId ? `${location.pathname}?runde=${encodeURIComponent(spielId)}` : location.pathname;
  if (location.pathname + location.search !== soll) history.replaceState(null, '', soll);
}

function bildschirm(welcher) {
  for (const id of ['anmeldung', 'lobby', 'warteraum', 'spiel']) {
    $(id).classList.toggle('verstecken', id !== welcher);
  }
}

function anmeldeFehlerVerstecken() {
  const a = $('anmeldeFehler');
  if (a) { a.classList.add('verstecken'); a.textContent = ''; }
}

function hinweisZeigen(text) {
  const h = $('lobbyHinweis');
  if (!h) return;
  h.textContent = text;
  h.classList.remove('verstecken');
  setTimeout(() => h.classList.add('verstecken'), 6000);
}

function fehlerZeigen(text, feld) {
  Klang.fehler();     // im Original SYSm,6 bei jeder abgewiesenen Eingabe
  if (feld === 'anmeldung' || !konto) {
    const a = $('anmeldeFehler');
    if (a) { a.textContent = text; a.classList.remove('verstecken'); }
    return;
  }
  const ziel = $('fehlerFeld');
  if (!ziel || $('spiel').classList.contains('verstecken')) {
    const l = $('lobbyFehler');
    if (l) { l.textContent = text; l.classList.remove('verstecken'); setTimeout(() => l.classList.add('verstecken'), 6000); }
    return;
  }
  const d = document.createElement('div');
  d.className = 'meldung warnung';
  d.textContent = text;
  ziel.prepend(d);
  setTimeout(() => d.remove(), 6000);
}

// ------------------------------------------------------------------ Anmeldung

function anmeldungAufbauen() {
  const umschalten = reg => {
    registrierModus = reg;
    $('registrierFelder').classList.toggle('verstecken', !reg);
    $('tabAnmelden').classList.toggle('gut', !reg);
    $('tabRegistrieren').classList.toggle('gut', reg);
    $('anmeldeKnopf').textContent = reg ? 'Konto anlegen' : 'Anmelden';
    $('kKennwort').autocomplete = reg ? 'new-password' : 'current-password';
    anmeldeFehlerVerstecken();
  };
  $('tabAnmelden').onclick = () => umschalten(false);
  $('tabRegistrieren').onclick = () => umschalten(true);

  const absenden = () => {
    const name = $('kName').value.trim();
    const kennwort = $('kKennwort').value;
    if (!name) { fehlerZeigen('Bitte einen Namen angeben.', 'anmeldung'); return; }
    if (kennwort.length < 4) { fehlerZeigen('Das Kennwort braucht mindestens 4 Zeichen.', 'anmeldung'); return; }
    if (registrierModus) {
      if (kennwort !== $('kKennwort2').value) { fehlerZeigen('Die beiden Kennwörter stimmen nicht überein.', 'anmeldung'); return; }
      sende('registrieren', { name, kennwort });
    } else {
      sende('anmelden', { name, kennwort });
    }
  };
  $('anmeldeKnopf').onclick = absenden;
  for (const id of ['kName', 'kKennwort', 'kKennwort2']) {
    $(id).addEventListener('keydown', e => { if (e.key === 'Enter') absenden(); });
  }
  $('abmeldeKnopf').onclick = () => sende('abmelden');
  umschalten(false);
}

// ------------------------------------------------------------------ Lobby

function lobbyAufbauen() {
  // Erklaerung zum gewaehlten Regelwerk
  const regelhinweis = () => {
    const h = $('regelHinweis');
    if (!h) return;
    h.innerHTML = $('nRegelwerk').value === 'neu'
      ? 'Sechs Regeln sind geändert, damit Geld knapp bleibt und ein Krieg ein Wagnis ist: '
        + 'Zinsen gibt es nur noch auf Kapital bis zur Bonität, die Moral kehrt zur Mitte '
        + 'zurück statt gegen null zu fallen, Manöver bringen mit jedem weiteren im Jahr '
        + 'nur noch die Hälfte, der Verteidiger hat einen Heimvorteil, der Ausgang einer '
        + 'Schlacht streut und kostet auch den Sieger, und das Reich hat eine feste Fläche: '
        + '30.000 Hektar je Fürstentum am Tisch. Ist die aufgekauft, wechselt Land nur noch '
        + 'durch Krieg den Besitzer. Die Moral selbst bleibt dabei so unsichtbar wie im '
        + 'Original; nur ihre Regel ist eine andere.'
      : 'Die Regeln des C64-Spiels von 1984, Zeile für Zeile nachgebaut, mitsamt seinen '
        + 'Eigenheiten.';
  };
  $('nRegelwerk').onchange = regelhinweis;
  regelhinweis();

  $('rundeAnlegen').onclick = () => {
    sende('spielAnlegen', {
      name: $('nRundeName').value.trim(),
      regelwerk: $('nRegelwerk').value,
      weiblich: $('nAnrede').value === 'w',
      planungsSekunden: Number($('nPlanung').value),
      diplomatieSekunden: Number($('nDiplo').value)
    });
  };
  $('zurLobby').onclick = () => sende('lobby');
  $('kennwortKnopf').onclick = () => {
    const k = $('kennwortKarte');
    k.classList.toggle('verstecken');
    if (!k.classList.contains('verstecken')) $('kwAlt').focus();
  };
  $('kennwortSpeichern').onclick = () => {
    const alt = $('kwAlt').value, neu = $('kwNeu').value;
    if (neu.length < 4) { fehlerZeigen('Das neue Kennwort braucht mindestens 4 Zeichen.'); return; }
    if (neu !== $('kwNeu2').value) { fehlerZeigen('Die beiden neuen Kennwörter stimmen nicht überein.'); return; }
    sende('eigenesKennwortAendern', { alt, neu });
    for (const id of ['kwAlt', 'kwNeu', 'kwNeu2']) $(id).value = '';
  };
  $('warteraumLobby').onclick = () => sende('lobby');
  $('warteraumVerlassen').onclick = () => {
    if (zustand) sende('spielVerlassen', { spielId: zustand.spielId });
  };
  $('starten').onclick = () => sende('starten');
  $('zeitenSpeichern').onclick = () => sende('einstellungen', {
    planungsSekunden: Number($('planungsZeit').value),
    diplomatieSekunden: Number($('diploZeit').value)
  });
}

function lobbyZeichnen() {
  adresseSetzen(null);
  bildschirm('lobby');
  $('lobbyKonto').textContent = konto
    ? `Angemeldet als ${esc(konto.name)}${konto.admin ? ' (Verwaltung)' : ''}` : '';
  $('verwaltungKnopf').classList.toggle('verstecken', !(konto && konto.admin));
  if (!(konto && konto.admin)) $('verwaltungKarte').classList.add('verstecken');

  // Wer noch mit der Zahl aus der Einladung spielt, wird daran erinnert
  const h = $('kennwortHinweis');
  if (konto && konto.ausEinladung) {
    h.textContent = 'Sie benutzen noch das Kennwort aus Ihrer Einladung. '
      + 'Bitte ändern Sie es über den Knopf oben rechts.';
    h.classList.remove('verstecken');
  } else {
    h.classList.add('verstecken');
  }
  if (konto) $('nAnrede').value = konto.weiblich ? 'w' : 'm';

  const runden = lobbySicht.runden || [];

  if (!runden.length) {
    $('rundenListe').innerHTML = '<p class="klein">Es gibt noch keine Runde. Eröffnen Sie oben die erste.</p>';
    return;
  }

  $('rundenListe').innerHTML = runden.map((r, i) => {
    const lage = r.beendet ? `beendet, Kaiser ist ${esc(r.sieger)}`
      : r.gestartet ? `läuft, Anno ${r.jahr}, ${phaseName(r.phase)}`
      : 'wartet auf Mitspieler';
    const regeln = r.regelwerkName || 'Original 1984';
    const plaetze = r.spieler.length
      ? r.spieler.map(s => `<span class="platz${s.selbst ? ' selbst' : ''}">${esc(s.name)} <span class="klein">${esc(s.region)}</span></span>`).join('')
      : '<span class="klein">noch niemand</span>';

    let knoepfe = '';
    if (r.dabei) {
      knoepfe = `<button data-oeffnen="${esc(r.id)}" class="gut">${r.gestartet ? 'Weiterspielen' : 'Zum Warteraum'}</button>`;
      if (!r.gestartet) knoepfe += `<button data-verlassen="${esc(r.id)}" class="gefahr">Platz aufgeben</button>`;
    } else if (r.beitretbar) {
      // Das Fuerstentum richtet sich nach der Sitzreihenfolge, wie im Original.
      knoepfe = `
        <span class="klein">Sie regieren ${esc(r.naechsteRegion)}.</span>
        <select data-anrede="${esc(r.id)}">
          <option value="m"${konto && !konto.weiblich ? ' selected' : ''}>männlich</option>
          <option value="w"${konto && konto.weiblich ? ' selected' : ''}>weiblich</option>
        </select>
        <button data-beitreten="${esc(r.id)}" class="gut">Platz nehmen</button>`;
    } else {
      knoepfe = `<span class="klein">${r.gestartet ? 'Läuft bereits, kein Einstieg mehr.' : 'Voll besetzt.'}</span>`;
    }

    return `<div class="runde${r.dabei ? ' meine' : ''}">
      <div class="rundenkopf">
        <span class="rundenname">${esc(r.name)}</span>
        <span class="klein">${lage}</span>
        <span class="klein">${r.spielerzahl} von ${r.maxSpieler} Plätzen</span>
      </div>
      <div class="plaetze">${plaetze}</div>
      <div class="reihe">${knoepfe}</div>
      <div class="klein"><b>${esc(regeln)}.</b> Planung ${r.planungsSekunden ? r.planungsSekunden + ' s' : 'ohne Frist'},
        Diplomatie ${r.diplomatieSekunden ? r.diplomatieSekunden + ' s' : 'ohne Frist'}${
        r.angelegtVon ? ', eröffnet von ' + r.angelegtVon : ''}${
        r.angelegt ? ' am ' + datum(r.angelegt) : ''}</div>
    </div>`;
  }).join('');

  const liste = $('rundenListe');
  liste.querySelectorAll('[data-oeffnen]').forEach(b =>
    b.onclick = () => sende('spielOeffnen', { spielId: b.dataset.oeffnen }));
  liste.querySelectorAll('[data-verlassen]').forEach(b =>
    b.onclick = () => sende('spielVerlassen', { spielId: b.dataset.verlassen }));
  liste.querySelectorAll('[data-beitreten]').forEach(b => b.onclick = () => {
    const id = b.dataset.beitreten;
    const anrede = liste.querySelector(`[data-anrede="${id}"]`);
    sende('spielBeitreten', { spielId: id, weiblich: anrede ? anrede.value === 'w' : false });
  });
}

// ------------------------------------------------------------------ Verwaltung

function verwaltungAufbauen() {
  $('verwaltungKnopf').onclick = () => {
    const offen = !$('verwaltungKarte').classList.contains('verstecken');
    if (offen) { $('verwaltungKarte').classList.add('verstecken'); return; }
    sende('verwaltung');
  };
}

function verwaltungZeichnen() {
  if (!verwaltung || !konto || !konto.admin) return;
  $('verwaltungKarte').classList.remove('verstecken');
  const b = verwaltung.bremse;

  const zeilen = verwaltung.konten.map(k => {
    const knoepfe = [];
    const eigen = k.name === konto.name;
    knoepfe.push(`<button data-kennwort="${esc(k.name)}">Kennwort neu</button>`);
    if (verwaltung.post && verwaltung.post.bereit) {
      knoepfe.push(`<button data-erneut="${esc(k.name)}">${k.email ? 'Einladung erneut' : 'Einladen'}</button>`);
    }
    if (!eigen) {
      knoepfe.push(`<button data-sperren="${esc(k.name)}" data-wert="${k.gesperrt ? '0' : '1'}">${k.gesperrt ? 'Entsperren' : 'Sperren'}</button>`);
      knoepfe.push(`<button data-admin="${esc(k.name)}" data-wert="${k.admin ? '0' : '1'}">${k.admin ? 'Verwaltung entziehen' : 'Zum Verwalter'}</button>`);
      knoepfe.push(`<button data-loeschen="${esc(k.name)}" class="gefahr">Löschen</button>`);
    }
    return `<tr class="${k.gesperrt ? 'gesperrt' : ''}">
      <td>${esc(k.name)}${k.admin ? ' <span class="rolle">Verwaltung</span>' : ''}${k.gesperrt ? ' <span class="klein">gesperrt</span>' : ''}</td>
      <td class="klein">${k.email ? esc(k.email) : '<span style="opacity:.5">keine Mail</span>'}${
        k.eingeladen ? '<br>eingeladen ' + datum(k.eingeladen) + (k.kennwortGeaendert ? '' : ', Zahl noch unverändert') : ''}</td>
      <td class="klein">${datum(k.angelegt)}${k.angelegtVon ? '<br>von ' + k.angelegtVon : ''}</td>
      <td class="klein">${k.zuletzt ? datum(k.zuletzt) : 'nie'}</td>
      <td class="zahl">${k.sitzungen}</td>
      <td>${knoepfe.join('')}</td>
    </tr>`;
  }).join('');

  $('verwaltungInhalt').innerHTML = `
    <div class="schalter">
      <span>Offene Registrierung:
        <span class="lage ${b.registrierungOffen ? 'offen' : 'zu'}">${b.registrierungOffen ? 'offen' : 'geschlossen'}</span></span>
      <button data-reg="${b.registrierungOffen ? '0' : '1'}">
        ${b.registrierungOffen ? 'Registrierung schließen' : 'Registrierung öffnen'}</button>
    </div>
    <p class="klein">Ist sie geschlossen, legt nur die Verwaltung neue Konten an.
       Ist sie offen, gilt zusätzlich die Bremse: höchstens ${b.grenzen.proQuelleStunde} Konten
       je Herkunftsadresse und Stunde, ${b.grenzen.proQuelleTag} je Tag,
       ${b.grenzen.gesamtStunde} insgesamt je Stunde und ${b.grenzen.hoechstzahl} Konten überhaupt.</p>

    <div class="bremse">
      <div class="wert"><div class="name">Konten</div><div class="zahl">${b.konten} von ${b.grenzen.hoechstzahl}</div></div>
      <div class="wert"><div class="name">Neu, letzte Stunde</div><div class="zahl">${b.letzteStunde} von ${b.grenzen.gesamtStunde}</div></div>
      <div class="wert"><div class="name">Neu, letzter Tag</div><div class="zahl">${b.letzterTag}</div></div>
    </div>

    <h3>Spieler einladen</h3>
    ${verwaltung.post && verwaltung.post.bereit ? `
    <p class="klein">Der Server würfelt ein Kennwort und schickt es an die angegebene
       Adresse. Sie selbst bekommen sie nicht zu sehen. Absender ist
       ${esc(verwaltung.post.absender)}, das Tor steht unter ${esc(verwaltung.post.adresse)}.</p>
    <div class="reihe">
      <div><label for="eName">Name des Fürsten</label><input id="eName" maxlength="14" style="width:160px"></div>
      <div><label for="eMail">Mailadresse</label><input id="eMail" type="email" style="width:230px"></div>
      <div><label for="eAnrede">Anrede</label>
        <select id="eAnrede"><option value="m">männlich</option><option value="w">weiblich</option></select></div>
      <div><label for="eAdmin">Rolle</label>
        <select id="eAdmin"><option value="0">Spieler</option><option value="1">Verwalter</option></select></div>
      <button data-einladen="1" class="gut">Einladen</button>
      <button data-postpruefen="1">Mailserver prüfen</button>
    </div>` : `
    <p class="meldung warnung">Der Mailversand ist nicht eingerichtet. Setzen Sie
      KAISER_SMTP_HOST, KAISER_SMTP_USER, KAISER_SMTP_PASS und KAISER_SMTP_VON,
      dann lassen sich Spieler per Mail einladen.</p>`}

    <h3>Konto ohne Mail anlegen</h3>
    <div class="reihe">
      <div><label for="vName">Name</label><input id="vName" maxlength="14" style="width:160px"></div>
      <div><label for="vKennwort">Kennwort</label><input id="vKennwort" type="text" style="width:160px"></div>
      <div><label for="vAdmin">Rolle</label>
        <select id="vAdmin"><option value="0">Spieler</option><option value="1">Verwalter</option></select></div>
      <button data-neu="1">Anlegen</button>
    </div>
    <p class="klein">Hier steht das Kennwort im Klartext, damit Sie es mündlich weitergeben
       können. Bitten Sie die Person, es danach selbst zu ändern.</p>

    <h3>Konten</h3>
    <div class="tabellenhuelle"><table class="nutzerliste">
      <tr><th>Name</th><th>Mail</th><th>Angelegt</th><th>Zuletzt angemeldet</th><th class="zahl">Sitzungen</th><th>Verwalten</th></tr>
      ${zeilen}
    </table></div>`;

  const z = $('verwaltungInhalt');
  z.querySelector('[data-reg]').onclick = e =>
    sende('registrierungSetzen', { offen: e.target.dataset.reg === '1' });
  z.querySelector('[data-neu]').onclick = () => {
    const name = $('vName').value.trim();
    const kennwort = $('vKennwort').value;
    if (!name || kennwort.length < 4) { fehlerZeigen('Name und ein Kennwort mit mindestens 4 Zeichen angeben.'); return; }
    sende('nutzerAnlegen', { name, kennwort, admin: $('vAdmin').value === '1' });
    $('vName').value = ''; $('vKennwort').value = '';
  };
  const einladen = z.querySelector('[data-einladen]');
  if (einladen) einladen.onclick = () => {
    const name = $('eName').value.trim();
    const email = $('eMail').value.trim();
    if (!name || !email) { fehlerZeigen('Name und Mailadresse angeben.'); return; }
    sende('nutzerEinladen', {
      name, email,
      weiblich: $('eAnrede').value === 'w',
      admin: $('eAdmin').value === '1'
    });
    $('eName').value = ''; $('eMail').value = '';
  };
  const pruefen = z.querySelector('[data-postpruefen]');
  if (pruefen) pruefen.onclick = () => sende('postPruefen');
  z.querySelectorAll('[data-erneut]').forEach(b => b.onclick = () => {
    const name = b.dataset.erneut;
    const bekannt = verwaltung.konten.find(x => x.name === name);
    const email = prompt(`Einladung für ${name} senden an:`, bekannt && bekannt.email ? bekannt.email : '');
    if (email == null || !email.trim()) return;
    if (!confirm(`${name} bekommt ein neues Kennwort per Mail. Die bisherige gilt dann nicht mehr. Fortfahren?`)) return;
    sende('nutzerErneutEinladen', { name, email: email.trim() });
  });

  z.querySelectorAll('[data-kennwort]').forEach(b => b.onclick = () => {
    const neueZahl = prompt(`Neues Kennwort für ${b.dataset.zahl} (mindestens 4 Zeichen):`);
    if (neueZahl == null) return;
    if (neueZahl.length < 4) { fehlerZeigen('Das Kennwort braucht mindestens 4 Zeichen.'); return; }
    sende('nutzerKennwortSetzen', { name: b.dataset.zahl, kennwort: neueZahl });
  });
  z.querySelectorAll('[data-sperren]').forEach(b => b.onclick = () =>
    sende('nutzerSperren', { name: b.dataset.sperren, gesperrt: b.dataset.wert === '1' }));
  z.querySelectorAll('[data-admin]').forEach(b => b.onclick = () =>
    sende('nutzerAdmin', { name: b.dataset.admin, admin: b.dataset.wert === '1' }));
  z.querySelectorAll('[data-loeschen]').forEach(b => b.onclick = () => {
    if (!confirm(`Konto ${b.dataset.loeschen} wirklich löschen? Plätze in noch nicht gestarteten Runden gehen verloren.`)) return;
    sende('nutzerLoeschen', { name: b.dataset.loeschen });
  });
}

const phaseName = p => ({ planung: 'Planung', diplomatie: 'Diplomatie', auswertung: 'Auswertung', ende: 'Spielende' }[p] || p);

/**
 * Öffnet eine Runde, die in der Adresse steht: /?runde=abendrunde
 * So lässt sich eine Runde als Lesezeichen ablegen. Wer dort keinen Platz hat,
 * bleibt in der Lobby stehen.
 */
let adresseSchonGefolgt = false;
function rundeAusAdresse() {
  if (adresseSchonGefolgt) return;
  const wunsch = gewuenschteRunde;      // beim Start gemerkt, siehe unten
  if (!wunsch) { adresseSchonGefolgt = true; return; }
  const r = (lobbySicht.runden || []).find(x => x.id === wunsch || x.name === wunsch);
  adresseSchonGefolgt = true;
  if (r && r.dabei) sende('spielOeffnen', { spielId: r.id });
  else if (r) fehlerZeigen(`In der Runde "${r.name}" haben Sie noch keinen Platz.`);
  else fehlerZeigen(`Die Runde "${wunsch}" gibt es nicht.`);
}

// ------------------------------------------------------------------ Anzeige

function zeichnen() {
  if (!zustand || !zustand.ich) return;
  adresseSetzen(zustand.spielId);
  bildschirm(zustand.gestartet ? 'spiel' : 'warteraum');
  if (!zustand.gestartet) { warteraumZeichnen(); return; }

  $('jahr').textContent = 'Anno ' + zustand.jahr;
  $('anrede').textContent = `${esc(zustand.ich.anrede)} · ${esc(zustand.name)}`
    + (zustand.regelwerk && zustand.regelwerk.id !== 'original' ? ' · ' + zustand.regelwerk.name : '');
  const p = $('phaseAnzeige');
  p.textContent = { planung: 'Planung', diplomatie: 'Diplomatie', auswertung: 'Auswertung', ende: 'Spielende' }[zustand.phase];
  p.className = 'phase ' + zustand.phase;

  werteZeichnen();
  reichZeichnen();
  karteZeichnen();
  spielstandZeichnen();
  meldungenZeichnen();
  planungZeichnen();
  diplomatieZeichnen();
  aufstellungZeichnen();
  berichtZeichnen();
  zeremonienPruefen();
}

function warteraumZeichnen() {
  $('warteraumTitel').textContent = zustand.name || 'Kaiser';
  $('planungsZeit').value = zustand.planungsSekunden ?? 300;
  $('diploZeit').value = zustand.diplomatieSekunden ?? 120;
  const t = $('warteListe');
  t.innerHTML = '<tr><th>Spieler</th><th>Region</th></tr>' +
    zustand.spieler.map(s => `<tr class="${s.selbst ? 'selbst' : ''}"><td>${esc(s.anrede)}</td><td>${esc(s.region)}</td></tr>`).join('');
}

function werteZeichnen() {
  const i = zustand.ich;
  // Gezeigt wird, was auch auf dem C64 zu sehen war. Die Spielstandtabelle des
  // Originals (Zeile 614) nennt Punkte, Soldaten, Land, Geld und Einwohner,
  // Bild 1 und Bild 4 den Rest. Nicht dabei: die Moral und die Kennzahl des
  // Titelaufstiegs -- die rechnet das Programm im Verborgenen.
  const werte = [
    ['Titel', i.titelName], ['Region', i.regionName], ['Punkte', zahl(i.punkte)],
    ['Land', zahl(i.land) + ' ha'],
    ['Staatskasse', zahl(i.kasse) + ' Taler'], ['Einwohner', zahl(i.einwohner)],
    ['Kornreserve', zahl(i.korn) + ' Maß'], ['Soldaten', zahl(i.soldaten)],
    ['Märkte', i.maerkte], ['Mühlen', i.muehlen],
    ['Palast', i.palast + '/16'], ['Kathedrale', i.kathedrale + '/14'],
    ['Kavallerie', i.kavallerie], ['Artillerie', i.artillerie], ['Infanterie', i.infanterie],
    ['Miliz', i.miliz]
  ];
  $('werte').innerHTML = werte.map(([n, v]) =>
    `<div class="wert"><div class="name">${n}</div><div class="zahl">${esc(v)}</div></div>`).join('');

  speicherZeigen($('kornBalken'), i, 4);
}

/**
 * Setzt den Kornspeicher des Originals in einen Kasten, mit der Beschriftung
 * daneben. Der Speicher zeigt vier Fuenftel der Reserve, gemessen am Bedarf.
 */
function speicherZeigen(ziel, i, punkt = 4) {
  if (!ziel) return;
  ziel.innerHTML = `<div class="speicherhuelle">
      <canvas class="kornspeicher"></canvas>
      <div>
        <div class="klein">Kornspeicher</div>
        <div>${zahl(i.korn)} Maß im Vorrat</div>
        <div class="klein">Der Speicher zeigt vier Fünftel davon, gemessen am
          Jahresbedarf von ${zahl(i.bedarf)} Maß. Ist er voll, reicht die Reserve.</div>
      </div>
    </div>`;
  kornspeicherMalen(ziel.querySelector('canvas'), i.korn, i.bedarf, punkt);
}

function spielstandZeichnen() {
  $('spielstand').innerHTML =
    '<tr><th>Fürst</th><th class="zahl">Punkte</th><th class="zahl">Soldaten</th><th class="zahl">Land</th><th class="zahl">Taler</th><th>Status</th></tr>' +
    zustand.spieler.map(s => {
      const status = s.tot ? `<span class="tot">verschieden ${s.gestorbenIn || ''}</span>`
        : s.aussetzen ? '<span class="wartet">setzt aus</span>'
        : (zustand.phase === 'diplomatie'
            ? (s.diplomatieFertig ? '<span class="fertig">bereit</span>' : '<span class="wartet">wählt</span>')
            : (s.fertig ? '<span class="fertig">fertig</span>' : '<span class="wartet">plant</span>'));
      return `<tr class="${s.selbst ? 'selbst' : ''}${s.tot ? ' verstorben' : ''}">
        <td>${esc(s.titel + ' ' + s.name)}<br><span class="klein">${esc(s.region)}</span></td>
        <td class="zahl">${zahl(s.punkte)}</td><td class="zahl">${zahl(s.soldaten)}</td>
        <td class="zahl">${zahl(s.land)}</td><td class="zahl">${zahl(s.kasse)}</td>
        <td>${status}</td></tr>`;
    }).join('');
}

function meldungenZeichnen() {
  const m = (zustand.runde && zustand.runde.meldungen) || [];
  $('meldungen').innerHTML = m.length
    ? m.map(x => `<div class="meldung ${x.art === 'warnung' || x.art === 'bankrott' || x.art === 'amtsenthebung' || x.art === 'tod' ? 'warnung' : (x.art === 'titel' ? 'gut' : '')}">${esc(x.text)}
        ${x.verlust ? '<ul>' + x.verlust.map(v => `<li>${zahl(v.anzahl)} ${esc(v.was)}</li>`).join('') + '</ul>' : ''}</div>`).join('')
    : '<p class="klein">Keine Meldungen.</p>';
}

// ------------------------------------------------------------------ Planung

/**
 * Die Planung folgt dem Original: statt einer langen Seite geht man Schritt
 * für Schritt durch einzelne Bildschirme. Welche erreichbar sind, ergibt sich
 * aus dem Serverzustand: vor der Kornverteilung nur 1 bis 3, danach 4 und 5,
 * nach dem Steuereinzug 6 bis 8.
 */
const SCHRITTE = [
  { nr: 1, kurz: 'Ernte',    name: 'Ernte und Preise' },
  { nr: 2, kurz: 'Markt',    name: 'Markt' },
  { nr: 3, kurz: 'Korn',     name: 'Korn an das Volk verteilen' },
  { nr: 4, kurz: 'Volk',     name: 'Ihr Volk' },
  { nr: 5, kurz: 'Steuern',  name: 'Steuern' },
  { nr: 6, kurz: 'Einkäufe', name: 'Staatseinkäufe' },
  { nr: 7, kurz: 'Militär',  name: 'Militär und Krieg' },
  { nr: 8, kurz: 'Ende',     name: 'Zug beenden' }
];
let planungsSchritt = 1;
let letzteRunde = null;

/** Welche Schritte sind gerade erlaubt? */
function schrittGrenzen(r) {
  if (r.verteiltesKorn === null) return { min: 1, max: 3 };
  if (!r.steuernEingezogen) return { min: 4, max: 5 };
  return { min: 6, max: 8 };
}

function planungZeichnen() {
  const karte = $('planungKarte');
  karte.classList.toggle('verstecken', zustand.phase !== 'planung');
  if (zustand.phase !== 'planung') { schrittLeisteVerbergen(); return; }
  const r = zustand.runde, i = zustand.ich;
  const ziel = $('planungInhalt');

  $('hilfeKnopf').classList.toggle('verstecken', !!(r.aussetzen || r.fertig));
  if (r.tot) {
    schrittLeisteVerbergen();
    hilfeSchliessen();
    const selbst = zustand.spieler.find(s => s.selbst);
    ziel.innerHTML = `<p class="meldung warnung">Ihr Regent ist Anno
      ${(selbst && selbst.gestorbenIn) || ''} verschieden. Das Fürstentum bleibt ohne Herrn,
      Sie können nicht mehr handeln.</p>
      <p class="klein">Die übrigen Fürsten spielen weiter. Sie können zusehen.</p>`;
    return;
  }
  if (r.aussetzen) {
    schrittLeisteVerbergen();
    hilfeSchliessen();
    ziel.innerHTML = '<p class="meldung warnung">Sie sind in diesem Jahr Ihres Amtes enthoben und können nicht handeln.</p>';
    return;
  }
  if (r.fertig) {
    schrittLeisteVerbergen();
    hilfeSchliessen();
    const offen = zustand.spieler.filter(s => !s.fertig && !s.aussetzen && !s.tot).map(s => s.name);
    ziel.innerHTML = `<p class="meldung gut">Ihr Zug ist beendet.</p>
      <p class="klein">${offen.length
        ? 'Es fehlen noch: ' + offen.join(', ') + '. Sobald alle fertig sind, geht es weiter, auch vor Ablauf der Zeit.'
        : 'Alle sind fertig, die Runde wird abgerechnet.'}</p>`;
    return;
  }

  // Bei einem neuen Jahr wieder vorn anfangen
  const kennung = `${zustand.spielId}/${zustand.jahr}`;
  if (letzteRunde !== kennung) { letzteRunde = kennung; planungsSchritt = 1; }

  const g = schrittGrenzen(r);
  planungsSchritt = Math.max(g.min, Math.min(g.max, planungsSchritt));

  const inhalt = {
    1: seiteErnte, 2: seiteMarkt, 3: seiteVerteilung, 4: seiteVolk,
    5: seiteSteuern, 6: seiteEinkauf, 7: seiteMilitaer, 8: seiteAbschluss
  }[planungsSchritt](r, i);

  schrittLeisteZeichnen(g);
  ziel.innerHTML = inhalt + fussLeiste(g, r);
  ereignisseBinden(r, i);
  hilfeMitziehen();
}

/** Zeichnet die Schrittleiste über der ganzen Seitenbreite. */
function schrittLeisteZeichnen(g) {
  const leiste = $('schrittLeiste');
  leiste.classList.remove('verstecken');
  leiste.innerHTML = SCHRITTE.map(s => {
    const lage = s.nr === planungsSchritt ? 'jetzt'
      : s.nr < g.min ? 'erledigt'
      : s.nr > g.max ? 'spaeter' : 'offen';
    const anklickbar = lage === 'offen';
    const tag = anklickbar ? 'button' : 'span';
    return `<${tag} class="stufe ${lage}" title="${esc(s.name)}"${anklickbar ? ` data-schritt="${s.nr}"` : ''}>
      <span class="nr">${s.nr}</span><span class="was">${s.kurz}</span>
    </${tag}>`;
  }).join('');
  leiste.querySelectorAll('[data-schritt]').forEach(b => b.onclick = () => {
    planungsSchritt = Number(b.dataset.schritt);
    planungZeichnen();
  });
}

/** Blendet die Leiste aus, wenn gerade nicht geplant wird. */
function schrittLeisteVerbergen() {
  const leiste = $('schrittLeiste');
  if (leiste) { leiste.classList.add('verstecken'); leiste.innerHTML = ''; }
}

/** Vor, zurück und jederzeit fertig werden. */
/**
 * Die Haupthandlung eines Schritts. Sie steht in der Fussleiste zwischen
 * Zurueck und Zug beenden, damit alle Knoepfe, die den Zug voranbringen,
 * an derselben Stelle liegen.
 */
function haupttaste(r) {
  if (planungsSchritt === 3 && r.verteiltesKorn === null) {
    return '<button data-a="kornVerteilen" class="gut">Verteilen und weiter</button>';
  }
  if (planungsSchritt === 5 && !r.steuernEingezogen) {
    return '<button data-a="steuernEinziehen" class="gut">Steuern einziehen und weiter</button>';
  }
  return '';
}

function fussLeiste(g, r) {
  const zurueck = planungsSchritt > g.min;
  const weiter = planungsSchritt < g.max;
  const offeneNamen = zustand.spieler.filter(s => !s.fertig && !s.aussetzen && !s.tot && !s.selbst).map(s => s.name);
  return `<div class="abschluss">
    <div class="reihe">
      ${zurueck ? '<button data-nav="-1">&lt; Zurück</button>' : ''}
      ${haupttaste(r)}
      ${weiter ? '<button data-nav="1" class="gut">Weiter &gt;</button>' : ''}
      <button data-a="zugBeenden" class="${planungsSchritt === 8 ? 'gut' : ''}">Zug beenden</button>
    </div>
    <p class="klein">Sobald alle Spieler fertig sind, geht es sofort weiter, die Frist muss nicht ablaufen.${
      offeneNamen.length ? ' Es planen noch: ' + offeneNamen.join(', ') + '.' : ' Sie sind der oder die Letzte.'}</p>
  </div>`;
}

// ---------------------------------------------------------------- die Seiten

function seiteErnte(r, i) {
  const w = ['Dürre', 'Regen', 'Gewöhnliche Ernte', 'Gutes Wetter', 'Tolles Wetter'][r.markt.wetter - 1];
  const wt = ['Hungersnot droht', 'Schlechte Ernte', '', 'Reiche Ernte', 'Rekordernte'][r.markt.wetter - 1];
  const anteil = Math.min(1, i.korn / Math.max(1, i.bedarf));
  return `<h3>Wir schreiben das Jahr ${zustand.jahr}</h3>
    <div class="meldung"><strong>${w}</strong> ${wt}<br>
      ${r.markt.verfault}% Ihrer Kornreserven sind verfault.</div>
    <div class="tabellenhuelle"><table>
      <tr><td>Kornreserve</td><td class="zahl">${zahl(i.korn)}</td><td>Maß</td></tr>
      <tr><td>Nötiges Korn</td><td class="zahl">${zahl(i.bedarf)}</td><td>Maß</td></tr>
      <tr><td>Kornpreis</td><td class="zahl">${zahl(r.markt.kornpreis)}</td><td>Taler je 1000 Maß</td></tr>
      <tr><td>Landpreis</td><td class="zahl">${r.markt.landpreis.toFixed(1)}</td><td>Taler je Hektar</td></tr>
      <tr><td>Landbesitz</td><td class="zahl">${zahl(i.land)}</td><td>Hektar</td></tr>
      <tr><td>Vermögen</td><td class="zahl">${zahl(i.kasse)}</td><td>Taler</td></tr>
    </table></div>
    <div id="speicherErnte"></div>
    ${anteil < 1 ? '<p class="meldung warnung">Die Reserve deckt den Bedarf nicht.</p>' : ''}`;
}

/**
 * Was ein Kornverkauf einbringt. Das Original rechnet den Kauf mit c8/1000
 * (Zeile 497), den Verkauf aber mit c8/1111 (Zeile 500): der Haendler behaelt
 * rund ein Zehntel. Beim Land steht dieselbe Spanne ausdruecklich da, als
 * c7*.9 in Zeile 505. Abgerundet, damit hier nie mehr steht, als hinterher in
 * der Kasse landet.
 */
const verkaufspreis = kornpreis => Math.floor(kornpreis * 1000 / 1111);

function seiteMarkt(r, i) {
  return `<h3>Markt</h3>
    <p class="klein">Kornpreis ${zahl(r.markt.kornpreis)} Taler je 1000 Maß, der Verkauf
       bringt ${zahl(verkaufspreis(r.markt.kornpreis))} Taler je 1000 Maß.
       Landpreis ${r.markt.landpreis.toFixed(1)} Taler je Hektar, der Verkauf bringt
       ${(r.markt.landpreis * 0.9).toFixed(1)} Taler je Hektar.
       Sie haben ${zahl(i.kasse)} Taler, ${zahl(i.korn)} Maß Korn und ${zahl(i.land)} Hektar Land.</p>
    <div class="reihe">
      <div><label for="mKorn">Korn (Maß)</label><input id="mKorn" type="number" min="0" value="1000" style="width:130px"></div>
      <button data-a="kornKaufen">Korn kaufen</button>
      <button data-a="kornVerkaufen">Korn verkaufen</button>
    </div>
    <div class="reihe">
      <div><label for="mLand">Land (Hektar)</label><input id="mLand" type="number" min="0" value="500" style="width:130px"></div>
      <button data-a="landKaufen">Land kaufen</button>
      <button data-a="landVerkaufen">Land verkaufen</button>
    </div>
    <div id="speicherMarkt"></div>
    ${zustand.freiesLand !== null && zustand.freiesLand !== undefined
      ? `<p class="meldung ${zustand.freiesLand > 0 ? '' : 'warnung'}">Im Reich sind noch
          <b>${zahl(zustand.freiesLand)} Hektar</b> herrenlos. Ist der Vorrat aufgebraucht,
          wechselt Land nur noch durch Krieg den Besitzer.</p>`
      : ''}
    <p class="klein">Sie können hier beliebig oft handeln. Mindestens ein Hektar Land muss bleiben.
       Gekauft wird zum vollen Preis, verkauft zu neun Zehnteln davon &mdash; bei Korn wie
       bei Land. Bei jeder Verkaufsaktion werden zehn Prozent Provision abgezogen, so
       steht es im Handbuch.</p>`;
}

function seiteVerteilung(r, i) {
  const min = Math.trunc(i.korn / 5), max = Math.trunc(i.korn * 0.8);
  const vorschlag = Math.min(max, Math.max(min, i.bedarf));
  return `<h3>Korn an das Volk verteilen</h3>
    <p>Das Volk benötigt <strong>${zahl(i.bedarf)} Maß</strong>.
       Erlaubt sind ${zahl(min)} bis ${zahl(max)} Maß, also 20 bis 80 Prozent Ihrer Reserve.</p>
    <div class="reihe">
      <div><label for="vKorn">Menge</label><input id="vKorn" type="number" min="0" value="${vorschlag}" style="width:150px"></div>
      <button data-v="max">Maximum</button>
      <button data-v="bedarf">Benötigtes</button>
      <button data-v="min">Minimum</button>
    </div>
    <div id="speicherVerteilung"></div>
    <p class="klein">Zu wenig Korn kostet Menschenleben, zu viel lockt Einwanderer an.
       Nach dem Verteilen lässt sich nichts mehr am Markt ändern.</p>`;
}

function seiteVolk(r) {
  const b = r.bevoelkerung, e = r.einnahmen;
  const zeilen = [];
  if (b.geboren) zeilen.push(`<tr><td>Geboren</td><td class="zahl">${zahl(b.geboren)}</td></tr>`);
  if (b.gestorben) zeilen.push(`<tr><td>Gestorben</td><td class="zahl">${zahl(b.gestorben)}</td></tr>`);
  if (b.einwanderer) zeilen.push(`<tr><td>Eingewandert</td><td class="zahl">${zahl(b.einwanderer)}</td></tr>`);
  if (b.ausgewandert) zeilen.push(`<tr><td>Ausgewandert</td><td class="zahl">${zahl(b.ausgewandert)}</td></tr>`);
  return `<h3>Ihr Volk</h3>
    <p class="klein">Sie haben ${zahl(b.ausgegeben)} Maß Korn verteilt.</p>
    <div class="tabellenhuelle"><table>${zeilen.join('') ||
      '<tr><td colspan="2" class="klein">Es hat sich nichts getan.</td></tr>'}</table></div>
    ${e ? `<h3>Einnahmen und Sold</h3>
    <div class="tabellenhuelle"><table>
      <tr><td>Märkte</td><td class="zahl">${zahl(e.maerkte)}</td><td>Taler</td></tr>
      <tr><td>Mühlen</td><td class="zahl">${zahl(e.muehlen)}</td><td>Taler</td></tr>
      <tr><td>Sold für die Armee</td><td class="zahl">−${zahl(e.sold)}</td><td>Taler</td></tr>
    </table></div>` : ''}`;
}

function seiteSteuern(r, i) {
  const st = r.steuerVorschau || { zoll: 0, mwst: 0, est: 0, gold: 0, summe: 0 };
  return `<h3>Steuern</h3>
    <p class="klein">Hohe Sätze bringen Geld, vertreiben aber Einwohner.
       Ändern Sie die Werte und sehen Sie sich die Vorschau an.</p>
    <div class="reihe">
      <div><label for="sZoll">Zoll %</label><input id="sZoll" type="number" min="0" max="99" value="${i.zoll}" style="width:80px"></div>
      <div><label for="sMwst">Mehrwertst. %</label><input id="sMwst" type="number" min="0" max="99" value="${i.mwst}" style="width:80px"></div>
      <div><label for="sEst">Einkommenst. %</label><input id="sEst" type="number" min="0" max="99" value="${i.est}" style="width:80px"></div>
      <div><label for="sJustiz">Justiz</label>
        <select id="sJustiz">${['Sehr fair', 'Bescheiden', 'Hart', 'Gierig']
          .map((n, k) => `<option value="${k + 1}" ${i.justiz === k + 1 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <button data-a="steuernSetzen">Vorschau</button>
    </div>
    <div class="tabellenhuelle"><table>
      <tr><th>Quelle</th><th class="zahl">Taler</th></tr>
      <tr><td>Zoll</td><td class="zahl">${zahl(st.zoll)}</td></tr>
      <tr><td>Mehrwertsteuer</td><td class="zahl">${zahl(st.mwst)}</td></tr>
      <tr><td>Einkommensteuer</td><td class="zahl">${zahl(st.est)}</td></tr>
      <tr><td>Justiz</td><td class="zahl">${zahl(st.gold)}</td></tr>
      <tr><th>Summe</th><th class="zahl">${zahl(st.summe)}</th></tr>
    </table></div>
    <p class="klein">Danach lassen sich die Sätze für dieses Jahr nicht mehr ändern.</p>`;
}

function seiteEinkauf(r, i) {
  const d = Math.trunc(i.land / 1000);
  const moeglich = (bedingung, grund) => bedingung ? '' : `<span class="klein"> ${grund}</span>`;
  return `<h3>Staatseinkäufe</h3>
    <p class="klein">Sie haben ${zahl(i.kasse)} Taler und ${zahl(i.land)} Hektar Land.
       Je 1000 Hektar trägt Ihr Land einen Markt und eine Mühle.</p>
    <div class="tabellenhuelle"><table class="weit">
      <tr><th>Bauwerk</th><th class="zahl">Preis</th><th class="zahl">Bestand</th><th></th></tr>
      <tr><td>Marktplatz</td><td class="zahl">1.000</td><td class="zahl">${i.maerkte}</td>
        <td><button data-bau="markt">Bauen</button>${moeglich(i.maerkte < d - 1, 'braucht mehr Land')}</td></tr>
      <tr><td>Kornmühle</td><td class="zahl">2.000</td><td class="zahl">${i.muehlen}</td>
        <td><button data-bau="muehle">Bauen</button>${moeglich(i.muehlen < d - 1, 'braucht mehr Land')}</td></tr>
      <tr><td>Palast (Teil)</td><td class="zahl">5.000</td><td class="zahl">${i.palast} von 16</td>
        <td><button data-bau="palast">Bauen</button>${moeglich(i.land >= 13000 && i.palast < 16, 'ab 13.000 Hektar')}</td></tr>
      <tr><td>Kathedrale (Teil)</td><td class="zahl">9.000</td><td class="zahl">${i.kathedrale} von 14</td>
        <td><button data-bau="kathedrale">Bauen</button>${moeglich(i.land >= 25000 && i.kathedrale < 14, 'ab 25.000 Hektar')}</td></tr>
    </table></div>
    <p class="klein">Märkte und Mühlen bringen jedes Jahr Geld. Palast und Kathedrale
       brauchen Sie für die Kaiserwürde.</p>`;
}

function seiteMilitaer(r, i) {
  const gegner = zustand.spieler.filter(s => !s.selbst && !s.tot);
  let h = `<h3>Militär</h3>
    <p class="klein">Sie haben ${zahl(i.soldaten)} Soldaten, davon ${zahl(i.soeldner)} Söldner,
       und ${zahl(i.kasse)} Taler.</p>
    <div class="tabellenhuelle"><table class="weit">
      <tr><th>Gattung</th><th class="zahl">Bestand</th><th class="zahl">Rekruten</th><th class="zahl">Söldner</th><th></th></tr>
      <tr><td>Kavallerie</td><td class="zahl">${i.kavallerie}</td>
        <td class="zahl">${zahl(r.preise.kavallerie + 600)}</td>
        <td class="zahl">${zahl(r.preise.kavallerie + 600 + Math.trunc(r.preise.kavallerie / 2))}</td>
        <td><button data-truppe="kavallerie">Rekrutieren</button><button data-soeldner="kavallerie">Söldner</button></td></tr>
      <tr><td>Artillerie</td><td class="zahl">${i.artillerie}</td>
        <td class="zahl">${zahl(r.preise.artillerie + 400)}</td>
        <td class="zahl">${zahl(r.preise.artillerie + 400 + Math.trunc(r.preise.artillerie / 2))}</td>
        <td><button data-truppe="artillerie">Rekrutieren</button><button data-soeldner="artillerie">Söldner</button></td></tr>
      <tr><td>Infanterie</td><td class="zahl">${i.infanterie}</td>
        <td class="zahl">${zahl(r.preise.infanterie + 200)}</td>
        <td class="zahl">${zahl(r.preise.infanterie + 200 + Math.trunc(r.preise.infanterie / 2))}</td>
        <td><button data-truppe="infanterie">Rekrutieren</button><button data-soeldner="infanterie">Söldner</button></td></tr>
      <tr><td>Miliz</td><td class="zahl">${i.miliz}</td><td colspan="3" class="klein">ergibt sich aus Ihren Bauwerken</td></tr>
    </table></div>
    <p class="klein">Rekruten kosten Einwohner, Söldner nicht, dafür mehr Geld.</p>
    <div class="reihe"><button data-a="manoever">Manöver abhalten (${zahl(4 * i.soldaten + 1000)} Taler)</button></div>
    <h3>Krieg</h3>`;

  if (i.titel < 2) {
    h += `<p class="klein">Es ist noch zu früh.</p>`;
  } else if (r.krieg) {
    const z = zustand.spieler.find(s => s.id === r.krieg.ziel);
    h += `<p class="meldung warnung">Sie erklären ${z ? esc(z.titel + ' ' + z.name) : '?'} den Krieg.
      Die Schlacht wird nach der Planungsphase ausgetragen.</p>
      <button data-a="kriegZuruecknehmen" class="gefahr">Kriegserklärung zurücknehmen</button>`;
  } else if (!gegner.length) {
    h += `<p class="klein">Es gibt niemanden, den Sie angreifen könnten.</p>`;
  } else {
    h += `<div class="reihe">
      <div><label for="kZiel">Wen wollen Sie angreifen?</label>
        <select id="kZiel">${gegner.map(s => `<option value="${esc(s.id)}">${esc(s.titel + ' ' + s.name + ' von ' + s.region)}</option>`).join('')}</select></div>
      <button data-a="kriegErklaeren" class="gefahr">Krieg erklären</button>
    </div>
    <p class="klein">Die Erklärung wird erst nach der Planungsphase aufgedeckt.
       Danach stellen beide Seiten ihre Truppen auf.</p>`;
  }
  return h;
}

function seiteAbschluss(r, i) {
  const st = r.steuernEingezogen;
  const gegner = zustand.spieler.filter(s => !s.selbst && !s.fertig && !s.aussetzen && !s.tot).map(s => s.name);
  const ziel = r.krieg ? zustand.spieler.find(s => s.id === r.krieg.ziel) : null;
  return `<h3>Das Jahr ${zustand.jahr} ist geplant</h3>
    <div class="tabellenhuelle"><table>
      <tr><td>Kornreserve</td><td class="zahl">${zahl(i.korn)}</td><td>Maß</td></tr>
      <tr><td>Staatskasse</td><td class="zahl">${zahl(i.kasse)}</td><td>Taler</td></tr>
      <tr><td>Einwohner</td><td class="zahl">${zahl(i.einwohner)}</td><td></td></tr>
      <tr><td>Land</td><td class="zahl">${zahl(i.land)}</td><td>Hektar</td></tr>
      <tr><td>Soldaten</td><td class="zahl">${zahl(i.soldaten)}</td><td></td></tr>
      ${st ? `<tr><td>Steuern eingezogen</td><td class="zahl">${zahl(st.summe)}</td><td>Taler</td></tr>` : ''}
    </table></div>
    ${ziel ? `<p class="meldung warnung">Sie ziehen gegen ${esc(ziel.titel + ' ' + ziel.name)} in den Krieg.</p>` : ''}
    <p class="klein">${gegner.length
      ? 'Es planen noch: ' + gegner.join(', ') + '.'
      : 'Alle anderen sind fertig. Mit Ihrem Zug endet die Planung.'}</p>`;
}

// ---------------------------------------------------------------- Ereignisse

function ereignisseBinden(r, i) {
  const ziel = $('planungInhalt');

  ziel.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => {
    planungsSchritt += Number(b.dataset.nav);
    planungZeichnen();
  });
  for (const id of ['speicherErnte', 'speicherMarkt', 'speicherVerteilung']) {
    if ($(id)) speicherZeigen($(id), i, 3);
  }

  ziel.querySelectorAll('[data-schritt]').forEach(b => b.onclick = () => {
    Klang.klick();
    planungsSchritt = Number(b.dataset.schritt);
    planungZeichnen();
  });

  ziel.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
    const a = b.dataset.a;
    if (a === 'manoever') Klang.manoever();
    else if (/Kaufen|Verkaufen|bauen/.test(a)) Klang.kauf();
    else Klang.klick();
    if (a === 'kornKaufen' || a === 'kornVerkaufen') aktion(a, { menge: Number($('mKorn').value) });
    else if (a === 'landKaufen' || a === 'landVerkaufen') aktion(a, { menge: Number($('mLand').value) });
    else if (a === 'kornVerteilen') aktion(a, { menge: Number($('vKorn').value) });
    else if (a === 'steuernSetzen') aktion(a, {
      zoll: Number($('sZoll').value), mwst: Number($('sMwst').value),
      est: Number($('sEst').value), justiz: Number($('sJustiz').value)
    });
    else if (a === 'kriegErklaeren') aktion(a, { ziel: $('kZiel').value });
    else if (a === 'zugBeenden') zugBeenden();
    else aktion(a);
  });

  ziel.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
    const feld = $('vKorn');
    if (b.dataset.v === 'max') feld.value = Math.trunc(i.korn * 0.8);
    if (b.dataset.v === 'min') feld.value = Math.trunc(i.korn / 5);
    if (b.dataset.v === 'bedarf') feld.value = Math.min(Math.trunc(i.korn * 0.8), Math.max(Math.trunc(i.korn / 5), i.bedarf));
  });
  ziel.querySelectorAll('[data-bau]').forEach(b => b.onclick = () => { Klang.kauf(); aktion('bauen', { was: b.dataset.bau }); });
  ziel.querySelectorAll('[data-truppe]').forEach(b => b.onclick = () => { Klang.truppen(); aktion('truppenKaufen', { gattung: b.dataset.truppe, soeldner: false }); });
  ziel.querySelectorAll('[data-soeldner]').forEach(b => b.onclick = () => { Klang.truppen(); aktion('truppenKaufen', { gattung: b.dataset.soeldner, soeldner: true }); });
}

/**
 * Beendet den Zug. Fehlen noch Pflichtschritte, wird vorher gefragt: der
 * Verwalter verteilt dann das Nötige und zieht die Steuern ein.
 */
function zugBeenden() {
  const r = zustand.runde;
  const fehlt = [];
  if (r.verteiltesKorn === null) fehlt.push('das Korn ist noch nicht verteilt');
  if (!r.steuernEingezogen) fehlt.push('die Steuern sind noch nicht eingezogen');
  if (fehlt.length) {
    const text = `Sie sind noch nicht fertig: ${fehlt.join(' und ')}.\n\n` +
      'Ihr Verwalter erledigt das dann selbst: er verteilt das Nötige und zieht die Steuern ein.\n\n' +
      'Zug trotzdem beenden?';
    if (!confirm(text)) return;
  }
  aktion('zugBeenden');
}

// ------------------------------------------------------------------ Diplomatie

function diplomatieZeichnen() {
  const karte = $('diplomatieKarte');
  karte.classList.toggle('verstecken', zustand.phase !== 'diplomatie');
  if (zustand.phase !== 'diplomatie') return;
  const r = zustand.runde;
  let h = '<p class="klein">Diese Kriege wurden erklärt. Entscheiden Sie, wie Sie sich verhalten.</p>';

  for (const k of zustand.kriege) {
    h += `<div class="karte"><h3>${esc(k.angreifer)} greift ${esc(k.verteidiger)} an</h3>`;
    if (k.beteiligt) {
      h += `<p class="meldung warnung">Sie sind selbst beteiligt und wählen keine Haltung.
        Stellen Sie unten Ihre Truppen auf und bestätigen Sie dann.</p>`;
    } else {
      const opt = [
        [2, 'Durchmarsch gewähren'], [3, 'Durchmarsch und Hilfe für den Angreifer'],
        [1, 'Hilfe für den Angegriffenen'], [0, 'Neutral bleiben']
      ];
      h += '<div class="reihe">' + opt.map(([v, t]) =>
        `<button data-krieg="${esc(k.id)}" data-haltung="${v}" ${k.haltung === v ? 'class="gut"' : ''}>${t}</button>`).join('') + '</div>';
      if (k.haltung != null) h += `<p class="klein">Gewählt: ${opt.find(o => o[0] === k.haltung)[1]}</p>`;
    }
    h += '</div>';
  }

  const selbstImKrieg = zustand.kriege.some(k => k.beteiligt);
  if (r.diplomatieFertig) {
    const offen = zustand.spieler.filter(p => !p.diplomatieFertig).map(p => p.name);
    h += `<p class="meldung gut">Ihre Entscheidung steht.</p>
      <p class="klein">${offen.length ? 'Es fehlen noch: ' + offen.join(', ') : 'Die Schlacht wird ausgetragen.'}</p>`;
  } else {
    h += `<button data-bereit="1" class="gut">${selbstImKrieg ? 'Aufstellung bestätigen' : 'Entscheidung bestätigen'}</button>
      <p class="klein">Danach lässt sich nichts mehr ändern.</p>`;
  }
  $('diplomatieInhalt').innerHTML = h;

  $('diplomatieInhalt').querySelectorAll('[data-krieg]').forEach(b => b.onclick = () =>
    aktion('haltung', { kriegId: b.dataset.krieg, haltung: Number(b.dataset.haltung) }));
  const bereit = $('diplomatieInhalt').querySelector('[data-bereit]');
  if (bereit) bereit.onclick = () => aktion('bereit');
}

// ------------------------------------------------------------ Reichskarte

// Im Original der Menüpunkt "Karte malen": ein gezeichneter Überblick über das
// eigene Fürstentum, 74 Spalten breit und 11 Zeilen hoch.
let karteOffen = true;

// ------------------------------------------------------- Uebersicht des Reiches

let reichOffen = true;

/** Die beiden Einklappknoepfe der Kartenkaesten. */
function kartenknoepfeBinden() {
  $('reichKnopf').onclick = () => { Klang.klick(); reichOffen = !reichOffen; reichZeichnen(); };
  $('karteKnopf').onclick = () => { Klang.klick(); karteOffen = !karteOffen; karteZeichnen(); };
}

/** Zeigt, wer an wen grenzt und wen man von hier aus erreicht. */
function reichZeichnen() {
  const karte = $('reichKarte');
  const reich = zustand && zustand.reich;
  karte.classList.toggle('verstecken', !reich);
  if (!reich) return;
  $('reichKnopf').textContent = reichOffen ? 'Einklappen' : 'Aufklappen';
  const inhalt = $('reichInhalt');
  inhalt.classList.toggle('verstecken', !reichOffen);
  if (!reichOffen) return;
  const eigene = zustand.ich ? zustand.ich.region : -1;
  inhalt.innerHTML = reichskarteSvg(reich, eigene, zustand.spieler || [])
    + reichskarteErklaerung(reich, eigene)
    + '<p class="klein">Diese Übersicht hat das Original nicht. Die Grenzen darin'
    + ' stammen aber aus seinen Angriffswegen, die Lage der Länder auf dem Blatt'
    + ' ist unsere Wahl.</p>';
}

// ---------------------------------------------------------- Reichskarte
//
// Die Karte ist hochaufloesend, nicht mehrfarbig. Ihr Zeichensatz entsteht im
// Original zur Laufzeit (Routine $A3AA): jedes der Grafikzeichen 96 bis 127
// des fetten Satzes bei $E000 wird waagerecht und senkrecht verdoppelt, aus
// einem Zeichen wird eine Kachel von 16 mal 16 Pixeln. Deshalb sind die
// Striche zwei Pixel dick und der Zaun eine glatte Linie.
//
// Ein Wert im Kartenpuffer ist keine Zeichennummer, sondern ein Kachelindex:
//
//   Kachel = Wert und 63, Quellzeichen = 96 + Kachel
//   Farbe  = Tabelle $02C7 nach Wert geteilt durch 64
//
// Die Kacheln 32 und 33 sind Sonderfaelle: sie entstehen aus Zeichen 103, die
// eine ganz, die andere nur zur Haelfte. Das ist der Einwohnerbalken.
const KARTENSATZ = 'assets/charset_karte.png';
const KACHELGROESSE = 16;

// Farbtabelle aus $02C7 bis $02CA, gesetzt in $A3F2. Der Index ist der
// Pufferwert geteilt durch 64. Daher ist ein Vermoegen gelb, ein Zaun gruen,
// ein Marktplatz rot und die Muehle blau, ohne dass irgendwo eine Liste von
// Zeichen steht.
const KARTENFARBTABELLE = [FARBEN[7], FARBEN[13], FARBEN[2], FARBEN[6]];

// Grundfarbe des Bildes. Sie haengt am Wetter des Jahres: BASIC-Zeile 466
// wuerfelt c5 von 1 bis 5, Zeile 107 holt damit ueber g=c5+5 eines der
// Farbschemata aus den DATA-Zeilen 969 bis 973.
const KARTENGRUENDE = [FARBEN[9], FARBEN[8], FARBEN[3], FARBEN[5], FARBEN[5]];

/** Die Grundfarbe des Kartenbildes fuer dieses Jahr. */
function kartenGrund(k) {
  return KARTENGRUENDE[((k && k.farbschema) || 1) - 1] || KARTENGRUENDE[0];
}

/** Malt eine einzelne Kachel der Karte. */
function kachelMalen(ctx, wert, x, y, g = KACHELGROESSE) {
  if (!wert) return;
  const kachel = wert & 63;
  const farbe = KARTENFARBTABELLE[wert >> 6];
  if (kachel === 32 || kachel === 33) {
    // Einwohnerbalken: Zeichen 103, ganz oder halb
    zeichen(ctx, 103, x, y, g, farbe, KARTENSATZ, g / 2);
    if (kachel === 32) zeichen(ctx, 103, x, y + g / 2, g, farbe, KARTENSATZ, g / 2);
    return;
  }
  zeichen(ctx, 96 + kachel, x, y, g, farbe, KARTENSATZ);
}

async function karteZeichnen() {
  const k = zustand && zustand.karte;
  const karte = $('karteKarte');
  karte.classList.toggle('verstecken', !k);
  if (!k) return;

  $('karteKnopf').textContent = karteOffen ? 'Einklappen' : 'Aufklappen';
  karte.querySelector('.kartenhuelle').classList.toggle('verstecken', !karteOffen);
  $('kartenlegende').classList.toggle('verstecken', !karteOffen);
  if (!karteOffen) return;

  try { await zeichensatzLaden(KARTENSATZ); } catch { return; }
  const c = $('reichskarte');
  const g = KACHELGROESSE;
  c.width = k.spalten * g;
  c.height = k.zeilen * g;
  const ctx = c.getContext('2d');
  const grund = kartenGrund(k);
  ctx.fillStyle = grund;
  ctx.fillRect(0, 0, c.width, c.height);
  c.parentElement.style.background = grund;
  for (let z = 0; z < k.zeilen; z++) {
    for (let sp = 0; sp < k.spalten; sp++) {
      kachelMalen(ctx, k.feld[z * k.spalten + sp], sp * g, z * g);
    }
  }
  kartenlegendeZeichnen(k);
}

/**
 * Die Legende zeigt die Zeichen, die auch auf der Karte stehen, nicht bloss
 * Farbtupfer. Sonst findet man sie im Gewimmel nicht wieder.
 */
function kartenlegendeZeichnen(k) {
  // Das Original zeichnet die Karte ohne Legende; wir benennen die Zeichen,
  // damit man sie zuordnen kann. Wie viel ein Feld zaehlt, verraet es nicht,
  // und wir tun es auch nicht.
  const eintraege = [
    [[k.schulden ? 159 : 31, k.schulden ? 159 : 31], k.schulden ? 'Schulden' : 'Vermögen'],
    [[77, 78, 68], 'Ihr Land'],
    [[146, 139, 143], 'Märkte und Städte'],
    [[200], 'Mühlen'],
    [[16, 5, 12], 'Palast und Kathedrale'],
    [[224, 225], 'Einwohner'],
    [[93], 'Wald']
  ];
  const ziel = $('kartenlegende');
  const grund = kartenGrund(k);
  const g = KACHELGROESSE;
  ziel.innerHTML = '';
  for (const [codes, text] of eintraege) {
    const e = document.createElement('span');
    e.className = 'legendeneintrag';
    const c = document.createElement('canvas');
    c.width = codes.length * g; c.height = g;
    const ctx = c.getContext('2d');
    ctx.fillStyle = grund; ctx.fillRect(0, 0, c.width, c.height);
    c.style.background = grund;
    codes.forEach((code, n) => kachelMalen(ctx, code, n * g, 0));
    e.appendChild(c);
    e.appendChild(document.createTextNode(' ' + text));
    ziel.appendChild(e);
  }
}

// -------------------------------------------------------------- Zeremonien

// Die Vollbildschirme des Originals. Der Server schickt sie im Jahresbericht
// mit; wir zeigen sie nacheinander, jeder wird mit einem Knopfdruck bestaetigt
// wie beim GOSUB37 des Originals ("KNOPF DRUECKEN!").

let zeremonienSchlange = [];
let zeremonieOffen = false;
let zeremonieJahr = null;       // bis zu welchem Jahresbericht schon gezeigt

function zeremonienAufbauen() {
  $('zeremonieWeiter').onclick = zeremonieWeiter;
  document.addEventListener('keydown', e => {
    if (zeremonieOffen && (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape')) {
      e.preventDefault();
      zeremonieWeiter();
    }
  });
}

/** Sucht im neuen Jahresbericht die eigenen Zeremonien und reiht sie ein. */
function zeremonienPruefen() {
  const b = zustand && zustand.letzterBericht;
  if (!b || !zustand.ich) return;
  if (zeremonieJahr === b.jahr) return;
  zeremonieJahr = b.jahr;
  const meiner = (b.spieler || []).find(s => s.id === zustand.ich.id);
  if (!meiner || !meiner.zeremonien || !meiner.zeremonien.length) return;
  for (const z of meiner.zeremonien) zeremonienSchlange.push(...blaetterAus(z));
  if (!zeremonieOffen) zeremonieNaechste();
}

async function zeremonieNaechste() {
  const blatt = zeremonienSchlange.shift();
  if (!blatt) { zeremonieSchliessen(); return; }
  zeremonieOffen = true;

  const schirm = $('zeremonieSchirm');
  const kasten = schirm.querySelector('.zeremonieblatt');
  kasten.className = 'zeremonieblatt ' + blatt.art;
  $('zeremonieTitel').textContent = blatt.titel;
  $('zeremonieText').innerHTML = blatt.zeilen.map(z => `<p>${z}</p>`).join('');

  const krone = $('zeremonieKrone');
  krone.classList.toggle('verstecken', !blatt.krone);
  if (blatt.krone) await kroneMalen(krone, 18);

  const huelle = $('zeremonieBildhuelle');
  huelle.classList.toggle('verstecken', !blatt.abspann);
  if (blatt.abspann) $('zeremonieBild').src = 'assets/outro.png';

  schirm.classList.remove('verstecken');
  $('zeremonieWeiter').focus();

  if (blatt.art === 'titel') Klang.fanfare();
  else if (blatt.art === 'bankrott' || blatt.art === 'amtsenthebung' || blatt.art === 'tod') Klang.unheil();
  else if (blatt.art === 'kaiser') abspannMusik();
}

function zeremonieWeiter() {
  if (!zeremonieOffen) return;
  Klang.klick();
  zeremonieNaechste();
}

function zeremonieSchliessen() {
  zeremonieOffen = false;
  $('zeremonieSchirm').classList.add('verstecken');
  $('zeremonieBild').removeAttribute('src');
}

/** Die Abspannmusik aus karte_57be.prg, wie im Original beim Kaiserbild. */
async function abspannMusik() {
  try {
    const m = await import('./sid.js');
    await m.musikLaden('assets/kaiser_abspann.sid', { neustartNachAufrufen: 0 });
    m.lautstaerke(0.35);
    await m.abspielen();
  } catch { /* ohne Originaldateien gibt es eben keine Musik */ }
}

// -------------------------------------------------------------------- Hilfe

function hilfeAufbauen() {
  const schirm = $('hilfeSchirm');
  $('hilfeKnopf').onclick = hilfeZeigen;
  $('hilfeZu').onclick = hilfeSchliessen;
  // Klick auf den dunklen Grund schließt, Klick auf das Blatt nicht
  schirm.onclick = e => { if (e.target === schirm) hilfeSchliessen(); };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !schirm.classList.contains('verstecken')) hilfeSchliessen();
  });
}

function hilfeZeigen() {
  if (!zustand || !zustand.runde || !zustand.ich) return;
  const h = hilfeZu(planungsSchritt, zustand.runde, zustand.ich);
  $('hilfeTitel').textContent = h.titel;
  $('hilfeInhalt').innerHTML = h.inhalt;
  $('hilfeSchirm').classList.remove('verstecken');
  $('hilfeZu').focus();
}

function hilfeSchliessen() {
  $('hilfeSchirm').classList.add('verstecken');
}

/** Beim Wechsel des Schritts die offene Hilfe mitziehen. */
function hilfeMitziehen() {
  if (!$('hilfeSchirm').classList.contains('verstecken')) hilfeZeigen();
}

// ---------------------------------------------------------- Schlachtlegende

// Das Original hat einen eigenen Legendenbildschirm, BASIC-Zeile 432 bis 440.
// Man ruft ihn in der Voransicht des Schlachtfeldes mit dem Joystick zur Seite
// auf ("F{$dc}r Legende: Joystick zur Seite!", Zeile 431) und nur ein einziges
// Mal je Schlacht. Wir zeigen ihn dauerhaft unter dem Feld.
//
// Die Beschreibungen der Gattungen stammen aus dem gedruckten Handbuch.

const GATTUNGSWERTE = {
  kavallerie: 'hat im Krieg die größte Reichweite',
  artillerie: 'steht fest und kann nur schießen',
  infanterie: 'die kostengünstigste Truppe, meist in größerer Zahl',
  miliz: 'die Bürgerwehr, verteidigt nur'
};

// Gelaende, Zeichen aus denselben DATA-Zeilen wie die Karte
const GELAENDE = [
  [[115, 116], 'Mühlen'],
  [[29, 30], 'Märkte'],
  [[27, 28], 'Märkte'],
  [[34, 35, 36], 'Paläste'],
  [[42, 31, 42], 'Kathedralen'],
  [[97, 98], 'Ruine'],
  [[107, 108], 'Bäume'],
  [[117, 118], 'Bäume'],
  [[120, 111, 111], 'Grenze'],
  [[123, 111, 111, 119], 'Fluß']
];

/** Malt eine Zeichenfolge auf ein kleines Feld, so wie auf dem Schlachtfeld. */
function zeichenprobe(codes, hoehe = 16) {
  const c = document.createElement('canvas');
  c.width = codes.length * 8; c.height = 8;
  const ctx = c.getContext('2d');
  ctx.fillStyle = GRUND; ctx.fillRect(0, 0, c.width, c.height);
  codes.forEach((code, n) => zelleMalen(ctx, code, n * 8, 0, 8));
  c.style.height = hoehe + 'px';
  return c;
}

function legendenzeile(ziel, teile, name, was) {
  const zeile = document.createElement('div');
  zeile.className = 'gattung';
  for (const codes of teile) zeile.appendChild(zeichenprobe(codes));
  const text = document.createElement('span');
  text.innerHTML = `<span class="name">${name}</span>` + (was ? ` <span class="was">${was}</span>` : '');
  zeile.appendChild(text);
  ziel.appendChild(zeile);
}

/**
 * Malt die Zeichenerklaerung unter ein Schlachtfeld.
 * nurSeite: true nur der Angreifer, false nur der Verteidiger, null beide.
 */
async function schlachtlegende(ziel, nurSeite = null) {
  if (!ziel) return;
  try { await zeichensatzBereit(); } catch { ziel.innerHTML = ''; return; }
  ziel.innerHTML = '';
  const seiten = nurSeite === null ? [true, false] : [nurSeite];
  for (const g of A.GATTUNGEN) {
    legendenzeile(ziel, seiten.map(a => A.zeichenPaar(g, a)), A.GATTUNGSNAMEN[g], GATTUNGSWERTE[g]);
  }
  for (const [codes, name] of GELAENDE) legendenzeile(ziel, [codes], name, '');
  const hinweis = document.createElement('p');
  hinweis.className = 'klein';
  hinweis.style.gridColumn = '1 / -1';
  hinweis.style.margin = '2px 0 0';
  hinweis.textContent = nurSeite === null
    ? 'Je Gattung links der Angreifer, rechts der Verteidiger.'
    : 'Die Zeichen des Gegners sehen anders aus, aber gleich groß.';
  ziel.appendChild(hinweis);
}

// -------------------------------------------------------------- Aufstellung

let aufstellung = null;

async function aufstellungZeichnen() {
  const karte = $('aufstellungKarte');
  const krieg = zustand.phase === 'diplomatie'
    ? zustand.kriege.find(k => k.beteiligt && k.feld) : null;
  karte.classList.toggle('verstecken', !krieg);
  if (!krieg) { aufstellung = null; return; }

  if (!aufstellung || aufstellung.kriegId !== krieg.id) aufstellung = A.zustandAus(krieg);
  const z = aufstellung;
  const offen = A.offeneEinheiten(z);
  const gesperrt = !!(zustand.runde && zustand.runde.diplomatieFertig);

  if (gesperrt) {
    $('aufstellungInhalt').innerHTML =
      `<p class="meldung gut">Ihre Aufstellung steht: ${z.gesetzt.length} Einheiten.
        ${z.vorrat.length ? z.vorrat.length + ' weitere stellt der Feldherr nahe der Grenze auf.' : ''}</p>`
      + truppentafel(z);
    try { await zeichensatzBereit(); } catch { return; }
    feldMalen();
    schlachtlegende($('aufstellungLegende'), z.istAngreifer);
    return;
  }

  $('aufstellungInhalt').innerHTML = `
    <p class="klein">Verteilen Sie jetzt bitte die Truppen! Sie sind ${z.istAngreifer
      ? 'der <b>Angreifer</b> und stellen in der linken Spalte auf'
      : 'der <b>Verteidiger</b> und stellen in der rechten Spalte auf'}.
      Klicken Sie auf die gewünschte Stelle im gelb umrandeten Bereich. Ein zweiter Klick
      auf eine besetzte Stelle nimmt die Einheit zurück. In eine Zeile passen mehrere
      Einheiten nebeneinander. Die Gattung wählen Sie nicht selbst: es kommt immer die
      nächste an die Reihe, zuerst die Kavallerie, dann Artillerie, Infanterie und zuletzt
      die Miliz.</p>
    ${truppentafel(z)}
    <p class="meldung${z.gewaehlt ? '' : ' gut'}">${z.gewaehlt
      ? `Als nächstes setzen Sie: <b>${A.GATTUNGSNAMEN[z.gewaehlt]}</b>, noch ${offen[z.gewaehlt]} übrig.`
      : 'Alle Einheiten sind aufgestellt.'}</p>
    <div class="hinweisleiste">
      <span>Aufgestellt: <b>${z.gesetzt.length}</b></span>
      <span>Übrig: <b>${z.vorrat.length}</b></span>
      <button data-auto="1">Rest verteilen</button>
      <button data-leeren="1">Alles zurücknehmen</button>
    </div>
    <p class="klein">Nicht aufgestellte Einheiten verteilt der Feldherr am Ende selbst,
       und zwar drei Spalten vor der feindlichen Grenze; „Rest verteilen“ macht dasselbe.
       Von Hand kommen Sie noch etwas dichter heran.
       Miliz verteidigt nur, sie greift nicht an. Der Gegner stellt auf demselben Feld auf
       und sieht Ihre Truppen dabei, so wie Sie seine sehen.</p>
    <div class="handbuch"><b>Aus dem Handbuch</b><p>Beim Aufstellen der Truppen im Krieg
      sollte man jede Einheit möglichst nahe der feindlichen Grenze postieren, da es sonst
      passieren kann, daß die feindliche Armee das feindliche Gebiet nicht erreicht. Achten
      Sie jedoch darauf, daß die Truppen direkt an der Grenze zuerst losmarschieren. Steht
      dann in diesem Grenzabschnitt noch Artillerie, kann es sein, daß man seine eigenen
      Truppen beschießt.</p>
      <p class="quelle">Handbuch zu Kaiser, Ariolasoft 1984, Seite 16</p></div>`;

  const feld = $('aufstellungInhalt');
  const auto = feld.querySelector('[data-auto]');
  if (auto) auto.onclick = () => anwenden(A.restVerteilen(aufstellung));
  const leeren = feld.querySelector('[data-leeren]');
  if (leeren) leeren.onclick = () => anwenden(A.alleZurueck(aufstellung));

  try { await zeichensatzBereit(); }
  catch { zeichensatzFehlt($('aufstellungsfeld')); return; }
  feldMalen();
  schlachtlegende($('aufstellungLegende'), z.istAngreifer);
}

/**
 * Die Truppentafel ueber dem Feld, BASIC-Zeile 441 bis 445. Das Original zeigt
 * beide Parteien nebeneinander, Angreifer in Spalte 12, Verteidiger in
 * Spalte 27. Wer noch wie viel uebrig hat, ist also kein Geheimnis.
 */
function truppentafel(z) {
  const meine = A.zaehlen(z.vorrat);
  const gesetztMeine = A.zaehlen(z.gesetzt.map(e => e.gattung));
  const gegnerGesamt = A.zaehlen(z.gegnerEinheiten);
  const gegnerGesetzt = A.zaehlen((z.gegnerAufstellung || []).map(e => e.gattung));
  const ichLinks = z.istAngreifer;
  const spalte = (gesetzt, offen) => `<td class="zahl">${gesetzt || 0}</td><td class="zahl klein">${offen || 0}</td>`;
  return `<div class="tabellenhuelle"><table class="truppentafel">
    <tr><th></th>
      <th colspan="2">${ichLinks ? 'Sie (Angreifer)' : 'Gegner (Angreifer)'}</th>
      <th colspan="2">${ichLinks ? 'Gegner (Verteidiger)' : 'Sie (Verteidiger)'}</th></tr>
    <tr><th></th><th class="zahl klein">gesetzt</th><th class="zahl klein">übrig</th>
      <th class="zahl klein">gesetzt</th><th class="zahl klein">übrig</th></tr>
    ${A.GATTUNGEN.map(g => {
      const links = ichLinks
        ? [gesetztMeine[g], meine[g]]
        : [gegnerGesetzt[g], (gegnerGesamt[g] || 0) - (gegnerGesetzt[g] || 0)];
      const rechts = ichLinks
        ? [gegnerGesetzt[g], (gegnerGesamt[g] || 0) - (gegnerGesetzt[g] || 0)]
        : [gesetztMeine[g], meine[g]];
      return `<tr><td>${A.GATTUNGSNAMEN[g]}</td>${spalte(...links)}${spalte(...rechts)}</tr>`;
    }).join('')}
  </table></div>`;
}

function anwenden(e) {
  if (e.fehler) fehlerZeigen(e.fehler);
  if (!e.geaendert) return;
  aktion('aufstellung', { aufstellung: aufstellung.gesetzt });
  aufstellungZeichnen();
}

/** Zeichnet Gelände samt gesetzter Einheiten. */
function feldMalen() {
  if (!aufstellung) return;
  const c = $('aufstellungsfeld');
  const ctx = c.getContext('2d');
  feldZeichnen(ctx, A.anzeigeFeld(aufstellung));
  // Den erlaubten Bereich hervorheben. Im Original darf der Cursor vom
  // Startplatz aus bis an den eigenen Rand und bis an die Grenze wandern.
  const g = A.spaltenbereich(aufstellung);
  ctx.strokeStyle = FARBEN[7];
  ctx.lineWidth = 1;
  ctx.strokeRect(g.von * KACHEL - 0.5, A.AUFSTELLUNG.ersteZeile * KACHEL - 0.5,
    (g.bis - g.von + 2) * KACHEL,
    (A.AUFSTELLUNG.letzteZeile - A.AUFSTELLUNG.ersteZeile + 1) * KACHEL);
}

$('aufstellungsfeld').onclick = ev => {
  if (!aufstellung) return;
  if (zustand.runde && zustand.runde.diplomatieFertig) return;   // schon bestätigt
  const r = $('aufstellungsfeld').getBoundingClientRect();
  const zeile = A.zeileAusKlick(ev.clientY, r.top, r.height, ZEILEN);
  const spalte = A.spalteAusKlick(ev.clientX, r.left, r.width, SPALTEN);
  anwenden(A.klick(aufstellung, zeile, spalte));
};

// ------------------------------------------------------------------ Bericht

function berichtZeichnen() {
  const b = zustand.letzterBericht;
  $('berichtKarte').classList.toggle('verstecken', !b);
  $('schlachtKarte').classList.toggle('verstecken', !b || !b.kriege.length);
  if (!b) return;

  let h = `<h3>Jahr ${b.jahr}</h3>`;
  for (const k of b.kriege) {
    if (k.abgebrochen) { h += `<div class="meldung warnung">${esc(k.text)}</div>`; continue; }
    const gewinner = k.landAngreifer > 0 ? k.angreifer : k.verteidiger;
    const land = Math.abs(k.landAngreifer);
    h += `<div class="meldung"><strong>${esc(k.angreifer)} gegen ${esc(k.verteidiger)}</strong><br>
      Angriffsweg: ${k.pfad.join(' → ')}<br>
      ${land ? `${esc(gewinner)} gewinnt ${zahl(land)} Hektar.` : 'Keine Landverschiebung.'}<br>
      Verluste ${esc(k.angreifer)}: ${beschreibeVerluste(k.verluste[0])}<br>
      Verluste ${esc(k.verteidiger)}: ${beschreibeVerluste(k.verluste[1])}
      ${k.entschaedigungen.length ? '<br>' + k.entschaedigungen.map(e => `${esc(e.von)} zahlt ${zahl(e.taler)} Taler an ${esc(e.an)}.`).join('<br>') : ''}
      </div>`;
  }
  for (const s of b.spieler) {
    for (const m of s.meldungen) {
      if (m.art === 'titel' || m.art === 'bankrott') h += `<div class="meldung ${m.art === 'titel' ? 'gut' : 'warnung'}">${esc(s.name)}: ${esc(m.text)}</div>`;
    }
  }
  $('bericht').innerHTML = h;

  if (b.kriege.length) {
    schlachtIndex = Math.min(schlachtIndex, b.kriege.length - 1);
    schlachtfeldZeichnen();
  }
}

function beschreibeVerluste(v) {
  const t = [];
  if (v.kavallerie) t.push(v.kavallerie + ' Kavallerie');
  if (v.artillerie) t.push(v.artillerie + ' Artillerie');
  if (v.infanterie) t.push(v.infanterie + ' Infanterie');
  if (v.miliz) t.push(v.miliz + ' Miliz');
  return t.length ? t.join(', ') : 'keine';
}

/**
 * Schreibt einen Hinweis auf die Fläche, wenn der Zeichensatz fehlt. Das ist
 * nach einem frischen Klon der Fall: das Originalmaterial liegt nicht im Repo.
 */
function zeichensatzFehlt(flaeche) {
  if (!flaeche) return;
  const ctx = flaeche.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, flaeche.width, flaeche.height);
  ctx.fillStyle = FARBEN[7];
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  const zeilen = [
    'Der Zeichensatz fehlt.',
    'assets/charset_map.png ist nicht da.',
    '',
    'Er wird aus dem eigenen kaiser.d64 erzeugt:',
    'python3 extract_assets.py',
    '',
    'Siehe README im Projektverzeichnis.'
  ];
  zeilen.forEach((z, i) => ctx.fillText(z, flaeche.width / 2, 40 + i * 16));
}

// ------------------------------------------------------------ Schlachtfeld

let nachspieler = null;

async function schlachtfeldZeichnen() {
  const b = zustand.letzterBericht;
  if (!b || !b.kriege.length) return;
  const k = b.kriege[schlachtIndex];
  $('schlachtName').textContent = `${k.angreifer} gegen ${k.verteidiger} (${schlachtIndex + 1}/${b.kriege.length})`;
  if (!k.feld) return;
  try { await zeichensatzBereit(); }
  catch { zeichensatzFehlt($('schlachtfeld')); return; }

  schlachtlegende($('schlachtLegende'));
  const ctx = $('schlachtfeld').getContext('2d');
  const hatAufzeichnung = k.startbild && k.aufzeichnung && k.aufzeichnung.length;
  $('abspielLeiste').classList.toggle('verstecken', !hatAufzeichnung);
  $('zeitleiste').classList.toggle('verstecken', !hatAufzeichnung);

  if (nachspieler) nachspieler.anhalten();
  if (!hatAufzeichnung) { feldZeichnen(ctx, k.feld); nachspieler = null; return; }

  nachspieler = new Nachspieler(ctx, k.startbild, k.aufzeichnung);
  nachspieler.tempo = Number($('tempo').value) || 24;
  const leiste = $('zeitleiste');
  leiste.max = String(nachspieler.anzahl);
  leiste.value = '0';
  nachspieler.beiFortschritt = (bild, gesamt) => {
    leiste.value = String(bild);
    $('fortschritt').textContent = `${bild} / ${gesamt}`;
    $('abspielen').textContent = nachspieler.laeuft ? 'Anhalten' : 'Schlacht abspielen';
  };
  nachspieler.springen(0);
}

$('abspielen').onclick = () => {
  if (!nachspieler) return;
  if (!nachspieler.laeuft) Klang.schlachtbeginn();   // Zeile 296 des Originals
  if (nachspieler.laeuft) nachspieler.anhalten(); else nachspieler.starten();
  $('abspielen').textContent = nachspieler.laeuft ? 'Anhalten' : 'Schlacht abspielen';
};
$('einBild').onclick = () => { if (nachspieler) { nachspieler.anhalten(); nachspieler.schritt(); } };
$('zumEnde').onclick = () => { if (nachspieler) nachspieler.zumEnde(); };
$('tempo').oninput = e => { if (nachspieler) nachspieler.tempo = Number(e.target.value); };
$('zeitleiste').oninput = e => { if (nachspieler) { nachspieler.anhalten(); nachspieler.springen(Number(e.target.value)); } };

$('schlachtZurueck').onclick = () => {
  const b = zustand.letzterBericht;
  if (b && b.kriege.length) { schlachtIndex = (schlachtIndex - 1 + b.kriege.length) % b.kriege.length; schlachtfeldZeichnen(); }
};
$('schlachtVor').onclick = () => {
  const b = zustand.letzterBericht;
  if (b && b.kriege.length) { schlachtIndex = (schlachtIndex + 1) % b.kriege.length; schlachtfeldZeichnen(); }
};

// ------------------------------------------------------------------ Musik

// Die Titelmusik des Originals wird erst auf Knopfdruck geladen: Browser
// erlauben Tonausgabe nur nach einer Nutzeraktion. Fehlt das Modul oder die
// Musikdatei, wird der Knopf abgeschaltet.
//
// Das Stueck ist 2688 Aufrufe lang (etwa 33 Sekunden) und hat keine eigene
// Schleife; mit neustartNachAufrufen laeuft es endlos weiter.
const MUSIKLAENGE = 2688;
let musik = null;
let musikLaeuft = false;

async function musikUmschalten() {
  const knopf = $('musikKnopf');
  if (musikLaeuft) {
    try { await musik.anhalten(); } catch { /* egal */ }
    musikLaeuft = false;
    knopf.classList.remove('an');
    localStorage.setItem('kaiser.musik', 'aus');
    return;
  }
  if (!musik) {
    knopf.disabled = true;
    knopf.textContent = '♪ lädt...';
    try {
      musik = await import('./sid.js');
      await musik.musikLaden('assets/kaiser_titel.sid', { neustartNachAufrufen: MUSIKLAENGE });
      musik.lautstaerke(0.35);
    } catch (e) {
      musik = null;
      knopf.textContent = '♪ keine Musik';
      knopf.classList.add('fehlt');
      return;                       // Knopf bleibt abgeschaltet
    }
    knopf.disabled = false;
    knopf.textContent = '♪ Musik';
  }
  try {
    await musik.abspielen();
    musikLaeuft = true;
    knopf.classList.add('an');
    localStorage.setItem('kaiser.musik', 'an');
  } catch (e) {
    knopf.textContent = '♪ kein Ton';
    knopf.classList.add('fehlt');
    knopf.disabled = true;
  }
}

$('musikKnopf').onclick = musikUmschalten;

// Geraeusche an und aus. Der Stand steht schon beim Laden im Knopf.
function tonKnopfSetzen() {
  $('tonKnopf').textContent = Klang.tonLaeuft() ? 'Ton' : 'Ton aus';
}
$('tonKnopf').onclick = () => { const ein = Klang.tonUmschalten(); tonKnopfSetzen(); if (ein) Klang.klick(); };
tonKnopfSetzen();

// ------------------------------------------------------------------ Frist

setInterval(() => {
  if (!zustand || !zustand.frist) { $('fristAnzeige').textContent = ''; return; }
  const rest = Math.max(0, Math.round((zustand.frist - Date.now()) / 1000));
  const m = String(Math.floor(rest / 60)).padStart(2, '0'), s = String(rest % 60).padStart(2, '0');
  $('fristAnzeige').textContent = `noch ${m}:${s}`;
}, 500);

// ------------------------------------------------------------------ Start

async function titelbildZeigen() {
  const c = $('titelbild');
  const ctx = c.getContext('2d');
  const bild = new Image();
  bild.onload = () => ctx.drawImage(bild, 0, 0, c.width, c.height);
  bild.onerror = () => {
    // Ersatz für das Originalbild: schlichter Schriftzug auf der Tafel
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#c9a83c'; ctx.textAlign = 'center';
    ctx.font = '54px UnifrakturMaguntia, serif';
    ctx.fillText('Kaiser', c.width / 2, c.height / 2 + 18);
    const h = $('grafikHinweis');
    if (h) {
      h.innerHTML = 'Die Originalgrafik fehlt. Sie liegt nicht im Repo und wird aus einem ' +
        'eigenen <code>kaiser.d64</code> erzeugt: <code>python3 extract_assets.py</code> ' +
        'und <code>python3 extract_sid.py</code>. Spielen geht auch ohne.';
      h.classList.remove('verstecken');
    }
  };
  bild.src = 'assets/title.png';
}

anmeldungAufbauen();
lobbyAufbauen();
verwaltungAufbauen();
hilfeAufbauen();
zeremonienAufbauen();
kartenknoepfeBinden();
titelbildZeigen();
verbinden();
