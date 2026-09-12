// Hilfetexte zu jedem Schritt der Planung.
//
// **Die Regel dieser Datei**: hier darf nur stehen, was ein Spieler von 1984
// auch wissen konnte. Es gibt genau zwei Quellen:
//
//   1. Was auf dem C64-Bildschirm stand. Das sind die 225 Textzeilen des
//      BASIC-Programms, vom "Nötiges Korn" des ersten Bildes bis zum
//      "ZU VIELE SOLDATEN !" der Rekrutierung.
//   2. Was im gedruckten Handbuch von 1984 steht. Ratschlaege kommen nur von
//      dort und sind als "Aus dem Handbuch" gekennzeichnet.
//
// Was das Programm im Verborgenen rechnet, bleibt verborgen: Formeln,
// Schwellenwerte, der Zinssatz, die Moral, die Kennzahlen des Titelaufstiegs.
// Der Autor des Handbuchs schreibt dazu selbst, er wolle "lediglich Tips und
// Hinweise geben" und keine genauen Angaben; den eigenen Stil soll jeder
// selbst finden. Wer im Nachbau mehr erklaert, nimmt dem Spiel diese Reise.
//
// Ausnahme sind Dinge, die es im Original gar nicht gibt und die darum auch
// niemand erraten kann: die Fristen, der Verwalter, der Feldherr, die zwei
// Regelwerke. Sie sind unsere Zutat und werden als solche benannt.
//
// Eine dritte Quelle ist die Kurzanleitung, die dem Spiel beilag. Sie nennt
// drei Zahlen, die das Handbuch nicht nennt: einen Markt und eine Muehle je
// 1.000 Hektar, und die Absetzung unter 500 Einwohnern. Wo sie benutzt wird,
// steht es im Quelltext daneben.

const zahl = n => Math.round(n).toLocaleString('de-DE');
const komma = (n, stellen = 1) =>
  Number(n).toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
const int = Math.trunc;

/** Kleine Bausteine für wiederkehrende Formen. */
const absatz = t => `<p>${t}</p>`;
const liste = e => `<ul>${e.map(x => `<li>${x}</li>`).join('')}</ul>`;
const lage = (text, gut) =>
  `<p class="meldung ${gut ? 'gut' : 'warnung'}">${text}</p>`;

/**
 * Ein Rat aus dem gedruckten Handbuch, als Zitat kenntlich gemacht und mit
 * Seitenangabe. Die Quelle steht dabei, damit jeder nachschlagen kann und
 * sichtbar bleibt, dass es ein Zitat ist und kein eigener Einfall.
 */
const handbuch = (t, seite) =>
  `<div class="handbuch"><b>Aus dem Handbuch</b><p>${t}</p>
     <p class="quelle">Handbuch zu Kaiser, Ariolasoft 1984, ${seite}</p></div>`;

/**
 * Liefert Titel und Inhalt der Hilfe zum angegebenen Schritt.
 * @param {number} schritt 1 bis 8
 * @param {object} r Rundendaten
 * @param {object} i eigener Spielstand
 */
export function hilfeZu(schritt, r, i) {
  switch (schritt) {

    // Bild 1 des Originals. Angezeigt werden dort: das Wetter im Klartext,
    // der verfaulte Anteil, Kornreserve, Nötiges Korn, Korn- und Landpreis,
    // Landbesitz, Vermögen und der Kornspeicher. Wovon die Erntemenge
    // abhaengt, sagt weder Bildschirm noch Handbuch; darum steht es hier auch
    // nicht.
    case 1: return { titel: 'Ernte und Preise', inhalt:
      absatz('Zu Jahresbeginn wird geerntet. Wie gut sie ausfällt, hängt vom Wetter ab: von der Dürre, bei der eine Hungersnot droht, bis zum tollen Wetter mit Rekordernte.') +
      liste([
        'Ein Teil Ihrer Kornreserve verfault jedes Jahr. Wie viel es war, steht oben.',
        'Korn- und Landpreis stehen jedes Jahr neu.'
      ]) +
      handbuch('Der Kornspeicher zeigt nicht Ihre ganze Reserve, sondern achtzig Prozent davon, also die Menge, die Sie höchstens ausgeben dürfen. Achten Sie immer auf seine Füllhöhe. Haben Sie weniger Korn, als unter Nötiges Korn steht, können Sie auch nur weniger ausgeben, und das hat fatale Folgen: ein Teil Ihrer Bevölkerung verhungert.', 'Seite 7 und 8') +
      (i.korn < i.bedarf
        ? lage(`Ihre Reserve von ${zahl(i.korn)} Maß deckt den Jahresbedarf von ${zahl(i.bedarf)} Maß nicht.`, false)
        : lage(`Ihre Reserve von ${zahl(i.korn)} Maß deckt den Jahresbedarf von ${zahl(i.bedarf)} Maß.`, true))
    };

    // Die Provision von zehn Prozent und die Preisspannen stehen im Handbuch,
    // Seite 15. Die Landgrenze "ein Hektar je Einwohner" steht auf Seite 9.
    // Wie viel der Markt hoechstens hergibt, sagt das Original nicht vorher,
    // sondern erst beim Anstossen: "VORRÄTE ERSCHÖPFT!".
    case 2: return { titel: 'Markt', inhalt:
      absatz('Hier handeln Sie mit Korn und Land. Sie können beliebig oft kaufen und verkaufen, solange die Kasse es hergibt.') +
      liste([
        `Korn kostet ${zahl(r.markt.kornpreis)} Taler je tausend Maß.`,
        `Land kostet ${komma(r.markt.landpreis)} Taler je Hektar.`,
        'Bei jeder Verkaufsaktion werden zehn Prozent Provision abgezogen.',
        'Der Markt gibt nicht beliebig viel Korn her. Ist der Vorrat erschöpft, meldet er es.',
        'Jeder Einwohner erfordert mindestens einen Hektar Land.'
      ]) +
      handbuch('Die Kornpreise liegen in einem Bereich zwischen etwa 20 und 430 Talern, die Landpreise schwanken zwischen etwa 16 und 70. Kaufen Sie zu einem Ihnen günstig erscheinenden Preis und verkaufen Sie, wenn die Preise sehr hoch sind. Haben Sie nur noch geringe Kornreserven und fällt die Ernte durch schlechtes Wetter schlecht aus, sind die Kornpreise meistens sehr hoch. Bessert sich dieser Zustand nach zwei bis drei Jahren nicht, kaufen Sie trotz der hohen Kosten einen größeren Vorrat ein; die Praxis hat gezeigt, daß die Kornpreise auf diese Art zumindest oft gefallen sind.', 'Seite 15 und 16') +
      lage(`Sie haben ${zahl(i.kasse)} Taler, ${zahl(i.korn)} Maß Korn und ${zahl(i.land)} Hektar Land.`, true)
    };

    // Der Vertrag ueber 20 bis 80 Prozent steht im Handbuch, Seite 7, mitsamt
    // der Folge: wer zu wenig gibt, dessen Volk verhungert zum Teil. Wie das
    // Programm den Bedarf errechnet und wie genau es die Toten zaehlt, steht
    // nirgends.
    case 3: {
      const min = int(i.korn / 5), max = int(i.korn * 0.8);
      return { titel: 'Korn an das Volk verteilen', inhalt:
        absatz('Einmal im Jahr geben Sie Korn an Ihr Volk aus. Ein Vertrag verpflichtet Sie, zwischen zwanzig und achtzig Prozent Ihrer Kornreserven auszugeben.') +
        liste([
          `Erlaubt sind ${zahl(min)} bis ${zahl(max)} Maß.`,
          `Benötigt werden ${zahl(i.bedarf)} Maß.`,
          'Geben Sie weniger, als nötig ist, verhungert ein Teil Ihrer Bevölkerung.'
        ]) +
        handbuch('Um Ihrem Land über die Landesgrenzen hinweg einen guten Ruf zu geben, ist zu überlegen, eine größere Kornmenge an das Volk auszugeben als nur die unter Nötiges Korn angegebene. Es lohnt sich meistens, und die ersten Einwanderer werden nicht lange auf sich warten lassen. Wägen Sie jedoch ab, in welchem Maß Sie mehr Korn ausgeben: ist die Menge zu gering, dürfen Sie keine große Reaktion erwarten, geben Sie dagegen zuviel, ist das auch nicht immer von Vorteil.', 'Seite 16') +
        (max < i.bedarf
          ? lage(`Auch die größte erlaubte Gabe von ${zahl(max)} Maß bleibt unter dem Bedarf von ${zahl(i.bedarf)} Maß. Ein Teil Ihres Volkes wird verhungern.`, false)
          : lage(`Mit ${zahl(i.bedarf)} Maß ist Ihr Volk satt.`, true))
      };
    }

    // Bild 2 des Originals. Der erste Absatz ist das Handbuch, Seite 9, fast
    // woertlich. Die Betraege stehen jedes Jahr auf dem Bild; die Saetze
    // dahinter (was ein Markt einbringt, was ein Soldat kostet) nicht.
    // Die Grenze von 500 Einwohnern stammt aus der Kurzanleitung.
    case 4: return { titel: 'Ihr Volk', inhalt:
      absatz('Dieses Bild gibt Ihnen Aufschluß über die Ereignisse des Jahres und gestattet keine Spielaktionen. Sie sehen die Geburtenzahl, die Zahl der Todesfälle und wie viele Einwanderer kamen. Unter widrigen Umständen steht hier auch, wie viele Einwohner Ihr Land verlassen haben. Dazu die Einnahmen durch Marktplätze und Kornmühlen und die Kosten für Ihre Armee.') +
      liste([
        'Wer das Land verlässt, tut es als Opfer des Staatshaushaltes: als Antwort auf Ihre Steuern und Ihre Justiz.',
        'Fallen die Einwohner in Ihrem Staat unter 500, werden Sie für ein Jahr abgesetzt.'
      ])
    };

    // Bild 3 des Originals. Der erste Absatz und der Rat am Ende stehen im
    // Handbuch, Seite 10 und 16. Welche Kennzahl an welcher Steuer haengt,
    // steht nirgends; das Bild zeigt nur die Betraege.
    case 5: return { titel: 'Steuern', inhalt:
      absatz('Die Staatseinnahmen sind für Ihre Staatskasse von größter Bedeutung; nur mit guten Einnahmen können Sie Ihr Land aufbauen und unterhalten. Sie setzen drei Steuersätze und die Härte Ihrer Justiz. Die Justiz kennt vier Stufen: sehr fair, bescheiden, hart und gierig. Die Steuersätze können Sie beliebig oft ändern.') +
      absatz('Die Vorschau zeigt Ihnen, was Zoll, Mehrwertsteuer, Einkommensteuer und Justiz in diesem Jahr beisteuern würden. Nach dem Einzug lassen sich die Sätze nicht mehr ändern.') +
      absatz('Wer sein Volk zu hart belastet, findet im nächsten Bild, wie viele Einwohner als Opfer des Staatshaushaltes das Land verlassen haben.') +
      handbuch('Wenn Sie den Titel des Königs erreicht haben, sollten Sie sich eine neue Zusammenstellung Ihrer Steuersätze überlegen. Als König haben Sie größere Rechte und erhalten auch größere Beträge in Bezug auf Zoll oder Einkommensteuer.', 'Seite 16') +
      lage(`Ihre Sätze zusammen: ${i.zoll + i.mwst + i.est} Prozent.`, true)
    };

    // Bild 5 des Originals. Preise, Teilezahlen und Landgrenzen stehen im
    // Handbuch, Seite 11. Dass Land auch Bauwerke kostet, sagt der Bildschirm
    // ("Sie haben wegen Landmangel folgende Gebäude verloren"); ab welcher
    // Hektarzahl, sagt er nicht. Ein Bauwerk je 1.000 Hektar: Kurzanleitung.
    case 6: {
      const d = int(i.land / 1000);
      return { titel: 'Staatseinkäufe', inhalt:
        absatz('Jetzt ist der Zeitpunkt gekommen, an dem Sie entscheiden müssen, was Sie mit Ihrer Staatskasse anfangen wollen.') +
        liste([
          'Ein Marktplatz kostet 1.000 Taler, eine Kornmühle 2.000. Für beide brauchen Sie 1.000 Hektar Land; je tausend Hektar trägt Ihr Land einen Markt und eine Mühle.',
          'Ein Palastteil kostet 5.000 Taler; für einen Palast brauchen Sie mindestens 13.000 Hektar. Ein vollständiger Palast besteht aus sechzehn Teilen.',
          'Ein Kathedralenteil kostet 9.000 Taler; für eine Kathedrale brauchen Sie 25.000 Hektar. Sie besteht aus vierzehn Teilen.',
          'Verlieren Sie Land, verlieren Sie auch Bauwerke.'
        ]) +
        handbuch('Zu Beginn des Spieles halten sich die Steuereinnahmen sehr in Grenzen. Um diese Phase des Aufbauens zu erleichtern, ist es ratsam, Mühlen und Marktplätze zu errichten. Sie erhalten so zusätzliche Einnahmen in nicht unbeträchtlicher Höhe.', 'Seite 16') +
        lage(`Bei ${zahl(i.land)} Hektar tragen Sie bis zu ${Math.max(0, d - 1)} Märkte und ebenso viele Mühlen. Sie haben ${i.maerkte} und ${i.muehlen}.`, true)
      };
    }

    // Die Truppenbeschreibungen stehen fast woertlich im Handbuch, Seite 11
    // und 12, die Diplomatie auf Seite 14. Der Kampfwert selbst, die Moral
    // und die Grenze fuer Rekruten sind unsichtbar; das Original meldet nur
    // "ZU VIELE SOLDATEN !" und "ES IST NOCH ZU FRÜH!".
    case 7: {
      return { titel: 'Militär und Krieg', inhalt:
        absatz('Sie können Soldaten aus Ihrer Bevölkerung rekrutieren oder Söldner anwerben. Jede Truppe hat ihre Besonderheiten.') +
        liste([
          '<b>Kavallerie</b> hat im Krieg die größte Reichweite.',
          '<b>Artillerie</b> ist fest aufgestellt und kann nur schießen.',
          '<b>Infanterie</b> ist die kostengünstigste Truppe und wird meistens in größerer Anzahl eingesetzt. Ihre Reichweite ist nicht ganz so gut wie die der Kavallerie, aber zu Fuß geht es nun mal nicht so schnell.',
          '<b>Miliz</b> ist die Bürgerwehr. Sie können sie nicht kaufen; Sie erhalten sie automatisch, abhängig von der Menge an Marktplätzen und Kornmühlen. Sie verteidigt nur.',
          '<b>Söldner</b> sind erheblich teurer, nicht nur in der Anschaffung, sondern auch im Unterhalt. Dafür reduzieren sie Ihre Bevölkerung nicht, und ihr anfänglicher Kampfwert ist besser, da es sich um bereits ausgebildete Soldaten handelt.',
          'Ein <b>Manöver</b> verbessert den Kampfwert Ihrer Truppen und kostet einen Betrag, der von der Anzahl Ihrer Truppen abhängt. Sie können in einem Jahr so viele Manöver veranstalten, wie Sie wollen.'
        ]) +
        absatz('Rekruten kommen aus Ihrem Volk. Sind zu wenige da, weist das Spiel den Kauf ab. Söldner kosten keine Einwohner.') +
        lage(`Sie haben ${zahl(i.einwohner)} Einwohner, ${zahl(i.soldaten)} Soldaten und ${i.miliz} Einheiten Bürgerwehr aus Ihren Bauwerken.`, true) +
        absatz('<b>Krieg</b> lässt sich nicht vom ersten Jahr an führen; zu Beginn ist es dafür noch zu früh. Die Erklärung wird erst nach der Planungsphase aufgedeckt. Dann werden die übrigen Regenten gefragt, ob sie eine der beiden streitenden Parteien unterstützen, den fremden Armeen Durchmarsch durch ihr Land gewähren oder sich völlig neutral verhalten wollen. Wer unterstützt, stellt dem Unterstützten sämtliche Truppen mit Ausnahme der Miliz leihweise zur Verfügung.') +
        absatz('Ein Angriff ist nur möglich, wenn eine Grenze dorthin führt, unmittelbar oder über ein Land, das Durchmarsch gewährt. Die Grenzen der Staaten sind historischen Gegebenheiten nachempfunden.')
      };
    }

    // Zinsen, Bonitaet, Pfaendung und das Todesjahr stehen im Handbuch,
    // Seite 13, das Spielziel auf Seite 14. Der Zinssatz, die Kennzahlen des
    // Titelaufstiegs und das genaue Sterbejahr stehen nirgends.
    case 8: return { titel: 'Zug beenden', inhalt:
      absatz('Wenn Sie fertig sind, beenden Sie Ihren Zug. Sobald alle Spieler fertig sind, geht es sofort weiter, die Frist muss nicht ablaufen.') +
      liste([
        'Nach der Beendigung des Spielzuges werden die Zinsen für Ihr Kapital oder für Ihre Schulden berechnet.',
        'Außerdem wird überprüft, ob eine neue Titelverleihung fällig ist. Mit einem neuen Titel steigt Ihre Bonität um jeweils 10.000 Taler. Die Anfangsbonität liegt bei 10.000 Talern.',
        'Dabei ist jedoch nicht ausgeschlossen, daß die Schuldner ihr Geld zurückverlangen. In einem solchen Fall werden alle Ihre Besitztümer gepfändet, bis Ihre Schulden abgetragen sind.',
        'Jeder Mensch hat nur eine begrenzte Lebenserwartung. Zu Beginn des Spieles wird für alle Spieler das Todesjahr festgelegt. Es wird ungefähr zwischen 1760 und 1768 liegen, und ist für alle Spieler gleich.'
      ]) +
      absatz('<b>Ziel ist der Kaiser des Heiligen Römischen Reiches Deutscher Nation.</b> Dafür müssen Sie fünf Städte errichten, jede aus fünf Marktplätzen und drei Kornmühlen, also fünfundzwanzig Märkte und fünfzehn Mühlen. Dazu mindestens 25.000 Hektar Land, 100.000 Taler in bar, einen Palast und schließlich die Kathedrale. Mit der Krönungszeremonie ist das Spiel beendet.')
    };

    default: return { titel: 'Hilfe', inhalt: absatz('Zu diesem Schritt gibt es keine Hilfe.') };
  }
}
