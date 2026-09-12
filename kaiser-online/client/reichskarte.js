// Eine Uebersicht der neun Fuerstentuemer und ihrer Grenzen.
//
// Das Original hat so eine Karte nicht. Es zeigt den Angriffsweg erst,
// nachdem man einen Gegner gewaehlt hat, und das Handbuch beschreibt die
// Nachbarschaften nur in Worten: "Preussen hat zum Beispiel eine direkte
// Grenze zu Hessen und Boehmen. Daraus ergibt sich, dass Preussen zwar
// Hessen angreifen kann, aber bei einem Angriff auf Bayern den Durchmarsch
// durch Hessen oder Boehmen gewaehrt bekommen muss."
//
// Die Grenzen selbst sind nicht erfunden: sie stehen in den Angriffswegen des
// Originals (DATA-Zeilen 960 bis 963). Ein Weg ohne Zwischenland ist eine
// gemeinsame Grenze. Der Server rechnet sie aus und schickt sie mit.
//
// Die Lage der Laender auf dem Blatt ist unsere Wahl. Sie folgt grob der
// Geographie, kann aber nicht alle Grenzen als Nachbarschaft abbilden;
// deshalb sind die Grenzen als Linien gezeichnet.

const PLATZ = {
  PREUSSEN:    [0.62, 0.12],
  FLANDERN:    [0.11, 0.24],
  HESSEN:      [0.33, 0.37],
  SACHSEN:     [0.56, 0.36],
  MÄHREN:      [0.90, 0.26],
  BÖHMEN:      [0.77, 0.50],
  'DER PFALZ': [0.14, 0.63],
  BAYERN:      [0.42, 0.71],
  TIROL:       [0.70, 0.83]
};

// Namen von Mitspielern gehen in SVG-Text; maskieren, siehe esc() in app.js.
const esc = wert => String(wert ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const BREITE = 620, HOEHE = 400;
const punkt = name => {
  const p = PLATZ[name] || [0.5, 0.5];
  return [p[0] * BREITE, p[1] * HOEHE];
};

/**
 * Baut die Karte als SVG.
 * @param {object} reich   { regionen, nachbarn } vom Server
 * @param {number} eigene  Index des eigenen Fuerstentums, oder -1
 * @param {object[]} spieler  Spielerliste, um besetzte Laender zu kennzeichnen
 */
export function reichskarteSvg(reich, eigene, spieler = []) {
  if (!reich || !reich.regionen) return '';
  const { regionen, nachbarn } = reich;
  // Die Spielerliste nennt die Region als Namen; die Nummer steht daneben.
  // Eine Map statt eines Objekts: der Schluessel kommt vom Server, und in eine
  // Map laesst sich kein "__proto__" hineinschreiben.
  const wer = new Map();
  for (const s of spieler) if (s.regionIndex != null) wer.set(Number(s.regionIndex), s);

  // Grenzen einsammeln. Was nur in eine Richtung geht, wird als Pfeil
  // gezeichnet; das gibt es im Original zweimal.
  const kanten = [];
  const gesehen = new Set();
  regionen.forEach((_, a) => {
    for (const b of nachbarn[a] || []) {
      const schluessel = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (gesehen.has(schluessel)) continue;
      gesehen.add(schluessel);
      const hin = (nachbarn[a] || []).includes(b);
      const zurueck = (nachbarn[b] || []).includes(a);
      kanten.push({ a, b, einseitig: !(hin && zurueck) });
    }
  });

  const meineNachbarn = eigene >= 0 ? new Set(nachbarn[eigene] || []) : new Set();

  const linien = kanten.map(k => {
    const [x1, y1] = punkt(regionen[k.a]);
    const [x2, y2] = punkt(regionen[k.b]);
    const meine = eigene >= 0 && (k.a === eigene || k.b === eigene);
    const klasse = 'grenze' + (meine ? ' meine' : '') + (k.einseitig ? ' einseitig' : '');
    const marke = k.einseitig ? ' marker-end="url(#spitze)"' : '';
    return `<line class="${klasse}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}"
      x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"${marke}></line>`;
  }).join('');

  const knoten = regionen.map((name, i) => {
    const [x, y] = punkt(name);
    const s = wer.get(i);
    const klassen = ['land'];
    if (i === eigene) klassen.push('eigen');
    else if (meineNachbarn.has(i)) klassen.push('nachbar');
    if (s) klassen.push('besetzt');
    if (s && s.tot) klassen.push('herrenlos');
    const beschriftung = s
      ? `<text class="fuerst" x="${x.toFixed(1)}" y="${(y + 26).toFixed(1)}">${esc(s.titel + ' ' + s.name)}</text>`
      : '';
    return `<g class="${klassen.join(' ')}">
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s ? 13 : 9}"></circle>
      <text class="name" x="${x.toFixed(1)}" y="${(y - 17).toFixed(1)}">${esc(name)}</text>
      ${beschriftung}
    </g>`;
  }).join('');

  return `<svg viewBox="0 0 ${BREITE} ${HOEHE}" class="reichsbild" role="img"
      aria-label="Übersicht der Fürstentümer und ihrer Grenzen">
    <defs>
      <marker id="spitze" viewBox="0 0 10 10" refX="9" refY="5"
        markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z"></path>
      </marker>
    </defs>
    ${linien}${knoten}
  </svg>`;
}

/** Der Text unter der Karte: was von hier aus unmittelbar zu erreichen ist. */
export function reichskarteErklaerung(reich, eigene) {
  if (!reich || eigene < 0) return '';
  const { regionen, nachbarn } = reich;
  const meine = nachbarn[eigene] || [];
  const fern = regionen.map((_, i) => i).filter(i => i !== eigene && !meine.includes(i));
  const einseitig = [];
  for (const b of meine) if (!(nachbarn[b] || []).includes(eigene)) einseitig.push(regionen[b]);
  for (let b = 0; b < regionen.length; b++) {
    if (b !== eigene && (nachbarn[b] || []).includes(eigene) && !meine.includes(b)) {
      einseitig.push(regionen[b] + ' (nur von dort hierher)');
    }
  }
  return `<p class="klein">Von <b>${regionen[eigene]}</b> aus grenzen Sie unmittelbar an
      ${meine.map(i => regionen[i]).join(', ')}. Diese Länder können Sie ohne Weiteres
      angreifen. Nach ${fern.map(i => regionen[i]).join(', ')} kommen Sie nur, wenn ein
      Land dazwischen den Durchmarsch gewährt.</p>
    ${einseitig.length
      ? `<p class="klein">Einseitige Grenzen im Original: ${einseitig.join(', ')}.</p>`
      : ''}`;
}
