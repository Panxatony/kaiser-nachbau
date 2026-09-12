// Versand der Einladungen.
//
// Die Zugangsdaten kommen ausschliesslich aus Umgebungsvariablen und stehen
// nirgends im Quelltext:
//
//   KAISER_SMTP_HOST    Rechnername des Mailservers
//   KAISER_SMTP_PORT    587 mit STARTTLS (Vorgabe) oder 465 mit TLS
//   KAISER_SMTP_USER    Benutzername
//   KAISER_SMTP_PASS    Kennwort
//   KAISER_SMTP_VON     Absender, z.B. "Kaiser <kaiser@example.org>"
//   KAISER_ADRESSE_WEB  Adresse des Spiels für den Link in der Einladung
//
// Fehlt eine davon, ist der Versand abgeschaltet. Das Spiel läuft weiter,
// die Verwaltung bekommt nur keine Einladungen verschickt.

import crypto from 'node:crypto';
import nodemailer from 'nodemailer';

const HOST = process.env.KAISER_SMTP_HOST || '';
const PORT = Number(process.env.KAISER_SMTP_PORT || 587);
const USER = process.env.KAISER_SMTP_USER || '';
const PASS = process.env.KAISER_SMTP_PASS || '';
const VON = process.env.KAISER_SMTP_VON || (USER ? `Kaiser <${USER}>` : '');
const WEB = process.env.KAISER_ADRESSE_WEB || 'http://localhost:8420';

let versand = null;

/** Ist der Versand eingerichtet? */
export function bereit() {
  return !!(HOST && USER && PASS && VON);
}

/** Was die Verwaltung über den Versand wissen soll, ohne Geheimnisse. */
export function stand() {
  return {
    bereit: bereit(),
    host: HOST || null,
    port: HOST ? PORT : null,
    absender: VON || null,
    adresse: WEB
  };
}

function verbindung() {
  if (versand) return versand;
  versand = nodemailer.createTransport({
    host: HOST,
    port: PORT,
    secure: PORT === 465,          // 465 spricht sofort TLS, 587 über STARTTLS
    requireTLS: PORT !== 465,
    auth: { user: USER, pass: PASS },
    tls: { minVersion: 'TLSv1.2' }
  });
  return versand;
}

/** Prüft die Verbindung zum Mailserver, ohne etwas zu verschicken. */
export async function pruefen() {
  if (!bereit()) return { fehler: 'Der Mailversand ist nicht eingerichtet.' };
  try {
    await verbindung().verify();
    return { ok: true };
  } catch (e) {
    return { fehler: 'Der Mailserver antwortet nicht: ' + e.message };
  }
}

/** Sieht die Adresse brauchbar aus? Bewusst großzügig geprüft. */
export function adresseGueltig(adresse) {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(String(adresse || '').trim());
}

/**
 * Erzeugt ein Kennwort, das man am Telefon vorlesen kann: zwei sprechbare
 * Silbenwoerter und vier Ziffern. Die Mitlaute lassen l und j aus, die sich
 * in vielen Schriften nur schwer unterscheiden lassen.
 * Das ergibt rund 38 Bit, zusammen mit der Sperre nach acht Fehlversuchen
 * reicht das fuer eine Einladung, die ohnehin geaendert werden soll.
 */
export function kennwortWuerfeln() {
  const anlaut = 'bdfghkmnprstvwz';
  const laut = 'aeiou';
  const wuerfel = n => crypto.randomInt(0, n);
  const silben = z => {
    let w = '';
    for (let i = 0; i < z; i++) w += anlaut[wuerfel(anlaut.length)] + laut[wuerfel(laut.length)];
    return w;
  };
  return `${silben(2)}-${silben(2)}-${crypto.randomInt(1000, 10000)}`;
}

/**
 * Setzt die Einladung im Ton des 17. Jahrhunderts.
 * Liefert Betreff, Klartext und eine schlichte HTML-Fassung.
 *
 * Bewusst wird KEIN bestimmtes Fürstenthum genannt: welche Region jemand
 * bekommt, entscheidet sich erst beim Beitritt zu einer Runde in der Lobby.
 * Ein Brief, der Bayern verspricht, während der Platz dann Hessen ist, wäre
 * eine Zusage, die das Spiel nicht hält.
 */
export function einladungSetzen({ name, kennwort, weiblich, vonWem, adresse }) {
  const anrede = weiblich ? 'Hochwohlgeborene Frau' : 'Hochwohlgeborener Herr';
  const betreff = 'Bestallung zu einem Fürstenthum im Heiligen Römischen Reiche';

  const text = `${anrede} ${name},

es hat der Allmächtige, dem alle Cronen und Zepter zu eigen sind, in seinem
unerforschlichen Rathschlusse verfüget, daß Euch die göttliche Aufgabe
zugetheilet werde, ein Fürstenthum zu führen und Eure Macht zu mehren, bis
daß Ihr dereinst die Cron des Kaisers traget.

Welches Land Euch zufalle, ob Preußen, Bayern, Sachsen oder ein anderes, das
erfahret Ihr, wenn Ihr eintretet und Euch einer Tafel anschließet.

So nehmet denn an, was Euch anvertrauet ist: Land und Leute, Korn und Kasse,
Waffen und Wälle. Sorget, daß Euer Volk zu essen habe, denn ein hungernd Volk
ist kein treu Volk. Leget die Steuern mit Maaßen auf, denn wer zu vil nimmt,
dem laufen die Unterthanen davon. Bauet Märkte und Mühlen, ehe Ihr an Palast
und Cathedral denket. Und führet Krieg erst, wenn Eure Schatzkammer ihn traget.

Zum Beweis Eurer Person ist Euch beygefüget:

    Nahme:     ${name}
    Kennwort:  ${kennwort}

Traget Sorge, daß niemand es erfahre, und ändert es, sobald Ihr das erste
Mal eingetreten seyd. Das Thor zu Eurem Fürstenthum findet Ihr allhier:

    ${adresse}

${vonWem ? `Ausgefertiget zu Händen durch ${vonWem}.\n` : ''}Gegeben in dieser Kanzley, im Jahre der Gnaden, da wir schreiben ${new Date().getFullYear()}.

Gott befohlen.
Die Reichskanzley zu Kaiser`;

  const html = `<!doctype html><html lang="de"><meta charset="utf-8">
<body style="margin:0;padding:24px;background:#cdbf9e;
  font-family:'Hoefler Text',Georgia,'Times New Roman',serif;color:#2a2118;">
<div style="max-width:640px;margin:0 auto;background:#e6dbc0;
  border:1px solid #a8977a;padding:28px 32px;">
  <div style="font-size:26px;letter-spacing:.04em;border-bottom:3px double #a8977a;
    padding-bottom:10px;margin-bottom:18px;">${betreff}</div>
  <p>${anrede} ${name},</p>
  <p>es hat der Allmächtige, dem alle Cronen und Zepter zu eigen sind, in seinem
     unerforschlichen Rathschlusse verfüget, daß Euch die göttliche Aufgabe
     zugetheilet werde, ein Fürstenthum zu führen und Eure Macht zu mehren, bis
     daß Ihr dereinst die Cron des Kaisers traget.</p>
  <p>Welches Land Euch zufalle, ob Preußen, Bayern, Sachsen oder ein anderes, das
     erfahret Ihr, wenn Ihr eintretet und Euch einer Tafel anschließet.</p>
  <p>So nehmet denn an, was Euch anvertrauet ist: Land und Leute, Korn und Kasse,
     Waffen und Wälle. Sorget, daß Euer Volk zu essen habe, denn ein hungernd Volk
     ist kein treu Volk. Leget die Steuern mit Maaßen auf, denn wer zu vil nimmt,
     dem laufen die Unterthanen davon. Bauet Märkte und Mühlen, ehe Ihr an Palast
     und Cathedral denket. Und führet Krieg erst, wenn Eure Schatzkammer ihn traget.</p>
  <p>Zum Beweis Eurer Person ist Euch beygefüget:</p>
  <table style="border-collapse:collapse;background:#f1e9d6;border:1px solid #a8977a;
    margin:14px 0;width:100%;">
    <tr><td style="padding:7px 12px;border-bottom:1px solid #c3b494;">Nahme</td>
        <td style="padding:7px 12px;border-bottom:1px solid #c3b494;"><b>${name}</b></td></tr>
    <tr><td style="padding:7px 12px;">Kennwort</td>
        <td style="padding:7px 12px;"><b style="font-family:ui-monospace,monospace;
          font-size:17px;letter-spacing:.06em;">${kennwort}</b></td></tr>
  </table>
  <p>Traget Sorge, daß niemand es erfahre, und ändert es, sobald Ihr das erste
     Mal eingetreten seyd.</p>
  <p style="text-align:center;margin:22px 0;">
    <a href="${adresse}" style="display:inline-block;background:#40602f;color:#f1e9d6;
      padding:11px 26px;text-decoration:none;border:1px solid #2c4420;">
      Zum Fürstenthum eintreten</a>
  </p>
  <p style="font-size:14px;color:#6b5d4a;">Sollte der Knopf nicht dienen, so rufet
     diese Adresse auf:<br><span style="word-break:break-all;">${adresse}</span></p>
  <p style="border-top:1px solid #a8977a;padding-top:14px;font-style:italic;">
    ${vonWem ? `Ausgefertiget zu Händen durch ${vonWem}.<br>` : ''}
    Gegeben in dieser Kanzley, im Jahre der Gnaden, da wir schreiben
    ${new Date().getFullYear()}.<br>Gott befohlen. Die Reichskanzley zu Kaiser</p>
</div></body></html>`;

  return { betreff, text, html };
}

/**
 * Verschickt eine Einladung. Das Kennwort steht nur in der Mail, nie im
 * Protokoll.
 */
export async function einladen({ an, name, kennwort, weiblich, vonWem }) {
  if (!bereit()) return { fehler: 'Der Mailversand ist nicht eingerichtet.' };
  if (!adresseGueltig(an)) return { fehler: 'Diese Mailadresse sieht nicht richtig aus.' };

  const brief = einladungSetzen({ name, kennwort, weiblich, vonWem, adresse: WEB });
  try {
    const e = await verbindung().sendMail({
      from: VON, to: an,
      subject: brief.betreff, text: brief.text, html: brief.html
    });
    console.log(`Einladung an ${an} für ${name} verschickt (${e.messageId}).`);
    return { ok: true, id: e.messageId };
  } catch (e) {
    console.error(`Einladung an ${an} fehlgeschlagen: ${e.message}`);
    return { fehler: 'Die Einladung ließ sich nicht versenden: ' + e.message };
  }
}
