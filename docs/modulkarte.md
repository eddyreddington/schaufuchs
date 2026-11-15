# Modulkarte

Erzeugt mit `bun run modulkarte` aus `scripts/modulkarte.ts` – nicht von Hand ändern. Erst hier suchen, dann die genannte Datei öffnen.
Überblick: `docs/architektur.md`, Moduldoku: `docs/module/`, Entscheidungen: `docs/entscheidungen/`. ⚠ = über 600 Zeilen.

Inhalt: [Fachlogik](#fachlogik-packagesdomainsrc) · [tRPC-Prozeduren](#trpc-prozeduren-appsserversrcrouters) · [Seiten](#seiten-appswebsrcseiten) · [Weitere Dateien](#weitere-dateien) · [Server-Tests](#server-tests-appsserversrctests)

## Fachlogik `packages/domain/src`

Reine Funktionen ohne Datenbank und Oberfläche. Server und Web importieren aus `@schau/domain` (`index.ts`).

### abmeldung.ts (46 Z.)
Tests: `abmeldung.test.ts`

- `ABMELDUNG_MINUTEN` – Automatische Abmeldung nach Untätigkeit, je Rolle vom Administrator einstellbar (Verein und Datenschutz).
- `ABMELDUNG_ROLLEN`
- `ABMELDUNG_VORGABE`
- `ABMELDUNG_KULANZ_MS` – Spielraum für das Lebenszeichen (kommt höchstens jede Minute) und Uhrabweichungen.
- `abmeldungLesen()` – Gespeicherter Wert (jsonb, ggf. alt oder unvollständig) → gültige Einstellung; Unbekanntes gilt als Vorgabe.
- `letzteEingabe()` – Letzte Eingabe, wie sie für die Sitzung gilt.
- `untaetigAbgelaufen()` – Ist die Sitzung wegen Untätigkeit abgelaufen?
- Typen: `AbmeldungRolle`, `Abmeldung`

### abrechnung.ts (67 Z.)

- `provision()`
- `berechneAbrechnung()`
- `gesamtabrechnungZeilen()` – Gesamtabrechnung eines Ausstellers als Rechenweg für die Quittung: alles, was er zahlt (Meldegeld, zugesagte Ehrenpreisstiftung und Spende), was er …
- Typen: `AbrechnungEingabe`, `Abrechnung`

### adressen.ts (152 Z.)

- `AdressZeile` (Typ) – Vorschläge beim Erfassen von Ausstellern aus den eigenen Daten des Vereins (bisherige Aussteller): Ort zur PLZ, Straßen im Ort, Vereine mit ihrem K …
- `strassenName()` – Straße ohne Hausnummer: „Lindenweg 12a“ → „Lindenweg“.
- `adressVorschlaege()`
- `ortZurPlz()` – Ort zu einer vollständigen PLZ, wenn er in den eigenen Daten eindeutig ist – sonst null.
- `kreisverbandZumVerein()` – Kreisverband zum Verein, wenn eindeutig bekannt – sonst null.
- `vereinsSchluessel()` – Vergleichsschlüssel für Vereinsnamen: klein, Satzzeichen und Bindestriche als Leerzeichen – „GZV Musterdorf-Lindenau“ und „gzv musterdorf lindenau“ …
- `istEigenerVerein()` – Steht in der Vereinsangabe eine der Schreibweisen, die der Verein als seine eigenen festgelegt hat?
- `istVereinsmitglied()` – Vereinsmitglied: von Hand gesetzt (`mitglied` true/false) oder sonst nach der Vereinsangabe.
- `verzeichnisVorschlaege()` – Vorschläge aus dem Vereinsverzeichnis (nur Namen und Kreisverband): je Verein der Kreisverband, wenn er im Verzeichnis eindeutig ist, dazu alle Kre …
- `mitVerzeichnis()` – Eigene Vorschläge ergänzen um das Vereinsverzeichnis.
- Typen: `VereinVorschlag`, `AdressVorschlaege`

### besatz.ts (44 Z.)

- `tiergruppe()` – Ordnet über Sparte und Rasse grob zu – Bezeichnungen im Verzeichnis sind nicht genormt.
- `standardBesatz()` – Vorgeschriebener Besatz für Stamm oder Voliere, sonst null.
- `pruefeBesatz()` – Hinweis, wenn der gemeldete Besatz nicht der Vorgabe entspricht (der Preisrichter vergibt dann o.B.).
- `tierzahl()` – Anzahl der Tiere hinter einer Geschlechtsangabe: „1,0“ → 1, „1,2“ → 3, „3,3“ → 6. Für Aufzeichnungen über abgegebene Tiere (Stamm und Voliere zähle …

### briefvorlage.ts (117 Z.)
Briefvorlage des Vereins: wie Briefe aussehen (DIN 5008 für Fensterumschläge, Briefkopf, Fußzeile) und welche Texte in ihnen stehen.
Tests: `briefvorlage.test.ts`

- `BRIEF_PLATZHALTER` – Platzhalter, die in Brieftexten erlaubt sind, mit Erklärung für die Oberfläche.
- `BRIEF_VORGABE` – So sahen Briefe bisher aus – Ausgangspunkt jeder Vorlage.
- `anschriftfeld()` – Lage des Anschriftfelds nach DIN 5008 in mm (Form A / B): oben links, Rücksendezone zuerst, dann die Anschrift.
- `falzmarkenMm()` – Falz- und Lochmarken (mm von oben) je Form.
- `fuelle()` – Setzt Platzhalter ein; unbekannte bleiben, wie sie sind (siehe unbekanntePlatzhalter).
- `unbekanntePlatzhalter()` – Platzhalter im Text, die es nicht gibt (Tippfehler wie {Vornahme}) – zum Anzeigen vor dem Speichern.
- `briefWerte()` – Werte der Platzhalter für einen Empfänger.
- `BRIEFKOPF_ZEILEN` – Höchstzahl der Zeilen im Briefkopf (Form B: alle drei, Form A: zwei; der Rest wird beim Drucken mit „…“ gekürzt).
- `briefVorlageLesen()` – Gespeicherten Wert in eine gültige Vorlage bringen; Fehlendes gilt als Vorgabe.
- Typen: `BriefPlatzhalter`, `BriefVorlage`

### datenschutz.ts (205 Z.)
Datenschutz und Anbieterkennzeichnung: Speicherfristen und Mustertexte für Impressum und Datenschutzhinweise.

- `AUFBEWAHRUNG_VERKAUF_JAHRE` – Verkaufsaufzeichnungen (Herkunft, Bestimmung, Registriernummer) für das Veterinäramt.
- `AUFBEWAHRUNG_BELEGE_JAHRE` – Buchungsbelege (Zahlungen, Quittungen, Kaufbelege), § 147 Abs. 3 AO in der Fassung ab 2025. Prüfhinweis für den Verein.
- `AUFBEWAHRUNG_BUECHER_JAHRE` – Bücher und Aufzeichnungen, § 147 Abs. 1 Nr. 1 und Abs. 3 AO: auch nach dem BEG IV zehn Jahre.
- `POSTAUSGANG_TAGE` – Bestätigungsmails mit Zugangslink im Postausgang.
- `INAKTIV_JAHRE` – Aussteller ohne Meldung so lange: Stammdaten werden gelöscht.
- `KARENZ_TAGE` – Karenzzeit nach dem Abschluss einer Schau, bevor IBAN, Geburtsdatum und Preisrichter-PIN gelöscht werden.
- `ONLINE_MONATE` – So lange nach der Schau (Bewertungstag) stehen Ergebnisse und Katalog öffentlich im Internet.
- `onlineAbgelaufen()` – Ergebnisse und Katalog sind nicht mehr öffentlich: `ONLINE_MONATE` nach dem Bewertungstag (Datum JJJJ-MM-TT).
- `fehlendeVereinsangaben()` – Pflichtangaben, die für Impressum und Datenschutzhinweise noch fehlen.
- `impressumAbschnitte()` – Anbieterkennzeichnung nach § 5 DDG.
- `datenschutzKurz()` – Kurzfassung für das Meldeformular (erste Ebene der Information nach Art. 13 DSGVO).
- `datenschutzAbschnitte()` – Vollständige Datenschutzhinweise.
- `alsText()` – Abschnitte als schlichter Text, z. B. um das Muster als eigenen Text zu übernehmen.
- `aufbewahrenBis()` – Bis wann die Daten eines Ausstellers aufbewahrt werden müssen: Verkaufsaufzeichnungen ab Verkauf, Belege (Zahlungen, Auszahlungen, Kaufbelege) bis …
- Typen: `Vereinsangaben`, `Textabschnitt`

### druckvorlage.ts (263 Z.)
Tests: `druckvorlage.test.ts`

- `MM_JE_ZOLL` – Druckvorlage der Bewertungskarte: welches Papier, wie viele Karten je Bogen, was auf der Karte steht und wo.
- `ENDLOS_12_ZOLL` – Übliche Bogenlängen von Endlospapier: 12 Zoll und 6 Zoll (in mm, gerundet wie auf den Packungen).
- `ENDLOS_6_ZOLL`
- `PAPIER` – Papierformate in Millimetern (hochkant).
- `KartenFormat` (Typ) – Wie die Karten auf dem Bogen liegen.
- `KARTEN_FORMAT_LABEL`
- `Druckeinstellung` (Typ) – Feinabstimmung für den Drucker: Versatz der ganzen Seite und Längenkorrektur (Endlospapier rutscht über viele Bögen).
- `Nutzen` (Typ) – Eine Karte auf dem Bogen (mm, Ursprung oben links).
- `bogen()` – Bogengröße und Lage aller Karten auf einem Bogen.
- `korrigiert()` – Wendet Versatz und Längenkorrektur auf eine Stelle an (mm auf dem Bogen).
- `KARTEN_BAUSTEINE` – ── Bausteine der eigenen Karte ───────────────────────────────────────────
- `KARTEN_BAUSTEIN_LABEL`
- `KARTEN_RAND` – Rand der Karte rundum (A6, 100 %).
- `VordruckFeld` (Typ) – Feld auf einem Vordruck: Lage in mm ab der oberen linken Ecke der Karte, Schriftgröße in pt.
- `VORDRUCK_FELDER`
- `VORDRUCK_FELD_LABEL`
- `KARTEN_VORGABE` – Die Karte, wie SchauFUCHS sie bisher gedruckt hat: A6, vier je A4, alle Bausteine außer dem eigenen Text.
- `kartenMassstab()` – Maßstab der Karte gegenüber einer A6-Karte (A5 ≈ 1,41, A4 = 2): die engere der beiden Richtungen, damit auch eine quer liegende Karte (z. B. Endlos …
- `kartenLayout()` – Lage der eingeschalteten Bausteine auf einer Karte (mm ab Kartenoberkante, innerhalb des Rands).
- `vordruckFelderAusLayout()` – Feldlagen für den Vordruck-Modus, abgeleitet aus der eigenen A6-Karte – Ausgangspunkt zum Verschieben.
- `kartenVorlageLesen()` – Gespeicherten Wert (jsonb, ggf. alt oder unvollständig) in eine gültige Vorlage bringen; Unbekanntes gilt als Vorgabe.
- Typen: `KartenBaustein`, `VordruckFeldId`, `KartenVorlage`

### einteilung.ts (99 Z.)
Preisrichter-Einteilung nach Rassen: Vor der Nummernvergabe teilt die Ausstellungsleitung die Preisrichter nach Sparte, Rasse und – wo eine Rasse g …
Tests: `einteilung.test.ts`

- `RassenRegel` (Typ) – Eine Regel: diese Rasse (bzw. dieser Farbenschlag der Rasse) geht an diesen Preisrichter.
- `EinteilTier` (Typ) – Was ein Tier für die Einteilung ausmacht.
- `richterNachRasse()` – Preisrichter für ein Tier: eine Regel für seinen Farbenschlag geht vor der Regel für die ganze Rasse.
- `bereicheAusRassen()` – Nummernbereiche aus der Einteilung nach Rassen.
- `regelnAusZuteilung()` – Aus einer Einteilung nach Nummern (z. B. dem gleichmäßigen Vorschlag) Regeln je Rasse machen: Geht eine Rasse ganz an einen Preisrichter, eine Rege …

### gebuehren.ts (83 Z.)

- `berechneMeldebetrag()` – Berechnet, was ein Aussteller für seine Meldung zahlen muss.
- `JUGEND_ALTERSGRENZE` – Jugendliche: am Stichtag noch nicht 18 Jahre alt.
- `alterAm()` – Alter in vollen Jahren am Stichtag (beide als JJJJ-MM-TT).
- `istJugendlich()` – Darf zum Jugendtarif und im Jugendblock ausstellen: am Stichtag jünger als die Altersgrenze.
- `gefordertCent()` – Was eine Meldung insgesamt fordert: Meldegeld plus die mit ihr zugesagte Ehrenpreisstiftung und Spende.
- Typen: `Gebuehr`, `MeldePosition`, `Rechnungszeile`, `Meldebetrag`

### geld.ts (58 Z.)

- `formatEuro()`
- `parseEuro()` – "11,50" oder "11.50" oder "11" → 1150. Ungültig → null.
- `anteil()` – Prozentsatz in Basispunkten (1500 = 15 %), kaufmännisch gerundet auf Cent.
- `betragInWorten()` – Betrag in Worten für Quittungen: 23550 → „zweihundertfünfunddreißig Euro und fünfzig Cent“.

### hallenplan-3d.ts (543 Z.)
Hallenplan räumlich: aus dem gerechneten Plan (`planeHalle`) die Körper für die 3D-Ansicht – Wände mit Türen, Aufsteller unter den Grundplatten, Kä …
Tests: `hallenplan-3d.test.ts`

- `Aufsteller` (Typ) – Aufsteller (Gestelle, auf denen die Grundplatten mit den Käfigen stehen).
- `AUFSTELLER_STANDARD`
- `VERKLEIDUNG_STANDARD` – Vorgabe: verkleidet, weiße Plane (wie auf den Schauen üblich), ohne Bild.
- `VERKLEIDUNG_FRUEHERE_VORGABE` – Frühere Vorgabe (dunkles Grün-Anthrazit, 14.11.2026 kurz live).
- `verkleidungVon()`
- `verkleidungsKachel()` – Kachel der Verkleidung mit einem Logo bzw. Banner (cm): eine weiße Bahn, auf der das Bild in regelmäßigem Abstand wiederkehrt – mittig in der Höhe, …
- `PLATTEN_STAERKE` – Stärke der Grundplatte auf dem Aufsteller (cm) – die Verkleidung reicht bis darunter.
- `SzeneSchuerze` (Typ) – Verkleidung eines Sockels: dünne Bahn (Körper) vor seiner Seite, `aussen` zeigt vom Sockel weg, `laenge` entlang der Bahn.
- `Quader` (Typ) – Körper: linke vordere Ecke am Boden (x, z), Unterkante y; Ausdehnung b (in x), t (in z), h (nach oben).
- `SzeneTier` (Typ) – Ein Tier, wie es die 3D-Ansicht zeigt – nur Nummer, Rasse, Sparte und Preisrichter, nie der Aussteller.
- `WAND_HOEHE`
- `WAND_DICKE`
- `TUER_HOEHE` – Türhöhe (cm); darüber läuft die Wand weiter.
- `AUGEN_HOEHE`
- `figurFuer()` – Welche Figur ein Tier bekommt: Taube, Ente, Gans, Pute, Zwerghuhn oder Huhn.
- `FIGUR_GROESSE` – Natürliche Größe der Figuren (cm, Scheitel über Boden).
- `gefiederFarbe()`
- `gangStandpunkt()` – Standpunkt im Gang: zwischen den ersten beiden Reihen, deren Fronten sich gegenüberstehen (im Reihensystem, ohne Handversatz), am Anfang der Reihen …
- `hallenSzene()` – Die Szene der Halle.
- `vertauscht()` – Szene mit vertauschten Achsen (x ↔ z), wie `zeichnungDerHalle` die Halle zeichnet, wenn sie länger als breit ist.
- `SzeneSeite` (Typ) – Seite der Halle, an der eine Wand steht (Szene: x0 links, x1 rechts, z0 hinten/oben im Plan, z1 vorn/unten).
- `wandSeiten()` – An welchen Seiten ein Wandstück steht (eine Ecke an zweien).
- `WAND_DURCHSICHTIG` – Kleinste Deckkraft ausgeblendeter Wände (ganz weg wirkt die Halle ohne Rand).
- `wandDeckkraft()` – Deckkraft einer Wand (0–1) aus Kamera und Blickziel (cm, Szene-Koordinaten): Steht die Kamera außerhalb der Halle hinter der Wand (die Wand steht z …
- `WandInnenseite` (Typ) – Innenseite eines Wandstücks (cm, Szene): Seite, Strecke entlang der Wand, Unterkante und Höhe, Wand (Index in `waende`).
- `wandInnenseiten()` – Innenseiten der Wandstücke (ohne Ecken): voll hohe Stücke und die Stürze über den Türen.
- `schuerzenFuer()` – Verkleidung der Sockel: Sockel mit derselben Front, die quer zur Reihe gleich liegen und aneinanderstoßen, bilden ein Stück Reihe.
- Typen: `Verkleidung`, `Figur`, `SzeneKaefig`, `SzeneVoliere`, `SzeneTuer`, `SzeneFlaeche`, `SzeneBeschriftung`, `HallenSzene`

### hallenplan-druck.ts (102 Z.)
Hallenplan drucken und zeichnen: gemeinsame Regeln für Bildschirm und PDF – Farben der Preisrichter in der Folge der Katalognummern, Lage der Zeich …
Tests: `hallenplan-druck.test.ts`

- `RICHTER_FARBE` – Preisrichter: geprüfte Kategorien-Palette in fester Reihenfolge nach Katalognummern – Nachbarn im Katalog bekommen Nachbarfarben.
- `richterFarbe()`
- `richterSchraffur()` – Schraffiert, damit einzelne Paare (Rot/Orange, Grün/Orange) auch bei Farbschwäche und im Schwarzweiß-Druck zu unterscheiden sind.
- `richterFolge()` – Preisrichter in der Folge ihrer kleinsten Katalognummer im Plan (gleich: nach Namen).
- `zeichnungDerHalle()` – Zeichnung der Halle: die lange Seite waagrecht (ist die Halle länger als breit, liegt sie quer).
- `druckMassstab()` – Blatt für den Plan: Querformat, wenn die Zeichnung breiter als hoch ist, sonst Hochformat; der Maßstab (Punkte je cm) so groß, dass die Zeichnung s …
- `Schild` (Typ) – Lage einer Reihenbezeichnung „R…“ am Rand der Zeichnung: über der oberen Wand (Reihe senkrecht) oder links davor.
- `reihenSchilder()` – Wo die Reihenbezeichnungen stehen – im Plan wie im Druck.

### hallenplan-entfernen.ts (228 Z.)
Hallenplan von Hand: Leeres entfernen.
Tests: `hallenplan-entfernen.test.ts`

- `FreierPlatzTeil` (Typ) – Ein freier Käfigplatz im festen Plan: Reihe und Lage im Reihensystem (wie `FreierPlatz.x/y`).
- `PlanAuswahlTeil` (Typ) – Was im Editor gewählt sein kann: ein verschiebbares Teil oder ein freier Platz.
- `leereEntfernen()` – Alles Leere der Auswahl entfernen.
- `pruefeEntfernt()` – Prüfung beim Speichern der Halle (Server): Neu entfernte Platten und Plätze müssen im festen Plan stehen und leer sein.
- `pruefeTeileEntfernt()` – Prüfung beim Speichern der Halle (Server): Eingesetzte Käfigblöcke und Volieren, die wegfallen, müssen leer sein.
- `halleOhneFestenPlan()` – Halle für eine neue Schau (Vorlage, letzte Schau, Testschau): einzeln verschobene Platten und entfernte leere Plätze gehören zum festen Plan der al …
- `plattenStand()` – Kennzeichen der Grundplatten eines Plans (je Reihe Lage, Länge und Käfigart jeder Platte).
- Typen: `EntfernenErgebnis`

### hallenplan-fehlend.ts (163 Z.)
Tiere ohne Platz im Hallenplan, nach Käfiggröße zusammengefasst: wie viele, welche (Katalognummer und Rasse, ohne Aussteller) und was sich einsetze …
Tests: `hallenplan-fehlend.test.ts`

- `KAEFIGBLOCK_TYPEN` – Käfigarten, für die es im Editor einen Käfigblock gibt.
- `fehlendeKaefige()` – Tiere ohne Platz je Käfiggröße, in der Reihenfolge, in der die Größen zuerst vorkommen.
- `freieStelle()` – Freier Platz für ein neues Teil der Größe `groesse`: möglichst nah an `start` (Raster `schritt`, ringförmig nach außen), ganz in der Halle und auf …
- `Einsatz` (Typ) – Ein Teil, das „fehlende Käfige einsetzen“ in die Halle stellt (wie `HallenObjekt`, ohne id).
- `Belegt` (Typ) – Was schon Platz einnimmt (Platten, Teile, Flächen, Gang vor Eingängen …); bei Grundplatten mit Käfigart.
- `fehlendeEinsetzen()` – Stellen für die fehlenden Käfige: Käfigblöcke (bzw. Volieren) nur in die nutzbaren Abschnitte der Reihen – dort, wo die Planung selbst Platten stel …
- Typen: `FehlendeKaefige`

### hallenplan-folge.ts (209 Z.)
Reihenfolge der Käfige, wie sie im Plan stehen – Grundlage für „Nach Plan nummerieren“ nach dem Umstellen.
Tests: `hallenplan-folge.test.ts`

- `PlanPlatz` (Typ) – Ein Platz im Plan in der Folge des Plans: belegt (tierId) oder frei; Reihenplätze mit ihrer Lage im Reihensystem.
- `planPlaetze()` – Alle Plätze in Reihen und Käfigblöcken (belegt und frei) in der Folge des Plans: Reihe für Reihe (quer zu den Reihen aufsteigend), in jeder Reihe v …
- `planFolge()` – Tier-Ids in der Reihenfolge des Plans (nur Tiere mit Platz).
- `planUnordnung()` – Wie unordentlich der (feste) Plan nach dem Umstellen ist: freie Plätze mitten zwischen belegten derselben Käfiggröße (dahinter steht noch ein Tier …
- `luekenlosAuffuellen()` – Lückenlos auffüllen (fester Plan): in jeder Reihe (Zeile des Plans) rücken die Tiere je Käfiggröße in der Folge des Plans in die Plätze dieser Größ …
- `blockFolge()` – Folge der eingesetzten Käfigblöcke im Plan (Indizes in `objekte`) – dieselbe, in der „Nach Plan nummerieren“ zählt.

### hallenplan-gruppe.ts (394 Z.)
Hallenplan von Hand bearbeiten: Teile wählen (auch mehrere) und zusammen verschieben.
Tests: `hallenplan-gruppe.test.ts`

- `HallenTeil` (Typ) – Ein von Hand verschiebbares Teil des Hallenplans (Fläche über ihre laufende Nummer in `halle.flaechen`).
- `teilSchluessel()` – Eindeutiger Schlüssel eines Teils (zum Vergleichen und Nachschlagen).
- `gleichesTeil()`
- `auswahlUmschalten()` – Teil in die Auswahl aufnehmen bzw. wieder herausnehmen (Umschalt-, Strg- oder Cmd-Klick, Schalter „Mehrfachauswahl“).
- `auswahlBereinigen()` – Auswahl zum Verschieben: jedes Teil einmal; Grundplatten einer ebenfalls gewählten Reihe fallen weg – sie gehen mit ihrer Reihe (sonst würden sie d …
- `verschiebeTeile()` – Alle Teile der Auswahl um dx/dy (cm, Hallenkoordinaten: x entlang der Breite, y entlang der Länge) verschieben.
- `PlanKoerper` (Typ) – Etwas, das im Plan Platz einnimmt, mit seiner Lage im aktuellen Entwurf.
- `pruefeVerschiebung()` – Darf die Auswahl um dx/dy verschoben werden?
- `anKantenEinrasten()` – Beim Ziehen bündig einrasten: Landet eine Kante der Auswahl nach dem Weg dx/dy weniger als `fang` cm (Raster) neben einer Kante eines anderen Teils …
- `rasterAusrichten()` – Am Raster ausrichten: jedes Teil (bzw. jede Gruppe aneinanderstehender Teile, z. B. die beiden Seiten einer Doppelreihe) rückt mit seiner linken ob …
- `pruefeLage()` – Darf ein Teil künftig an `rechteck` stehen (z. B. nach dem Drehen)?
- Typen: `VerschiebePruefung`, `AusrichtenErgebnis`

### hallenplan-neu.ts (93 Z.)
Plan neu setzen: Die Software stellt alle Käfige neu – nach den Einstellungen der Halle (Maße, Gänge, Richtung, Wandreihen, Grundplatten) und ihren …
Tests: `hallenplan-neu.test.ts`

- `belegtImPlan()` – Was im Plan Platz einnimmt: Grundplatten (mit Käfigart), eingesetzte Teile, Flächen außer Volierenbereichen, der Gang vor Eingängen und Notausgänge …
- `halleZumNeuSetzen()` – Halle ohne alles, was zur bisherigen Aufstellung gehört (siehe oben); `reihenVersatz` bleibt nur, wenn angegeben.
- `neuSetzen()` – Halle für einen neu gesetzten Plan: ohne die bisherige Aufstellung, mit Käfigblöcken (bzw. Volieren) für die Tiere, die nicht in die Reihen passen.
- `fehlendeImPlan()` – Stellen für die Tiere ohne Platz – dieselbe Suche für „Plan neu setzen“ und den Knopf „Alle fehlenden Käfige einsetzen“ (siehe `fehlendeEinsetzen`) …
- `vonHandGeplant()` – Steht im Plan etwas von Hand Geplantes, das beim Neu-Setzen wegfiele?

### hallenplan-versetzen.ts (171 Z.)
Tiere im festen Hallenplan von Hand versetzen (Rückmeldung 15.11.2026: „ich will auch käfige frei zuordnen können im halleneditor und ggf tiere ver …
Tests: `hallenplan-versetzen.test.ts`

- `KaefigPlatz` (Typ) – Ein Käfigplatz: in einer Reihe (Lage im Reihensystem wie im festen Plan) oder in einem Käfigblock (Platz ab 0).
- `PlatzBelegung` (Typ) – Wer auf einem Platz sitzt (null = frei) und welche Größe er hat; null: diesen Platz gibt es im Plan nicht.
- `platzImPlan()` – Wo ein Tier im Plan steht (Reihe oder Käfigblock); null: ohne Platz, Voliere oder unbekannt.
- `belegungImPlan()` – Belegung eines Platzes, wie der Plan sie zeigt.
- `gleicherPlatz()` – Gleiche Plätze?
- `tierVersetzen()` – Tier `tierId` auf Platz `ziel` versetzen (`plan`: der Plan aus `fest`, wie er gerade gerechnet ist).
- Typen: `VersetzenErgebnis`

### hallenplan-wand.ts (66 Z.)
Einzelreihe an einer Wand: Zieht die Ausstellungsleitung eine Reihe an eine der beiden Wände, an denen die Reihen entlanglaufen, stellt die Softwar …
Tests: `hallenplan-wand.test.ts`

- `wandSeiteVon()` – Steht ein Rechteck (Hallenkoordinaten) an einer der Wände, an denen Einzelreihen stehen können?
- `mitWandreihe()` – Halle mit Einzelreihe an `seite` (eine schon vorhandene an der anderen Wand bleibt).
- `reihenVersatzNachUmbau()` – Versatz der von Hand verschobenen Reihen nach dem Umbau (neue Einzelreihe, andere Abstände): jede bleibt, wo sie steht.
- Typen: `WandSeite`

### hallenplan-wandfront.ts (108 Z.)
Käfige an den Wänden mit der Rückwand an die Wand (Rückmeldung 14.11.2026): Ein Käfig hat vorn die offene Gitterfront, Rück- und Seitenwände sind d …
Tests: `hallenplan-wandfront.test.ts`

- `WAND_FANG` – So nah (cm) an einer Wand gilt ein Teil als an der Wand.
- `WandKandidat` (Typ) – Ein Teil, das an einer Wand stehen könnte: wie es gezeichnet ist (Lage, Front).
- `WandDrehung` (Typ) – Eine nötige Drehung: um 180° an Ort und Stelle, danach Front `front`.
- `wandRichtung()` – Wand, an der die lange Seite eines Teils liegt (bündig oder bis `fang`), als Richtung von dort in die Halle (= Front, die es haben soll); null, wen …
- `wandAusrichtung()` – Was zu drehen ist: Teile an einer Wand, deren Front zur Wand zeigt.
- `wandKandidaten()` – Kandidaten aus einem gerechneten Plan (Lage samt Versatz und Drehung): alle Grundplatten, Käfigblöcke und eingesetzten Volieren.
- `wandDrehungenAnwenden()` – Drehungen in die Halle übernehmen: Grundplatten über ihre Drehung (um die eigene Mitte), Teile über ihre Front.

### hallenplan.ts (1.550 Z. ⚠)
Hallenplan: Wie stehen die Käfige in der Halle?

- `EntfernterPlatz` (Typ) – Entfernte leere Grundplatte (Lage der Platte) bzw. entfernter freier Platz im festen Plan.
- `dreheRechteck()` – Rechteck um den Punkt c in 90°-Schritten drehen (Hallenkoordinaten x/y).
- `Blick` (Typ) – Richtung, in die eine Käfigfront zeigt (Hallenkoordinaten: x+ zu größerem x, z+ zu größerem y).
- `dreheBlick()` – Richtung in 90°-Schritten drehen (wie `dreheRechteck`: 90° führt x in y über).
- `frontDerReihe()` – Front der Käfige einer Reihe in der Halle (Reihensystem: „rechts“ = zu größerem x; bei Reihen quer ist das Hallen-y).
- `streifenVor()` – Streifen der Breite `tief` vor der Seite `blick` eines Rechtecks.
- `gangVorKaefigen()` – Der Gang vor den Käfigen jeder Grundplatte (Gangbreite der Halle, in Richtung der Front) – dort steht kein Tisch und keine Bank.
- `etagenStreifen()` – Feld eines Käfigs im Plan, wenn Käfige übereinander stehen: die Grundfläche quer zur Front in so viele Streifen geteilt, wie es Etagen gibt – die u …
- `blickTausch()` – Richtung im gedrehten Koordinatensystem (x und y vertauscht: Reihensystem bei Reihen quer, Zeichnung der Halle quer).
- `Strecke` (Typ) – Strecke von (x1, y1) nach (x2, y2) in Hallenkoordinaten.
- `kaefigKanten()` – Kanten eines Käfigs, einer Grundplatte oder eines Blocks mit Front `front`: die dichte Rückwand gegenüber der Front, die beiden dichten Seitenwände …
- `blockFront()` – Front eines eingesetzten Käfigblocks ohne eigene Angabe: zur langen Seite (ungedreht zu größerem y, gedreht zu größerem x).
- `objektFront()` – Front eines Käfigblocks: seine Angabe `front`, wenn sie zu einer langen Seite zeigt (ungedreht z±, gedreht x±), sonst wie `blockFront`.
- `mitteVon()` – Mitte des umschließenden Rechtecks.
- `MoebelArt` (Typ) – Tisch, Bank und Garnitur (Biertisch mit zwei Bänken): eingesetzte Teile ohne Käfigplatz.
- `MOEBEL_ARTEN`
- `MOEBEL_NAME`
- `TISCH_STANDARD` – Biertisch 220 × 50 cm, Bierbank 220 × 25 cm; in der Garnitur je eine Bank an jeder langen Seite, 15 cm vom Tisch.
- `BANK_STANDARD`
- `GARNITUR_ABSTAND`
- `TISCH_HOEHE` – Höhen (cm) für die 3D-Ansicht.
- `BANK_HOEHE`
- `istMoebel()`
- `moebelMass()` – Maße eines Möbelstücks mit Vorgaben: Länge, Tiefe (Tisch bzw. Bank) und bei der Garnitur die Tiefe der Bänke.
- `moebelStuecke()` – Tisch, Bank oder Garnitur in der Lage `q` (Hallenkoordinaten): die Körper darin – eine Garnitur als Bank, Tisch, Bank quer zur Länge.
- `halleNormal()` – Halle mit allen Vorgaben ausgefüllt – ältere gespeicherte Hallen haben noch nicht jedes Feld.
- `stabilerText()` – Text mit sortierten Schlüsseln (leere Felder fallen weg) – gleiche Halle ergibt immer denselben Text.
- `halleSchluessel()` – Kurzer Schlüssel für den Stand einer Halle – zum Erkennen gleichzeitiger Änderungen.
- `VOLIEREN_GANG` – Freier Gang zwischen Volierenreihen (cm).
- `eingangsGang()` – Gang vor einem Eingang oder Notausgang (samt dem Ausgang selbst): in Fluchtrichtung, so breit wie der Ausgang und einen Gang tief – seitlich danebe …
- `teilGroesse()` – Größe eines eingesetzten Teils, ungedreht (lange Seite in x): eine Voliere nach dem Volierenmaß, ein Käfigblock so groß wie die Grundplatte seiner …
- `HAUPTGANG_STANDARD`
- `Grundplatte` (Typ) – Grundplatte eines Käfigblocks: Länge entlang der Reihe, Tiefe quer dazu.
- `GRUNDPLATTE_STANDARD`
- `HALLE_STANDARD`
- `PLATTE_LAENGE` – Länge, auf die eine Grundplatte ausgelegt ist (cm): rund 2 m.
- `kaefigeJePlatte()` – Wie viele Käfige einer Art auf einer Grundplatte stehen: eigene Angabe, sonst so viele, wie auf ihr eigenes Plattenmaß passen, sonst so viele, wie …
- `platteFuer()` – Grundplatte einer Käfigart (Länge entlang der Reihe, Tiefe quer dazu) und wie viele Käfige darauf stehen.
- `ETAGEN_MAX` – Höchstens so viele Etagen übereinander.
- `etagenVon()` – Etagen einer Käfigart: eigene Angabe (1 bis 4), sonst eine.
- `plaetzeJePlatte()` – Plätze auf einer Grundplatte: Käfige nebeneinander × Etagen.
- `etagenNormal()` – Nur Angaben über einer Etage; leer = nicht da.
- `blockBelegung()` – Belegung eines Käfigblocks je Platz (Tier-Id, null = frei), ohne freie Plätze am Ende.
- `blockPlatz()` – Lage eines Platzes in einem eingesetzten Käfigblock: die Plätze liegen entlang der langen Seite, je Spalte die Etagen übereinander (gezählt unten z …
- `PlanTier` (Typ) – Ein Tier in Katalogfolge, wie es in einen Käfig kommt.
- `Rechteck` (Typ) – Rechteck in Hallenkoordinaten (x entlang der Breite, y entlang der Länge) – zum Zeichnen.
- `FesterPlan` (Typ) – Festgeschriebener Plan: die Lage jedes Käfigs im Reihensystem (ohne Versatz und Drehung, die bleiben einstellbar).
- `festGeometrie()` – Was beim Festschreiben gilt: Hallenmaße, Reihen und Käfigmaße (nicht Flächen oder eingesetzte Teile).
- `etageFeld()` – Etage nur, wenn nicht unten (so bleiben Pläne ohne Etagen wie bisher).
- `gleicheEtage()` – Gleiche Etage (fehlt = unten).
- `festschreiben()` – Den gerechneten Plan festschreiben (aus `planeHalle` ohne festen Plan).
- `planeHalle()` – Plan der Halle.
- `planeImReihensystem()` – Stellen im Reihensystem.
- `frontFehler()` – Käfigfronten, die nicht zu einem Gang zeigen: Die Front (Gitter) eines Käfigs ist offen, Rück- und Seitenwände sind dicht – vor jeder Front muss ei …
- Typen: `HallenFlaeche`, `Halle`, `Drehung`, `HallenObjekt`, `Hauptgang`, `PlanKaefig`, `Reihe`, `FreierPlatz`, `PlanPlatte`, `PlanObjekt`, `Hallenplan`

### import.ts (328 Z.)
Import aus Altprogrammen (Entscheidung 015): Es gibt kein Standardformat – Programme wie Vereins- und Katalogprogramme exportieren Tabellen mit eig …
Tests: `import.test.ts`

- `IMPORT_FELDER`
- `AUSSTELLER_FELDER`
- `TIER_FELDER`
- `csvLesen()` – CSV lesen: Trennzeichen (; , Tab) aus der ersten Zeile, Anführungszeichen nach RFC 4180, BOM weg, leere Zeilen weg.
- `suchNorm()` – Kleinbuchstaben, Umlaute ausgeschrieben, ß → ss, Satzzeichen zu Leerzeichen.
- `spaltenRaten()` – Für jede Spalte das wahrscheinliche Feld (oder null); jedes Feld höchstens einmal.
- `geschlechtLesen()` – Geschlecht als „1,0“ usw.; null, wenn nicht lesbar.
- `alterLesen()`
- `preisLesen()` – Preis in Cent: „25“, „25,50“, „25,-“, „12,5 €“, „1.250,00“; leer, „-“ oder Text → null.
- `ausstellerSchluessel()` – Wiedererkennen: gültige Registriernummer, sonst Vorname, Nachname und PLZ.
- `aehnlichkeit()` – Ähnlichkeit zweier Texte (Dice-Koeffizient über Buchstabenpaare), 0 bis 1.
- `rassenVorschlaege()` – Vorschläge aus dem Verzeichnis für Rasse und Farbenschlag aus der Datei; genaue Treffer zuerst.
- `zeilenAuswerten()` – Zeilen der Tabelle nach der Spaltenzuordnung auswerten.
- Typen: `ImportFeld`, `ImportAussteller`, `ImportTier`, `ImportZeile`

### index.ts (42 Z.)
Sammelt alle Exporte (`export * from …`).

### kaefige.ts (174 Z.)
Käfige: Welche Käfiggröße braucht ein gemeldetes Tier, und welche Käfignummern (= Katalognummern) gehören zu welcher Größe?

- `KAEFIG_TYPEN`
- `KAEFIG_TYP_LABEL`
- `KAEFIG_TYP_MEHRZAHL` – Mehrzahl der Käfigarten („34 Taubenkäfige“).
- `kaefigAnzahl()` – Anzahl mit Käfigart und Maß (Breite × Tiefe × Höhe): „34 Taubenkäfige (40 × 40 × 40 cm)“, ohne Maß nur die Art.
- `KaefigRegel` (Typ) – Abweichende Käfiggröße für eine Rasse (gilt für Einzeltiere), z. B. Fasane im Großkäfig.
- `kaefigTyp()` – Käfiggröße eines Eintrags.
- `nummernBereiche()` – Käfignummern kurz: „1–40, 52, 55–60, 100a, 100b“.
- `KAEFIG_RICHTWERT` – Richtwerte für Ausstellungskäfige (Innenmaß, Kantenlänge, ein Tier) nach den BMEL-Leitlinien zur Ausrichtung von Tierbörsen (2006), die Veterinäräm …
- `KaefigMass` (Typ) – Maß eines Käfigs in cm (Innenmaß): Breite (Front), Tiefe, Höhe.
- `KaefigMasse` (Typ) – Maße der eigenen Käfige je Käfigart.
- `KAEFIG_MASS_STANDARD` – Ohne eigene Maße: Würfel mit der Kantenlänge nach Richtwert (Tauben die obere Grenze 40 cm).
- `KAEFIG_FUER` – Wofür die Käfigart gedacht ist – als Erklärung neben dem Maß.
- `kaefigMass()` – Geltendes Maß: eigenes vor Richtwert; null bei Stamm und Voliere ohne eingetragenes Maß.
- `kaefigName()` – Anzeige eines Käfigs mit seinem Maß („70 × 60 × 70 cm“, Breite × Tiefe × Höhe); Stamm und Voliere mit Namen davor.
- `kaefigNameLang()` – Maß mit Verwendungszweck, für Auswahllisten: „70 × 70 × 70 cm – Hühner, Enten“.
- `kaefigVorschlag()` – Vorschlag für eine Rasse, wenn er von der automatischen Größe abweicht – sonst null.
- Typen: `KaefigTyp`, `KaefigVorschlag`

### katalog.ts (313 Z.)

- `FolgeEintrag` (Typ) – Ein Katalogeintrag mit allem, was für die Ausstellungsfolge zählt.
- `SORTIER_KRITERIEN` – Kriterien, nach denen die Katalognummern innerhalb der Gliederung (Jugend, Käfigblöcke, Volieren und Stämme vorn) laufen.
- `SORTIERUNG_STANDARD` – Bisherige Ausstellungsfolge: Sparte, Rasse, Farbenschlag, Meldeart, je Aussteller 1,0 jung, 1,0 alt, 0,1 jung, 0,1 alt.
- `SORTIER_LABEL`
- `SORTIER_RICHTUNG` – Richtungen [normal, umgekehrt]; ohne Eintrag gibt es keine Wahl (Verzeichnisfolge bzw. Name A–Z).
- `SORTIER_FEST` – Immer an, immer vorn und in dieser Reihenfolge: das Gerüst des Katalogs (Sparten- und Rassenköpfe, Rassenverzeichnis mit Nummernbereich je Rasse) u …
- `sortierungNormal()` – Vollständige, gültige Sortierung aus einer gespeicherten (oder leeren) Liste: unbekannte und doppelte Einträge fallen weg, fehlende kommen in Vorga …
- `istStandardSortierung()` – Ist das die Vorgabe?
- `sortierungText()` – Kurztext: „Sparte, Rasse, Farbenschlag, Meldeart, Aussteller, Geschlecht (1,0 vor 0,1), Alter (jung vor alt)“.
- `gruppenAbteilung()` – Eigene Abteilung im Katalog, wenn Stämme und Volieren vorn stehen – sonst null (Tier steht in seiner Sparte).
- `vergleicheFolge()`
- `vergebeKatalognummern()` – Vergibt alle Katalognummern neu, lückenlos ab `start`.
- `nachmeldungsNummer()` – Nummer für eine Nachmeldung, ohne bestehende Nummern zu ändern: Sie bekommt die Nummer ihres Vorgängers in der Ausstellungsfolge plus Unternummer ( …
- `nachmeldungsNummern()` – Nummern für mehrere Nachmeldungen eines Laufs.
- `formatKatalognummer()`
- `ringjahrPasst()` – Plausibilität des Ringjahrs: Ein Jungtier trägt einen Ring des laufenden Jahrgangs.
- Typen: `Katalognummer`, `SortierKriterium`, `SortierSchritt`, `KatalogSortierung`, `FolgeOptionen`, `Nachmeldungsnummer`

### kommende-schauen.ts (389 Z.)
Kommende Schauen: Termine anderer Schauen für die Katalogseite „Kommende Schauen“, Austausch per iCal (RFC 5545).
Tests: `kommende-schauen.test.ts`

- `TERMIN_EBENEN`
- `TERMIN_EBENE_INFO`
- `KOMMENDE_JE_EBENE` – Höchstens so viele Termine je Ebene auf der Katalogseite (die frühesten).
- `istDatum()` – Gültiges Kalenderdatum JJJJ-MM-TT?
- `plusTage()`
- `zeitraumDe()` – „5.–7.
- `schauTage()` – Öffnungstage einer Schau.
- `verbandSchluessel()` – Vergleich von Verbandsnamen: klein, ohne Satzzeichen und Zusätze wie „KV“, „Kreisverband“, „e. V.“.
- `TERMINE_KEINE` – Wert der Auswahl „keine“ bei Kreis bzw. Landesverband: diese Ebene steht nicht im Katalog.
- `kommendeSchauen()` – Termine für die Katalogseite: nach der eigenen Schau, Kreis- und Landesebene auf den gewählten Verband begrenzt, gruppiert nach Ebene (Kreis, Land, …
- `IcalTermin` (Typ) – ── iCal lesen ──────────────────────────────────────────────────────────
- `ICAL_MAX_TERMINE` – Höchstens so viele Termine aus einer Datei (Schutz vor riesigen Kalendern).
- `leseIcal()` – Termine (VEVENT) aus einer iCal-Datei: Name (SUMMARY), Ort (LOCATION), Beginn und Ende (ganztägig oder mit Uhrzeit), UID und Link.
- `schreibeIcal()` – iCal-Datei mit ganztägigen Terminen (eigene Schauen des Vereins zum Abonnieren).
- `TerminStatus` (Typ) – ── Abgleich mit einem abonnierten Kalender ─────────────────────────────
- `Abweichung` (Typ) – Angaben, die die Quelle anders meldet als übernommen; `entfallen`: steht nicht mehr im Kalender.
- `gleicheAb()` – Vergleicht die gespeicherten Termine eines Abos mit dem neu abgerufenen Kalender.
- Typen: `TerminEbene`, `KommenderTermin`, `KommendeWahl`, `GespeicherterTermin`, `Abgleich`

### lizenz.ts (47 Z.)
Lizenzangaben von Bildern im Katalog (Rassebilder, Fotos des Vereins).
Tests: `lizenz.test.ts`

- `lizenzUrlVon()` – Link zur Lizenz aus einer üblichen Angabe wie „CC BY-SA 4.0“ oder „CC BY 3.0 DE“; leer, wenn nicht ableitbar.
- `pruefeLizenz()` – Prüft, ob ein Bild mit diesen Angaben in den Katalog darf.
- Typen: `LizenzAngaben`

### meisterschaft.ts (390 Z.)
Tests: `meisterschaft.test.ts`

- `GLEICHSTAND_KRITERIEN` – Meisterschaftswertungen einer Schau: Summe der besten n Tiere je Aussteller und Rasse/Farbenschlag (Einzelwertung) oder je Verein (Vereinswertung), …
- `GLEICHSTAND_LABEL`
- `MeisterschaftTier` (Typ) – Ein bewertetes Tier für die Wertung (Einzeltiere; Stämme und Volieren zählen nicht).
- `MEISTERSCHAFT_VORLAGEN` – Voreinstellungen aus den Bestimmungen von AAB und BDRG (Stand November 2026).
- `meisterschaftLesen()` – Gespeicherte Regel in eine gültige bringen; Fehlendes gilt als Vorgabe.
- `werteMeisterschaft()` – Wertet eine Meisterschaft aus.
- Typen: `GleichstandKriterium`, `SparteRegel`, `MeisterschaftRegel`, `MeisterschaftVorlage`, `Kandidat`, `Gruppe`

### noten.ts (70 Z.)

- `STANDARD_NOTENSKALA` – Notenskala des europäischen Bewertungssystems, wie sie der BDRG anwendet (v 97, hv 96, sg 95–93, g 92–91, b 90).
- `SONDERNOTE_LABEL`
- `OBMANN_NOTE` – Note, für die der Obmann bestätigen muss.
- `OBMANN_SONDERNOTEN` – Sondernoten, die der Obmann ebenfalls bestätigen muss.
- `erlaubtePunkte()`
- `noteFuerPunkte()`
- `bewertungsText()` – Text für Katalog und Listen, z. B. "95 sg" oder "o.B.".
- `brauchtObmann()`
- `pruefeBewertung()` – Prüft eine Bewertung.
- Typen: `NotenStufe`, `BewertungsWert`

### preise.ts (105 Z.)

- `passtZuPreisart()` – Passt das Tier zur Bindung der Preisart (Zielgruppe, Sparte)?
- `PR_GEWICHT` – Gewicht einer Meldung bei der Höchstzahl je Preisrichter (PV-Hinweise): Stamm 2, Voliere 3, Bruteier 3.
- `gewichteteTierzahl()` – Gewichtete Tierzahl eines Preisrichters aus den Meldearten seiner Tiere.
- `bindungText()` – Kurzer Text zur Bindung für Katalog und Oberfläche („nur Jugend“, „Sparte Tauben“), leer ohne Bindung.
- `kontingent()` – Wie viele Preise dieser Art bei `tiere` ausgestellten Tieren vergeben werden dürfen.
- `pruefeVergabe()` – Prüft eine Preisvergabe.
- `pruefeNotenaenderung()` – Prüft, ob eine Bewertung geändert oder zurückgesetzt werden darf, obwohl das Tier schon Preise hat.
- `stiftungsanteil()` – Anteil des nächsten gestifteten Preises: der noch nicht vergebene Rest der Stiftung, geteilt durch die freien Plätze (aufgerundet; der letzte Platz …
- Typen: `Preisart`, `VergabePruefung`

### ruecksprung.ts (16 Z.)
Tests: `ruecksprung.test.ts`

- `ruecksprungZiel()` – Rücksprung nach der Anmeldung: Wer mit abgelaufener Anmeldung einen Direktlink öffnet, landet nach dem Anmelden wieder auf dieser Seite statt auf d …
- `anmeldeZiel()` – Adresse der Anmeldeseite mit dem Ziel `?weiter=…` (Pfad und Suche der aktuellen Seite).

### schriften.ts (159 Z.)

- `KATALOG_SCHRIFTEN` – Schriften für den gedruckten Katalog: je ein Paar aus Titelschrift (Überschriften, Rassen, Farbenschläge) und Textschrift (Listen, Tabellen, Zahlen).
- `KATALOG_SCHRIFT_INFO`
- `KATALOG_STILE` – Gestaltung von Titelseite, Seiten- und Spartenköpfen des Katalogs (der Tierteil ist bei allen gleich).
- `KATALOG_STIL_INFO`
- `KATALOG_TITELHINTERGRUENDE` – Hintergrund der Titelseite.
- `KATALOG_TITELHINTERGRUND_INFO`
- `KATALOG_PAPIERTON` – Papierton der Titelseite (warmes Creme).
- `KATALOG_TITELBILDER` – Titelfoto: in die Bildfläche eingepasst oder randlos bis an die Kanten (der Stich bleibt immer eingepasst).
- `KATALOG_TITELBILD_INFO`
- `KATALOG_FUSSZEILEN` – Fußzeile: Linie mit Seitenzahl außen und Schauname (bisher), Seitenzahl mittig, Seitenzahl im Farbfeld.
- `KATALOG_FUSSZEILE_INFO`
- `KATALOG_LINIEN` – Stärke der Schmucklinien (Zierlinien, Balken, Rahmen).
- `KATALOG_LINIEN_INFO`
- `KATALOG_GESTALTUNG_VORGABE` – Vorgaben der Gestaltung – so sah jeder Katalog vor diesen Einstellungen aus.
- `KATALOG_FARBFAMILIEN` – Vereinsfarben nach Farbfamilien, alle dunkel genug für Linien und Flächen im Druck.
- `KATALOG_PALETTEN` – Abgestimmte Paare aus Vereinsfarbe (Flächen) und Akzentfarbe (Linien, kleine Überschriften, Seitenzahlen).
- `kontrastZuWeiss()` – Kontrast einer Farbe #RRGGBB zu weißem Papier nach WCAG (1 bis 21).
- `KATALOG_AUFTEILUNGEN` – Aufteilung des Tierteils: Tabelle über die ganze Breite, zwei oder drei Spalten (drei nur auf A4).
- `KATALOG_AUFTEILUNG_INFO`
- `KATALOG_TEILE` – Teile des Katalogs, die sich ausblenden lassen (Titel, Inhalt, Termine und Tierteil stehen immer darin).
- `KATALOG_TEIL_INFO`
- `KATALOG_GLIEDERUNG` – Aufbau des Katalogs in Druckreihenfolge (fest, wie in den Verbandskatalogen).
- `KatalogSeitenbereich` (Typ) – Seiten eines Teils im erzeugten Katalog (1-basiert, `bis` einschließlich).
- `seitenbereiche()` – Seitenbereiche aus den Anfangsseiten der Teile: ein Teil reicht bis vor den nächsten, außer der nächste beginnt auf derselben Seite weiter unten (` …
- Typen: `KatalogSchrift`, `KatalogStil`, `KatalogTitelhintergrund`, `KatalogTitelbild`, `KatalogFusszeile`, `KatalogLinien`, `KatalogAufteilung`, `KatalogTeil`, `KatalogGliederungsTeil`

### sepa.ts (138 Z.)
Tests: `sepa.test.ts`

- `normalisiereIban()` – SEPA-Überweisungen (pain.001.001.09, wie von deutschen Banken nach DK-Datenformat angenommen).
- `formatIban()`
- `verdeckeIban()` – Gekürzte IBAN für Helfer ohne Bankdaten-Recht: Land und die letzten vier Stellen, z. B. „DE… 3000“.
- `pruefeIban()` – Prüft eine IBAN (Aufbau, Länge für häufige Länder, Prüfziffer).
- `imEwr()`
- `pruefeBic()`
- `sepaText()` – Auf den SEPA-Zeichensatz bringen (Umlaute umschreiben, Unerlaubtes ersetzen) und kürzen.
- `erzeugeSepaUeberweisung()` – Erzeugt die XML-Datei für eine Sammelüberweisung.
- Typen: `SepaPosten`, `SepaAuftrag`

### spenden.ts (155 Z.)
Tests: `spenden.test.ts`

- `SPENDE_ARTEN` – Spenden an den Verein: wann eine Zuwendungsbestätigung (§ 10b EStG, § 50 EStDV) ausgestellt werden darf, welche Spenden in eine Sammelbestätigung g …
- `SPENDE_WEGE` – Wie das Geld kam: bar in die Kasse, aufs Konto oder mit dem Meldegeld (freiwilliger Posten der Tiermeldung).
- `SPENDE_WEG_LABEL`
- `SACH_HERKUNFT` – Herkunft einer Sachzuwendung – entscheidet, welcher Wert gilt (amtliches Muster).
- `Steuerstatus` (Typ) – Steuerliche Angaben des Vereins für Zuwendungsbestätigungen.
- `STEUER_VORGABE`
- `steuerstatusLesen()` – Gespeicherten Wert in gültige Angaben bringen.
- `bescheidSperre()` – Darf der Verein heute Zuwendungsbestätigungen ausstellen?
- `spenderName()`
- `bestaetigungsSperren()` – Gründe, aus denen für diese Spende keine Zuwendungsbestätigung ausgestellt werden darf (leer: erlaubt).
- `sammelbestaetigung()` – Sammelbestätigung eines Kalenderjahres: alle Geldzuwendungen des Spenders aus diesem Jahr, die bestätigt werden dürfen (Sachzuwendungen nie – sie b …
- Typen: `SpendeArt`, `SpendeWeg`, `SachHerkunft`, `Sachangaben`, `SpendeFuerBestaetigung`, `SpenderAnschrift`

### stammdaten.ts (101 Z.)

- `zerlegeZeile()` – Zerlegt eine CSV-Zeile.
- `parseStammdatenCsv()` – Liest eine CSV mit den Spalten Sparte;Rasse;Farbenschlag.
- Typen: `StammdatenZeile`, `StammdatenBaum`

### stellvorschlaege.ts (99 Z.)
Tests: `stellvorschlaege.test.ts`

- `StellVorschlag` (Typ) – Ein Vorschlag, wie die Halle gestellt werden kann – mit dem durchgerechneten Plan.
- `stellTitel()` – Beschreibung einer Aufstellung.
- `stellVorschlaege()` – Alle Aufstellungen derselben Halle zum Vergleich: Reihenrichtung (quer, längs), Wandreihen, bündig an Wänden und Lage des Hauptgangs (Anfang, Ende, …

### termine.ts (15 Z.)
Tests: `termine.test.ts`

- `oeffnungszeitenZeilen()` – Öffnungszeiten als Zeilen, je Tag eine: getrennt an Zeilenumbrüchen und Semikolons, in einer Zeile außerdem vor jedem weiteren Wochentag („Fr.

### textbausteine.ts (104 Z.)

- `BAUSTEIN_KATEGORIEN` – Textbausteine der Bewertungskarte: Kategorie (Vorzüge, Wünsche, Mängel), Merkmal (Gruppe) und Geflügelart.
- `BAUSTEIN_KATEGORIE_LABEL`
- `BAUSTEIN_ARTEN`
- `BAUSTEIN_ART_LISTE`
- `artenDerSparte()` – Welche Bausteine passen zur Sparte eines Tieres?
- `bausteinPasst()`
- `rassePasst()` – Gilt ein Baustein mit dieser Rasse für das Tier?
- `bausteinFuerTier()` – Passt ein Baustein zum Tier?
- `BAUSTEIN_GRUPPEN_FOLGE` – Reihenfolge der Merkmale wie beim Durchgehen eines Tieres – unbekannte Gruppen danach alphabetisch.
- `sortiereGruppen()`
- Typen: `BausteinKategorie`, `BausteinArt`

### tiergesundheit.ts (189 Z.)

- `TIERARTEN` – Tierseuchenrecht auf der Schau: Tierart aus Sparte und Rasse, nötige Nachweise je Aussteller, Fristen der Nachweise und die Registriernummer nach § …
- `TIERART_LABEL`
- `tierart()` – Ordnet Sparte und Rasse einer Tierart zu.
- `NACHWEISARTEN`
- `NACHWEIS_LABEL`
- `UNTERSUCHUNG_ARTEN` – Klinische Untersuchung nach § 7 Abs. 1 GeflPestSchV: Der Veranstalter stellt sicher, dass die Vögel vorher tierärztlich untersucht sind – als Einla …
- `UNTERSUCHUNG_LABEL`
- `KL_TAGE` – Höchstalter der Bescheinigung vor der Schau (Merkblätter: 5 bis 6 Tage) – je Schau einstellbar.
- `istAuslaendisch()` – Ausländische Herkunft (Registriernummer mit Ländercode in Buchstaben, nicht DE).
- `noetigeNachweise()` – Welche Nachweise ein Aussteller mit diesen Tierarten bei der Einlieferung vorlegen muss.
- `NachweisFristen` (Typ) – Fristen der Schau nach dem Merkblatt des Veterinäramts (Tage vor dem Stichtag); leer = keine Frist.
- `WG_UNTERSUCHUNG_TAGE` – Virologische Untersuchung höchstens 7 Tage, Sentinel-Bestätigung höchstens 12 Monate vor der Schau.
- `WG_SENTINEL_TAGE`
- `pruefeNachweis()` – Prüft einen Nachweis: Datum vorhanden, nicht in der Zukunft, beim Wassergeflügel innerhalb der Frist vor dem Stichtag (Bewertungstag).
- `normalisiereRegistriernummer()` – Registriernummer nach § 26 ViehVerkV: 12 Ziffern (8-stelliger Gemeindeschlüssel + 4-stellige Betriebsnummer), oft mit Ländercode 276 davor.
- `REGISTRIERNUMMER_HINWEIS`
- `pruefeGeschlecht()` – Geschlechtsangabe „m,w“: mindestens ein Tier; Einzeltier genau eines, Stamm und Voliere höchstens 30.
- Typen: `Tierart`, `Nachweisart`, `Untersuchung`

### types.ts (79 Z.)

- `PHASEN` – Fachliche Grundbegriffe einer Rassegeflügelschau.
- `PHASEN_LABEL`
- `MELDEARTEN`
- `MELDEART_LABEL`
- `GEBUEHR_ARTEN`
- `GEBUEHR_LABEL`
- `ALTER`
- `EINGANG`
- `MELDUNG_STATUS`
- `EINTRAG_STATUS`
- `SONDERNOTEN` – Noten außerhalb der Punkteskala (BDRG): u = ungenügend (0 Punkte), o.B.
- `PREIS_QUELLEN`
- `PREIS_ZIELGRUPPEN` – Für wen eine Preisart gilt: alle Tiere, nur Jugendmeldungen oder nur Senioren (keine Jugend).
- `PREIS_ZIELGRUPPE_LABEL`
- `RUNDUNGEN` – „Auf 10 Tiere 1 E“: nur volle Zehner zählen oder auch angefangene.
- `KONTINGENT_BASEN` – Worauf sich das Preiskontingent bezieht: die Tiere jedes Preisrichters oder alle Tiere der Schau.
- Typen: `Phase`, `Meldeart`, `GebuehrArt`, `Alter`, `Eingang`, `MeldungStatus`, `EintragStatus`, `Sondernote`, `PreisZielgruppe`, `Rundung`, `KontingentBasis`, `PreisQuelle`

### version.ts (2 Z.)

- `VERSION` – Version von SchauFUCHS (Oberfläche, Server, Handbuch).

### veterinaeramt.ts (87 Z.)
Tests: `veterinaeramt.test.ts`

- `Veterinaeramt` (Typ) – Verzeichnis der zuständigen Veterinärämter (je Landkreis, kreisfreie Stadt bzw. Bezirk ein Eintrag): Vorschläge für das Feld „Zuständiges Veterinär …
- `suchNormal()` – Für die Suche: klein, Umlaute ausgeschrieben, Akzente und Satzzeichen weg.
- `kreisKern()` – Kreisname ohne Vorsatz („Landkreis Böblingen“ → „boeblingen“), normalisiert.
- `veterinaeramtSuchen()` – Ämter, auf die alle Wörter der Suche passen (Kreis, Amt, Ort, Land); Kreisname am Anfang zuerst.
- `veterinaeramtText()` – Text für das Feld: „Amt, Straße, PLZ Ort“ (leere Teile fallen weg).
- `veterinaeramtZurSchau()` – Vorschlag aus Ort bzw. Anschrift der Schau: der Kreis, dessen Name als ganzes Wort darin vorkommt (der längste gewinnt).

### zuwendungsbestaetigung.ts (70 Z.)
Zuwendungsbestätigungen nach den amtlichen Mustern (BMF-Schreiben vom 7.11.2013, IV C 4 – S 2223/07/0018 :005, BStBl I S. 1333; Anlagen 3, 4 und 14 …
Tests: `zuwendungsbestaetigung.test.ts`

- `UEBERSCHRIFT`
- `UNTERZEILE`
- `AUSSTELLER_TITEL`
- `ZUWENDENDER_TITEL`
- `SACH_HERKUNFT_TEXT`
- `SACH_UNTERLAGEN`
- `MITGLIEDSBEITRAG_TITEL`
- `MITGLIEDSBEITRAG_SATZ`
- `SAMMEL_KEINE_WEITEREN`
- `SAMMEL_VERZICHT`
- `UNTERSCHRIFT_TITEL`
- `HINWEIS`
- `ANLAGE_TITEL`
- `ANLAGE_SPALTEN`
- `datumKurz()` – TT.MM.JJJJ aus JJJJ-MM-TT.
- `bescheidSatz()` – Satz zum Freistellungsbescheid bzw. zur Feststellung nach § 60a AO – nur die zutreffende Variante.
- `verwendungSatz()` – „Es wird bestätigt, dass die Zuwendung nur zur Förderung … verwendet wird.“
- `betragFelder()` – Betrag in Ziffern und Buchstaben (BMF Nr. 5).
- `sachSaetze()` – Text der Sachzuwendung: Bezeichnung und die zutreffenden Sätze zur Herkunft und zu den Unterlagen.

Weitere Tests: `abrechnung-gesamt.test.ts`, `domain.test.ts`, `fristen.test.ts`, `hallenplan-etagen.test.ts`, `hallenplan-frei.test.ts`, `hallenplan-lueckenlos.test.ts`, `katalog-gliederung.test.ts`, `katalog-sortierung.test.ts`, `preisbindung.test.ts`, `stiftung.test.ts`

## tRPC-Prozeduren `apps/server/src/routers`

Aufruf im Web als `trpc.<bereich>.<prozedur>`. Rolle: öffentlich (ohne Anmeldung), angemeldet (jede Rolle), admin (Ausstellungsleitung, mit Zwei-Faktor), richter (Tablet). Feinere Rechte prüft die Prozedur selbst.

### routers/auth/anmeldung.ts (189 Z.) → `auth`
Anmeldung: Status, Ersteinrichtung, Anmelden (auch zweiter Schritt), Abmelden, eigenes Passwort ändern.

- `auth.status` query · öffentlich
- `auth.einrichten` mutation · öffentlich – Ersteinrichtung: legt Verein und ersten Administrator an.
- `auth.anmelden` mutation · öffentlich
- `auth.anmeldenCode` mutation · öffentlich – Zweiter Schritt der Anmeldung: Code aus der Authenticator-App oder ein Notfallcode.
- `auth.abmelden` mutation · öffentlich
- `auth.passwortAendern` mutation · angemeldet

### routers/auth/benutzer.ts (251 Z.) → `auth`
Benutzerverwaltung durch die Ausstellungsleitung: Liste, Angaben, Anlegen, Sperren, Löschen, Rolle, Passwort, Sperre aufheben.

- `auth.benutzerListe` query · admin
- `auth.benutzerGet` query · admin – Ein Benutzer mit allem, was die Verwaltung braucht (für dessen eigene Seite).
- `auth.benutzerSpeichern` mutation · admin – Name und E-Mail ändern (die E-Mail ist die Anmeldung – über alle Vereine eindeutig).
- `auth.benutzerAbmelden` mutation · admin – Alle Geräte eines Benutzers abmelden (z. B. Tablet an der Kasse liegen gelassen).
- `auth.benutzerAnlegen` mutation · admin
- `auth.benutzerAktiv` mutation · admin
- `auth.benutzerWillkommen` mutation · admin – Willkommensmail noch einmal schicken (z. B. kam die erste nicht an).
- `auth.benutzerLoeschen` mutation · admin – Benutzer löschen.
- `auth.benutzerRolle` mutation · admin – Rolle ändern.
- `auth.benutzerPasswortSetzen` mutation · admin – Neues Passwort durch die Ausstellungsleitung (vergessen).
- `auth.sperreAufheben` mutation · admin – Hebt Wartezeit und Sperren nach Fehlversuchen für ein Konto auf (z. B. wenn jemand Fremdes es aufhält).

### routers/auth/einladung.ts (47 Z.) → `auth`
Einladungslink: prüfen und annehmen (Passwort selbst festlegen).

- `auth.einladungPruefen` mutation · öffentlich – Einladungslink öffnen: wer ist eingeladen?
- `auth.einladungAnnehmen` mutation · öffentlich – Passwort über den Einladungslink festlegen.

### routers/auth/gemeinsam.ts (251 Z.)
Gemeinsame Bausteine der Anmeldung und Benutzerverwaltung: Bremsen (ein Zählerstand für alle Prozeduren), Prüfungen, Einladung, Willkommens- und Hi …

Keine Prozeduren (Hilfen für die Router).

### routers/auth/zweifaktor.ts (84 Z.) → `auth`
Zwei-Faktor-Anmeldung: Status, Einrichten, Bestätigen, Abschalten, Zurücksetzen durch die Ausstellungsleitung.

- `auth.zweiFaktorStatus` query · angemeldet
- `auth.zweiFaktorEinrichten` mutation · angemeldet – Schritt 1 der Einrichtung: neuen Schlüssel erzeugen (noch nicht aktiv).
- `auth.zweiFaktorBestaetigen` mutation · angemeldet – Schritt 2: mit einem Code aus der App bestätigen – erst dann ist der zweite Faktor aktiv.
- `auth.zweiFaktorAbschalten` mutation · angemeldet – Abschalten durch den Benutzer selbst: Passwort und aktueller Code (oder Notfallcode).
- `auth.zweiFaktorZuruecksetzen` mutation · admin – Telefon verloren und keine Notfallcodes mehr: die Ausstellungsleitung setzt den zweiten Faktor zurück.

### routers/auth.ts (12 Z.)
Anmeldung und Benutzer.

Setzt Teile zu einem Router zusammen.

### routers/bewertung.ts (384 Z.) → `bewertung`, `richter`

- `bewertung.liste` query · angemeldet
- `bewertung.setzen` mutation · admin
- `bewertung.zuruecksetzen` mutation · admin – Nimmt eine Bewertung zurück, damit das Tier neu bewertet werden kann.
- `bewertung.obmannBestaetigen` mutation · admin – Obmann-Bestätigung, die die Ausstellungsleitung im Auftrag des Obmanns einträgt.
- `bewertung.textbausteine` query · angemeldet
- `bewertung.textbausteinSpeichern` mutation · admin
- `bewertung.textbausteinGrundbestand` mutation · admin – Fehlende Bausteine aus dem Grundbestand übernehmen – eigene bleiben unverändert, nichts wird gelöscht.
- `bewertung.textbausteinLoeschen` mutation · admin
- `richter.anmeldeInfo` query · öffentlich
- `richter.anmelden` mutation · öffentlich
- `richter.abmelden` mutation · öffentlich
- `richter.daten` query · richter
- `richter.abgleich` mutation · richter – Nimmt die auf dem Tablet gesammelten Bewertungen entgegen (auch nach längerer Offline-Zeit).
- `richter.zuruecksetzen` mutation · richter – Der Preisrichter nimmt seine Bewertung zurück (nur mit Verbindung, nur bis zur Freigabe).
- `richter.preisVergeben` mutation · richter
- `richter.preisEntfernen` mutation · richter
- `richter.obmannBestaetigen` mutation · richter

### routers/druckvorlage.ts (141 Z.) → `druckvorlage`
Druckvorlagen (vorerst Bewertungskarte): Vorlagen des Vereins anlegen, ändern, löschen; je Schau eine auswählen oder für die Schau abwandeln (eigen …

- `druckvorlage.liste` query · admin – Alle Kartenvorlagen des Vereins: die allgemeinen und die für einzelne Schauen abgewandelten.
- `druckvorlage.vorgabe` query · admin – Vorgabe (so druckt SchauFUCHS ohne eigene Vorlage) – Ausgangspunkt für eine neue Vorlage.
- `druckvorlage.speichern` mutation · admin
- `druckvorlage.loeschen` mutation · admin – Löschen: Schauen, die sie nutzen, drucken danach wieder mit der Vorgabe.
- `druckvorlage.fuerSchau` query · admin – Welche Vorlage eine Schau nutzt (null = Vorgabe) und welche zur Wahl stehen.
- `druckvorlage.waehlen` mutation · admin – Vorlage für eine Schau wählen (Vereinsvorlage oder die eigene Fassung dieser Schau; null = Vorgabe).
- `druckvorlage.fuerSchauAnpassen` mutation · admin – Für diese Schau abwandeln: Kopie der gewählten Vorlage (oder der Vorgabe) nur für diese Schau, gleich gewählt.
- `druckvorlage.brief` query · admin – Briefvorlage des Vereins und die Vorgabe (zum Zurücksetzen einzelner Texte).
- `druckvorlage.briefSpeichern` mutation · admin
- `druckvorlage.serienbriefAnzahl` query · admin – Wie viele Empfänger ein Serienbrief mit dieser Auswahl hätte (vor dem Erzeugen anzeigen).

### routers/import.ts (119 Z.) → `datenimport`
Import aus Altprogrammen (Entscheidung 015), nur Administratoren: Datei lesen (CSV oder Excel), prüfen, übernehmen, Importläufe anzeigen und zurück …

- `datenimport.lesen` mutation · admin – Datei lesen: Excel (.xlsx) oder CSV.
- `datenimport.pruefen` mutation · admin
- `datenimport.uebernehmen` mutation · admin
- `datenimport.laeufe` query · admin
- `datenimport.zuruecknehmen` mutation · admin

### routers/kasse.ts (715 Z. ⚠) → `kasse`

- `kasse.tierSuchen` query · angemeldet
- `kasse.verkaufen` mutation · angemeldet
- `kasse.stornieren` mutation · admin
- `kasse.angebot` query · angemeldet – Tiere, die zum Verkauf stehen: verkäuflich gemeldet, eingeliefert, bewertet, nicht gesperrt und noch nicht verkauft.
- `kasse.verkaeufe` query · angemeldet
- `kasse.zahlungseingangVerkauf` mutation · admin – Zahlungseingang zu einem Verkauf per Überweisung (laut Kontoauszug) – nur Ausstellungsleitung.
- `kasse.offeneUeberweisungen` query · angemeldet – Verkäufe per Überweisung, deren Zahlungseingang noch fehlt (Liste für die Kasse).
- `kasse.abrechnung` query · angemeldet
- `kasse.auszahlen` mutation · angemeldet – Bucht die Auszahlung.
- `kasse.ueberweisungsdatei` query · angemeldet – Die offene SEPA-Datei (erstellt, noch nicht gebucht) oder null.
- `kasse.ueberweisungsdateiErstellen` mutation · admin – Legt die SEPA-Datei mit allen jetzt überweisbaren Ausstellern fest.
- `kasse.ueberweisungsdateiVerwerfen` mutation · admin – Verwirft die offene SEPA-Datei, z. B. wenn die Bank sie abgelehnt hat.
- `kasse.ueberweisungenBuchen` mutation · admin – Bucht die Aussteller aus der offenen SEPA-Datei mit den Beträgen der Datei als ausgezahlt (Art: Überweisung).
- `kasse.auszahlungStornieren` mutation · admin – Storniert eine Buchung, bei der kein Geld geflossen ist (Fehlbuchung, Überweisung von der Bank zurückgebucht).
- `kasse.kassenbuch` query · angemeldet – Kassenbuch nach Tagen: Anfangsbestand, Bargeldbewegungen, Soll, Tagesabschluss.
- `kasse.kassenbewegung` mutation · angemeldet – Wechselgeld zu Beginn, Einlage oder Entnahme (z. B. Bargeld zur Bank).
- `kasse.tagesabschluss` mutation · angemeldet – Tagesabschluss mit gezähltem Bestand für einen Kassentag (Standard: heute; nach Mitternacht der Vortag).
- `kasse.belege` query · angemeldet – Archivierte Belege mit Prüfsumme (SHA-256).

### routers/katalog-gestaltung.ts (334 Z.) → `katalogGestaltung`

- `katalogGestaltung.laden` query · angemeldet
- `katalogGestaltung.speichern` mutation · admin
- `katalogGestaltung.bildHochladen` mutation · admin
- `katalogGestaltung.bildAngabenSetzen` mutation · admin – Urheber, Lizenz und Quelle eines Vereinsbilds (Bildnachweis im Katalog).
- `katalogGestaltung.bildLoeschen` mutation · admin
- `katalogGestaltung.beitragSpeichern` mutation · admin
- `katalogGestaltung.beitragLoeschen` mutation · admin
- `katalogGestaltung.beitraegeOrdnen` mutation · admin – Neue Reihenfolge einer Art (Grußworte, Anzeigen, Seiten) als Liste der IDs.

### routers/katalog.ts (1.265 Z. ⚠) → `katalog`, `halle`

- `katalog.kaefigbedarf` query · angemeldet – Käfigbedarf: je Käfiggröße die gemeldeten und bestätigten Tiere (ohne fehlende) und die Käfignummern (= Katalognummern) der bestätigten.
- `katalog.aufstellerSetzen` mutation · admin – Höhe der Aufsteller (cm), auf denen die Grundplatten stehen; null = wieder Vorgabe.
- `katalog.sockelBildSetzen` mutation · admin – Bild für die Sockelverkleidung (z. B. die Plane eines Sponsors): wie die Katalogbilder geprüft (PNG oder JPEG, Größe, Pixel), ersetzt ein vorheriges.
- `katalog.sockelBildEntfernen` mutation · admin – Bild der Sockelverkleidung entfernen (die Verkleidung bleibt in ihrer Farbe).
- `katalog.plattenSetzen` mutation · admin – Grundplatte (Länge × Tiefe in cm) und Käfige je Platte für einzelne Käfigarten (fehlend = automatisch aus Platte und Käfigbreite).
- `katalog.kaefigRegelSetzen` mutation · admin – Abweichende Käfiggröße für eine Rasse festlegen (typ null = wieder automatisch).
- `katalog.kaefigMassSetzen` mutation · admin – Maße der eigenen Käfige je Käfigart (cm); null = wieder Richtwert.
- `katalog.hallenplan` query · angemeldet – Hallenplan: alle gemeldeten Tiere (offen und bestätigt) mit Käfig in Katalogfolge (Käfignummern) auf die Reihen der Halle verteilt; dazu die Preisr …
- `katalog.stellVorschlaege` query · angemeldet – Stellvorschläge: die Halle in anderen Aufstellungen (Richtung, Wandreihen, bündig, Hauptgang) durchgerechnet, mit Eingängen, Flächen und eingesetzt …
- `katalog.stellVorschlaegeEntwurf` mutation · admin – Stellvorschläge für eine noch nicht gespeicherte Halle (geführter Ablauf „Halle einrichten“): nur Ausstellungsleitung, als POST (ein Entwurf mit vi …
- `katalog.planFestschreiben` mutation · admin – Plan festschreiben: Die Lage jedes Käfigs wird gespeichert, die Automatik rechnet danach nicht mehr neu.
- `katalog.planNeuSetzen` mutation · admin – Plan neu setzen: die Software stellt alle Käfige neu (siehe `planNeuSetzenIn`).
- `katalog.planLoesen` mutation · admin – Früherer Name von „Plan neu setzen“ (ohne neue Einstellungen) – für ältere geöffnete Seiten.
- `katalog.tierVersetzen` mutation · admin – Tier im festen Plan von Hand versetzen (Rückmeldung 15.11.2026): in einen freien Käfig gleicher Größe oder Tausch mit einem Tier gleicher Größe (si …
- `katalog.kaefigInfo` query · angemeldet – Angaben zu einem Käfig im Hallenplan (beim Klick): Tier, Züchter, Preisrichter, Status, Bewertung und Preise.
- `katalog.halleSetzen` mutation · admin – Halle für den Hallenplan festlegen (Maße in cm).
- `katalog.wandreiheStellen` mutation · admin – Einzelreihe an einer Wand (die Ausstellungsleitung hat eine Reihe an die Wand gezogen): dort steht dann eine Einzelreihe, die übrigen Reihen ordnen …
- `katalog.liste` query · angemeldet
- `katalog.nummernVergeben` mutation · admin – Vor dem Festschreiben: alle Nummern lückenlos neu.
- `katalog.nummernNachPlan` mutation · admin – Nach dem Umstellen im Hallenplan: Nummern in der Reihenfolge, in der die Käfige jetzt im (festgeschriebenen) Plan stehen (siehe `planFolge`).
- `katalog.gedrucktSetzen` mutation · admin
- `halle.ringnummerSetzen` mutation · angemeldet – Ringnummer bei der Einlieferung nach der Ringkarte eintragen (Kennzeichnung für Kaufbeleg und Veterinärliste).
- `halle.kaefigSetzen` mutation · angemeldet – Andere Käfiggröße für ein einzelnes Tier, z. B. das Zwerghuhn in den letzten freien Großkäfig.
- `halle.suche` query · angemeldet – Einlieferung: Aussteller mit ihren Tieren, gesucht nach Name oder Katalognummer.
- `halle.statusSetzen` mutation · angemeldet
- `halle.vetSetzen` mutation · angemeldet – Nachweise bei der Einlieferung: ND-Impfung (Hühner, Puten), PMV-Impfung (Tauben), Untersuchung Wassergeflügel.
- `halle.gesundheit` query · angemeldet – Gesundheitsjournal (Art. 25 DelVO (EU) 2019/2035): Krankheit, Verdacht, Todesfall, Maßnahme.
- `halle.gesundheitErfassen` mutation · angemeldet
- `halle.gesundheitFreigeben` mutation · admin – Sperre aufheben (z. B. Tierarzt gibt Entwarnung) – nur die Ausstellungsleitung; der Eintrag bleibt im Journal.

### routers/meisterschaft.ts (37 Z.) → `meisterschaft`
Meisterschaften einer Schau (Entscheidung 014): Regeln lesen und speichern (Ausstellungsleitung, mit Protokoll), Vorlagen, Ergebnisse.

- `meisterschaft.regeln` query · angemeldet – Regeln der Schau (gelesen und ergänzt) und die Vorlagen.
- `meisterschaft.speichern` mutation · admin
- `meisterschaft.ergebnisse` query · angemeldet – Ergebnisse aller Meisterschaften (intern, mit allen Namen).

### routers/meldung.ts (424 Z.) → `meldung`

- `meldung.liste` query · angemeldet
- `meldung.get` query · angemeldet
- `meldung.adressVorschlaege` query · angemeldet – Vorschläge für Ort zur PLZ, Straße, Verein und Kreisverband aus den bisherigen Ausstellern des Vereins.
- `meldung.ausstellerSuche` query · angemeldet
- `meldung.speichern` mutation · angemeldet
- `meldung.statusSetzen` mutation · angemeldet
- `meldung.zahlungErfassen` mutation · angemeldet
- `meldung.erstattungenBuchen` mutation · admin – Erstattungen nach einer Absage gesammelt buchen: für jede stornierte Meldung mit Zahlungseingang eine Gegenbuchung (Überweisung) über den offenen B …
- `meldung.zuErstatten` query · angemeldet – Stornierte Meldungen mit Zahlungseingang: wem ist was zu erstatten (mit IBAN nur für die Ausstellungsleitung).
- `meldung.verfallBuchen` mutation · admin – Verfall: Das Meldegeld einer stornierten oder abgelehnten Meldung behält der Verein (z. B. Rücktritt nach dem Meldeschluss laut AAB).
- `meldung.zahlungStornieren` mutation · admin – Falsch erfasste Zahlung stornieren – nur Ausstellungsleitung, mit Grund.
- `meldung.bestaetigungSenden` mutation · angemeldet
- `meldung.zuletzt` query · angemeldet

### routers/oeffentlich.ts (435 Z.) → `oeffentlich`

- `oeffentlich.schau` query · öffentlich
- `oeffentlich.rechtstexte` query · öffentlich – Impressum (§ 5 DDG) und Datenschutzhinweise (Art. 13 DSGVO) des ausrichtenden Vereins.
- `oeffentlich.farbenschlagSuche` query · öffentlich
- `oeffentlich.melden` mutation · öffentlich
- `oeffentlich.meineMeldung` query · öffentlich
- `oeffentlich.onlineVeroeffentlichung` mutation · öffentlich – Einwilligung in die Online-Veröffentlichung erteilen oder widerrufen (Art. 7 Abs. 3 DSGVO) – so einfach wie die Erteilung.
- `oeffentlich.ergebnisse` query · öffentlich

### routers/preise.ts (296 Z.) → `preise`

- `preise.uebersicht` query · angemeldet
- `preise.vergeben` mutation · admin
- `preise.entfernen` mutation · admin
- `preise.stiftungSpeichern` mutation · admin
- `preise.stiftungBarErhalten` mutation · admin – Bar übergebene Stiftung ohne Meldung: als Einlage ins Kassenbuch (mit Eigenbeleg) und als eingegangen vermerken.
- `preise.stiftungLoeschen` mutation · admin
- `preise.freigeben` mutation · admin – Gibt die Ergebnisse frei (öffentlich sichtbar, Bewertung geschlossen).

### routers/preisrichter.ts (563 Z.) → `preisrichter`

- `preisrichter.liste` query · angemeldet
- `preisrichter.speichern` mutation · admin
- `preisrichter.pinErzeugen` mutation · admin – Erzeugt eine neue 8-stellige PIN für das Tablet.
- `preisrichter.sperreAufheben` mutation · admin – Hebt die Wartezeit nach PIN-Fehlversuchen auf, ohne eine neue PIN zu vergeben.
- `preisrichter.loeschen` mutation · admin
- `preisrichter.einteilungSetzen` mutation · admin
- `preisrichter.einteilungVorschlagen` query · admin
- `preisrichter.zuteilung` query · angemeldet – Einteilung nach Rassen: alle gemeldeten Rassen (offene und bestätigte Meldungen) in Ausstellungsfolge mit Tierzahl und Farbenschlägen, dazu die ges …
- `preisrichter.zuteilungSetzen` mutation · admin – Einteilung nach Rassen speichern.
- `preisrichter.zuteilungVorschlagen` query · admin – Vorschlag: gleichmäßig verteilen in der Folge Sparte, Rasse, Farbenschlag (ohne die Blöcke für Stämme und Jugend – so liegt jede Rasse beisammen un …

### routers/rassebild.ts (107 Z.) → `rassebild`
Rassebilder: ansehen (alle Benutzer) und pflegen (Ausstellungsleitung).

- `rassebild.liste` query · angemeldet – Alle Rassen eines Verzeichnisses mit ihrem Bild (falls vorhanden).
- `rassebild.hochladen` mutation · admin – Bild hochladen oder ersetzen (von Hand gepflegt = geprüft).
- `rassebild.angabenSetzen` mutation · admin – Urheber, Lizenz, Quelle und „geprüft“ ändern.
- `rassebild.loeschen` mutation · admin

### routers/schau.ts (859 Z. ⚠) → `schau`

- `schau.veterinaeraemter` query · angemeldet – Verzeichnis der zuständigen Veterinärämter (öffentliche Behördenangaben mit Quelle, siehe daten/veterinaeraemter.json) für die Vorschläge im Feld „ …
- `schau.liste` query · angemeldet
- `schau.get` query · angemeldet
- `schau.anlegen` mutation · admin – Neue Schau anlegen – leer mit Startwerten oder aus einer früheren Schau des Vereins als Vorlage.
- `schau.demodatenNeu` mutation · admin – Testschau: Demodaten neu einspielen – Meldungen, Test-Aussteller, Geld, Katalog und Bewertungen weg, frische Demodaten bis zur Einlieferung.
- `schau.loeschen` mutation · admin – Löscht eine leere Schau (z. B. zum Ausprobieren angelegt): nur in der Vorbereitung, ohne Meldungen, Geld, Belege oder Stiftungen, mit eingetipptem …
- `schau.alsTestschau` mutation · admin – Eine bestehende Schau als Testschau kennzeichnen (z. B. eine zum Üben angelegte mit Demo-Meldungen): ihre Aussteller werden Test-Aussteller und ver …
- `schau.testschauVorschau` query · admin – Vor dem Kennzeichnen: wer würde Test-Aussteller, wer ist echt (und verhindert es)?
- `schau.aktualisieren` mutation · admin
- `schau.katalogSortierungSetzen` mutation · admin – Reihenfolge der Katalognummern (Kriterien in Rangfolge, ausgeschaltet, umgekehrt; siehe SORTIER_KRITERIEN).
- `schau.absagen` mutation · admin – Schau absagen (z. B. Ausstellungsverbot wegen Tierseuche, § 7 Abs. 5 GeflPestSchV): nur bis vor der Einlieferung.
- `schau.phaseSetzen` mutation · admin
- `schau.gebuehrenSetzen` mutation · admin
- `schau.preisartSpeichern` mutation · admin – Preisart anlegen oder ändern.
- `schau.preisartLoeschen` mutation · admin
- `schau.notenskalaSetzen` mutation · admin
- `schau.uebersicht` query · angemeldet
- `schau.protokoll` query · angemeldet
- `schau.protokollPruefen` query · angemeldet – Prüft die Hash-Kette des Protokolls: wurde etwas nachträglich verändert?
- `schau.postausgang` query · admin – Postausgang des Vereins: nicht versandte Mails zuerst, damit ein gestörter Mailserver auffällt.
- `schau.postErneutSenden` mutation · admin – Nicht versandte Mail erneut senden (z. B. nach Korrektur der Mailserver-Einstellungen).

### routers/spenden.ts (202 Z.) → `spenden`
Spenden (Entscheidung 013): steuerliche Angaben des Vereins, Spenderverzeichnis, Spenden je Schau erfassen und stornieren, Zuwendungsbestätigungen …

- `spenden.steuer` query · admin – Steuerliche Angaben und ob der Verein heute Zuwendungsbestätigungen ausstellen darf.
- `spenden.steuerSpeichern` mutation · admin
- `spenden.spender` query · angemeldet – Spenderverzeichnis (ohne Test-Spender), optional gesucht nach Name oder Ort.
- `spenden.spenderSpeichern` mutation · angemeldet
- `spenden.liste` query · angemeldet – Spenden einer Schau mit Eingangstag, Bestätigung und den Gründen, warum (noch) keine Bestätigung geht.
- `spenden.spenderDetails` query · admin – Spenden eines Spenders über alle Schauen (für die Sammelbestätigung) und seine Bestätigungen.
- `spenden.erfassen` mutation · angemeldet – Spende erfassen: bar (Kasse, heute), Überweisung (Eingangstag) oder Sache.
- `spenden.stornieren` mutation · admin – Storno (nur Ausstellungsleitung): nicht, solange eine gültige Zuwendungsbestätigung sie umfasst.
- `spenden.bestaetigen` mutation · admin
- `spenden.sammelbestaetigen` mutation · admin
- `spenden.bestaetigungStornieren` mutation · admin

### routers/stammdaten.ts (232 Z.) → `stammdaten`

- `stammdaten.gliederung` query · angemeldet – Sparten und Rassen einer Version – für die Vorschläge beim Ergänzen.
- `stammdaten.ergaenzen` mutation · admin – Ergänzt ein eingespieltes Verzeichnis von Hand um Sparte, Rasse und Farbenschläge.
- `stammdaten.versionen` query · angemeldet
- `stammdaten.importieren` mutation · admin
- `stammdaten.loeschen` mutation · admin – Löscht nur eigene Versionen des Vereins; die des Betreibers (ohne Verein) bleiben.
- `stammdaten.suche` query · angemeldet
- `stammdaten.baum` query · angemeldet

### routers/termine.ts (260 Z.) → `termine`
Kommende Schauen: Termine anderer Schauen pflegen (von Hand oder aus abonnierten Kalendern) und für den Katalog Kreis und Landesverband wählen.

- `termine.laden` query · angemeldet – Alles für die Pflegeseite: Termine, Abos, Wahl im Katalog dieser Schau und die Vorschau der Katalogseite.
- `termine.wahlSetzen` mutation · admin – Kreis und Landesverband für den Katalog dieser Schau (leer = alle).
- `termine.druckenSetzen` mutation · admin – Seite „Kommende Schauen“ im Katalog dieser Schau drucken oder weglassen (derselbe Wert wie unter „Teile des Katalogs“).
- `termine.speichern` mutation · admin – Eigener Eintrag (neu oder geändert).
- `termine.loeschen` mutation · admin
- `termine.pruefen` mutation · admin – Vorschläge prüfen: übernehmen (dann im Katalog) oder verwerfen (kommt auch beim nächsten Abruf nicht wieder).
- `termine.abweichung` mutation · admin – Abweichung der Quelle übernehmen (Angaben ersetzen bzw. entfallenen Termin löschen) oder ignorieren.
- `termine.aboSpeichern` mutation · admin
- `termine.aboLoeschen` mutation · admin – Abo beenden: offene Vorschläge verschwinden, übernommene Termine bleiben (ohne Verbindung zum Kalender).
- `termine.aboAbrufen` mutation · admin – Jetzt abrufen statt auf den täglichen Abruf zu warten.
- `termine.veroeffentlichenSetzen` mutation · admin – Eigene Schauen als Kalender veröffentlichen (für andere Vereine zum Abonnieren).

### routers/verein.ts (170 Z.) → `verein`

- `verein.get` query · angemeldet – Angaben für Impressum und Datenschutzhinweise, dazu die daraus erzeugten Texte.
- `verein.speichern` mutation · admin
- `verein.abmeldung` query · admin – Automatische Abmeldung nach Untätigkeit: Minuten je Rolle.
- `verein.abmeldungSpeichern` mutation · admin
- `verein.aussteller` query · admin – Aussteller des Vereins: Verwaltung, Auskunft und Löschung – getrennt nach Vereinsmitgliedern und Externen.
- `verein.ausstellerDaten` query · admin – Stammdaten eines Ausstellers zum Bearbeiten (ohne Geburtsdatum).
- `verein.ausstellerSpeichern` mutation · admin – Aussteller anlegen oder Stammdaten ändern (mit Protokoll; Bankdaten nicht, solange eine offene SEPA-Datei sie enthält).
- `verein.vereinsangaben` query · admin – Vereinsangaben der Aussteller und die Schreibweisen, die als eigener Verein gelten.
- `verein.vereinsnamenSetzen` mutation · admin
- `verein.ausstellerLoeschen` mutation · admin – Löschen auf Wunsch (Art. 17 DSGVO): sofort, oder gesperrt bis zum Ende der Aufbewahrungsfrist.
- `verein.auskunftPerson` mutation · admin – Auskunft für Käufer und Preisrichter (keine Aussteller-Stammdaten), gesucht nach Name – als POST, damit der Name in keiner URL steht.
- `verein.bereinigen` mutation · admin

## Seiten `apps/web/src/seiten`

Route aus `apps/web/src/routes.tsx`, dahinter die aufgerufenen Prozeduren.

### abrechnung.tsx (422 Z.) – `/schau/:schauId/abrechnung`
Prozeduren: auth.status, kasse.abrechnung, kasse.auszahlen, kasse.auszahlungStornieren, kasse.ueberweisungenBuchen, kasse.ueberweisungsdatei, kasse.ueberweisungsdateiErstellen, kasse.ueberweisungsdateiVerwerfen, meldung.erstattungenBuchen, meldung.zuErstatten, schau.get

### aussteller.tsx (456 Z.) – `/aussteller`
Prozeduren: schau.liste, verein.aussteller, verein.ausstellerDaten, verein.ausstellerLoeschen, verein.ausstellerSpeichern, verein.vereinsangaben, verein.vereinsnamenSetzen

### benutzer.tsx (630 Z. ⚠) – `/benutzer`, `/benutzer/neu`, `/benutzer/:benutzerId`
Prozeduren: auth.benutzerAbmelden, auth.benutzerAktiv, auth.benutzerAnlegen, auth.benutzerGet, auth.benutzerListe, auth.benutzerLoeschen, auth.benutzerPasswortSetzen, auth.benutzerRolle, auth.benutzerSpeichern, auth.benutzerWillkommen, auth.passwortAendern, auth.sperreAufheben, auth.status, auth.zweiFaktorAbschalten, auth.zweiFaktorBestaetigen, auth.zweiFaktorEinrichten, auth.zweiFaktorStatus, auth.zweiFaktorZuruecksetzen

### bewertung.tsx (326 Z.) – `/schau/:schauId/bewertung`
Prozeduren: auth.status, bewertung.liste, bewertung.obmannBestaetigen, bewertung.setzen, bewertung.zuruecksetzen

### briefvorlage.tsx (236 Z.) – `/verein/briefvorlage`
Prozeduren: druckvorlage.brief, druckvorlage.briefSpeichern, druckvorlage.serienbriefAnzahl, schau.liste

### druckvorlage-vorschau.tsx (147 Z.)

### druckvorlage.tsx (229 Z.) – `/verein/druckvorlagen/:vorlageId`
Prozeduren: druckvorlage.liste, druckvorlage.speichern, druckvorlage.vorgabe

### einladung.tsx (99 Z.) – `/einladung`
Prozeduren: auth.einladungAnnehmen, auth.einladungPruefen, auth.status

### einlieferung.tsx (497 Z.) – `/schau/:schauId/einlieferung`
Prozeduren: auth.status, halle.gesundheit, halle.gesundheitErfassen, halle.gesundheitFreigeben, halle.kaefigSetzen, halle.ringnummerSetzen, halle.statusSetzen, halle.suche, halle.vetSetzen, meldung.zahlungErfassen, schau.get

### einstellungen-druck.tsx (60 Z.)
Prozeduren: druckvorlage.fuerSchau, druckvorlage.fuerSchauAnpassen, druckvorlage.waehlen

### einstellungen-meisterschaften.tsx (267 Z.)
Prozeduren: meisterschaft.regeln, meisterschaft.speichern

### einstellungen-vetamt.tsx (87 Z.)
Prozeduren: schau.veterinaeraemter

### einstellungen.tsx (892 Z. ⚠) – `/schau/:schauId/einstellungen`
Prozeduren: auth.status, schau.absagen, schau.aktualisieren, schau.alsTestschau, schau.demodatenNeu, schau.gebuehrenSetzen, schau.get, schau.loeschen, schau.notenskalaSetzen, schau.preisartLoeschen, schau.preisartSpeichern, schau.protokoll, schau.testschauVorschau, stammdaten.versionen

### fehler.tsx (42 Z.)

### hallenplan-3d-seite.tsx (54 Z.) – `/schau/:schauId/hallenplan/3d`
Hallenplan in 3D als eigene Seite (eigener Browser-Tab, ohne Seitenleiste): zeigt den gespeicherten Stand des Plans.
Prozeduren: auth.status, katalog.hallenplan, schau.get

### hallenplan-3d.tsx (944 Z. ⚠)
Hallenplan in 3D: die Halle räumlich – drehen, zoomen, verschieben, von oben oder im Gang in Augenhöhe.

### hallenplan-werkzeuge.tsx (301 Z.)
Bausteine der Werkzeugleiste im Hallenplan-Editor: Symbole, Werkzeugknöpfe mit Tooltip (Name und Tastenkürzel), Gruppen und aufklappbare Menüs.

### hallenplan.tsx (3.577 Z. ⚠) – `/schau/:schauId/hallenplan`
Prozeduren: katalog.halleSetzen, katalog.hallenplan, katalog.kaefigInfo, katalog.nummernNachPlan, katalog.planFestschreiben, katalog.planNeuSetzen, katalog.stellVorschlaege, katalog.stellVorschlaegeEntwurf, katalog.tierVersetzen, katalog.wandreiheStellen

### hilfe.tsx (182 Z.) – `/hilfe`, `/hilfe/:teil`
Prozeduren: auth.status

### import.tsx (421 Z.) – `/import`
Prozeduren: datenimport.laeufe, datenimport.lesen, datenimport.pruefen, datenimport.uebernehmen, datenimport.zuruecknehmen, schau.liste

### kaefige.tsx (473 Z.) – `/schau/:schauId/kaefige`
Prozeduren: katalog.aufstellerSetzen, katalog.kaefigMassSetzen, katalog.kaefigRegelSetzen, katalog.kaefigbedarf, katalog.plattenSetzen, katalog.sockelBildEntfernen, katalog.sockelBildSetzen

### kassenbuch.tsx (334 Z.) – `/schau/:schauId/kassenbuch`
Prozeduren: kasse.belege, kasse.kassenbewegung, kasse.kassenbuch, kasse.tagesabschluss

### katalog-gestalten.tsx (1.029 Z. ⚠) – `/schau/:schauId/katalog/gestalten`
Prozeduren: auth.status, katalogGestaltung.beitraegeOrdnen, katalogGestaltung.beitragLoeschen, katalogGestaltung.beitragSpeichern, katalogGestaltung.bildAngabenSetzen, katalogGestaltung.bildHochladen, katalogGestaltung.bildLoeschen, katalogGestaltung.laden, katalogGestaltung.speichern, schau.get, termine.laden

### katalog-reihenfolge.tsx (96 Z.)
Prozeduren: schau.katalogSortierungSetzen

### katalog-vorschau.tsx (141 Z.)

### katalog.tsx (177 Z.) – `/schau/:schauId/katalog`
Prozeduren: auth.status, katalog.gedrucktSetzen, katalog.liste, katalog.nummernVergeben, schau.get

### kommende-schauen.tsx (534 Z.)
Prozeduren: termine.aboAbrufen, termine.aboLoeschen, termine.aboSpeichern, termine.abweichung, termine.druckenSetzen, termine.laden, termine.loeschen, termine.pruefen, termine.speichern, termine.veroeffentlichenSetzen, termine.wahlSetzen

### meisterschaften.tsx (84 Z.) – `/schau/:schauId/meisterschaften`
Prozeduren: meisterschaft.ergebnisse

### meldung-bearbeiten.tsx (446 Z.) – `/schau/:schauId/meldungen/neu`, `/schau/:schauId/meldungen/:meldungId`
Prozeduren: meldung.adressVorschlaege, meldung.ausstellerSuche, meldung.bestaetigungSenden, meldung.get, meldung.speichern, meldung.statusSetzen, meldung.verfallBuchen, meldung.zahlungErfassen, meldung.zahlungStornieren, schau.get, stammdaten.suche

### meldungen.tsx (123 Z.) – `/schau/:schauId/meldungen`
Prozeduren: meldung.liste

### oeffentlich.tsx (495 Z.) – `/s/:slug`, `/s/:slug/meldung/:token`, `/s/:slug/ergebnisse`, `/s/:slug/impressum`, `/s/:slug/datenschutz`
Prozeduren: oeffentlich.ergebnisse, oeffentlich.farbenschlagSuche, oeffentlich.meineMeldung, oeffentlich.melden, oeffentlich.onlineVeroeffentlichung, oeffentlich.rechtstexte, oeffentlich.schau

### preise.tsx (462 Z.) – `/schau/:schauId/preise`
Prozeduren: auth.status, preise.entfernen, preise.freigeben, preise.stiftungBarErhalten, preise.stiftungLoeschen, preise.stiftungSpeichern, preise.uebersicht, preise.vergeben, schau.get

### preisrichter.tsx (506 Z.) – `/schau/:schauId/preisrichter`
Prozeduren: preisrichter.einteilungSetzen, preisrichter.einteilungVorschlagen, preisrichter.liste, preisrichter.loeschen, preisrichter.pinErzeugen, preisrichter.speichern, preisrichter.sperreAufheben, preisrichter.zuteilung, preisrichter.zuteilungSetzen, preisrichter.zuteilungVorschlagen, schau.get, stammdaten.gliederung

### protokoll.tsx (147 Z.) – `/schau/:schauId/protokoll`
Prozeduren: schau.protokoll, schau.protokollPruefen

### rassebilder.tsx (268 Z.)
Prozeduren: rassebild.angabenSetzen, rassebild.hochladen, rassebild.liste, rassebild.loeschen

### richter.tsx (1.140 Z. ⚠) – `/richter/:slug`
Bewertung am Tablet für Preisrichter.
Prozeduren: auth.status, richter.anmeldeInfo, richter.anmelden

### schau-liste.tsx (206 Z.) – `/`
Prozeduren: auth.status, schau.anlegen, schau.liste

### spende-erfassen.tsx (178 Z.)
Prozeduren: spenden.erfassen, spenden.spender, spenden.spenderSpeichern

### spenden.tsx (168 Z.) – `/schau/:schauId/spenden`
Prozeduren: spenden.bestaetigen, spenden.liste, spenden.steuer, spenden.stornieren

### spender.tsx (181 Z.) – `/spender`
Prozeduren: spenden.bestaetigungStornieren, spenden.sammelbestaetigen, spenden.spender, spenden.spenderDetails, spenden.spenderSpeichern

### stammdaten.tsx (291 Z.) – `/stammdaten`
Prozeduren: auth.status, stammdaten.baum, stammdaten.ergaenzen, stammdaten.gliederung, stammdaten.importieren, stammdaten.loeschen, stammdaten.versionen

### uebersicht.tsx (302 Z.) – `/schau/:schauId`
Prozeduren: auth.status, schau.phaseSetzen, schau.uebersicht

### verein-abmeldung.tsx (53 Z.)
Prozeduren: verein.abmeldung, verein.abmeldungSpeichern

### verein-druckvorlagen.tsx (75 Z.)
Prozeduren: druckvorlage.liste, druckvorlage.loeschen

### verein-steuer.tsx (75 Z.)
Prozeduren: spenden.steuer, spenden.steuerSpeichern

### verein.tsx (544 Z.) – `/verein`
Prozeduren: bewertung.textbausteinGrundbestand, bewertung.textbausteinLoeschen, bewertung.textbausteinSpeichern, bewertung.textbausteine, schau.postErneutSenden, schau.postausgang, stammdaten.gliederung, stammdaten.versionen, verein.auskunftPerson, verein.bereinigen, verein.get, verein.speichern

### verkauf.tsx (340 Z.) – `/schau/:schauId/verkauf`
Prozeduren: auth.status, kasse.angebot, kasse.offeneUeberweisungen, kasse.stornieren, kasse.tierSuchen, kasse.verkaeufe, kasse.verkaufen, kasse.zahlungseingangVerkauf, schau.get

## Weitere Dateien

Je Datei: Zeilen, Beschreibung, exportierte Namen.

### Server-Dienste mit Datenbank `apps/server/src/services`

- `aussteller.ts` (183 Z.) – Aussteller-Verwaltung des Vereins: anlegen, Stammdaten ändern, Vereinsmitglied (ohne Meldung, unter „Verein und Datenschutz“). · ausstellerVerwaltungEingabe, eigeneVereinsnamen, speichereAussteller, setzeVereinsnamen, vereinsangabenUebersicht
- `bewertung.ts` (193 Z.) · bewertungEingabe, RICHTER_PHASEN, speichereBewertung, setzeBewertungZurueck
- `bremse.ts` (224 Z.) · Bremse, Wartezeit, anschlussSchluessel, netz48Schluessel, istLokaleAdresse, adressSchluessel
- `datenschutz.ts` (595 Z.) · ladeVereinsangaben, ladeAuskunft, ladeAuskunftPerson, loescheAussteller, bereinige, starteBereinigung
- `einteilung.ts` (90 Z.) · sperreEinteilung, einteilTier, einteilSchluessel, ladeRegeln, bereicheDerSchau, rassenEinteilungAnwenden, einteilungNachStatus
- `eintraege.ts` (249 Z.) · ladeEintraege, NICHT_VEROEFFENTLICHT, verdeckeNamen, ausstellerAnzeige, bezeichnung, alsFolge, meldebetrag, meldebetraege, skalaVon
- `fehlertext.ts` (5 Z.) · kurzerFehler
- `import.ts` (381 Z.) – Import aus Altprogrammen (Entscheidung 015): Tabelle prüfen (Zeilen, Aussteller wiedererkennen, Rassen abgleichen), übernehmen (über dieselben Wege … · rassenSchluessel, importPruefen, importUebernehmen, importZuruecknehmen, importLaeufe
- `kasse.ts` (110 Z.) · sperreKasse, SEPA_ERSTELLT, SEPA_VERWORFEN, SEPA_GEBUCHT, offenerLauf, schliesseLauf, offeneStornoZahlungen, offeneUeberweisungsverkaeufe, pruefeNichtAbgeschlossen, pruefeNichtAbgerechnet
- `kassenbuch.ts` (237 Z.) · tagDe, ladeKassenbuch, sollBestand, archiviereBeleg, ladeBeleg, zweitschrift, belegListe, archiviereKaufbeleg, archiviereKassenbeleg, archiviereQuittung, archiviereSpendenquittung
- `meisterschaften.ts` (76 Z.) – Meisterschaftswertungen einer Schau (Entscheidung 014): Tiere aus Katalog und Bewertung für die Fachregel (packages/domain/src/meisterschaft.ts) au … · meisterschaftTiere, meisterschaftErgebnisse
- `meldung.ts` (493 Z.) · registriernummerFeld, ausstellerEingabe, positionEingabe, meldungEingabe, speichereMeldung, bindungen, hatAuszahlung
- `post.ts` (143 Z.) · smtpOptionen, ohneAdressen, mailStatus, POST_WIEDERHOLEN_MS, naechsterVersuch, sendeMail, versende, starteMailversand
- `preise.ts` (174 Z.) · vergebePreis, entfernePreis
- `protokoll-suche.ts` (136 Z.) · sucheProtokoll, pruefeProtokoll, eigenerKopf, kettenkopf
- `protokoll.ts` (37 Z.) · protokolliere
- `pruefung.ts` (366 Z.) · ONLINE_RESERVIERUNG_STUNDEN, belegteKaefige, zuteilung, offeneStiftungen, GESAMT, kontingente, checkliste
- `rassebild.ts` (86 Z.) – Rassebilder für den Katalog: prüfen und speichern (Oberfläche und Einspielen aus dem Netz). · RASSEBILD_MAX_BYTES, jpegAnzeige, oeffneBild, pruefeRassebild, speichereRassebild
- `serienbrief.ts` (34 Z.) – Empfänger eines Serienbriefs: Vereinsmitglieder, alle Aussteller des Vereins oder die Aussteller mit bestätigter Meldung zu einer Schau. · SERIENBRIEF_AUSWAHL, serienbriefEmpfaenger
- `spenden-quittung.ts` (34 Z.) – Spendenquittung einer Spende erzeugen (für das Belegarchiv, services/kassenbuch.ts): Briefkopf und Farbe aus der Briefvorlage des Vereins, Hinweis … · spendenquittung
- `spenden.ts` (152 Z.) – Spenden (Entscheidung 013): Spender zum Aussteller finden oder anlegen, Spenden einer Schau mit Eingangstag und Bestätigungsstand laden, Bestätigun … · ladeSteuer, spenderFuerAussteller, meldungsspendeAnlegen, eingangMitMeldegeld, ladeSpenden, sperreBestaetigungen, naechsteBestaetigungsnummer, spenderFuerKatalog
- `termine.ts` (253 Z.) – Kommende Schauen: Termine für die Katalogseite, abonnierte Kalender (iCal) abrufen und abgleichen, eigene Schauen als Kalender. · KALENDER_MAX_BYTES, ladeKommende, eigeneSchauenFuerKalender, istInterneAdresse, sichereAufloesung, pruefeKalenderAdresse, holeKalender, aboAbrufen, alleAbosAbrufen, starteTerminabruf
- `testschau.ts` (164 Z.) – Testschauen (Üben, Vorführen) sind von echten Schauen getrennt: Aussteller, die in einer Testschau angelegt oder gemeldet werden, gehören nur ihr ( … · sperreTestschauGeteilt, ausstellerDerSchau, echteAussteller, testSchauIdFuer, pruefeAusstellerZurSchau, sperreTestschauExklusiv, testschauVorschau, KOPIE_AKTION, testKopienVon, kennzeichneAlsTestschau
- `textbausteine-grundbestand.ts` (709 Z. ⚠) · TEXTBAUSTEINE_LISTE
- `textbausteine.ts` (50 Z.) · TEXTBAUSTEINE_GRUNDBESTAND, legeTextbausteineAn, TEXTBAUSTEINE_MAX, sperreBausteine, ergaenzeGrundbestand
- `tiergesundheit.ts` (28 Z.) · heuteDe, nachweisStand
- `tierliste.ts` (106 Z.) · ladeTierliste
- `vereinsverzeichnis.ts` (90 Z.) · verzeichnisVorschlaegeZwischengespeichert, verzeichnisVergessen, vereineEinspielen
- `verkaufsliste.ts` (55 Z.) · ladeVerkaufsliste
- `zuwendungsbestaetigung.ts` (95 Z.) – Zuwendungsbestätigungen ausstellen und stornieren (Entscheidung 013). · bestaetigeSpende, sammelbestaetige, storniereBestaetigung
- `zweifaktor.ts` (136 Z.) · base32, ausBase32, neuesGeheimnis, zeitschritt, totp, pruefeTotp, otpauthAdresse, lesbar, hashNotfallcode, neueNotfallcodes, starteZweiterSchritt, ladeZweiterSchritt, zweiterSchrittFehlgeschlagen, beendeZweiterSchritt
- `zwischenspeicher.ts` (38 Z.) · oeffentlichGeaendert, rassebilderGeaendert, termineGeaendert, oeffentlicherStand

### PDFs `apps/server/src/pdf`

- `auskunft.ts` (263 Z.) · auskunftPdf
- `basis.ts` (425 Z.) · MM, SERIF, SERIF_FETT, SERIF_KURSIV, SANS, SANS_FETT, SANS_KURSIV, registriereSchriften, TINTE, GRAU, HAARLINIE, STANDARDFARBE, kontrast, lesbareFarbe, logoBild, design, mitVermerk, erzeugePdf, aufLinie, kicker, briefkopf, fusszeilen, teilSeite, seitenzahlen, tabelle, textImFeld, angaben, hinweisKastenHoehe, hinweisKasten, unterschrift, ueberschrift, datumDe
- `bewertungskarte.ts` (325 Z.) – Bewertungskarten nach der Druckvorlage der Schau (Format, Bausteine oder Vordruck-Felder, Versatz) – dazu die Vorschau für den Designer und der Pro … · ladeKartenVorlage, kartenKopf, bewertungskartenPdf, BEISPIEL_KARTEN, zeichneKartenPdf, probedruckPdf
- `brief.ts` (136 Z.) – Briefe nach der Briefvorlage des Vereins (DIN 5008, Form A oder B): Briefkopf, Rücksendeangabe, Anschrift, Informationsblock, Falzmarken und Fußzeile. · BRIEF_RAENDER, ladeBriefVorlage, briefDesign, briefKopf, belegKopf, briefFuss, serienbriefPdf
- `dokumente-amt.ts` (245 Z.) – Listen für das Veterinäramt: abgegebene Tiere (Verkaufsliste) und Aussteller- und Tierliste. · verkaufslistePdf, tierlistePdf
- `dokumente-gemeinsam.ts` (35 Z.) – Gemeinsame Hilfen der Dokumente einer Schau (dokumente.ts, dokumente-kasse.ts, dokumente-amt.ts): Design aus der Katalog-Gestaltung, Vereinsname, K … · nr, klasse, tier, A4_RAENDER, ladeDesign, verein, kopfzeile, fusstext, breite, unten
- `dokumente-kasse.ts` (344 Z.) – Belege der Kasse: Kaufbeleg mit Ausgabeschein (Verkauf), Kassenbericht der Barkasse, Einzahlungsquittung und Eigenbeleg. · kaufbelegPdf, kassenberichtPdf, kassenbelegPdf
- `dokumente.ts` (544 Z.) · bewertungskartenPdf, preisrichterListePdf, ausstellerUnterlagenPdf, abrechnungPdf
- `hallenplan.ts` (403 Z.) – Hallenplan als PDF: genau ein Blatt DIN A4 – der Plan füllt es (Querformat, wenn die Zeichnung breiter als hoch ist), darüber ein knapper Kopf (Sch … · hallenplanPdf, aufbaulistePdf
- `illustrationen.ts` (31 Z.) – Historische Stiche für Titelseite und Spartenköpfe (apps/server/stiche, Quellen in QUELLEN.md). · stichBild, stichFuer
- `katalog.ts` (1.502 Z. ⚠) · KURZ_JE_ABTEILUNG, kurzauswahl, kurzeAdresse, urheberKurz, bildnachweisTeile, bildnachweis, katalogPdf
- `meisterschaften.ts` (54 Z.) – Ergebnisse der Meisterschaften als PDF (A4): je Meisterschaft und Rasse/Farbenschlag die Rangfolge mit den gewerteten Tieren (Katalognummer und Pun … · meisterschaftenPdf
- `spenden.ts` (257 Z.) – Spenden: Zuwendungsbestätigung nach amtlichem Muster (Geld, Sache, Sammelbestätigung mit Anlage) und die einfache Spendenquittung für die Kasse. · zuwendungsbestaetigungPdf, spendenquittungPdf

### Datenbank `apps/server/src/db`

- `client.ts` (11 Z.) · sql, db
- `geheim-bestand.ts` (61 Z.) – Stellt Altbestand im Klartext auf verschlüsselte Spalten um (läuft bei jedem Start nach den Migrationen; findet es nichts mehr, tut es nichts). · pruefeDatenschluessel, verschluesseleBestand
- `geheim.ts` (99 Z.) – Verschlüsselte Spalten: IBAN, Kontoinhaber, Bankdaten in SEPA-Dateien, Zwei-Faktor-Geheimnis. · PRAEFIX, erlaubeKlartext, datenschluessel, setzeDatenschluesselFuerTest, verschluessele, entschluessele, geheimText, geheimJson
- `schema-import.ts` (26 Z.) – Import aus Altprogrammen (Entscheidung 015): je Importlauf, was er angelegt hat – damit „Zurücknehmen“ genau das wieder entfernt, solange nichts we … · importlauf
- `schema-spenden.ts` (115 Z.) – Spenden (Entscheidung 013): Spenderverzeichnis des Vereins, Spenden je Schau und Zuwendungsbestätigungen. · spender, spende, zuwendungsbestaetigung, bestaetigungSpende
- `schema.ts` (1.028 Z. ⚠) · phaseEnum, meldeartEnum, gebuehrArtEnum, alterEnum, eingangEnum, meldungStatusEnum, eintragStatusEnum, sondernoteEnum, preisQuelleEnum, rolleEnum, zahlartEnum, erfasstAufEnum, rundungEnum, kontingentBasisEnum, organisation, benutzer, sitzung, stammdatenVersion, sparte, rasse, farbenschlag, schau, gebuehr, preisart, aussteller, meldung, zahlung, katalogeintrag, vereinsverzeichnis, preisrichter, prEinteilung, prZuteilung, bewertung, textbaustein, stiftung, preisvergabe, verkauf, verkaufZahlungseingang, gesundheit, auszahlung, aenderung, postausgang, KATALOG_FORMATE, BEITRAG_ARTEN, ANZEIGE_GROESSEN, druckvorlage, katalogGestaltung, TERMIN_STATUS, terminabo, schautermin, bild, rassebild, katalogBeitrag, KASSENBEWEGUNG_ARTEN, kassenbewegung, kassenabschluss, beleg, aenderungKette, aenderungGeloescht, aenderungAnonymisiert, sepaLauf
- `schutz.ts` (15 Z.) – Spielt die Schutz-Trigger (schutz.sql) ein: nach Migrationen, nach db:push und in den Tests. · schutzEinspielen
- `spalten.ts` (12 Z.) – Spaltenarten, die mehrere Schemadateien nutzen (schema.ts, schema-spenden.ts). · ts, created, createdNachSperre, bytea

### Server sonst `apps/server/src`

- `auth.ts` (189 Z.) · COOKIE, COOKIE_RICHTER, sha256, zufallsToken, hashPasswort, pruefePasswort, neueSitzung, sitzungWennUnveraendert, sitzungsId, beendeSitzung, ladeSitzung, cookieHeader
- `config.ts` (30 Z.) · config
- `csv.ts` (15 Z.) – CSV für Excel: Semikolon, BOM, Schutz vor Formel-Injektion. · csv
- `datei-druckvorlage.ts` (125 Z.) – Datei-Adressen des Druckvorlagen-Designers (nur Ausstellungsleitung): POST /datei/druckvorlage/vorschau.pdf – Beispielkarten nach der (noch nicht g … · druckvorlageDateien, briefDateien
- `datei-meisterschaften.ts` (47 Z.) – Datei-Adressen der Meisterschaften (angemeldete Benutzer der eigenen Schau): GET /datei/:schauId/meisterschaften.pdf – Ergebnisse zum Aushängen, Na … · meisterschaftDateien
- `datei-spenden.ts` (32 Z.) – Datei-Adresse der Zuwendungsbestätigungen (nur Ausstellungsleitung, nur eigener Verein): GET /datei/zuwendungsbestaetigung/:id.pdf – das beim Ausst … · spendenDateien
- `index.ts` (930 Z. ⚠)
- `migrate.ts` (17 Z.) – Spielt ausstehende Datenbank-Migrationen ein (Produktion, Docker-Start).
- `rassebilder-import.ts` (73 Z.) – Rassebilder aus einem Verzeichnis einspielen (z. B. aus Wikimedia Commons gesammelt): `ergebnis.json` mit {rasse, datei, urheber, lizenz, lizenzUrl … · rassebilderEinspielen
- `router.ts` (44 Z.) · appRouter
- `seed.ts` (550 Z.) – Demo-Daten für Entwicklung, Tests und Vorführung. · DEMO, demoEntfernen, seed, bisZurBewertung, komplett
- `testschau.ts` (517 Z.) – Testdaten für eine vorhandene, leere Schau: füllt sie wie eine echte Lokalschau bis nach der Einlieferung, damit die Ausstellungsleitung den Rest ( … · MERKMAL, DEMO_TIERE_HOECHSTENS, mitDemoSperre, fuellen, zuruecksetzen, entfernen
- `trpc.ts` (290 Z.) · kurzerPruefText, pruefeMeta, pruefeUmfang, strukturZuGross, sqlZustand, router, publicProcedure, fehler, dbId, kalenderdatum, benutzerProcedure, adminProcedure, richterProcedure, oeffentlichSichtbarProcedure, ladeSchau, pruefeNachFreigabe
- `vereinsverzeichnis-import.ts` (27 Z.) – Vereinsverzeichnis einspielen (Namen der Rassegeflügelzuchtvereine aus öffentlichen Verbandsseiten): bun src/vereinsverzeichnis-import.ts --datei < …

### Web-Bausteine `apps/web/src`

- `aussteller.tsx` (135 Z.) · leererAussteller, AusstellerFelder
- `positionen.tsx` (462 Z.) · neuePosition, alsEingabe, pruefePositionen, ausEintrag, FarbenschlagWahl, PositionenEditor
- `abmeldung.tsx` (78 Z.) · eingabeVorMs, useAutoAbmeldung, AbmeldeHinweis
- `lib.ts` (39 Z.) · fehlerText, datum, datumZeit, heuteIso, centZuText, ALTER_LABEL
- `main.tsx` (22 Z.)
- `modus.ts` (46 Z.) · setzeFarbmodus, useFarbmodus
- `pdf-anzeige.tsx` (43 Z.) – PDF im Browser anzeigen (pdf.js), gemeinsam für die Live-Vorschauen von Katalog und Druckvorlagen. · pdfjs, PdfSeite
- `rahmen.tsx` (527 Z.) · useSchauId, AppRahmen, SchauRahmen, AnmeldeFlaeche, Anmelden
- `rolle.ts` (9 Z.) · useIstAdmin
- `routes.tsx` (114 Z.) · router
- `symbole.tsx` (44 Z.) · Symbol
- `trpc.ts` (56 Z.) · trpc, queryClient, trpcClient, direkt
- `ui.tsx` (621 Z. ⚠) · knopfKlasse, Knopf, KnopfLink, Feld, useUngespeichertWarnung, useAenderungenWarnen, UngespeichertWaechter, Eingabe, Textfeld, Auswahl, Haken, Hinweis, Marke, useSeitentitel, SEITENRAND, SEITE, SCHMAL, LESEBREITE, Seitenkopf, HilfeLink, Abschnitt, TabellenRahmen, Suchfeld, Segmente, Formular, FormAbschnitt, SpeicherPlatz, Speicherleiste, Kennzahlen, Leer, Laden, FehlerAnzeige, Dialog, FragenAnbieter, useFrage, MeldungenAnbieter, useMeldung

## Server-Tests `apps/server/src/tests`

Laufen nacheinander gegen eine Datenbank (Einstieg `apps/server/src/ablauf.test.ts`); spätere Teile nutzen Daten der früheren.

- `01-schau-ablauf.ts` (354 Z.) – Kompletter Durchlauf einer Schau von der Einrichtung bis zur Abrechnung.
- `02-rechte-und-kasse.ts` (420 Z.) – Rechte, Tablet-Sperre, Kontingente, Stammdaten je Verein; Kassensperren, SEPA, Nummern, CSV.
- `03-tablet-halle-drucke.ts` (208 Z.) – Tablet-Abgleich, Impfnachweis bei der Einlieferung, PDF-Drucke.
- `04-meldung-katalog-sicherheit.ts` (288 Z.) – Jugendmeldung, freie Bezeichnung, Volieren/Stämme, Verkaufsliste, erhaltene Daten, Sicherheit.
- `05-datenschutz-fachrecht.ts` (295 Z.) – Paket 3 (Datenschutz) und Paket 4 (Fachrecht).
- `06-gobd-beta.ts` (329 Z.) – Paket 5 (Kasse und GoBD, Versionszähler) und Behebungen aus der Beta.
- `07-runde4.ts` (392 Z.) – Audit Runde 4: Speicherflut, Geld, Fachlogik, Datenschutz, Bewertung am PC.
- `08-betrieb-grenzen.ts` (578 Z.) – Runde 4: Betrieb, Anmeldung und Grenzen; Nachbesserungen zu Größengrenzen, superjson, öffentlichem Katalog.
- `09-nachbesserung-runde5.ts` (405 Z.) – Nachbesserungen Runde 4 (Geld, Protokoll, Datenschutz, Bremsen) und Audit Runde 5. Teil des Schau-Ablaufs: ablauf.test.ts bindet die Teile in feste …
- `10-benutzer-zugang.ts` (382 Z.) – Benutzer, Zwei-Faktor-Anmeldung, Verzeichnis ergänzen, Willkommensmail, Einladungslink.
- `11-runde6-bausteine.ts` (239 Z.) – Audit Runde 6, Textbausteine, Zwei-Faktor-Pflicht.
- `12-runde7-rollen-kasse.ts` (265 Z.) – Audit Runde 7, Rollen (Meldungen, Noten, Preise, Meldegeld), Nachtrag nach dem Tagesabschluss.
- `13-luecken.ts` (210 Z.) – Prozeduren, die bisher in keinem Test aufgerufen wurden (Code-Review nach Runde 7): je Prozedur Wirkung, Rechte und Grenzen.
- `14-konzept-audit.ts` (125 Z.) – Restpunkte aus Audit Runde 7 und Konzept-Abgleich: Meldephase nur mit Gebühren und Meldeschluss, Hinweise vor der Freigabe, Zahlungsweise (vorab od …
- `15-info-runde7.ts` (35 Z.) – Info-Hinweise aus Audit Runde 7 (Mengenbremse je /48).
- `16-schau-loeschen.ts` (60 Z.) – Leere Schau löschen (z. B. eine angelegte Test-Schau).
- `17-kaefige.ts` (234 Z.) – Käfigbedarf je Käfiggröße und abweichende Größe je Rasse.
- `18-adressvorschlaege.ts` (42 Z.) – Vorschläge für Ort, Straße, Verein und Kreisverband aus den eigenen Ausstellerdaten.
- `19-hallenplan.ts` (177 Z.) – Hallenplan: Halle anlegen, Käfige in Katalogfolge auf die Reihen, Preisrichter-Bereiche.
- `20-schau-vorlage.ts` (64 Z.) – Neue Schau aus einer früheren als Vorlage: alles außer Meldungen und Geld.
- `21-bestaetigung-zuruecknehmen.ts` (36 Z.) – Versehentlich bestätigt: Helfer und Ausstellungsleitung nehmen die Bestätigung zurück.
- `22-audit-runde8.ts` (186 Z.) – Behebungen aus Audit Runde 8 (Geld, Datenschutz, Status, Löschen, Kassenbuch).
- `23-preisrichter-sparten.ts` (52 Z.) – Preisrichter bewerten nur ihre Sparten: Einteilung (Vorschlag und von Hand) beachtet das.
- `24-plan-fest.ts` (57 Z.) – Hallenplan festschreiben: Lage bleibt, Storno macht frei, Nachmeldung rückt nach; nur Ausstellungsleitung.
- `25-rassebilder.ts` (196 Z.) – Rassebilder: pflegen (nur Ausstellungsleitung), je Verein getrennt, ungeprüfte nicht im Katalog; Einspielen überschreibt nichts.
- `26-aussteller-verwaltung.ts` (161 Z.) – Aussteller-Verwaltung: anlegen, bearbeiten, Mitglieder und Externe getrennt (Schreibweisen des Vereins), Rechte, Protokoll, Bankdaten-Sperre.
- `27-verschluesselung.ts` (114 Z.) – Verschlüsselte Spalten: IBAN, Kontoinhaber, SEPA-Datei, Zwei-Faktor-Geheimnis; Umstellung des Altbestands; falscher Schlüssel.
- `28-testschau.ts` (313 Z.) – Testschauen: eigene Aussteller, nie in echten Schauen, Vorschlägen oder der Verwaltung; Kennzeichnen und Löschen.
- `29-einteilung-rassen.ts` (101 Z.) – Preisrichter nach Rassen einteilen, vor den Katalognummern; die Bereiche folgen der Nummernvergabe.
- `30-einteilung-gegenpruefung.ts` (159 Z.) – Einteilung nach Rassen nach der Gegenprüfung: Sperre gegen gleichzeitige Nummernvergabe, Lücken, bewertete Tiere bei Nachmeldungen, Unternummern an …
- `31-stellvorschlaege.ts` (57 Z.) – Stellvorschläge für die Halle: abrufen, übernehmen (Eingänge bleiben, Handarbeit der alten Aufstellung fällt weg).
- `32-eingabepruefung.ts` (59 Z.) – Eingabeprüfung (zod 4): eigene Fehlertexte bleiben, Standardtexte auf Deutsch.
- `33-vereinsverzeichnis.ts` (57 Z.) – Vereinsverzeichnis: einspielen (nur Namen, nichts überschrieben, Prüfung auf Kontaktdaten, Protokoll) und Vorschläge in Verwaltung und öffentlicher …
- `34-katalog-gestaltung.ts` (304 Z.) – Druckkatalog: Schrift und Gestaltung wählbar, A4 als Vorgabe, Stiche je Sparte (einmal eingebettet), Öffnungszeiten untereinander.
- `35-pruefung-nachbesserung.ts` (574 Z.) – Nachbesserungen aus der Gesamtprüfung vom 13.11.2026 (interne Prüfung): Sperren nach Festschreiben und Abschluss, Geld-Lücken, Protokoll, rechtssic …
- `36-nach-plan-nummerieren.ts` (178 Z.) – Nach dem Umstellen im Hallenplan neu nummerieren: vor dem Festschreiben der Katalognummern die Katalognummern (und Käfigplätze) in der Reihenfolge …
- `37-kommende-schauen.ts` (178 Z.) – Kommende Schauen: Termine pflegen, Kalender abonnieren ohne stilles Überschreiben, Katalogseite mit Kreiswahl, eigener Kalender.
- `38-hallenplan-entfernen.ts` (86 Z.) – Leere Plätze im festen Hallenplan entfernen: über das Speichern der Halle (wie jede Änderung im Editor), nur leere Platten und Plätze im festen Pla …
- `39-hallenplan-druck.ts` (100 Z.) – Hallenplan drucken: genau ein Blatt A4 (quer, wenn die Zeichnung breiter als hoch ist), auch bei einer großen Halle mit vielen Käfigen, festgeschri …
- `40-hallenplan-neu-setzen.ts` (131 Z.) – Plan neu setzen (Rückmeldung 14.11.2026: „wenn ich quer auf längs gehe und neu anordne macht er quatsch“): Plan fest, Reihe und Platten verschoben, …
- `41-hallenplan-3d.ts` (93 Z.) – Hallenplan räumlich: Aufsteller je Schau einstellen, Daten für die 3D-Ansicht ohne Ausstellernamen.
- `42-hallenplan-moebel-etagen.ts` (105 Z.) – Hallenplan: Tische, Bänke und Garnituren als eingesetzte Teile (mit Maßen gespeichert, bleiben beim Neu-Setzen) und Etagen je Käfigart (Kapazität d …
- `43-katalog-sortierung.ts` (106 Z.) – Reihenfolge der Katalognummern wählbar: speichern (nur Ausstellungsleitung, Vorgabe als null, Protokoll), Vergabe nach der gewählten Folge, Sperre …
- `44-pruefliste-hallenplan.ts` (60 Z.) – Prüfliste ab der Phase „Katalog & Halle“: Hinweise zum Hallenplan (Tiere ohne Platz, Käfigfront zur Wand oder zu einer Reihe, Nummern nicht in Plan …
- `45-hallenplan-tier-versetzen.ts` (163 Z.) – Tiere im Halleneditor versetzen (Rückmeldung 15.11.2026: „ich will auch käfige frei zuordnen können im halleneditor und ggf tiere versetzen“): nur …
- `46-automatische-abmeldung.ts` (64 Z.) – Automatische Abmeldung nach Untätigkeit (Rückmeldung 15.11.2026): Frist je Rolle unter „Verein und Datenschutz“, nur die angebotenen Minuten, Proto …
- `47-druckvorlagen.ts` (112 Z.) – Druckvorlagen für Bewertungskarten: Vorlagen des Vereins speichern, je Schau wählen, für eine Schau abwandeln, löschen (Schau druckt dann wieder mi …
- `48-briefvorlage.ts` (116 Z.) – Briefvorlage des Vereins: speichern (Protokoll), eigene Texte im B-Bogen, Serienbrief an Mitglieder, alle Aussteller oder die einer Schau – ohne ge …
- `49-spenden.ts` (221 Z.) – Spenden (Entscheidung 013): steuerliche Angaben, Barspende mit Kassenbuch und Quittung, Spende bei der Meldung im offenen Betrag, Zuwendungsbestäti …
- `50-meisterschaften.ts` (60 Z.) – Meisterschaften (Entscheidung 014): Regeln speichern (Ausstellungsleitung, Protokoll), Wertung aus Katalog und Bewertung, PDF und CSV.
- `51-import.ts` (116 Z.) – Import aus Altprogrammen (Entscheidung 015): Datei lesen (CSV in Windows-1252, altes .xls abgelehnt), prüfen (Aussteller wiedererkennen, Rassen zuo …
- `52-import-befunde.ts` (153 Z.) – Import aus Altprogrammen, Befunde der Gegenprüfung (Entscheidung 015): große Dateien, einzelne fehlerhafte Zeilen, gleicher Name mit anderer Regist …
- `kontext.ts` (55 Z.) – Gemeinsamer Zustand und Hilfen für den Schau-Ablauf (ablauf.test.ts und die Teile in diesem Ordner).
- Außerdem: `einteilung.test.ts`, `veterinaeraemter.test.ts`
