// Gemeinsame Hilfe fuer die Werkzeuge: anmelden, Runde anlegen oder betreten.
// Seit der Lobby braucht jede Verbindung ein Konto.

import WebSocket from 'ws';

export const ADRESSE = process.env.KAISER_ADRESSE || 'ws://localhost:8420';
export const warte = ms => new Promise(r => setTimeout(r, ms));

/**
 * Meldet ein Konto an und legt es bei Bedarf an.
 * Liefert ein Objekt mit ws, konto, zustand, lobby und Hilfsmethoden.
 */
export function anmelden(name, kennwort = 'werkzeug', { still = false } = {}) {
  return new Promise((fertig, fehlgeschlagen) => {
    const ws = new WebSocket(ADRESSE);
    const c = {
      ws, name, konto: null, kennung: null, zustand: null, lobby: null,
      sende: (typ, daten = {}) => ws.send(JSON.stringify({ typ, ...daten })),
      aktion: (a, daten = {}) => ws.send(JSON.stringify({ typ: 'aktion', aktion: a, daten })),
      schliessen: () => ws.close()
    };
    let versuchtRegistrieren = false;
    let angemeldet = false;   // die Anmeldung ist durch

    ws.on('open', () => c.sende('anmelden', { name, kennwort }));
    ws.on('error', e => fehlgeschlagen(e));
    ws.on('message', m => {
      const n = JSON.parse(m);
      if (n.typ === 'angemeldet') { c.konto = n.konto; c.kennung = n.kennung; }
      else if (n.typ === 'lobby') {
        c.lobby = n; c.zustand = null;
        if (c.konto && !angemeldet) { angemeldet = true; fertig(c); }
      }
      else if (n.typ === 'zustand') {
        c.zustand = n.zustand; c.lobby = null;
        // Nur waehrend der Anmeldung: wer noch in einer alten Runde sitzt,
        // bekommt gleich den Spielstand statt der Lobby. Dann die Lobby
        // nachfordern, sonst wartet das Werkzeug ewig. Spaeter im Ablauf ist
        // ein Spielstand das erwartete Ergebnis und darf nichts ausloesen.
        if (c.konto && !angemeldet) { angemeldet = true; c.sende('lobby'); }
      }
      else if (n.typ === 'abgemeldet' || (n.typ === 'fehler' && n.feld === 'anmeldung')) {
        if (!versuchtRegistrieren) {
          versuchtRegistrieren = true;
          c.sende('registrieren', { name, kennwort });
        } else {
          fehlgeschlagen(new Error('Anmeldung fehlgeschlagen: ' + (n.text || 'unbekannt')));
        }
      } else if (n.typ === 'fehler' && !still) {
        console.log(`  ! ${name}: ${n.text}`);
      }
    });
    setTimeout(() => fehlgeschlagen(new Error('Zeitüberschreitung bei der Anmeldung')), 10000);
  });
}

/** Holt eine frische Lobbysicht. */
export async function lobbyHolen(c) {
  c.lobby = null;
  c.sende('lobby');
  for (let i = 0; i < 50 && !c.lobby; i++) await warte(100);
  return c.lobby;
}

/** Legt eine Runde an oder tritt der vorhandenen mit diesem Namen bei. */
/**
 * Tritt einer Runde bei. Das Fuerstentum richtet sich nach der Reihenfolge,
 * es laesst sich nicht waehlen; wer eine bestimmte Nachbarschaft braucht,
 * laesst die Werkzeuge in der passenden Reihenfolge beitreten.
 */
export async function rundeBetreten(c, rundenName, { weiblich, planungsSekunden, diplomatieSekunden } = {}) {
  await lobbyHolen(c);          // sonst arbeitet man mit einer veralteten Sicht
  const vorhanden = (c.lobby?.runden || []).find(r => r.name === rundenName);
  if (vorhanden) {
    if (vorhanden.dabei) c.sende('spielOeffnen', { spielId: vorhanden.id });
    else c.sende('spielBeitreten', { spielId: vorhanden.id, weiblich });
  } else {
    c.sende('spielAnlegen', { name: rundenName, weiblich, planungsSekunden, diplomatieSekunden });
  }
  for (let i = 0; i < 60 && !c.zustand; i++) await warte(100);
  if (!c.zustand) throw new Error(`Runde "${rundenName}" konnte nicht betreten werden`);
  return c.zustand;
}

/** Wartet, bis die Runde in einer bestimmten Phase ist. */
export async function warteAufPhase(c, phase, sekunden = 20) {
  for (let i = 0; i < sekunden * 10; i++) {
    if (c.zustand && c.zustand.phase === phase) return true;
    await warte(100);
  }
  return false;
}
