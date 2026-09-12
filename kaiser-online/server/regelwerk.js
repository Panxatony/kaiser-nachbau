// Zwei Regelwerke zur Wahl.
//
// "Original 1984" ist der Nachbau, Zeile für Zeile aus dem BASIC. So hat das
// Spiel sich damals angefuehlt, mitsamt seinen Eigenheiten.
//
// "Fassung 2026" aendert sechs Stellen, an denen Messungen gezeigt haben, dass
// das Spiel seine Spannung verliert. Jede Aenderung steht unten mit dem Befund,
// der zu ihr gefuehrt hat. Alles andere bleibt, wie es war: Wetter, Ernte,
// Kornkreislauf, Bevoelkerung, die zwoelf Kennzahlen des Titelaufstiegs und das
// gemeinsame Todesjahr sind in beiden Fassungen gleich.

export const REGELWERKE = {

  original: {
    id: 'original',
    name: 'Original 1984',
    kurz: 'Die Regeln des C64-Spiels, Zeile für Zeile nachgebaut.',

    zinsGedeckelt: false,
    moralZurMitte: false,
    manoeverGedeckelt: false,
    moralGrenze: Infinity,
    heimvorteil: 0,
    schlachtStreuung: 0,
    sockelverlust: 0,
    landJeFuerst: 0            // 0 heisst: Land entsteht aus dem Nichts
  },

  neu: {
    id: 'neu',
    name: 'Fassung 2026',
    kurz: 'Sechs Regeln geändert, damit Geld knapp bleibt und Kriege ein Wagnis sind.',

    /**
     * 1. Zinsen nur auf Kapital bis zur Bonitaet.
     *
     * Befund: wer nur sein Volk satt haelt und Steuern zieht, hat Anno 1759
     * 2,6 Millionen Taler. Bei 200.000 Talern sind 93 Prozent des Einkommens
     * Zinsen, bei einer Million 99. Zoll, Mehrwertsteuer, Einkommensteuer und
     * Justiz werden damit zur Dekoration.
     *
     * Die Bonitaet ist eine Zahl, die das Handbuch selbst nennt: 10.000 Taler
     * zu Beginn, mit jedem Titel 10.000 mehr. Im Original dient sie nur als
     * Schuldengrenze. Hier begrenzt sie auch, wie viel Kapital Zinsen traegt:
     * ein Herr bekommt hoechstens 1.000 Taler im Jahr, ein Kaiser 9.000. Das
     * liegt in der Groessenordnung der Steuern. Schulden verzinsen sich
     * weiterhin in voller Hoehe.
     */
    zinsGedeckelt: true,

    /**
     * 2. Die Moral kehrt zur Mitte zurueck, statt gegen null zu fallen.
     *
     * Befund: im Original faellt sie jedes Jahr um ein Zehntel und liegt bei
     * einem sorgfaeltigen Aufbauspieler Anno 1740 bei 0,01. Da im Kampf nur
     * das Verhaeltnis der Moralwerte zaehlt, macht das den festen Zuschlag
     * eines Manoevers mit der Zeit beliebig maechtig.
     *
     * Statt o = o * 0.9 gilt o = o + (1 - o) / 10. Die Moral bewegt sich
     * damit auf eins zu, von oben wie von unten. Soeldner, Manoever, Siege
     * und Niederlagen sind Ausschlaege um eine Norm, kein Uhrwerk.
     */
    moralZurMitte: true,

    /**
     * 3. Manoever mit fallendem Ertrag, Moral gedeckelt.
     *
     * Befund: 772 Manoever in einem Jahr sind bezahlbar und bringen die Moral
     * auf 78. Das ist ein Kaufknopf fuer den Sieg.
     *
     * Das erste Manoever eines Jahres bringt 0,1, jedes weitere die Haelfte
     * des vorigen. Damit sind auch unendlich viele Manoever hoechstens 0,2
     * wert. Die Moral steigt ausserdem nie ueber 2.
     */
    manoeverGedeckelt: true,
    moralGrenze: 2,

    /**
     * 4. Der Verteidiger hat einen Heimvorteil.
     *
     * Befund: bei gleicher Staerke und gleicher Moral gewinnt der Angreifer,
     * sobald beide Seiten weit von der Grenze aufstellen, 58 von 60 Schlachten.
     * Einen Heimvorteil gibt es nicht, obwohl das Handbuch dem Verteidiger
     * ausdruecklich einen zuspricht: er bestimme das Schlachtfeld und koenne
     * das Gelaende nutzen.
     *
     * Wer auf eigenem Boden angegriffen wird, dessen Wehrwert steigt um ein
     * Viertel. Das macht einen Angriff bei Gleichstand zum Wagnis.
     */
    heimvorteil: 0.25,

    /**
     * 5. Der Ausgang streut, und auch ein Sieg kostet.
     *
     * Befund: 12 gegen 20 Einheiten verliert in 59 von 60 Schlachten, 32 gegen
     * 20 gewinnt in 60 von 60. Es gibt keinen spannenden Bereich dazwischen.
     *
     * Der Landgewinn wird am Ende mit einem Wert zwischen 0,6 und 1,4
     * vervielfacht, und beide Seiten verlieren zusaetzlich ein Zehntel ihrer
     * ueberlebenden Einheiten. Ein Angriff mit anderthalbfacher Uebermacht ist
     * damit kein sicheres Geschaeft mehr.
     */
    schlachtStreuung: 0.4,
    sockelverlust: 0.1,

    /**
     * 6. Das Reich hat eine feste Flaeche.
     *
     * Befund: Land ist der bindende Faktor fuer den Titelaufstieg, aber man
     * kauft es einfach mit dem ueberschuessigen Geld. Solange Land aus dem
     * Nichts entsteht, ist Krieg nie noetig.
     *
     * Das Reich misst 30.000 Hektar je Fuerstentum am Tisch. Jeder beginnt mit
     * 15.000, also liegt zu Anfang die Haelfte des Reiches brach. Wer kauft,
     * nimmt aus diesem gemeinsamen Vorrat; wer verkauft, gibt zurueck. Ist der
     * Vorrat aufgebraucht, wechselt Land nur noch durch Krieg den Besitzer.
     *
     * Damit wird aus dem Wettlauf um den Titel ein Wettlauf um Boden, und der
     * Krieg bekommt den Zweck, den das Handbuch ihm zuschreibt.
     */
    landJeFuerst: 30000
  }
};

export const STANDARD = REGELWERKE.original;

/** Liefert ein Regelwerk zu seiner Kennung, mit dem Original als Rueckfall. */
export function regelwerk(id) {
  return REGELWERKE[id] || STANDARD;
}
