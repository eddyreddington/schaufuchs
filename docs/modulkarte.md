# Modulkarte

Erzeugt mit `bun run modulkarte` aus `scripts/modulkarte.ts` – nicht von Hand ändern. Erst hier suchen, dann die genannte Datei öffnen.
Überblick: `docs/architektur.md`, Moduldoku: `docs/module/`, Entscheidungen: `docs/entscheidungen/`. ⚠ = über 600 Zeilen.

Inhalt: [Fachlogik](#fachlogik-packagesdomainsrc) · [tRPC-Prozeduren](#trpc-prozeduren-appsserversrcrouters) · [Seiten](#seiten-appswebsrcseiten) · [Weitere Dateien](#weitere-dateien) · [Server-Tests](#server-tests-appsserversrctests)

## Fachlogik `packages/domain/src`

Reine Funktionen ohne Datenbank und Oberfläche. Server und Web importieren aus `@schau/domain` (`index.ts`).

### ablauf.ts (103 Z.)
Ablauf einer Schau für die Übersicht: wohin der Knopf der Phase führt und in welcher Folge die Prüfliste „Was noch zu tun ist“ ihre Gruppen zeigt.
Tests: `ablauf.test.ts`

- `ARBEIT` – Wo in welcher Phase die Arbeit liegt (Unterseite der Schau; Text des Knopfs: t.schau.uebersicht.arbeit).
- `HallenStand` (Typ) – Stand des Hallenplans für den Ablauf (Übersicht, Seite „Katalognummern“).
- `hallenStandVon()` – Stand aus dem gerechneten Plan (`plan` null: keine Halle) und den Tieren des Plans (`planTiere`).
- `hallenplanOffen()` – Was am Hallenplan noch zu tun ist, bevor die Katalognummern dran sind: der feste Plan ist veraltet, Tiere haben keinen Platz (fester oder automatis …
- `nachPlanVergeben()` – Seite „Katalognummern“: Steht ein fester, aktueller Plan mit Tieren, ist „Nach Hallenplan vergeben“ der empfohlene Weg (die Nummern folgen den Käfi …
- `arbeitsZiel()` – Ziel des Knopfs in der Übersicht.
- `PRUEFLISTE_FOLGE` – Folge der Gruppen in der Prüfliste (je Unterseite, auf der man es erledigt) – wie der Ablauf der Schau: Hallenplan vor Katalognummern, diese vor de …
- `prueflistenGruppen()` – Punkte der Prüfliste nach Unterseite gruppiert, ohne „ok“: Gruppen in der Folge `PRUEFLISTE_FOLGE`, unbekannte Ziele dahinter (in der Folge ihres e …

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

### briefvorlage.ts (137 Z.)
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

### datenschutz.ts (202 Z.)
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
- `datenschutzKurz()` – Kurzfassung für das Meldeformular (erste Ebene der Information nach Art. 13 DSGVO), in der Sprache des Ausstellers.
- `datenschutzAbschnitte()` – Vollständige Datenschutzhinweise.
- `alsText()` – Abschnitte als schlichter Text, z. B. um das Muster als eigenen Text zu übernehmen.
- `aufbewahrenBis()` – Bis wann die Daten eines Ausstellers aufbewahrt werden müssen: Verkaufsaufzeichnungen ab Verkauf, Belege (Zahlungen, Auszahlungen, Kaufbelege) bis …
- Typen: `Vereinsangaben`, `Textabschnitt`

### datum.ts (21 Z.)
Tests: `datum.test.ts`

- `tagBerlin()` – Kalendertag eines Zeitpunkts in deutscher Zeit.
- `datumKurz()` – TT.MM.JJJJ aus JJJJ-MM-TT (für Meldungen und Belege).
- `heuteBerlin()` – Heutiger Kalendertag in deutscher Zeit.

### druck-formate.ts (179 Z.)
Formatvorgaben der Drucke je Schau (Entscheidung 029): welche Drucksachen es gibt, auf welchem Papier sie kommen, welche sich umstellen lassen und …
Tests: `druck-formate.test.ts`

- `PAPIER_MM` – Papierformate in Millimetern (hochkant).
- `Blatt` (Typ) – Seitengröße in mm.
- `blatt()` – Ein Papierformat hochkant oder quer.
- `DRUCK_FORMAT_WAHL` – Formate, die sich je Schau wählen lassen; das erste ist die Vorgabe (so druckte SchauFUCHS bisher).
- `DRUCK_FORMAT_ARTEN`
- `DRUCK_FORMATE_VORGABE`
- `druckFormateLesen()` – Gespeicherten Wert begrenzen: Unbekanntes fällt weg, ein ungültiger Wert gilt als Vorgabe – je Drucksache für sich.
- `druckFormateAbweichung()` – Was von der Vorgabe abweicht (leer = alles wie bisher) – für Protokoll und Anzeige.
- `BelegBlatt` (Typ) – Beleg (Kaufbeleg, Kassenbeleg, Spendenquittung): der Beleg ist immer A5 quer, das Papier A5 quer oder A4 hoch.
- `belegBlatt()`
- `ListenSpalten` (Typ) – Spalten einer Bewertungsliste in mm: Nummer, Klasse, dann Note, Punkte und Preis zum Eintragen.
- `bewertungslisteBlatt()` – Bewertungsliste: Seite, wie viele Listen nebeneinander, Ränder (schmal, gelocht wird links), Lücke zwischen den Listen und die Spaltenbreiten in mm.
- `hallenplanBlatt()` – Hallenplan: ein Blatt, quer, wenn die Zeichnung breiter als hoch ist.
- `DruckEinstellung` (Typ) – Wo das Format einer Drucksache eingestellt wird.
- `DRUCKSACHEN` – Alle Drucksachen einer Schau in der Folge des Ablaufs (Meldung → Bewertung → Kasse → Halle).
- Typen: `Papier`, `DruckFormatArt`, `DruckFormate`, `BelegFormat`, `Drucksache`, `DrucksacheId`

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

### eingabefehler.ts (8 Z.)

- `EingabeFehler` (Klasse) – Fehler in den Angaben (hochgeladene Datei, Konto, Mandat), dessen Text der Server wörtlich als Meldung zeigen darf.

### einteilung.ts (145 Z.)
Preisrichter-Einteilung nach Rassen: Vor der Nummernvergabe teilt die Ausstellungsleitung die Preisrichter nach Sparte, Rasse und – wo eine Rasse g …
Tests: `einteilung.test.ts`

- `RassenRegel` (Typ) – Eine Regel: diese Rasse (bzw. dieser Farbenschlag der Rasse) geht an diesen Preisrichter.
- `EinteilTier` (Typ) – Was ein Tier für die Einteilung ausmacht.
- `richterNachRasse()` – Preisrichter für ein Tier: eine Regel für seinen Farbenschlag geht vor der Regel für die ganze Rasse.
- `richterImPlan()` – Preisrichter eines Tieres im Hallenplan: mit Katalognummer aus den Nummernbereichen (wie Tablet, Bewertung und Preise), ohne Nummer – vor dem Numme …
- `EinteilFolgeTier` (Typ) – Für die Folge der Einteilung: ein Tier mit den Stellen aus dem Verzeichnis (null = nicht im Verzeichnis).
- `vergleicheEinteilFolge()` – Folge der Einteilung nach Rassen: Sparte, Rasse, Farbenschlag (ohne Verzeichnis-Folge dahinter, nach dem Namen).
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

### gesundheitspruefung.ts (89 Z.)
Angaben der Gesundheitsprüfung `GET /api/gesund` für Überwachung und Update-Läufe (Entscheidung 024).
Tests: `gesundheitspruefung.test.ts`

- `SchauZeitraum` (Typ) – Was von einer Schau für die Schautage zählt.
- `schautageLaufen()` – Laufen gerade Schautage?
- `offeneMigrationen()` – Noch nicht eingespielte Migrationen: alle aus dem Verzeichnis (`when` in drizzle/meta/_journal.json), die jünger sind als die zuletzt eingespielte …
- `MigrationsEintrag` (Typ) – Ein Eintrag aus drizzle/meta/_journal.json.
- `Migrationsverzeichnis` (Typ) – Stand des Migrationsverzeichnisses: Journal, SQL-Dateien und Schnappschüsse (meta/NNNN_snapshot.json).
- `migrationsverzeichnisFehler()` – Fehler im Migrationsverzeichnis, wie sie entstehen, wenn zwei Zweige je eine Migration mit derselben Nummer anlegen und beim Merge nur umbenannt wird.

### girocode.ts (84 Z.)
Überweisung des Meldegelds mit Referenz und GiroCode (Entscheidung 021): Jede Meldung bekommt eine Referenz nach ISO 11649 („RF“ + Prüfziffern), di …
Tests: `girocode.test.ts`

- `rfReferenz()` – Referenz einer Meldung, ohne Leerzeichen, z. B. „RF910001234“.
- `istRfReferenz()` – Ist das eine gültige Referenz nach ISO 11649 (Aufbau und Prüfziffern)?
- `verwendungszweckMeldegeld()` – Verwendungszweck einer Meldegeld-Überweisung: Referenz zuerst (die findet der Import), dann der Name lesbar für den Kassierer.
- `GIROCODE_MAX_BYTE` – Höchstlänge des Inhalts laut EPC069-12.
- `giroCodeText()` – Inhalt des GiroCodes (EPC069-12 Version 002, UTF-8) oder null, wenn die Angaben dafür nicht reichen (IBAN ungültig, kein Empfänger, Betrag außerhal …
- Typen: `GiroCodeAngaben`

### hallenentwurf.ts (18 Z.)
Hallenplan-Entwürfe (Entscheidung 017): Rückfrage, bevor ein Entwurf die Halle ersetzt.
Tests: `hallenentwurf.test.ts`

- `IN_DER_HALLE` – Status eines Tiers, das schon in der Halle war: zählt für die Rückfrage.
- `entwurfRueckfrage()` – Text der Rückfrage oder `null`, wenn ohne Rückfrage geladen werden kann.

### hallenplan-3d-ausstattung.ts (245 Z.)
Ausstattung der 3D-Halle aus dem Aussehen (Entscheidung 028): Fenster oben in den Längswänden, Geräte an den Wänden (Basketballbretter, Sprossenwan …
Tests: `hallenplan-3d-ausstattung.test.ts`

- `WandFenster` (Typ) – Fenster auf der Innenseite eines Wandstücks: Strecke entlang der Wand (von–bis), Unterkante y und Höhe h.
- `fensterBand()` – Höhe des Fensterbands: oben knapp unter der Decke, unten über der Prallwand und mindestens in der oberen Wandhälfte.
- `fensterInWaenden()` – Fensterband oben in den Längswänden, nur in voll hohen Wandstücken (nie über einer Tür).
- `WandGeraet` (Typ) – Gerät an der Wand (Deko): Mitte entlang der Wand, Unterkante y, Breite b, Höhe h.
- `KORB` – Basketballbrett 1,80 × 1,05 m, Unterkante 2,90 m (bei niedriger Wand tiefer); Ring ragt bis 60 cm in die Halle.
- `SPROSSENWAND` – Sprossenwand mit zwei Feldern, bis 2,50 m hoch, 30 cm tief.
- `geraeteAnWaenden()` – Geräte an den Wänden: je Stirnwand ein Basketballbrett mittig oben, an einer Längswand eine Sprossenwand unter den Fenstern.
- `SpielfeldLinie` (Typ) – Linie am Boden (Strichmitte, cm); `punkte` als Linienzug.
- `LINIEN_BREITE` – Strichbreite der Spielfeldlinien (cm).
- `spielfeldLinien()` – Spielfeldlinien wie in einer Sporthalle, maßstäblich zur Halle: Handballfeld (40 × 20 m, mit 1 m Rand) mittig längs der langen Seite, in kleineren …

### hallenplan-3d-dach.ts (156 Z.)
Dach und Decke der 3D-Halle (Entscheidung 028): flache Decke in Wandhöhe oder Satteldach (First parallel zur langen Seite in der Mitte, nur beim re …
Tests: `hallenplan-3d-dach.test.ts`

- `DachLage` (Typ) – Was die Dachrechnung von der Szene braucht; `firstHoehe` fehlt: flach.
- `dachVon()`
- `deckenHoehe()` – Unterseite der Decke an der Stelle (x, z): an den Längswänden die Traufe, zur Mitte gerade bis zum First.
- `deckeSichtbar()` – Ist die Decke zu sehen?
- `BINDER` – Leimbinder 16 × 45 cm etwa alle 5,50 m; Leuchten 2,40 m lang.
- `LEUCHTE`
- `Binder` (Typ) – Ein Binder (bzw. eine Hälfte beim Satteldach): Oberkante an der Decke von a nach b, Querschnitt `BINDER`.
- `hoechstesInDerHalle()` – Höchster Käfig bzw. höchste Voliere der Szene (Oberkante, cm); 0 ohne.
- `deckenTeile()` – Holzdecke: Leimbinder quer zur langen Seite in gleichem Abstand, bündig unter der Decke (beim Satteldach zwei Hälften von der Traufe zum First); in …
- `Giebel` (Typ) – Giebeldreieck über einer Stirnwand: entlang der Wand von–bis (über die Ecken), Unterkante y, Spitze in der Mitte.
- `giebel()` – Giebel an beiden Stirnseiten beim Satteldach (geschlossen bis unter den First); flach: keine.
- Typen: `Dach`, `DeckenTeile`

### hallenplan-3d-rundgang.ts (119 Z.)
Automatischer Rundgang durch die Halle (3D): die Gänge zwischen den Reihen in Schlangenlinie, immer in Augenhöhe und mit Abstand zu allem (Hinderni …
Tests: `hallenplan-3d-rundgang.test.ts`

- `RUNDGANG_HOEHE` – Augenhöhe beim Rundgang (cm), überall gleich.
- `rundgang()` – Wegpunkte des Rundgangs in Szene-Koordinaten (cm; x entlang der Breite, z entlang der Länge, y Augenhöhe), vor dem Vertauschen der Achsen (`vertaus …
- Typen: `RundgangPunkt`

### hallenplan-3d-waende.ts (150 Z.)
3D-Wände mit Türöffnungen: um die rechteckige Halle und entlang eines freien Grundrisses (Entscheidung 019), dazu die Lage einer Tür in ihrer Wand.

- `ohneSeite()` – Die Seite gehört nur zu Wänden, nicht zur Türöffnung.
- `waendeImGrundriss()` – Wände entlang eines freien Grundrisses (Entscheidung 019): je Kante ein Wandstück außen an der Kante, bis zum um die Wanddicke versetzten Umriss – …
- `waendeUndTueren()` – Wände um die Halle (außen anliegend), mit Öffnungen an den Türen und einem Sturz darüber.
- `wandSeiten()` – An welchen Seiten ein Wandstück steht (eine Ecke an zweien).
- `tuerLage()` – Lage einer Tür in der Szene (cm): Seite ihrer Wand, Ebene der Innenfläche (x bei x0/x1, z bei z0/z1), Mitte und Breite entlang der Wand, Wandstärke.

### hallenplan-3d-wege.ts (340 Z.)
Wege durch die 3D-Halle ohne Anstoßen: eine Hinderniskarte aus der Szene (Grundplatten und Blöcke, Käfige samt Etagen, Volieren, Möbel, Sperrfläche …

- `KOERPER_RADIUS` – Halber Platzbedarf eines Menschen (cm): so weit bleibt der Weg von Käfigen und Wänden.
- `WegSzene` (Typ) – Was die Karte von der Szene braucht.
- `hinderniskarte()` – Hinderniskarte der Szene mit dem Körperradius als Abstand.
- `istFrei()` – Darf man hier stehen (mit Abstand zu allem)?
- `streckeFrei()` – Ist die gerade Strecke von a nach b ganz frei?
- `gleite()` – Schritt von `von` nach `nach`, an Hindernissen entlang gleitend; wer schon zu nah steht, darf heraus.
- `rasterVon()` – Raster der Karte (einmal gerechnet): Zellen um 15 cm, in großen Hallen etwas gröber (höchstens rund 90 000 Zellen).
- `zelleBei()` – Zelle an der Stelle (−1 außerhalb des Rasters).
- `zellMitte()`
- `freieZelleNahe()` – Nächste freie Zelle bis `weit` cm um die Stelle (−1: keine).
- `suche()` – Kürzester Weg (A*) von Zelle zu Zelle; null, wenn es keinen gibt oder er länger als `grenze` (cm) wäre.
- `abkuerzen()` – Abkürzen: von jedem Punkt so weit voraus, wie die gerade Strecke frei ist (erster und letzter Punkt bleiben).
- `runden()` – Ecken runden (Bogen bis 1,5 m vor und nach der Ecke, geprüft; wo er anstößt, enger oder gar nicht) und den Weg dicht abtasten, sodass zwei Punkte h …
- `wegZwischen()` – Freier, geglätteter Weg von Stelle zu Stelle (beide frei, im selben Bereich), sonst null.
- Typen: `Stelle`, `Raster`, `Hinderniskarte`

### hallenplan-3d.ts (523 Z.)
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
- `WAND_DURCHSICHTIG` – Kleinste Deckkraft ausgeblendeter Wände (ganz weg wirkt die Halle ohne Rand).
- `wandDeckkraft()` – Deckkraft einer Wand (0–1) aus Kamera und Blickziel (cm, Szene-Koordinaten): Steht die Kamera außerhalb der Halle hinter der Wand (die Wand steht z …
- `WandInnenseite` (Typ) – Innenseite eines Wandstücks (cm, Szene): Seite, Strecke entlang der Wand, Unterkante und Höhe, Wand (Index in `waende`).
- `wandInnenseiten()` – Innenseiten der Wandstücke (ohne Ecken): voll hohe Stücke und die Stürze über den Türen.
- `schuerzenFuer()` – Verkleidung der Sockel: Sockel mit derselben Front, die quer zur Reihe gleich liegen und aneinanderstoßen, bilden ein Stück Reihe.
- Typen: `Verkleidung`, `Figur`, `SzeneKaefig`, `SzeneVoliere`, `SzeneTuer`, `SzeneFlaeche`, `SzeneBeschriftung`, `HallenSzene`

### hallenplan-aussehen.ts (115 Z.)
Tests: `hallenplan-aussehen.test.ts`

- `HALLEN_BOEDEN` – Aussehen der Halle in der 3D-Ansicht (Entscheidung 028): Boden und Folie, Prallwand, Wand- und Firsthöhe, Fenster, Decke, Spielfeldlinien und Geräte.
- `AUSSEHEN_STANDARD` – Vorgabe: Daten und Plan wie bis 1.19 (Holz-Prallwand bis 2 m, 3,50 m hoch, flach, oben Fenster statt des früheren Lichtbands); die Darstellung ist …
- `WAND_HOEHE_MIN` – Grenzen (cm): Die Wand reicht über die Türen (2,50 m), die Prallwand bleibt mindestens 30 cm unter der Decke.
- `WAND_HOEHE_MAX`
- `PRALLWAND_HOEHE_MAX`
- `FIRST_HOEHE_MAX`
- `DECKE_VORSCHLAG` – Vorschlag beim Einschalten der Decke, solange Wand und First nie eingestellt waren: übliche Sporthalle.
- `PRALLWAND_VORGABEN` – Farben der Prallwand zur Auswahl (wie in Sporthallen üblich); daneben jede Farbe frei.
- `istPrallwandFarbe()` – Holz oder eine Farbe #rrggbb.
- `aussehenVon()` – Aussehen mit allen Vorgaben, Werte begrenzt (ungültige Angaben gelten als nicht gesetzt).
- `aussehenBereinigt()` – Zum Speichern: nur, was von der Vorgabe abweicht (der First nur, wenn er höher ist als die Wand); ohne Abweichung nichts (die Halle bleibt wie ohne …
- `deckeSchalten()` – Decke ein- oder ausschalten; beim Einschalten ohne je eingestellte Wand- und Firsthöhe mit `DECKE_VORSCHLAG`.
- `wandHoeheSetzen()` – Wandhöhe ändern: War ein First über der Wand gesetzt, zieht er mit (die Dachhöhe First − Wand bleibt, höchstens bis `FIRST_HOEHE_MAX`); sonst bleib …
- `wirksamerFirst()` – Firsthöhe, die in 3D gilt: das Satteldach nur mit Decke und rechteckigem Grundriss, sonst flach in Wandhöhe.
- Typen: `HallenBoden`, `HallenAussehen`, `VollesAussehen`

### hallenplan-bereinigen.ts (22 Z.)
Halle so bereinigt, wie der Server sie ablegt (`HALLE_EINGABE`): Türart nur an Eingängen und abweichend von der Vorgabe, Aussehen und Nummernfolge …

- `nummerFolgeBereinigt()` – Nummernfolge: nur gesetzte Werte (falsch zählt als nicht gesetzt); ohne Einstellung nichts.
- `halleBereinigt()`

### hallenplan-druck.ts (102 Z.)
Hallenplan drucken und zeichnen: gemeinsame Regeln für Bildschirm und PDF – Farben der Preisrichter in der Folge des Plans, Lage der Zeichnung (lan …
Tests: `hallenplan-druck.test.ts`

- `RICHTER_FARBE` – Preisrichter: geprüfte Kategorien-Palette in fester Reihenfolge (siehe `richterFolge`) – Nachbarn in der Halle bekommen Nachbarfarben.
- `richterFarbe()`
- `richterSchraffur()` – Schraffiert, damit einzelne Paare (Rot/Orange, Grün/Orange) auch bei Farbschwäche und im Schwarzweiß-Druck zu unterscheiden sind.
- `richterFolge()` – Preisrichter in der Folge ihres ersten Käfigs im Plan (Reihen mit ihren Käfigen, dann Volieren, dann eingesetzte Teile; ohne Käfig nach Namen).
- `zeichnungDerHalle()` – Zeichnung der Halle: die lange Seite waagrecht (ist die Halle länger als breit, liegt sie quer).
- `druckMassstab()` – Blatt für den Plan: Querformat, wenn die Zeichnung breiter als hoch ist, sonst Hochformat; der Maßstab (Punkte je cm) so groß, dass die Zeichnung s …
- `Schild` (Typ) – Lage einer Reihenbezeichnung „R…“ am Rand der Zeichnung: über der oberen Wand (Reihe senkrecht) oder links davor.
- `reihenSchilder()` – Wo die Reihenbezeichnungen stehen – im Plan wie im Druck.

### hallenplan-entfernen.ts (226 Z.)
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

### hallenplan-fest.ts (248 Z.)
Hallenplan – fester Plan: was beim Festschreiben gilt (`festGeometrie`), Festschreiben des gerechneten Plans, Belegung eines Käfigblocks und die Re …

- `blockBelegung()` – Belegung eines Käfigblocks je Platz (Tier-Id, null = frei), ohne freie Plätze am Ende.
- `festGeometrie()` – Was beim Festschreiben gilt: Hallenmaße, Reihen und Käfigmaße (nicht Flächen oder eingesetzte Teile).
- `festschreiben()` – Den gerechneten Plan festschreiben (aus `planeHalle` ohne festen Plan).
- `planeFest()` – Fester Plan: die Plätze bleiben, wo sie sind.

### hallenplan-folge.ts (219 Z.)
Reihenfolge der Käfige, wie sie im Plan stehen – Grundlage für „Nach Plan nummerieren“ nach dem Umstellen.
Tests: `hallenplan-folge.test.ts`

- `PlanPlatz` (Typ) – Ein Platz im Plan in der Folge des Plans: belegt (tierId) oder frei; Reihenplätze mit ihrer Lage im Reihensystem.
- `planPlaetze()` – Alle Plätze in Reihen und Käfigblöcken (belegt und frei) in der Folge des Plans: Reihe für Reihe (quer zu den Reihen aufsteigend), in jeder Reihe v …
- `planFolge()` – Tier-Ids in der Reihenfolge des Plans (nur Tiere mit Platz).
- `planUnordnung()` – Wie unordentlich der (feste) Plan nach dem Umstellen ist: freie Plätze mitten zwischen belegten derselben Käfiggröße (dahinter steht noch ein Tier …
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

### hallenplan-intern.ts (66 Z.)
Hallenplan – interne Hilfen für die Rechnung (nicht über `hallenplan.ts` veröffentlicht): Ersatzmaß der Voliere, Platzhalter-Rechteck, Stücke einge …

- `VOLIERE_ERSATZ` – Voliere ohne eingetragenes Maß: 2 × 1 m.
- `LEER` – Platzhalter im Reihensystem; die Lage in der Halle setzt `planeHalle`.
- `teilStuecke()` – Stücke eingesetzter Teile (siehe `HallenFlaeche.teil`), die ganz im Streifen einer Reihe stehen – je Reihe, entlang der Reihe sortiert.
- `teilStueckeFest()` – Im festen Plan: Stücke je Reihe, auf die keine angebaute Platte darf – jedes eingesetzte Teil, das in den Streifen der Reihe ragt (Volieren samt Ga …
- `hinterStuecken()` – Erste Stelle ab `y`, an der `laenge` frei von den Stücken ist (sortiert, siehe `teilStuecke`).
- `abziehen()`
- `m()`
- Typen: `Abschnitt`

### hallenplan-moebel.ts (72 Z.)
Hallenplan – Tisch, Bank, Garnitur und Pokaltisch: Arten, Namen, Standardmaße und Höhen, Maße mit Vorgaben, die Körper einer Garnitur (Bank, Tisch, …
Tests: `hallenplan-moebel.test.ts`

- `MoebelArt` (Typ) – Tisch, Bank, Garnitur (Biertisch mit zwei Bänken) und Pokaltisch (Ehrenpreise): eingesetzte Teile ohne Käfigplatz.
- `MOEBEL_ARTEN`
- `MOEBEL_NAME`
- `TISCH_STANDARD` – Biertisch 220 × 50 cm, Bierbank 220 × 25 cm; in der Garnitur je eine Bank an jeder langen Seite, 15 cm vom Tisch.
- `BANK_STANDARD`
- `GARNITUR_ABSTAND`
- `POKALTISCH_STANDARD` – Pokaltisch: ein breiterer Tisch für die Ehrenpreise, 200 × 80 cm.
- `TISCH_HOEHE` – Höhen (cm) für die 3D-Ansicht.
- `BANK_HOEHE`
- `istMoebel()`
- `moebelMass()` – Maße eines Möbelstücks mit Vorgaben: Länge, Tiefe (Tisch bzw. Bank) und bei der Garnitur die Tiefe der Bänke.
- `moebelStuecke()` – Tisch, Bank, Garnitur oder Pokaltisch in der Lage `q` (Hallenkoordinaten): die Körper darin – eine Garnitur als Bank, Tisch, Bank quer zur Länge.
- `POKAL_SKALA` – Pokal in 3D: Breite und Tiefe je cm Höhe (`POKAL_SKALA`, Körper 0,8, Henkel außen bei ±0,55) und die Hülle mit Henkeln (`POKAL_BREITE` × Höhe), in …
- `POKAL_BREITE`
- `pokalStellen()` – Pokale auf einem Pokaltisch in der Lage `q`: eine Reihe mittig längs der langen Seite, je etwa 50 cm einer (zwei bis sechs), mit Mittelpunkt (x, y …

### hallenplan-neu.ts (93 Z.)
Plan neu setzen: Die Software stellt alle Käfige neu – nach den Einstellungen der Halle (Maße, Gänge, Richtung, Wandreihen, Grundplatten) und ihren …
Tests: `hallenplan-neu.test.ts`

- `belegtImPlan()` – Was im Plan Platz einnimmt: Grundplatten (mit Käfigart), eingesetzte Teile, Flächen außer Volierenbereichen, der Gang vor Eingängen und Notausgänge …
- `halleZumNeuSetzen()` – Halle ohne alles, was zur bisherigen Aufstellung gehört (siehe oben); `reihenVersatz` bleibt nur, wenn angegeben.
- `neuSetzen()` – Halle für einen neu gesetzten Plan: ohne die bisherige Aufstellung, mit Käfigblöcken (bzw. Volieren) für die Tiere, die nicht in die Reihen passen.
- `fehlendeImPlan()` – Stellen für die Tiere ohne Platz – dieselbe Suche für „Plan neu setzen“ und den Knopf „Alle fehlenden Käfige einsetzen“ (siehe `fehlendeEinsetzen`) …
- `vonHandGeplant()` – Steht im Plan etwas von Hand Geplantes, das beim Neu-Setzen wegfiele?

### hallenplan-rechtecke.ts (148 Z.)
Hallenplan – Rechnen mit Rechtecken und Blickrichtungen: Drehen, Front einer Reihe oder eines Blocks, Streifen und Gang vor den Käfigen, Etagenfeld …

- `dreheRechteck()` – Rechteck um den Punkt c in 90°-Schritten drehen (Hallenkoordinaten x/y).
- `dreheBlick()` – Richtung in 90°-Schritten drehen (wie `dreheRechteck`: 90° führt x in y über).
- `frontDerReihe()` – Front der Käfige einer Reihe in der Halle (Reihensystem: „rechts“ = zu größerem x; bei Reihen quer ist das Hallen-y).
- `streifenVor()` – Streifen der Breite `tief` vor der Seite `blick` eines Rechtecks.
- `gangVorKaefigen()` – Der Gang vor den Käfigen jeder Grundplatte (Gangbreite der Halle, in Richtung der Front) – dort steht kein Tisch und keine Bank.
- `etagenStreifen()` – Feld eines Käfigs im Plan, wenn Käfige übereinander stehen: die Grundfläche quer zur Front in so viele Streifen geteilt, wie es Etagen gibt – die u …
- `blickTausch()` – Richtung im gedrehten Koordinatensystem (x und y vertauscht: Reihensystem bei Reihen quer, Zeichnung der Halle quer).
- `kaefigKanten()` – Kanten eines Käfigs, einer Grundplatte oder eines Blocks mit Front `front`: die dichte Rückwand gegenüber der Front, die beiden dichten Seitenwände …
- `blockFront()` – Front eines eingesetzten Käfigblocks ohne eigene Angabe: zur langen Seite (ungedreht zu größerem y, gedreht zu größerem x).
- `objektFront()` – Front eines Käfigblocks: seine Angabe `front`, wenn sie zu einer langen Seite zeigt (ungedreht z±, gedreht x±), sonst wie `blockFront`.
- `mitteVon()` – Mitte des umschließenden Rechtecks.
- `ueberlappt()` – Überschneiden sich zwei Rechtecke?
- `eingangsGang()` – Gang vor einem Eingang oder Notausgang (samt dem Ausgang selbst): in Fluchtrichtung, so breit wie der Ausgang und einen Gang tief – seitlich danebe …
- `blockPlatz()` – Lage eines Platzes in einem eingesetzten Käfigblock: die Plätze liegen entlang der langen Seite, je Spalte die Etagen übereinander (gezählt unten z …

### hallenplan-reihen.ts (340 Z.)
Hallenplan – Stellen im Reihensystem: Reihen und ihre Abschnitte, Grundplatten und Käfige streng in Katalogfolge, Volieren im Volierenbereich, Plat …

- `planeAusgeglichen()` – Automatische Aufstellung mit ruhigem Bild (Rückmeldung 14.11.2026): Die Tiere stehen streng in Katalogfolge Reihe für Reihe, lückenlos – auch über …
- `planeImReihensystem()` – Stellen im Reihensystem.

### hallenplan-rueckwand.ts (77 Z.)
Käfige ausrichten, wenn sie gestellt werden (Verschieben, Pfeiltasten, Einsetzen, Drehen) – Rückwand an die Wand und Rückwand an Rückwand (Wunsch d …
Tests: `hallenplan-rueckwand.test.ts`

- `ruhendeNachbarn()` – Ruhende Nachbarn, die nie selbst drehen: die Volieren im Volierenbereich.
- `ausrichtungBeimStellen()` – Was beim Stellen zu drehen ist, je um 180° an Ort und Stelle: `wand` – Front zu einer Wand, `ruecken` – Front an einem anliegenden Teil (oder mit s …

### hallenplan-tueren.ts (84 Z.)
Türen in den Eingängen (3D, Entscheidung 028): Art der Tür je Eingang oder Ausgang – bündig wie die Wand, Glastür, Holztür oder offen (nur die Öffn …
Tests: `hallenplan-tueren.test.ts`

- `TUER_ARTEN`
- `TUER_VORGABE` – Vorgabe ohne Angabe: Tür bündig in der Wand (wie in Sporthallen üblich, Rückmeldung 22.11.2026).
- `ZWEIFLUEGELIG_AB` – Breiter als das (cm entlang der Wand): zweiflügelige Tür.
- `GRIFF_HOEHE` – Höhe des Drückers bzw. der Panikstange über dem Boden (cm).
- `istTuerArt()`
- `tuerArtVon()` – Türart eines Eingangs: die gültige Angabe, sonst die Vorgabe.
- `tuerFluegel()` – Flügel einer Tür aus ihrer Breite entlang der Wand (cm).
- `flaecheBereinigt()` – Zum Speichern: die Türart nur an Eingängen, nur gültig und nur, wenn sie von der Vorgabe abweicht – sonst fällt das Feld weg (die Halle bleibt wie …
- `TuerBlatt` (Typ) – Ein Türblatt: Strecke entlang der Wand (cm, ab der Mitte der Öffnung) und wo der Griff sitzt.
- `TuerAufbau` (Typ) – Aufbau einer geschlossenen Tür in ihrer Öffnung (cm): Zarge an den Seiten und oben, Blätter, Griffe, Panikstange.
- `GLAS_PROFIL` – Glastür: Rahmenprofil an den Seiten und oben, unten der höhere Sockel (cm).
- `GLAS_SOCKEL`
- `PANIK_RAND` – Panikstange: so weit bleibt sie von den Kanten des Blatts (cm).
- `TUER_MIN_BREITE` – Schmaler (cm entlang der Wand) ist es keine Tür: Die Öffnung bleibt offen (Server erlaubt Flächen ab 10 cm).
- `tuerAufbau()` – Tür in einer Öffnung `breite` × `hoehe` (cm): ab `ZWEIFLUEGELIG_AB` (oder wie `fluegel` sagt) zwei gleiche Flügel mit den Griffen zur Mitte, sonst …
- Typen: `TuerArt`

### hallenplan-typen.ts (360 Z.)
Hallenplan – Datentypen: Halle mit Flächen und eingesetzten Teilen, Rechteck und Blickrichtung, gerechneter Plan (Reihen, Platten, Käfige, freie Pl …

- `NummerFolge` (Typ) – Einstellung „Nach Plan nummerieren“ (Rückmeldung 22.11.2026).
- `nummerFolgeAktiv()` – Ist eine Einstellung gesetzt, die von der gewohnten Folge abweicht?
- `EntfernterPlatz` (Typ) – Entfernte leere Grundplatte (Lage der Platte) bzw. entfernter freier Platz im festen Plan.
- `Blick` (Typ) – Richtung, in die eine Käfigfront zeigt (Hallenkoordinaten: x+ zu größerem x, z+ zu größerem y).
- `Strecke` (Typ) – Strecke von (x1, y1) nach (x2, y2) in Hallenkoordinaten.
- `Grundplatte` (Typ) – Grundplatte eines Käfigblocks: Länge entlang der Reihe, Tiefe quer dazu.
- `PlanTier` (Typ) – Ein Tier in Katalogfolge, wie es in einen Käfig kommt.
- `Rechteck` (Typ) – Rechteck in Hallenkoordinaten (x entlang der Breite, y entlang der Länge) – zum Zeichnen.
- `FesterPlan` (Typ) – Festgeschriebener Plan: die Lage jedes Käfigs im Reihensystem (ohne Versatz und Drehung, die bleiben einstellbar).
- Typen: `HallenFlaeche`, `Halle`, `Drehung`, `HallenObjekt`, `Hauptgang`, `PlanKaefig`, `Reihe`, `FreierPlatz`, `PlanPlatte`, `PlanObjekt`, `Hallenplan`

### hallenplan-umriss-pruefen.ts (67 Z.)
Prüfung einer Halle mit freiem Grundriss vor dem Speichern (Entscheidung 019): Grundriss gültig, Breite und Länge passen dazu, keine Fläche und kei …
Tests: `hallenplan-umriss-pruefen.test.ts`

- `pruefeHallenUmriss()` – Mit `vorher` (gespeicherte Halle) nur, was durch diese Änderung neu hinausragt: ein Teil, das schon vorher draußen stand (etwa nach einer größeren …
- `grundrissUebernehmen()` – Einen bearbeiteten Grundriss in die Halle übernehmen: einheitlich schreiben (`umrissNormal`), Breite und Länge danach.

### hallenplan-umriss.ts (295 Z.)
Freier Grundriss der Halle (Entscheidung 019): ein rechtwinkliges Vieleck in Hallenkoordinaten (cm, x nach rechts entlang der Breite, y nach unten …
Tests: `hallenplan-umriss.test.ts`

- `WandAussen` (Typ) – Seite, nach der eine Wand außen zeigt (wie man auf den Plan schaut).
- `UMRISS_MIN` – Mindestmaß des Grundrisses (cm), wie bei der rechteckigen Halle.
- `rechteckUmriss()`
- `umrissVon()` – Umriss einer Halle: der gezeichnete oder das Rechteck aus Breite und Länge.
- `umlaufsinn()` – Umlaufsinn: 1 im Uhrzeigersinn auf dem Plan, −1 dagegen (eine über die Gegenwand gezogene Wand kehrt ihn um).
- `WAND_MIN` – Kürzeste erlaubte Wand (cm): sonst entstünden Hallenarme, in denen nichts stehen kann.
- `umrissFlaeche()`
- `umrissMasse()`
- `umrissNormal()` – Einheitliche Form: links oben bei 0/0, im Uhrzeigersinn, ohne doppelte Ecken und ohne Ecken mitten auf einer geraden Wand, Beginn an der obersten, …
- `pruefeUmriss()` – Ist der Grundriss gültig?
- `punktInUmriss()` – Liegt der Punkt in der Halle?
- `umrissSperren()` – Was im umschließenden Rechteck außerhalb der Halle liegt, als möglichst wenige Rechtecke (Zeilen zusammengefasst, dann gleich breite Stücke unterei …
- `umrissKanten()` – Wände des Grundrisses mit ihrer Außenseite (für Zeichnung, 3D und Türen).
- `wandZiehen()` – Wand `i` (von Ecke i zu Ecke i+1) senkrecht verschieben: positiv nach innen, negativ nach außen.
- `istRechteckUmriss()` – Ist der Grundriss ein einfaches Rechteck (oder keiner)?
- `AUSSEN_NAME` – Name der Sperrflächen außerhalb des Grundrisses (in Meldungen beim Verschieben).
- `mitUmrissSperren()` – Halle für die Planung: dazu die Sperrflächen außerhalb des Grundrisses (markiert mit `aussen`, nie gespeichert).
- `wandTeilen()` – Wand `i` an der Stelle `bei` teilen (x bei waagrechter, y bei senkrechter Wand); ein Teilstück lässt sich dann ziehen.
- `umrissVersetzt()` – Umriss um `d` nach außen versetzt (Außenkante der Wand bei Wanddicke `d`).
- `tuerOeffnung()` – Öffnung in der Wand für einen Eingang `f` (Rechteck in der Halle, an einer Wand anliegend, `spiel` cm Toleranz): das Stück der Wand vor dem Eingang …
- `eingangAnWand()` – Eingang an die Wand, die `mitte` am nächsten liegt: `laenge` cm entlang der Wand (ab `von`, sonst mittig um `mitte`), `tiefe` cm in die Halle hinei …
- Typen: `Punkt`, `UmrissKante`

### hallenplan-versetzen.ts (172 Z.)
Tiere im festen Hallenplan von Hand versetzen (Rückmeldung 15.11.2026: „ich will auch käfige frei zuordnen können im halleneditor und ggf tiere ver …
Tests: `hallenplan-versetzen.test.ts`

- `KaefigPlatz` (Typ) – Ein Käfigplatz: in einer Reihe (Lage im Reihensystem wie im festen Plan) oder in einem Käfigblock (Platz ab 0).
- `PlatzBelegung` (Typ) – Wer auf einem Platz sitzt (null = frei) und welche Größe er hat; null: diesen Platz gibt es im Plan nicht.
- `platzImPlan()` – Wo ein Tier im Plan steht (Reihe oder Käfigblock); null: ohne Platz, Voliere oder unbekannt.
- `belegungImPlan()` – Belegung eines Platzes, wie der Plan sie zeigt.
- `gleicherPlatz()` – Gleiche Plätze?
- `tierVersetzen()` – Tier `tierId` auf Platz `ziel` versetzen (`plan`: der Plan aus `fest`, wie er gerade gerechnet ist).
- `mitBelegung()` – Fester Plan mit der Belegung, wie der Plan sie zeigt: je Reihenplatz das Tier dort (ein nicht mehr gemeldetes Tier bleibt eingetragen – kommt es zu …
- Typen: `VersetzenErgebnis`

### hallenplan-vorgaben.ts (140 Z.)
Hallenplan – Vorgaben und Maße: Halle mit allen Vorgaben (`halleNormal`), Schlüssel für den Stand einer Halle, Größe eingesetzter Teile, Standards …

- `halleNormal()` – Halle mit allen Vorgaben ausgefüllt – ältere gespeicherte Hallen haben noch nicht jedes Feld.
- `stabilerText()` – Text mit sortierten Schlüsseln (leere Felder fallen weg) – gleiche Halle ergibt immer denselben Text.
- `halleSchluessel()` – Kurzer Schlüssel für den Stand einer Halle – zum Erkennen gleichzeitiger Änderungen.
- `VOLIEREN_GANG` – Freier Gang zwischen Volierenreihen (cm).
- `teilGroesse()` – Größe eines eingesetzten Teils, ungedreht (lange Seite in x): eine Voliere nach dem Volierenmaß, ein Käfigblock so groß wie die Grundplatte seiner …
- `HAUPTGANG_STANDARD`
- `GRUNDPLATTE_STANDARD`
- `HALLE_STANDARD`
- `PLATTE_LAENGE` – Länge, auf die eine Grundplatte ausgelegt ist (cm): rund 2 m.
- `kaefigeJePlatte()` – Wie viele Käfige einer Art auf einer Grundplatte stehen: eigene Angabe, sonst so viele, wie auf ihr eigenes Plattenmaß passen, sonst so viele, wie …
- `platteFuer()` – Grundplatte einer Käfigart (Länge entlang der Reihe, Tiefe quer dazu) und wie viele Käfige darauf stehen.
- `ETAGEN_MAX` – Höchstens so viele Etagen übereinander.
- `etagenVon()` – Etagen einer Käfigart: eigene Angabe (1 bis 4), sonst eine.
- `plaetzeJePlatte()` – Plätze auf einer Grundplatte: Käfige nebeneinander × Etagen.
- `etagenNormal()` – Nur Angaben über einer Etage; leer = nicht da.
- `etageFeld()` – Etage nur, wenn nicht unten (so bleiben Pläne ohne Etagen wie bisher).
- `gleicheEtage()` – Gleiche Etage (fehlt = unten).

### hallenplan-wand.ts (66 Z.)
Einzelreihe an einer Wand: Zieht die Ausstellungsleitung eine Reihe an eine der beiden Wände, an denen die Reihen entlanglaufen, stellt die Softwar …
Tests: `hallenplan-wand.test.ts`

- `wandSeiteVon()` – Steht ein Rechteck (Hallenkoordinaten) an einer der Wände, an denen Einzelreihen stehen können?
- `mitWandreihe()` – Halle mit Einzelreihe an `seite` (eine schon vorhandene an der anderen Wand bleibt).
- `reihenVersatzNachUmbau()` – Versatz der von Hand verschobenen Reihen nach dem Umbau (neue Einzelreihe, andere Abstände): jede bleibt, wo sie steht.
- Typen: `WandSeite`

### hallenplan-wandfront.ts (153 Z.)
Käfige an den Wänden mit der Rückwand an die Wand (Rückmeldung 14.11.2026): Ein Käfig hat vorn die offene Gitterfront, Rück- und Seitenwände sind d …
Tests: `hallenplan-wandfront.test.ts`

- `WAND_FANG` – So nah (cm) an einer Wand gilt ein Teil als an der Wand.
- `WandKandidat` (Typ) – Ein Teil, das an einer Wand stehen könnte: wie es gezeichnet ist (Lage, Front).
- `WandDrehung` (Typ) – Eine nötige Drehung: um 180° an Ort und Stelle, danach Front `front`.
- `wandRichtung()` – Wand, an der die lange Seite eines Teils liegt (bündig oder bis `fang`), als Richtung von dort in die Halle (= Front, die es haben soll); null, wen …
- `UEBERLAPP_MIN` – So viel (cm) müssen sich zwei Seiten mindestens überlappen, damit sie aneinander stehen (kürzere Seiten: ganz).
- `gegen()` – Richtung umkehren.
- `liegtAn()` – Liegt n an der Seite `blick` von q an?
- `innenWaende()` – Innenwände eines freien Grundrisses (Entscheidung 019) als Rechtecke außerhalb; beim Rechteck keine.
- `wandSoll()` – Wie `wandRichtung`, dazu die Innenwände eines freien Grundrisses: Liegt eine lange Seite an einer davon, zeigt die Front von dort weg.
- `gegenueber()` – Zeigen a und b in entgegengesetzte Richtungen?
- `wandAusrichtung()` – Was zu drehen ist: Teile an einer Wand (auch einer Innenwand des Grundrisses), deren Front zur Wand zeigt.
- `kandidatGewaehlt()` – Gehört das Teil zu `nur` (eine Reihe steht für alle ihre Platten)?
- `wandKandidaten()` – Kandidaten aus einem gerechneten Plan (Lage samt Versatz und Drehung): alle Grundplatten, Käfigblöcke und eingesetzten Volieren.
- `wandDrehungenAnwenden()` – Drehungen in die Halle übernehmen: Grundplatten über ihre Drehung (um die eigene Mitte), Teile über ihre Front.

### hallenplan.ts (332 Z.)
Hallenplan: Wie stehen die Käfige in der Halle?

- `planeHalle()` – Plan der Halle.
- `frontFehler()` – Käfigfronten, die nicht zu einem Gang zeigen: Die Front (Gitter) eines Käfigs ist offen, Rück- und Seitenwände sind dicht – vor jeder Front muss ei …

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

### index.ts (70 Z.)
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

### katalog-typografie.ts (86 Z.)
Typografie des gedruckten Katalogs (Entscheidung 032): genau eine Schriftfamilie je Katalog – die gewählte – für Titel, Köpfe, Fließtext, Tabellen …
Tests: `katalog-typografie.test.ts`

- `KatalogSchnitt` (Typ) – Die drei Schnitte, mit denen der Katalog auszeichnet.
- `FamilienDateien` (Typ) – Schriftdateien einer Familie (apps/server/fonts).
- `KATALOG_FAMILIEN` – Die Familien, alle unter der SIL Open Font License.
- `KATALOG_SCHRIFT_FAMILIE` – Familie je Schriftwahl.
- `schnittDatei()` – Datei eines Schnitts; fehlt er der Familie, die Regular derselben Familie (nie eine fremde Schrift).
- `katalogSchriftsatz()` – Schriftsatz einer Wahl: Dateien der drei Schnitte, der Auszeichnung (oder null) und die Namen im PDF.
- `KATALOG_GROESSEN_STUFEN` – Größenstufen von groß nach klein.
- `KATALOG_GROESSEN` – Schriftgrößen in pt für das A5-Heft; A4 multipliziert alle mit demselben Faktor (katalogGroessen).
- `katalogGroessen()` – Die Größenstufen für ein Format (`faktor` 1 = A5-Heft).
- `KATALOG_ZIFFERN` – OpenType-Merkmal für Katalognummern, Noten und Preise: gleich breite Ziffern, damit Spalten fluchten.
- Typen: `KatalogFamilie`, `KatalogGroessenStufe`

### katalog.ts (335 Z.)

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
- `istJugendBlock()` – Steht das Tier im eigenen Jugendblock (Einstellung „Jugend im Katalog: eigener Block am Ende“)?
- `JUGEND_KUERZEL` – Kürzel für ein Jugendtier an der Tierzeile des gedruckten Katalogs (Online-Ansichten: Text der Sprache).
- `jugendKennzeichen()` – Bekommt das Tier das Kennzeichen „Jgd.“?
- `vergleicheFolge()`
- `vergebeKatalognummern()` – Vergibt alle Katalognummern neu, lückenlos ab `start`.
- `nachmeldungsNummer()` – Nummer für eine Nachmeldung, ohne bestehende Nummern zu ändern: Sie bekommt die Nummer ihres Vorgängers in der Ausstellungsfolge plus Unternummer ( …
- `nachmeldungsNummern()` – Nummern für mehrere Nachmeldungen eines Laufs.
- `formatKatalognummer()`
- `ringjahrPasst()` – Plausibilität des Ringjahrs: Ein Jungtier trägt einen Ring des laufenden Jahrgangs.
- Typen: `Katalognummer`, `SortierKriterium`, `SortierSchritt`, `KatalogSortierung`, `FolgeOptionen`, `Nachmeldungsnummer`

### kommende-schauen.ts (391 Z.)
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

### kontoauszug.ts (291 Z.)
Kontoauszug-Import (Entscheidung 023): Der Kassierer lädt den Auszug aus dem Onlinebanking hoch (camt.053 oder Bank-CSV); SchauFUCHS liest die Guts …
Tests: `kontoauszug.test.ts`

- `Buchung` (Typ) – Eine Gutschrift auf dem Vereinskonto.
- `dekodiere()` – Bytes der Datei als Text: UTF-8, sonst Windows-1252 (ältere CSV-Exporte deutscher Banken).
- `leseKontoauszug()` – Liest camt.053 oder Bank-CSV; nur Gutschriften in Euro.
- `buchungsSchluessel()` – Schlüssel je Gutschrift, aus dem der Server den Fingerabdruck gegen Doppelbuchung bildet.
- `OffeneMeldung` (Typ) – ── Zuordnung ───────────────────────────────────────────────────────────
- `ordneZu()` – Ordnet Gutschriften Meldungen zu.
- Typen: `Zuordnung`

### lastschrift.ts (228 Z.)
SEPA-Lastschrift für das Standgeld (Entscheidung 018): Gläubiger-Identifikationsnummer, Mandate der Aussteller und die Datei für die Bank (pain.008 …
Tests: `lastschrift.test.ts`

- `normalisiereGlaeubigerId()` – Gläubiger-ID einheitlich geschrieben (ohne Leerzeichen, groß).
- `pruefeGlaeubigerId()` – Gläubiger-Identifikationsnummer prüfen (Deutsche Bundesbank): Ländercode, zwei Prüfziffern, drei Zeichen Geschäftsbereich (frei wählbar, zählt bei …
- `pruefeMandatsreferenz()` – Mandatsreferenz: 1 bis 35 Zeichen aus dem SEPA-Zeichensatz, ohne Leerzeichen (eindeutig je Verein).
- `MANDAT_VERFALL_MONATE` – Ein Mandat verfällt nach so vielen Monaten ohne Lastschrift (SEPA-Regelwerk).
- `MANDAT_NACHWEIS_MONATE` – So lange nach Widerruf bzw. Verfall bleibt das Mandat als Nachweis (Widerspruchsfrist des Zahlers: 13 Monate).
- `mandatGueltig()` – Darf mit dem Mandat zum Stichtag eingezogen werden?
- `mandatLoeschbar()` – Darf das Mandat zum Stichtag gelöscht werden?
- `bankarbeitstag()` – Bankarbeitstag im SEPA-Zahlungsverkehr (TARGET2): kein Wochenende, nicht 1.1., Karfreitag, Ostermontag, 1.5., 25./26.12.
- `fruehesteFaelligkeit()` – Frühestes Fälligkeitsdatum ab heute: der zweite Bankarbeitstag nach heute.
- `VORABANKUENDIGUNG_TAGE` – Vorlauf der Vorabankündigung, wenn mit dem Zahler nichts anderes vereinbart ist (SEPA-Regelwerk).
- `vorgeschlageneFaelligkeit()` – Vorschlag für die Fälligkeit: 14 Tage nach heute (Vorabankündigung), dann der nächste Bankarbeitstag.
- `erzeugeSepaLastschrift()` – Erzeugt die XML-Datei für eine Sammellastschrift (pain.008.001.08, CORE).
- Typen: `MandatStand`, `LastschriftPosten`, `LastschriftAuftrag`

### lesemodus.ts (5 Z.)
Tests: `lesemodus.test.ts`

- `NUR_LESEN_MELDUNG` – Lesemodus (Entscheidung 025): Mit NUR_LESEN=1 nimmt der Server keine Änderungen an.

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

### meldebogen.ts (78 Z.)
A-Bogen (Meldebogen): das Formular, das der Aussteller ausfüllt und unterschreibt – Anschrift, Registriernummer, Tiere in der Reihenfolge des Melde …
Tests: `meldebogen.test.ts`

- `MELDEART_KUERZEL` – Kürzel der Meldeart in der schmalen Spalte „Art“ (Erklärung steht unter der Tabelle).
- `ALTER_KUERZEL`
- `A_BOGEN_LEERZEILEN` – Leerer A-Bogen: so viele Schreibzeilen, dass Tabelle und Unterschrift auf zwei Seiten passen.
- `A_BOGEN_NACHTRAG` – Vorausgefüllter A-Bogen: nach den gemeldeten Tieren noch Platz für Nachträge.
- `aBogenZeilen()` – Zeilen der Tiertabelle: gemeldete Tiere in der gemeldeten Reihenfolge (fortlaufend nummeriert), dann leere Schreibzeilen – leerer Bogen `A_BOGEN_LE …
- `geburtsdatumFuerABogen()` – A-Bogen für ein Vereinsmitglied ohne Meldung (Vereinsverwaltung): das gespeicherte Geburtsdatum nur, wenn es zählt – bei Jugendlichen am Stichtag ( …
- Typen: `ABogenTier`, `ABogenZeile`

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

### preise.ts (134 Z.)

- `passtZuPreisart()` – Passt das Tier zur Bindung der Preisart (Zielgruppe, Sparte)?
- `PR_GEWICHT` – Gewicht einer Meldung bei der Höchstzahl je Preisrichter (PV-Hinweise): Stamm 2, Voliere 3, Bruteier 3.
- `gewichteteTierzahl()` – Gewichtete Tierzahl eines Preisrichters aus den Meldearten seiner Tiere.
- `bindungText()` – Kurzer Text zur Bindung für Katalog und Oberfläche („nur Jugend“, „Sparte Tauben“), leer ohne Bindung.
- `kontingent()` – Wie viele Preise dieser Art bei `tiere` ausgestellten Tieren vergeben werden dürfen.
- `hatKontingent()` – Hat die Preisart ein Kontingent (je Preisrichter oder für die ganze Schau)?
- `zaehltZumKontingent()` – Zählt ein vergebener Preis zum Kontingent?
- `stiftungUngedeckt()` – Sind die vergebenen Preise einer gestifteten Preisart gedeckt?
- `pruefeVergabe()` – Prüft eine Preisvergabe.
- `pruefeNotenaenderung()` – Prüft, ob eine Bewertung geändert oder zurückgesetzt werden darf, obwohl das Tier schon Preise hat.
- `stiftungsanteil()` – Anteil des nächsten gestifteten Preises: der noch nicht vergebene Rest der Stiftung, geteilt durch die freien Plätze (aufgerundet; der letzte Platz …
- Typen: `Preisart`, `VergabePruefung`

### preisrichter-druck.ts (132 Z.)
Drucke für Preisrichter: Text und Gruppen zum Ankreuzen in der Preisrichterverpflichtung und die Gliederung der Bewertungsliste (Zwischenköpfe je R …
Tests: `preisrichter-druck.test.ts`

- `VERPFLICHTUNG_MUSTER` – Muster für einen eigenen Text der Verpflichtung (Briefvorlage, „Muster einsetzen“).
- `verpflichtungBrief()` – Betreff und Text der Preisrichterverpflichtung: eigener Text der Briefvorlage mit Platzhaltern, sonst (leer) der feste Text, der Ort, Bewertungstag …
- `rueckmeldungFehler()` – „Rückmeldung der Preisrichter bis“ (JJJJ-MM-TT) darf nicht nach dem Bewertungstag liegen; null = in Ordnung.
- `GRUPPEN_VORGABE` – Gruppen zum Ankreuzen, wenn im Verzeichnis keine gepflegt sind: A bis M, Z1 bis Z3.
- `verpflichtungGruppen()` – Gruppen zum Ankreuzen: die im Verzeichnis der Schau vorkommenden (einheitlich, ohne Doppelte, A … Z1 … Z10), sonst die Vorgabe.
- `ListenZeile` (Typ) – Eine Zeile der Bewertungsliste: Zwischenkopf (Rasse, Farbenschlag; `fortsetzung` oben in einer neuen Spalte) oder ein Tier.
- `OHNE_FARBENSCHLAG` – Text des Zwischenkopfs für ein Tier ohne Farbenschlag nach einem Farbenschlag derselben Rasse.
- `bewertungslisteZeilen()` – Zwischenköpfe in die Tierfolge (Katalogfolge) einsetzen: ein Kopf, wo die Rasse wechselt, darunter einer, wo der Farbenschlag wechselt.
- `bewertungslisteSpalten()` – Zeilen auf Spalten verteilen (zwei je Seite, laufend: links, rechts, nächste Seite links …).

### preisrichter-zulassung.ts (47 Z.)
Zulassung der Preisrichter: welche Tiere ein Preisrichter bewerten darf (Sparten und BDRG-Gruppen), Zuordnung zu einem Obmann und Stand der Zusage.
Tests: `preisrichter-zulassung.test.ts`

- `ZUSAGEN` – Stand der Zusage eines Preisrichters für die Schau.
- `bdrgGruppe()` – Gruppe einheitlich: ohne Leerzeichen, groß geschrieben („ z 1“ → „Z1“).
- `bdrgGruppeGueltig()` – Gültige Gruppe: kurzer Text aus Buchstaben und Ziffern (A–M, Z1–Z3, BV o. ä.), höchstens 10 Zeichen.
- `bewertetSparte()` – Bewertet dieser Preisrichter diese Sparte?
- `bewertetGruppe()` – Bewertet dieser Preisrichter diese Gruppe?
- `darfBewerten()` – Darf der Preisrichter dieses Tier bewerten?
- `pruefeObmann()` – Obmann für einen Preisrichter: leer oder ein Obmann derselben Schau, nicht er selbst.
- Typen: `Zusage`

### preisverteilung.ts (90 Z.)
Preisverteilung eines Preisrichters (Blatt für die Preisvergabe in der Halle): je Preisart so viele Zeilen, wie der Preisrichter vergeben darf.
Tests: `preisverteilung.test.ts`

- `VerteilungArt` (Typ) – Eine Preisart der Schau, in Druckfolge.
- `VerteilungVergabe` (Typ) – Ein vergebener Preis an einem Tier dieses Preisrichters, in Katalogfolge.
- `preisverteilung()`
- Typen: `VerteilungZeile`

### ruecksprung.ts (16 Z.)
Tests: `ruecksprung.test.ts`

- `ruecksprungZiel()` – Rücksprung nach der Anmeldung: Wer mit abgelaufener Anmeldung einen Direktlink öffnet, landet nach dem Anmelden wieder auf dieser Seite statt auf d …
- `anmeldeZiel()` – Adresse der Anmeldeseite mit dem Ziel `?weiter=…` (Pfad und Suche der aktuellen Seite).

### schriften.ts (160 Z.)

- `KATALOG_SCHRIFTEN` – Schriften für den gedruckten Katalog: je Wahl genau eine Familie für alles, bei zwei Wahlen dazu eine Auszeichnung nur für den Namen der Schau auf …
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

### sepa.ts (139 Z.)
SEPA-Überweisungen (pain.001.001.09, wie von deutschen Banken nach DK-Datenformat angenommen).
Tests: `sepa.test.ts`

- `normalisiereIban()`
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

### cs.ts (284 Z.)

- `cs`

### de.ts (290 Z.)

- `de` – Texte der Seiten für Aussteller (öffentliche Schauseite, Online-Meldung, Meine Meldung, Ergebnisse) und der Mails an Aussteller – Deutsch ist die G …

### en.ts (278 Z.)

- `en`

### fr.ts (278 Z.)

- `fr`

### index.ts (79 Z.)
Sammelt alle Exporte (`export * from …`).

### nl.ts (278 Z.)

- `nl`

### allgemein.ts (36 Z.)

- `allgemein`

### ehrenpreise-spenden.ts (128 Z.)

- `spenden`

### ehrenpreise.ts (149 Z.)

- `ehrenpreise`

### fach.ts (182 Z.)

- `fach`

### halle-bild.ts (182 Z.)

- `halleBild`

### halle-werkzeuge.ts (238 Z.)

- `halleWerkzeuge`

### halle.ts (230 Z.)

- `halle`

### index.ts (22 Z.)
Sammelt alle Exporte (`export * from …`).

### kasse-abrechnung.ts (108 Z.)

- `pocet()` – Číslo s podstatným jménem ve správném tvaru (1 / 2–4 / 5+).
- `abrechnung`

### kasse-kassenbuch.ts (79 Z.)

- `kassenbuch`

### kasse-kontoauszug.ts (36 Z.)

- `kontoauszug`

### kasse.ts (119 Z.)

- `kasse`

### katalog-farben.ts (70 Z.)

- `farben`

### katalog-teile.ts (85 Z.)

- `teile`
- `gliederung`

### katalog.ts (188 Z.)

- `katalog`

### meldung-aussteller.ts (105 Z.)

- `aussteller`
- `mandate`

### meldung.ts (113 Z.)

- `meldung`

### preisrichter-import.ts (99 Z.)

- `preisrichterImport`

### preisrichter-termine.ts (104 Z.)

- `preisrichterTermine`

### preisrichter.ts (124 Z.)

- `preisrichter`

### rahmen.ts (142 Z.)

- `rahmen`

### schau-druck-formate.ts (59 Z.)

- `druckFormate`

### schau-einstellungen.ts (188 Z.)

- `schauEinstellungen`

### schau.ts (131 Z.)

- `schau`

### schautage.ts (220 Z.)

- `schautage`

### server-kasse-geld.ts (77 Z.)

- `kasse`
- `auszahlung`
- `kassenbuch`
- `sepa`
- `verkauf`

### server-kasse-kontoauszug.ts (13 Z.)

- `kontoauszug`

### server-kasse-lastschrift.ts (82 Z.)

- `lastschrift`
- `spenden`

### server-kasse-preise.ts (130 Z.)

- `preise`
- `bewertung`
- `preisrichter`
- `meisterschaft`

### server-kasse.ts (7 Z.)

- `serverKasse`

### server-katalog-halle.ts (69 Z.)

- `halle`

### server-katalog-katalog.ts (64 Z.)

- `katalog`

### server-katalog-pruefung.ts (107 Z.)

- `pruefung`

### server-katalog-stamm.ts (52 Z.)

- `stamm`

### server-katalog.ts (7 Z.)

- `serverKatalog`

### server-schau-datei.ts (19 Z.)

- `serverSchauDatei`

### server-schau-import.ts (68 Z.)

- `serverSchauImport`

### server-schau-meldung.ts (95 Z.)

- `serverSchauMeldung`

### server-schau-pruefung.ts (137 Z.)

- `serverSchauPruefung`

### server-schau-zusatz.ts (19 Z.)

- `serverSchauZusatz`

### server-schau.ts (169 Z.)

- `serverSchau`

### tablet.ts (119 Z.)

- `tablet`

### verein-benutzer.ts (144 Z.)

- `mnozne()` – České množné číslo: 1 → jeden, 2–4 → několik, jinak → mnoho.
- `benutzer`

### verein.ts (211 Z.)

- `verein`

### vorlagen.ts (239 Z.)

- `vorlagen`

### allgemein.ts (35 Z.)

- `allgemein` – Wörter, die in vielen Bereichen vorkommen (nur lesen; Bereiche führen eigene Texte in ihrer Gruppe).

### ehrenpreise-spenden.ts (128 Z.)

- `spenden` – Texte der Oberfläche: ehrenpreise, Teil Spenden (Entscheidung 022).

### ehrenpreise.ts (150 Z.)
Texte der Oberfläche: ehrenpreise (Entscheidung 022) – Gebühren, Preisarten, Meisterschaften, Spenden.

- `ehrenpreise`

### fach.ts (66 Z.)
Bezeichnungen aus der Fachlogik (`@schau/domain`), wie die Oberfläche sie zeigt.

- `fach`

### halle-bild.ts (180 Z.)

- `halleBild` – Texte der Oberfläche: halleBild (Entscheidung 022) – Zeichnung des Hallenplans, Entwürfe, Grundriss, 3D-Ansicht.

### halle-werkzeuge.ts (244 Z.)

- `halleWerkzeuge` – Texte der Oberfläche: halleWerkzeuge (Entscheidung 022) – Werkzeugleiste, Befehle und Aktionen des Hallenplan-Editors, kleine Teile (Tiere ohne Pla …

### halle.ts (229 Z.)

- `halle` – Texte der Oberfläche: halle – Seiten „Käfige“ und „Hallenplan“ mit den Eigenschaften im Editor (Entscheidung 022).

### index.ts (25 Z.)
Deutsche Texte der Oberfläche (Verwaltung, Helfer, Tablet) – Grundlage aller Übersetzungen (Entscheidung 022).
Sammelt alle Exporte (`export * from …`).

### kasse-abrechnung.ts (95 Z.)

- `abrechnung` – Texte der Oberfläche: kasse.abrechnung – Abrechnung mit den Ausstellern, SEPA-Überweisungen, Erstattungen (Entscheidung 022).

### kasse-kassenbuch.ts (75 Z.)

- `kassenbuch` – Texte der Oberfläche: kasse.kassenbuch – Barkasse, Tagesabschluss, Belegarchiv (Entscheidung 022).

### kasse-kontoauszug.ts (32 Z.)

- `kontoauszug` – Texte der Oberfläche: kasse.kontoauszug – Kontoauszug-Import fürs Meldegeld (Entscheidungen 022, 023).

### kasse.ts (117 Z.)
Texte der Oberfläche: kasse – Tierverkauf, Abrechnung, Kassenbuch, Kontoauszug, Lastschrift (Entscheidung 022).

- `kasse`

### katalog-farben.ts (72 Z.)

- `farben` – Texte der Oberfläche: katalog.farben – Namen der Farbvorschläge und Farbpaare im Reiter „Aufbau“ (Entscheidung 022).

### katalog-teile.ts (87 Z.)

- `teile` – Texte der Oberfläche: katalog.teile und katalog.gliederung – Reiter „Teile und Reihenfolge“ mit Beiträgen (Entscheidung 022).
- `gliederung` – Namen der Teile in der Gliederung (Schlüssel wie `KATALOG_GLIEDERUNG` der Domain; dort stehen die Namen für das PDF).

### katalog.ts (195 Z.)
Texte der Oberfläche: katalog – Katalognummern, Reihenfolge, Katalog gestalten mit Vorschau (Entscheidung 022).

- `katalog`

### meldung-aussteller.ts (102 Z.)

- `aussteller` – Texte der Oberfläche: meldung, Teil Aussteller des Vereins (seiten/aussteller.tsx) und SEPA-Mandate (seiten/aussteller-mandate.tsx).
- `mandate`

### meldung.ts (114 Z.)
Texte der Oberfläche: meldung (Entscheidung 022) – Meldungen erfassen und bearbeiten, Aussteller des Vereins, SEPA-Mandate.

- `meldung`

### preisrichter-import.ts (75 Z.)
Texte der Oberfläche: preisrichter, Teil import – Import aus Altprogrammen (Entscheidungen 015, 022).

- `preisrichterImport`

### preisrichter-termine.ts (99 Z.)

- `preisrichterTermine` – Texte der Oberfläche: preisrichter, Teil termine – Katalogseite „Kommende Schauen“ (Entscheidung 022).

### preisrichter.ts (122 Z.)
Texte der Oberfläche: preisrichter (Entscheidung 022) – Seite Preisrichter mit Einteilung, dazu die Seiten „Kommende Schauen“ (`termine`) und Impor …

- `preisrichter`

### rahmen.ts (155 Z.)

- `rahmen` – Texte der Oberfläche: rahmen (Entscheidung 022) – App-Rahmen mit Seitenmenü und Benutzermenü, Anmeldung, Einladung, Hilfe-Rahmen, Fehlerseite und d …

### schau-druck-formate.ts (58 Z.)

- `druckFormate` – Texte der Oberfläche: schau.einstellungen.druck.formate (Entscheidung 022, 029) – Übersicht der Drucke im Reiter „Druck“.

### schau-einstellungen.ts (196 Z.)
Texte der Oberfläche: schau.einstellungen (Entscheidung 022) – Seite „Einstellungen“ der Schau und ihre Abschnitte.

- `schauEinstellungen`

### schau.ts (131 Z.)
Texte der Oberfläche: schau (Entscheidung 022) – Liste der Schauen, Übersicht; Einstellungen in schau-einstellungen.

- `schau`

### schautage.ts (216 Z.)

- `schautage` – Texte der Oberfläche: schautage – Einlieferung, Tierausgabe, Tiergesundheit, Bewertung am PC, Preise (Entscheidung 022).

### server-kasse-geld.ts (86 Z.)
Meldungen des Servers zur Kasse (routers/kasse/*, services/kasse.ts) mit SEPA-Überweisung aus der Fachlogik (sepa.ts) – Teil von serverKasse (Entsc …

- `kasse` – Gemeinsame Prüfungen der Kasse (services/kasse.ts, routers/kasse/gemeinsam.ts).
- `auszahlung` – Auszahlung, Nachzahlung, Rückforderung und Storno (routers/kasse/auszahlung.ts).
- `kassenbuch` – Barkasse: Einlage, Entnahme, Tagesabschluss (routers/kasse/kassenbuch.ts).
- `sepa` – SEPA-Sammelüberweisung (routers/kasse/sepa.ts) und Prüfungen beim Erzeugen der Datei (domain sepa.ts).
- `verkauf` – Tierverkauf, Storno, Zahlungseingang (routers/kasse/verkauf.ts).

### server-kasse-kontoauszug.ts (18 Z.)

- `kontoauszug` – Meldungen des Servers zum Kontoauszug-Import (routers/kontoauszug.ts und die dort weitergereichten Fehler der Domain, Entscheidung 023) – Teil von …

### server-kasse-lastschrift.ts (90 Z.)
Meldungen des Servers zu SEPA-Lastschrift (routers/lastschrift.ts, domain lastschrift.ts) und Spenden (routers/spenden.ts, services/zuwendungsbesta …

- `lastschrift` – Gläubiger-ID, Mandate, Lastschriftdatei, Rücklastschrift.
- `spenden` – Spenden, Spender und Zuwendungsbestätigungen.

### server-kasse-preise.ts (144 Z.)
Meldungen des Servers zu Preisen und Stiftungen (routers/preise.ts, services/preise.ts, domain preise.ts), Bewertung und Tablet (routers/bewertung. …

- `preise` – Preise vergeben und entfernen, Stiftungen, Freigabe der Ergebnisse.
- `bewertung` – Bewertung am PC und am Tablet, Obmann, Textbausteine, Anmeldung am Tablet.
- `preisrichter` – Einteilung der Preisrichter (routers/preisrichter.ts).
- `meisterschaft` – Gründe und Hinweise der Meisterschaftswertung (domain meisterschaft.ts).

### server-kasse.ts (12 Z.)
Texte der Oberfläche: serverKasse (Entscheidung 022) – Meldungen des Servers zu Kasse, SEPA, Lastschrift, Kontoauszug, Spenden, Preisen, Bewertung, …

- `serverKasse`

### server-katalog-halle.ts (74 Z.)

- `halle` – Meldungen des Servers zum Hallenplan (Entscheidung 022): routers/katalog/hallenplan.ts, gemeinsam.ts, kaefige.ts, routers/hallenentwurf.ts und die …

### server-katalog-katalog.ts (68 Z.)

- `katalog` – Meldungen des Servers zu Katalog und Einlieferung (Entscheidung 022): routers/katalog/einlieferung.ts, nummern.ts, gesundheit.ts, die Nachweise (pr …

### server-katalog-pruefung.ts (111 Z.)

- `pruefung` – Meldungen des Servers (Entscheidung 022): Zugang und Umfang der Anfrage (apps/server/src/trpc.ts), Kurztexte der Eingabeprüfung (kurzerPruefText, S …

### server-katalog-stamm.ts (56 Z.)

- `stamm` – Meldungen des Servers zu Bildern, Katalog-Gestaltung, Stammdaten, Rassebildern und Druckvorlagen (Entscheidung 022): routers/katalog-gestaltung.ts, …

### server-katalog.ts (10 Z.)
Texte der Oberfläche: serverKatalog (Entscheidung 022) – Meldungen des Servers zu Eingabeprüfung und Zugang, Hallenplan, Katalog und Einlieferung, …

- `serverKatalog`

### server-schau-datei.ts (21 Z.)

- `serverSchauDatei` – Fehlertexte der Datei-Adressen (apps/server/src/datei-*.ts, `c.text("…", 4xx)`), übersetzt vom Server in datei-sprache.ts (Entscheidung 022) – Teil …

### server-schau-import.ts (71 Z.)

- `serverSchauImport` – Import von Ausstellern und Meldungen aus Tabellen (routers/import.ts, services/import.ts, import/xlsx.ts und die Zeilenprüfung der Fachlogik) – Tei …

### server-schau-meldung.ts (102 Z.)
Meldungen des Servers zu Meldungen, Zahlungen und Ausstellern (Teil von serverSchau, Entscheidung 022).

- `serverSchauMeldung`

### server-schau-pruefung.ts (135 Z.)

- `serverSchauPruefung` – Prüfliste der Übersicht (services/pruefung.ts) und Phasenwechsel (routers/schau/phase.ts) – Teil von serverSchau.

### server-schau-zusatz.ts (18 Z.)

- `serverSchauZusatz` – Weitere Meldungen: Prüfung der Protokollkette (services/protokoll-suche.ts), Katalog-Vorschau (datei-katalog.ts), Mailserver (services/post.ts) – T …

### server-schau.ts (171 Z.)
Meldungen des Servers (Entscheidung 022): Schau anlegen, Einstellungen, Gebühren, Anmeldung, Bremsen, Termine, Verein.

- `serverSchau`

### tablet.ts (120 Z.)

- `tablet` – Texte der Oberfläche: tablet – Preisrichter-Tablet (Entscheidung 022).

### verein-benutzer.ts (141 Z.)

- `benutzer` – Texte der Oberfläche: verein.benutzer – Benutzerliste, Seite eines Benutzers, eigener Zugang (Entscheidung 022).

### verein.ts (220 Z.)
Texte der Oberfläche: verein – Verein und Datenschutz, automatische Abmeldung, Benutzer, Protokoll (Entscheidung 022).

- `verein`

### vorlagen.ts (238 Z.)
Texte der Oberfläche: vorlagen (Entscheidung 022) – Druckvorlagen (Bewertungskarte), Briefvorlage und Serienbrief, Rassen und Farbenschläge (Verzei …

- `vorlagen`

### allgemein.ts (36 Z.)

- `allgemein`

### ehrenpreise-spenden.ts (127 Z.)

- `spenden`

### ehrenpreise.ts (144 Z.)

- `ehrenpreise`

### fach.ts (182 Z.)

- `fach`

### halle-bild.ts (178 Z.)

- `halleBild`

### halle-werkzeuge.ts (234 Z.)

- `halleWerkzeuge`

### halle.ts (229 Z.)

- `halle`

### index.ts (22 Z.)
Sammelt alle Exporte (`export * from …`).

### kasse-abrechnung.ts (102 Z.)

- `abrechnung`

### kasse-kassenbuch.ts (75 Z.)

- `kassenbuch`

### kasse-kontoauszug.ts (33 Z.)

- `kontoauszug`

### kasse.ts (117 Z.)

- `kasse`

### katalog-farben.ts (70 Z.)

- `farben`

### katalog-teile.ts (85 Z.)

- `teile`
- `gliederung`

### katalog.ts (186 Z.)

- `katalog`

### meldung-aussteller.ts (104 Z.)

- `aussteller`
- `mandate`

### meldung.ts (110 Z.)

- `meldung`

### preisrichter-import.ts (97 Z.)

- `preisrichterImport`

### preisrichter-termine.ts (102 Z.)

- `preisrichterTermine`

### preisrichter.ts (121 Z.)

- `preisrichter`

### rahmen.ts (139 Z.)

- `rahmen`

### schau-druck-formate.ts (59 Z.)

- `druckFormate`

### schau-einstellungen.ts (188 Z.)

- `schauEinstellungen`

### schau.ts (124 Z.)

- `schau`

### schautage.ts (218 Z.)

- `schautage`

### server-kasse-geld.ts (77 Z.)

- `kasse`
- `auszahlung`
- `kassenbuch`
- `sepa`
- `verkauf`

### server-kasse-kontoauszug.ts (13 Z.)

- `kontoauszug`

### server-kasse-lastschrift.ts (82 Z.)

- `lastschrift`
- `spenden`

### server-kasse-preise.ts (130 Z.)

- `preise`
- `bewertung`
- `preisrichter`
- `meisterschaft`

### server-kasse.ts (7 Z.)

- `serverKasse`

### server-katalog-halle.ts (69 Z.)

- `halle`

### server-katalog-katalog.ts (64 Z.)

- `katalog`

### server-katalog-pruefung.ts (107 Z.)

- `pruefung`

### server-katalog-stamm.ts (52 Z.)

- `stamm`

### server-katalog.ts (7 Z.)

- `serverKatalog`

### server-schau-datei.ts (19 Z.)

- `serverSchauDatei`

### server-schau-import.ts (68 Z.)

- `serverSchauImport`

### server-schau-meldung.ts (95 Z.)

- `serverSchauMeldung`

### server-schau-pruefung.ts (130 Z.)

- `serverSchauPruefung`

### server-schau-zusatz.ts (19 Z.)

- `serverSchauZusatz`

### server-schau.ts (162 Z.)

- `serverSchau`

### tablet.ts (121 Z.)

- `tablet`

### verein-benutzer.ts (137 Z.)

- `benutzer`

### verein.ts (210 Z.)

- `verein`

### vorlagen.ts (238 Z.)

- `vorlagen`

### allgemein.ts (36 Z.)

- `allgemein`

### ehrenpreise-spenden.ts (127 Z.)

- `spenden`

### ehrenpreise.ts (144 Z.)

- `ehrenpreise`

### fach.ts (182 Z.)

- `fach`

### halle-bild.ts (178 Z.)

- `halleBild`

### halle-werkzeuge.ts (234 Z.)

- `halleWerkzeuge`

### halle.ts (229 Z.)

- `halle`

### index.ts (22 Z.)
Sammelt alle Exporte (`export * from …`).

### kasse-abrechnung.ts (105 Z.)

- `abrechnung`

### kasse-kassenbuch.ts (78 Z.)

- `kassenbuch`

### kasse-kontoauszug.ts (33 Z.)

- `kontoauszug`

### kasse.ts (120 Z.)

- `kasse`

### katalog-farben.ts (70 Z.)

- `farben`

### katalog-teile.ts (85 Z.)

- `teile`
- `gliederung`

### katalog.ts (186 Z.)

- `katalog`

### meldung-aussteller.ts (104 Z.)

- `aussteller`
- `mandate`

### meldung.ts (110 Z.)

- `meldung`

### preisrichter-import.ts (98 Z.)

- `preisrichterImport`

### preisrichter-termine.ts (103 Z.)

- `preisrichterTermine`

### preisrichter.ts (121 Z.)

- `preisrichter`

### rahmen.ts (139 Z.)

- `rahmen`

### schau-druck-formate.ts (59 Z.)

- `druckFormate`

### schau-einstellungen.ts (188 Z.)

- `schauEinstellungen`

### schau.ts (124 Z.)

- `schau`

### schautage.ts (218 Z.)

- `schautage`

### server-kasse-geld.ts (77 Z.)

- `kasse`
- `auszahlung`
- `kassenbuch`
- `sepa`
- `verkauf`

### server-kasse-kontoauszug.ts (13 Z.)

- `kontoauszug`

### server-kasse-lastschrift.ts (82 Z.)

- `lastschrift`
- `spenden`

### server-kasse-preise.ts (133 Z.)

- `preise`
- `bewertung`
- `preisrichter`
- `meisterschaft`

### server-kasse.ts (7 Z.)

- `serverKasse`

### server-katalog-halle.ts (69 Z.)

- `halle`

### server-katalog-katalog.ts (64 Z.)

- `katalog`

### server-katalog-pruefung.ts (107 Z.)

- `pruefung`

### server-katalog-stamm.ts (52 Z.)

- `stamm`

### server-katalog.ts (7 Z.)

- `serverKatalog`

### server-schau-datei.ts (19 Z.)

- `serverSchauDatei`

### server-schau-import.ts (69 Z.)

- `serverSchauImport`

### server-schau-meldung.ts (97 Z.)

- `serverSchauMeldung`

### server-schau-pruefung.ts (131 Z.)

- `serverSchauPruefung`

### server-schau-zusatz.ts (19 Z.)

- `serverSchauZusatz`

### server-schau.ts (162 Z.)

- `serverSchau`

### tablet.ts (121 Z.)

- `tablet`

### verein-benutzer.ts (139 Z.)

- `benutzer`

### verein.ts (211 Z.)

- `verein`

### vorlagen.ts (239 Z.)

- `vorlagen`

### index.ts (69 Z.)
Texte der ganzen Oberfläche – Anmeldung, Verwaltung, Helfer, Preisrichter-Tablet – in allen Sprachen (Entscheidung 022).
Sammelt alle Exporte (`export * from …`).

### allgemein.ts (36 Z.)

- `allgemein`

### ehrenpreise-spenden.ts (127 Z.)

- `spenden`

### ehrenpreise.ts (144 Z.)

- `ehrenpreise`

### fach.ts (182 Z.)

- `fach`

### halle-bild.ts (178 Z.)

- `halleBild`

### halle-werkzeuge.ts (234 Z.)

- `halleWerkzeuge`

### halle.ts (229 Z.)

- `halle`

### index.ts (22 Z.)
Sammelt alle Exporte (`export * from …`).

### kasse-abrechnung.ts (102 Z.)

- `abrechnung`

### kasse-kassenbuch.ts (77 Z.)

- `kassenbuch`

### kasse-kontoauszug.ts (33 Z.)

- `kontoauszug`

### kasse.ts (119 Z.)

- `kasse`

### katalog-farben.ts (70 Z.)

- `farben`

### katalog-teile.ts (85 Z.)

- `teile`
- `gliederung`

### katalog.ts (186 Z.)

- `katalog`

### meldung-aussteller.ts (104 Z.)

- `aussteller`
- `mandate`

### meldung.ts (110 Z.)

- `meldung`

### preisrichter-import.ts (98 Z.)

- `preisrichterImport`

### preisrichter-termine.ts (102 Z.)

- `preisrichterTermine`

### preisrichter.ts (121 Z.)

- `preisrichter`

### rahmen.ts (139 Z.)

- `rahmen`

### schau-druck-formate.ts (59 Z.)

- `druckFormate`

### schau-einstellungen.ts (188 Z.)

- `schauEinstellungen`

### schau.ts (124 Z.)

- `schau`

### schautage.ts (218 Z.)

- `schautage`

### server-kasse-geld.ts (77 Z.)

- `kasse`
- `auszahlung`
- `kassenbuch`
- `sepa`
- `verkauf`

### server-kasse-kontoauszug.ts (13 Z.)

- `kontoauszug`

### server-kasse-lastschrift.ts (82 Z.)

- `lastschrift`
- `spenden`

### server-kasse-preise.ts (130 Z.)

- `preise`
- `bewertung`
- `preisrichter`
- `meisterschaft`

### server-kasse.ts (7 Z.)

- `serverKasse`

### server-katalog-halle.ts (69 Z.)

- `halle`

### server-katalog-katalog.ts (64 Z.)

- `katalog`

### server-katalog-pruefung.ts (107 Z.)

- `pruefung`

### server-katalog-stamm.ts (52 Z.)

- `stamm`

### server-katalog.ts (7 Z.)

- `serverKatalog`

### server-schau-datei.ts (19 Z.)

- `serverSchauDatei`

### server-schau-import.ts (69 Z.)

- `serverSchauImport`

### server-schau-meldung.ts (95 Z.)

- `serverSchauMeldung`

### server-schau-pruefung.ts (130 Z.)

- `serverSchauPruefung`

### server-schau-zusatz.ts (19 Z.)

- `serverSchauZusatz`

### server-schau.ts (162 Z.)

- `serverSchau`

### tablet.ts (121 Z.)

- `tablet`

### verein-benutzer.ts (138 Z.)

- `benutzer`

### verein.ts (211 Z.)

- `verein`

### vorlagen.ts (238 Z.)

- `vorlagen`

### allgemein.ts (36 Z.)

- `allgemein`

### ehrenpreise-spenden.ts (128 Z.)

- `spenden`

### ehrenpreise.ts (149 Z.)

- `ehrenpreise`

### fach.ts (182 Z.)

- `fach`

### halle-bild.ts (183 Z.)

- `halleBild`

### halle-werkzeuge.ts (239 Z.)

- `halleWerkzeuge`

### halle.ts (231 Z.)

- `halle`

### index.ts (22 Z.)
Sammelt alle Exporte (`export * from …`).

### kasse-abrechnung.ts (110 Z.)

- `liczba()` – Liczba z rzeczownikiem w odpowiedniej formie (1 / 2–4 / 5+).
- `abrechnung`

### kasse-kassenbuch.ts (79 Z.)

- `kassenbuch`

### kasse-kontoauszug.ts (36 Z.)

- `kontoauszug`

### kasse.ts (120 Z.)

- `kasse`

### katalog-farben.ts (70 Z.)

- `farben`

### katalog-teile.ts (85 Z.)

- `teile`
- `gliederung`

### katalog.ts (190 Z.)

- `katalog`

### meldung-aussteller.ts (106 Z.)

- `aussteller`
- `mandate`

### meldung.ts (114 Z.)

- `meldung`

### preisrichter-import.ts (100 Z.)

- `preisrichterImport`

### preisrichter-termine.ts (105 Z.)

- `preisrichterTermine`

### preisrichter.ts (125 Z.)

- `preisrichter`

### rahmen.ts (146 Z.)

- `rahmen`

### schau-druck-formate.ts (59 Z.)

- `druckFormate`

### schau-einstellungen.ts (188 Z.)

- `schauEinstellungen`

### schau.ts (133 Z.)

- `schau`

### schautage.ts (221 Z.)

- `schautage`

### server-kasse-geld.ts (77 Z.)

- `kasse`
- `auszahlung`
- `kassenbuch`
- `sepa`
- `verkauf`

### server-kasse-kontoauszug.ts (13 Z.)

- `kontoauszug`

### server-kasse-lastschrift.ts (82 Z.)

- `lastschrift`
- `spenden`

### server-kasse-preise.ts (130 Z.)

- `preise`
- `bewertung`
- `preisrichter`
- `meisterschaft`

### server-kasse.ts (7 Z.)

- `serverKasse`

### server-katalog-halle.ts (69 Z.)

- `halle`

### server-katalog-katalog.ts (64 Z.)

- `katalog`

### server-katalog-pruefung.ts (107 Z.)

- `pruefung`

### server-katalog-stamm.ts (52 Z.)

- `stamm`

### server-katalog.ts (7 Z.)

- `serverKatalog`

### server-schau-datei.ts (19 Z.)

- `serverSchauDatei`

### server-schau-import.ts (68 Z.)

- `serverSchauImport`

### server-schau-meldung.ts (95 Z.)

- `serverSchauMeldung`

### server-schau-pruefung.ts (138 Z.)

- `serverSchauPruefung`

### server-schau-zusatz.ts (19 Z.)

- `serverSchauZusatz`

### server-schau.ts (168 Z.)

- `serverSchau`

### tablet.ts (119 Z.)

- `tablet`

### verein-benutzer.ts (146 Z.)

- `mnoga()` – Polska liczba mnoga: 1 → jeden, 2–4 (bez 12–14) → kilka, reszta → wiele.
- `benutzer`

### verein.ts (211 Z.)

- `verein`

### vorlagen.ts (243 Z.)

- `vorlagen`

### server.ts (126 Z.)
Meldungen des Servers (Fehler, Prüfungen, Hinweise) in der Sprache der Oberfläche (Entscheidung 022).

- `serverText()` – Meldung des Servers in der Sprache der Oberfläche.

### pl.ts (286 Z.)

- `pl`

### uebersetzung.ts (4 Z.)

- `Uebersetzung` (Typ) – Jede Übersetzung hat genau die Schlüssel des deutschen Textes; Platzhalter als Funktionen mit denselben Werten.

### umschreiben.ts (27 Z.)
Umschreibungen der deutschen Grundlage: Schweizer Schreibung und französische Satzzeichen (Entscheidung 020).

- `umschreiben()` – Wendet `f` auf jeden Text an – bei Texten mit Platzhaltern nur auf den festen Teil: eingesetzte Werte (Schauname, Grund, Adresse) bleiben, wie der …
- `ohneEszett()` – Schweizer Schreibung: wie Deutsch, aber „ss“ statt „ß“.
- `franzoesischeZeichen()` – Französische Satzzeichen: geschütztes Leerzeichen vor : ; ?

### stammdaten.ts (134 Z.)

- `zerlegeZeile()` – Zerlegt eine CSV-Zeile.
- `parseStammdatenCsv()` – Liest eine CSV mit den Spalten Sparte;Rasse;Farbenschlag, freiwillig dazu Gruppe (BDRG-Gruppe der Rasse).
- Typen: `StammdatenZeile`, `StammdatenBaum`

### stellvorschlaege.ts (99 Z.)
Tests: `stellvorschlaege.test.ts`

- `StellVorschlag` (Typ) – Ein Vorschlag, wie die Halle gestellt werden kann – mit dem durchgerechneten Plan.
- `stellTitel()` – Beschreibung einer Aufstellung.
- `stellVorschlaege()` – Alle Aufstellungen derselben Halle zum Vergleich: Reihenrichtung (quer, längs), Wandreihen, bündig an Wänden und Lage des Hauptgangs (Anfang, Ende, …

### teilschau.ts (43 Z.)
Tests: `teilschau.test.ts`

- `Teilschau` (Typ) – Teilschauen (Entscheidung 016): Eine Ausstellung kann aus mehreren Teilschauen bestehen, z. B. Landesschau, Kreisschau und Jugendschau in einer Halle.
- `TEILSCHAUEN_MAX`
- `teilschauenLesen()` – Gespeicherte oder eingegebene Teilschauen lesen: Namen gekürzt, leere und doppelte Kennungen weg, neue nummeriert.
- `teilschauVon()` – Teilschau einer Meldung: ihre, sonst (ohne Angabe oder gelöscht) die erste; ohne Teilschauen keine.
- `teilschauFolge()` – Stelle der Teilschau in der Katalogfolge (0 = erste).

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
Tests: `version.test.ts`

- `VERSION` – Version von SchauFUCHS (Oberfläche, Server, Handbuch).

### veterinaeramt.ts (87 Z.)
Tests: `veterinaeramt.test.ts`

- `Veterinaeramt` (Typ) – Verzeichnis der zuständigen Veterinärämter (je Landkreis, kreisfreie Stadt bzw. Bezirk ein Eintrag): Vorschläge für das Feld „Zuständiges Veterinär …
- `suchNormal()` – Für die Suche: klein, Umlaute ausgeschrieben, Akzente und Satzzeichen weg.
- `kreisKern()` – Kreisname ohne Vorsatz („Landkreis Böblingen“ → „boeblingen“), normalisiert.
- `veterinaeramtSuchen()` – Ämter, auf die alle Wörter der Suche passen (Kreis, Amt, Ort, Land); Kreisname am Anfang zuerst.
- `veterinaeramtText()` – Text für das Feld: „Amt, Straße, PLZ Ort“ (leere Teile fallen weg).
- `veterinaeramtZurSchau()` – Vorschlag aus Ort bzw. Anschrift der Schau: der Kreis, dessen Name als ganzes Wort darin vorkommt (der längste gewinnt).

### zahlart.ts (11 Z.)

- `ZAHLARTEN` – Zahlarten einer Meldegeld-Zahlung bzw. Auszahlung (Datenbank-Enum „zahlart“) und ihre Beschriftung in Belegen und Auskunft.
- `ZAHLART_LABEL`
- Typen: `Zahlart`

### zuwendungsbestaetigung.ts (69 Z.)
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
- `bescheidSatz()` – Satz zum Freistellungsbescheid bzw. zur Feststellung nach § 60a AO – nur die zutreffende Variante.
- `verwendungSatz()` – „Es wird bestätigt, dass die Zuwendung nur zur Förderung … verwendet wird.“
- `betragFelder()` – Betrag in Ziffern und Buchstaben (BMF Nr. 5).
- `sachSaetze()` – Text der Sachzuwendung: Bezeichnung und die zutreffenden Sätze zur Herkunft und zu den Unterlagen.

Weitere Tests: `abrechnung-gesamt.test.ts`, `domain.test.ts`, `einteilung-jugend.test.ts`, `fristen.test.ts`, `hallenplan-3d-umriss.test.ts`, `hallenplan-etagen.test.ts`, `hallenplan-frei.test.ts`, `hallenplan-lueckenlos.test.ts`, `hallenplan-nummerfolge.test.ts`, `hallenplan-ueberlappt.test.ts`, `katalog-gliederung.test.ts`, `katalog-sortierung.test.ts`, `oberflaeche.test.ts`, `preisbindung.test.ts`, `sprachen.test.ts`, `stammdaten-gruppe.test.ts`, `stiftung.test.ts`, `zusatzpreise.test.ts`

## tRPC-Prozeduren `apps/server/src/routers`

Aufruf im Web als `trpc.<bereich>.<prozedur>`. Rolle: öffentlich (ohne Anmeldung), angemeldet (jede Rolle), admin (Ausstellungsleitung, mit Zwei-Faktor), richter (Tablet). Feinere Rechte prüft die Prozedur selbst.

### routers/auth/anmeldung.ts (177 Z.) → `auth`
Anmeldung: Status, Ersteinrichtung, Anmelden (auch zweiter Schritt), Abmelden, eigenes Passwort und eigene Sprache.

- `auth.status` query · öffentlich
- `auth.einrichten` mutation · öffentlich – Ersteinrichtung: legt Verein und ersten Administrator an.
- `auth.anmelden` mutation · öffentlich
- `auth.anmeldenCode` mutation · öffentlich – Zweiter Schritt der Anmeldung: Code aus der Authenticator-App oder ein Notfallcode.
- `auth.abmelden` mutation · öffentlich
- `auth.passwortAendern` mutation · angemeldet
- `auth.spracheSetzen` mutation · angemeldet – Sprache der Oberfläche für das eigene Konto merken (Entscheidung 022); gilt auf jedem Gerät nach der Anmeldung.

### routers/auth/benutzer.ts (254 Z.) → `auth`
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

### routers/auth/gemeinsam.ts (261 Z.)
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

### routers/betrieb.ts (11 Z.) → `betrieb`
Betrieb: Zustand der Installation für die Oberfläche (Lesemodus, Entscheidung 025).

- `betrieb.lesemodus` query · öffentlich – Läuft der Lesemodus?

### routers/bewertung.ts (385 Z.) → `bewertung`, `richter`

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

### routers/druck-formate.ts (56 Z.) → `druckvorlage`
Formatvorgaben der Drucke einer Schau (Entscheidung 029), Teil von `druckvorlage`: Übersicht für den Reiter „Druck“ (die gewählten Formate, dazu Ka …

- `druckvorlage.formate` query · angemeldet – Formate aller Drucke der Schau: eigene Vorgaben, Katalogformat (Katalog-Gestaltung) und Kartenvorlage (011).
- `druckvorlage.formateSetzen` mutation · admin

### routers/druckvorlage.ts (145 Z.) → `druckvorlage`
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

### routers/hallenentwurf.ts (178 Z.) → `hallenentwurf`
Entwürfe des Hallenplans (Entscheidung 017): den aktuellen Plan einer Schau als Entwurf speichern, einen Entwurf (oder einen archivierten aus einer …

- `hallenentwurf.liste` query · angemeldet – Entwürfe dieser Schau und das Archiv des Vereins (neueste zuerst).
- `hallenentwurf.speichern` mutation · admin – Den aktuellen Plan der Schau als Entwurf speichern.
- `hallenentwurf.laden` mutation · admin – Entwurf dieser Schau (auch archiviert) oder aus dem Archiv einer früheren Schau laden – siehe `entwurfEinsetzen`.
- `hallenentwurf.umbenennen` mutation · admin
- `hallenentwurf.loeschen` mutation · admin
- `hallenentwurf.entscheiden` mutation · admin – Entscheidung: Mit `id` wird dieser Entwurf geladen und gilt; ohne gilt der aktuelle Plan.

### routers/import.ts (119 Z.) → `datenimport`
Import aus Altprogrammen (Entscheidung 015), nur Administratoren: Datei lesen (CSV oder Excel), prüfen, übernehmen, Importläufe anzeigen und zurück …

- `datenimport.lesen` mutation · admin – Datei lesen: Excel (.xlsx) oder CSV.
- `datenimport.pruefen` mutation · admin
- `datenimport.uebernehmen` mutation · admin
- `datenimport.laeufe` query · admin
- `datenimport.zuruecknehmen` mutation · admin

### routers/kasse/auszahlung.ts (120 Z.) → `kasse`
Abrechnung je Aussteller, Auszahlung (bar oder Überweisung, auch Nachzahlung und Rückforderung) und ihr Storno.

- `kasse.abrechnung` query · angemeldet
- `kasse.auszahlen` mutation · angemeldet – Bucht die Auszahlung.
- `kasse.auszahlungStornieren` mutation · admin – Storniert eine Buchung, bei der kein Geld geflossen ist (Fehlbuchung, Überweisung von der Bank zurückgebucht).

### routers/kasse/gemeinsam.ts (187 Z.)
Gemeinsame Hilfen der Kasse: Beleg- und Quittungsnummern, SEPA-XML aus einem Lauf, die Abrechnungsliste aller Aussteller, die erlaubten Phasen für …

Keine Prozeduren (Hilfen für die Router).

### routers/kasse/kassenbuch.ts (116 Z.) → `kasse`
Kassenbuch der Barkasse: Tage mit Bewegungen, Einlage und Entnahme, Tagesabschluss, archivierte Belege.

- `kasse.kassenbuch` query · angemeldet – Kassenbuch nach Tagen: Anfangsbestand, Bargeldbewegungen, Soll, Tagesabschluss.
- `kasse.kassenbewegung` mutation · angemeldet – Wechselgeld zu Beginn, Einlage oder Entnahme (z. B. Bargeld zur Bank).
- `kasse.tagesabschluss` mutation · angemeldet – Tagesabschluss mit gezähltem Bestand für einen Kassentag (Standard: heute; nach Mitternacht der Vortag).
- `kasse.belege` query · angemeldet – Archivierte Belege mit Prüfsumme (SHA-256).

### routers/kasse/sepa.ts (156 Z.) → `kasse`
SEPA-Sammelüberweisung an die Aussteller: offene Datei anzeigen, erstellen, verwerfen und als ausgezahlt buchen.

- `kasse.ueberweisungsdatei` query · angemeldet – Die offene SEPA-Datei (erstellt, noch nicht gebucht) oder null.
- `kasse.ueberweisungsdateiErstellen` mutation · admin – Legt die SEPA-Datei mit allen jetzt überweisbaren Ausstellern fest.
- `kasse.ueberweisungsdateiVerwerfen` mutation · admin – Verwirft die offene SEPA-Datei, z. B. wenn die Bank sie abgelehnt hat.
- `kasse.ueberweisungenBuchen` mutation · admin – Bucht die Aussteller aus der offenen SEPA-Datei mit den Beträgen der Datei als ausgezahlt (Art: Überweisung).

### routers/kasse/verkauf.ts (200 Z.) → `kasse`
Tierverkauf an der Kasse: Tier suchen, verkaufen, stornieren, Angebot, Verkaufsliste und Zahlungseingang bei Überweisung.

- `kasse.tierSuchen` query · angemeldet
- `kasse.verkaufen` mutation · angemeldet
- `kasse.stornieren` mutation · admin
- `kasse.angebot` query · angemeldet – Tiere, die zum Verkauf stehen: verkäuflich gemeldet, eingeliefert, bewertet, nicht gesperrt und noch nicht verkauft.
- `kasse.verkaeufe` query · angemeldet
- `kasse.zahlungseingangVerkauf` mutation · admin – Zahlungseingang zu einem Verkauf per Überweisung (laut Kontoauszug) – nur Ausstellungsleitung.
- `kasse.offeneUeberweisungen` query · angemeldet – Verkäufe per Überweisung, deren Zahlungseingang noch fehlt (Liste für die Kasse).

### routers/kasse.ts (16 Z.)
Kasse: Tierverkauf, Abrechnung und Auszahlung, SEPA-Sammelüberweisung und Kassenbuch.

Setzt Teile zu einem Router zusammen.

### routers/katalog/einlieferung.ts (303 Z.) → `halle`
Einlieferung in der Halle: Ringnummer, Käfig je Tier, Suche, Status (Einlieferung, Ausgabe), Impfnachweise.

- `halle.ringnummerSetzen` mutation · angemeldet – Ringnummer bei der Einlieferung nach der Ringkarte eintragen (Kennzeichnung für Kaufbeleg und Veterinärliste).
- `halle.kaefigSetzen` mutation · angemeldet – Andere Käfiggröße für ein einzelnes Tier, z. B. das Zwerghuhn in den letzten freien Großkäfig.
- `halle.suche` query · angemeldet – Einlieferung: Aussteller mit ihren Tieren, gesucht nach Name oder Katalognummer.
- `halle.statusSetzen` mutation · angemeldet
- `halle.vetSetzen` mutation · angemeldet – Nachweise bei der Einlieferung: ND-Impfung (Hühner, Puten), PMV-Impfung (Tauben), Untersuchung Wassergeflügel.

### routers/katalog/gemeinsam.ts (261 Z.)
Gemeinsames für Katalog und Hallenplan: Eingabe der Halle (Schemas), Grundriss prüfen, Plan neu setzen, Tiere für den Plan.

Keine Prozeduren (Hilfen für die Router).

### routers/katalog/gesundheit.ts (81 Z.) → `halle`
Gesundheitsjournal in der Halle: Liste, Eintrag erfassen, Sperre aufheben.

- `halle.gesundheit` query · angemeldet – Gesundheitsjournal (Art. 25 DelVO (EU) 2019/2035): Krankheit, Verdacht, Todesfall, Maßnahme.
- `halle.gesundheitErfassen` mutation · angemeldet
- `halle.gesundheitFreigeben` mutation · admin – Sperre aufheben (z. B. Tierarzt gibt Entwarnung) – nur die Ausstellungsleitung; der Eintrag bleibt im Journal.

### routers/katalog/hallenplan.ts (343 Z.) → `katalog`
Hallenplan: Plan und Stellvorschläge, festschreiben, neu setzen, Tier versetzen, Käfiginfo, Halle speichern, Wandreihe.

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

### routers/katalog/kaefige.ts (219 Z.) → `katalog`
Käfige und Grundplatten: Käfigbedarf, Aufsteller und Sockelbild, Grundplatten, Käfigregeln und -maße.

- `katalog.kaefigbedarf` query · angemeldet – Käfigbedarf: je Käfiggröße die gemeldeten und bestätigten Tiere (ohne fehlende) und die Käfignummern (= Katalognummern) der bestätigten.
- `katalog.aufstellerSetzen` mutation · admin – Höhe der Aufsteller (cm), auf denen die Grundplatten stehen; null = wieder Vorgabe.
- `katalog.sockelBildSetzen` mutation · admin – Bild für die Sockelverkleidung (z. B. die Plane eines Sponsors): wie die Katalogbilder geprüft (PNG oder JPEG, Größe, Pixel), ersetzt ein vorheriges.
- `katalog.sockelBildEntfernen` mutation · admin – Bild der Sockelverkleidung entfernen (die Verkleidung bleibt in ihrer Farbe).
- `katalog.plattenSetzen` mutation · admin – Grundplatte (Länge × Tiefe in cm) und Käfige je Platte für einzelne Käfigarten (fehlend = automatisch aus Platte und Käfigbreite).
- `katalog.kaefigRegelSetzen` mutation · admin – Abweichende Käfiggröße für eine Rasse festlegen (typ null = wieder automatisch).
- `katalog.kaefigMassSetzen` mutation · admin – Maße der eigenen Käfige je Käfigart (cm); null = wieder Richtwert.

### routers/katalog/nummern.ts (242 Z.) → `katalog`
Katalognummern: Liste, Stand des Hallenplans, Nummern vergeben, nach Hallenplan nummerieren, Festschreibung der Nummern.

- `katalog.liste` query · angemeldet
- `katalog.nummernStand` query · angemeldet – Stand des Hallenplans für die Seite „Katalognummern“: Steht ein fester Plan mit Tieren, ist „Nach Hallenplan vergeben“ (`nummernNachPlan`) der empf …
- `katalog.nummernVergeben` mutation · admin – Vor dem Festschreiben: alle Nummern lückenlos neu.
- `katalog.nummernNachPlan` mutation · admin – Nach dem Umstellen im Hallenplan: Nummern in der Reihenfolge, in der die Käfige jetzt im (festgeschriebenen) Plan stehen (siehe `planFolge`).
- `katalog.gedrucktSetzen` mutation · admin

### routers/katalog-gestaltung.ts (336 Z.) → `katalogGestaltung`

- `katalogGestaltung.laden` query · angemeldet
- `katalogGestaltung.speichern` mutation · admin
- `katalogGestaltung.bildHochladen` mutation · admin
- `katalogGestaltung.bildAngabenSetzen` mutation · admin – Urheber, Lizenz und Quelle eines Vereinsbilds (Bildnachweis im Katalog).
- `katalogGestaltung.bildLoeschen` mutation · admin
- `katalogGestaltung.beitragSpeichern` mutation · admin
- `katalogGestaltung.beitragLoeschen` mutation · admin
- `katalogGestaltung.beitraegeOrdnen` mutation · admin – Neue Reihenfolge einer Art (Grußworte, Anzeigen, Seiten) als Liste der IDs.

### routers/katalog.ts (16 Z.)
Katalog und Halle.

Setzt Teile zu einem Router zusammen.

### routers/kontoauszug.ts (159 Z.) → `kontoauszug`
Kontoauszug-Import (Entscheidung 023), nur Administratoren: Datei aus dem Onlinebanking (camt.053 oder CSV) prüfen – Gutschriften mit Vorschlag zur …

- `kontoauszug.pruefen` mutation · admin – Datei lesen und zuordnen – bucht nichts.
- `kontoauszug.buchen` mutation · admin – Ausgewählte Gutschriften buchen.

### routers/lastschrift.ts (318 Z.) → `lastschrift`
SEPA-Lastschrift für das Standgeld (Entscheidung 018), nur Administratoren: Gläubiger-ID des Vereins, Mandate der Aussteller, je Schau eine Lastsch …

- `lastschrift.einstellungen` query · admin
- `lastschrift.glaeubigerIdSetzen` mutation · admin
- `lastschrift.mandate` query · admin – Mandate eines Ausstellers (IBAN gekürzt).
- `lastschrift.mandatAnlegen` mutation · admin – Mandat erfassen (unterschriebenes Formular).
- `lastschrift.mandatWiderrufen` mutation · admin
- `lastschrift.uebersicht` query · admin – Vorschau: was jetzt eingezogen würde, wer ein ungültiges Mandat hat, die offene Datei und frühere Läufe.
- `lastschrift.erstellen` mutation · admin – Lastschriftdatei festlegen; auf Wunsch geht an jeden Zahler mit E-Mail die Vorabankündigung.
- `lastschrift.datei` query · admin – Die XML-Datei der offenen Lastschrift (bei jedem Abruf derselbe Inhalt).
- `lastschrift.verwerfen` mutation · admin
- `lastschrift.buchen` mutation · admin – Die Bank hat eingezogen: je Posten eine Zahlung „Lastschrift“ zum Fälligkeitstag, Mandate als genutzt markiert.
- `lastschrift.ruecklastschrift` mutation · admin – Rücklastschrift: der Betrag kam zurück – Gegenbuchung, das Meldegeld ist wieder offen.

### routers/meisterschaft.ts (37 Z.) → `meisterschaft`
Meisterschaften einer Schau (Entscheidung 014): Regeln lesen und speichern (Ausstellungsleitung, mit Protokoll), Vorlagen, Ergebnisse.

- `meisterschaft.regeln` query · angemeldet – Regeln der Schau (gelesen und ergänzt) und die Vorlagen.
- `meisterschaft.speichern` mutation · admin
- `meisterschaft.ergebnisse` query · angemeldet – Ergebnisse aller Meisterschaften (intern, mit allen Namen).

### routers/meldung.ts (452 Z.) → `meldung`

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

### routers/oeffentlich.ts (451 Z.) → `oeffentlich`

- `oeffentlich.schau` query · öffentlich
- `oeffentlich.rechtstexte` query · öffentlich – Impressum (§ 5 DDG) und Datenschutzhinweise (Art. 13 DSGVO) des ausrichtenden Vereins.
- `oeffentlich.farbenschlagSuche` query · öffentlich
- `oeffentlich.melden` mutation · öffentlich
- `oeffentlich.meineMeldung` query · öffentlich
- `oeffentlich.onlineVeroeffentlichung` mutation · öffentlich – Einwilligung in die Online-Veröffentlichung erteilen oder widerrufen (Art. 7 Abs. 3 DSGVO) – so einfach wie die Erteilung.
- `oeffentlich.ergebnisse` query · öffentlich

### routers/preise.ts (299 Z.) → `preise`

- `preise.uebersicht` query · angemeldet
- `preise.vergeben` mutation · admin
- `preise.entfernen` mutation · admin
- `preise.stiftungSpeichern` mutation · admin
- `preise.stiftungBarErhalten` mutation · admin – Bar übergebene Stiftung ohne Meldung: als Einlage ins Kassenbuch (mit Eigenbeleg) und als eingegangen vermerken.
- `preise.stiftungLoeschen` mutation · admin
- `preise.freigeben` mutation · admin – Gibt die Ergebnisse frei (öffentlich sichtbar, Bewertung geschlossen).

### routers/preisrichter.ts (438 Z.) → `preisrichter`

- `preisrichter.liste` query · angemeldet
- `preisrichter.speichern` mutation · admin
- `preisrichter.pinErzeugen` mutation · admin – Erzeugt eine neue 8-stellige PIN für das Tablet.
- `preisrichter.sperreAufheben` mutation · admin – Hebt die Wartezeit nach PIN-Fehlversuchen auf, ohne eine neue PIN zu vergeben.
- `preisrichter.loeschen` mutation · admin
- `preisrichter.einteilungSetzen` mutation · admin
- `preisrichter.einteilungVorschlagen` query · admin
- `preisrichter.zuteilung` query · angemeldet – Einteilung nach Rassen: alle gemeldeten Rassen (offene und bestätigte Meldungen) in Ausstellungsfolge mit Tierzahl und Farbenschlägen, dazu die ges …
- `preisrichter.zuteilungSetzen` mutation · admin – Einteilung nach Rassen speichern.
- `preisrichter.zuteilungVorschlagen` query · admin – Vorschlag: gleichmäßig verteilen in der Folge Sparte, Rasse, Farbenschlag (ohne die Blöcke für Stämme – so liegt jede Rasse beisammen und wird nur …
- `preisrichter.einteilungJugendSetzen` mutation · admin – Jugend in der Einteilung nach Rassen: mit ihrer Rasse (Vorgabe) oder separat mit eigenen Zeilen und Preisrichtern.

### routers/rassebild.ts (107 Z.) → `rassebild`
Rassebilder: ansehen (alle Benutzer) und pflegen (Ausstellungsleitung).

- `rassebild.liste` query · angemeldet – Alle Rassen eines Verzeichnisses mit ihrem Bild (falls vorhanden).
- `rassebild.hochladen` mutation · admin – Bild hochladen oder ersetzen (von Hand gepflegt = geprüft).
- `rassebild.angabenSetzen` mutation · admin – Urheber, Lizenz, Quelle und „geprüft“ ändern.
- `rassebild.loeschen` mutation · admin

### routers/schau/anlegen.ts (329 Z.) → `schau`
Schau anlegen (leer oder aus einer Vorlage), Demodaten einer Testschau, Schau löschen und als Testschau kennzeichnen.

- `schau.anlegen` mutation · admin – Neue Schau anlegen – leer mit Startwerten oder aus einer früheren Schau des Vereins als Vorlage.
- `schau.demodatenNeu` mutation · admin – Testschau: Demodaten neu einspielen – Meldungen, Test-Aussteller, Geld, Katalog und Bewertungen weg, frische Demodaten bis zur Einlieferung.
- `schau.loeschen` mutation · admin – Löscht eine leere Schau (z. B. zum Ausprobieren angelegt): nur in der Vorbereitung, ohne Meldungen, Geld, Belege oder Stiftungen, mit eingetipptem …
- `schau.alsTestschau` mutation · admin – Eine bestehende Schau als Testschau kennzeichnen (z. B. eine zum Üben angelegte mit Demo-Meldungen): ihre Aussteller werden Test-Aussteller und ver …
- `schau.testschauVorschau` query · admin – Vor dem Kennzeichnen: wer würde Test-Aussteller, wer ist echt (und verhindert es)?

### routers/schau/einstellungen.ts (239 Z.) → `schau`
Einstellungen einer Schau: Felder speichern, Reihenfolge der Katalognummern, Teilschauen und Notenskala.

- `schau.aktualisieren` mutation · admin
- `schau.katalogSortierungSetzen` mutation · admin – Reihenfolge der Katalognummern (Kriterien in Rangfolge, ausgeschaltet, umgekehrt; siehe SORTIER_KRITERIEN).
- `schau.teilschauenSetzen` mutation · admin – Teilschauen (Entscheidung 016) in Katalogfolge.
- `schau.notenskalaSetzen` mutation · admin

### routers/schau/gebuehren.ts (134 Z.) → `schau`
Gebühren und Preisarten einer Schau setzen, ändern und löschen (gesperrt, sobald Geld oder Preise daran hängen).

- `schau.gebuehrenSetzen` mutation · admin
- `schau.preisartSpeichern` mutation · admin – Preisart anlegen oder ändern.
- `schau.preisartLoeschen` mutation · admin

### routers/schau/phase.ts (185 Z.) → `schau`
Phase der Schau: absagen und Phase wechseln (mit den Prüfungen vor Meldephase, Schau und Abschluss).

- `schau.absagen` mutation · admin – Schau absagen (z. B. Ausstellungsverbot wegen Tierseuche, § 7 Abs. 5 GeflPestSchV): nur bis vor der Einlieferung.
- `schau.phaseSetzen` mutation · admin

### routers/schau/protokoll-post.ts (59 Z.) → `schau`
Protokoll der Schau (Suche, Prüfung der Hash-Kette) und Postausgang des Vereins.

- `schau.protokoll` query · angemeldet
- `schau.protokollPruefen` query · angemeldet – Prüft die Hash-Kette des Protokolls: wurde etwas nachträglich verändert?
- `schau.postausgang` query · admin – Postausgang des Vereins: nicht versandte Mails zuerst, damit ein gestörter Mailserver auffällt.
- `schau.postErneutSenden` mutation · admin – Nicht versandte Mail erneut senden (z. B. nach Korrektur der Mailserver-Einstellungen).

### routers/schau/uebersicht.ts (82 Z.) → `schau`
Schauen lesen: Verzeichnis der Veterinärämter, Liste der Schauen, eine Schau mit Gebühren und Preisarten, Übersicht.

- `schau.veterinaeraemter` query · angemeldet – Verzeichnis der zuständigen Veterinärämter (öffentliche Behördenangaben mit Quelle, siehe daten/veterinaeraemter.json) für die Vorschläge im Feld „ …
- `schau.liste` query · angemeldet
- `schau.get` query · angemeldet
- `schau.uebersicht` query · angemeldet

### routers/schau.ts (15 Z.)
Schauen: anlegen, lesen, Einstellungen, Phase, Gebühren und Preisarten, Protokoll und Postausgang.

Setzt Teile zu einem Router zusammen.

### routers/spenden.ts (204 Z.) → `spenden`
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

### routers/stammdaten.ts (268 Z.) → `stammdaten`

- `stammdaten.gliederung` query · angemeldet – Sparten und Rassen einer Version – für die Vorschläge beim Ergänzen.
- `stammdaten.ergaenzen` mutation · admin – Ergänzt ein eingespieltes Verzeichnis von Hand um Sparte, Rasse und Farbenschläge.
- `stammdaten.gruppenSetzen` mutation · admin – BDRG-Gruppen je Rasse pflegen (A, Z1, BV …; leer = keine).
- `stammdaten.versionen` query · angemeldet
- `stammdaten.importieren` mutation · admin
- `stammdaten.loeschen` mutation · admin – Löscht nur eigene Versionen des Vereins; die des Betreibers (ohne Verein) bleiben.
- `stammdaten.suche` query · angemeldet
- `stammdaten.baum` query · angemeldet

### routers/termine.ts (261 Z.) → `termine`
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

### abrechnung.tsx (443 Z.) – `/schau/:schauId/abrechnung`
Prozeduren: auth.status, kasse.abrechnung, kasse.auszahlen, kasse.auszahlungStornieren, kasse.ueberweisungenBuchen, kasse.ueberweisungsdatei, kasse.ueberweisungsdateiErstellen, kasse.ueberweisungsdateiVerwerfen, meldung.erstattungenBuchen, meldung.zuErstatten, schau.get

### aussteller-a-bogen.tsx (57 Z.)
Prozeduren: druckvorlage.serienbriefAnzahl, schau.liste

### aussteller-mandate.tsx (95 Z.)
Prozeduren: lastschrift.mandatAnlegen, lastschrift.mandatWiderrufen, lastschrift.mandate

### aussteller.tsx (484 Z.) – `/aussteller`
Prozeduren: schau.liste, verein.aussteller, verein.ausstellerDaten, verein.ausstellerLoeschen, verein.ausstellerSpeichern, verein.vereinsangaben, verein.vereinsnamenSetzen

### benutzer-bearbeiten.tsx (241 Z.)
Seite eines Benutzers (für Administratoren): Angaben, Zugang, Passwort neu setzen, Zwei-Faktor zurücksetzen.
Prozeduren: auth.benutzerAbmelden, auth.benutzerAktiv, auth.benutzerLoeschen, auth.benutzerPasswortSetzen, auth.benutzerRolle, auth.benutzerSpeichern, auth.benutzerWillkommen, auth.sperreAufheben, auth.zweiFaktorZuruecksetzen

### benutzer-eigener-zugang.tsx (145 Z.)
Eigener Zugang: Passwort ändern und Zwei-Faktor-Anmeldung einrichten oder abschalten.
Prozeduren: auth.passwortAendern, auth.zweiFaktorAbschalten, auth.zweiFaktorBestaetigen, auth.zweiFaktorEinrichten, auth.zweiFaktorStatus

### benutzer-teile.tsx (57 Z.)
Benutzer: gemeinsame Teile der Seiten (Rollennamen, Statusmarken, Rücklink, Neuladen nach Änderungen).

### benutzer.tsx (260 Z.) – `/benutzer`, `/benutzer/neu`, `/benutzer/:benutzerId`
Prozeduren: auth.benutzerAnlegen, auth.benutzerGet, auth.benutzerListe, auth.status

### bewertung.tsx (335 Z.) – `/schau/:schauId/bewertung`
Prozeduren: auth.status, bewertung.liste, bewertung.obmannBestaetigen, bewertung.setzen, bewertung.zuruecksetzen

### briefvorlage.tsx (281 Z.) – `/verein/briefvorlage`
Prozeduren: druckvorlage.brief, druckvorlage.briefSpeichern, druckvorlage.serienbriefAnzahl, schau.liste

### druckvorlage-vorschau.tsx (159 Z.)

### druckvorlage.tsx (231 Z.) – `/verein/druckvorlagen/:vorlageId`
Prozeduren: druckvorlage.liste, druckvorlage.speichern, druckvorlage.vorgabe

### einladung.tsx (101 Z.) – `/einladung`
Prozeduren: auth.einladungAnnehmen, auth.einladungPruefen, auth.status

### einlieferung.tsx (521 Z.) – `/schau/:schauId/einlieferung`
Prozeduren: auth.status, halle.gesundheit, halle.gesundheitErfassen, halle.gesundheitFreigeben, halle.kaefigSetzen, halle.ringnummerSetzen, halle.statusSetzen, halle.suche, halle.vetSetzen, meldung.zahlungErfassen, schau.get

### einstellungen-druck.tsx (147 Z.)
Prozeduren: druckvorlage.formate, druckvorlage.formateSetzen, druckvorlage.fuerSchau, druckvorlage.fuerSchauAnpassen, druckvorlage.waehlen

### einstellungen-meisterschaften.tsx (269 Z.)
Prozeduren: meisterschaft.regeln, meisterschaft.speichern

### einstellungen-notenskala.tsx (74 Z.)
Prozeduren: schau.notenskalaSetzen

### einstellungen-preise.tsx (263 Z.)
Prozeduren: schau.gebuehrenSetzen, schau.preisartLoeschen, schau.preisartSpeichern

### einstellungen-stammangaben.tsx (337 Z.)
Prozeduren: schau.aktualisieren, stammdaten.versionen

### einstellungen-teilschauen.tsx (73 Z.)
Prozeduren: schau.teilschauenSetzen

### einstellungen-verwalten.tsx (212 Z.)
Prozeduren: schau.absagen, schau.alsTestschau, schau.demodatenNeu, schau.loeschen, schau.testschauVorschau

### einstellungen-vetamt.tsx (89 Z.)
Prozeduren: schau.veterinaeraemter

### einstellungen.tsx (133 Z.) – `/schau/:schauId/einstellungen`
Prozeduren: auth.status, schau.get, schau.protokoll

### fehler.tsx (46 Z.)

### hallenplan-3d-bausteine.ts (242 Z.)
Bausteine der 3D-Halle: Texturen (Gitter, Stoff), Geometrien (Kasten, Schürzen, Innenseiten), Figuren, Schilder.

### hallenplan-3d-decke.ts (127 Z.)
Decke der 3D-Halle (Entscheidung 028): Holzdecke aus Profilbrettern – flach oder als Satteldach –, Leimbinder entlang der Decke, Giebel an den Stir …

### hallenplan-3d-export.test.ts (17 Z.)

### hallenplan-3d-export.ts (23 Z.)
3D-Modell herunterladen (Entscheidung 028): was in der Ansicht gerade ausgeblendet ist, kommt voll ins Modell.

### hallenplan-3d-folie.test.ts (16 Z.)

### hallenplan-3d-folie.ts (15 Z.)
Schalter „Folie“ in der 3D-Ansicht (Entscheidung 028): nur die Ansicht, gespeichert wird nichts.

### hallenplan-3d-landschaft.ts (288 Z.)
Umgebung der 3D-Halle (nur zur Anschauung, ohne Maße): Himmel mit Wolken, Wiese, ein heller Hof um die Halle, vor dem Haupteingang ein Parkplatz, g …

### hallenplan-3d-licht.test.ts (26 Z.)

### hallenplan-3d-licht.ts (23 Z.)

### hallenplan-3d-raum.ts (260 Z.)
Der Raum der 3D-Halle nach ihrem Aussehen (Entscheidung 028): Boden mit Belag, Folie und Meterraster, Spielfeldlinien, Innenseiten der Wände mit Pr …

### hallenplan-3d-seite.tsx (56 Z.) – `/schau/:schauId/hallenplan/3d`
Hallenplan in 3D als eigene Seite (eigener Browser-Tab, ohne Seitenleiste): zeigt den gespeicherten Stand des Plans.
Prozeduren: auth.status, katalog.hallenplan, schau.get

### hallenplan-3d-steuerkreuz.tsx (63 Z.)
Steuerkreuz unten rechts in der 3D-Ansicht – für Tablet und Maus, was am Rechner die Tasten tun: gehen, drehen, zoomen (solange gedrückt) und die g …

### hallenplan-3d-steuerung.ts (347 Z.)
Bewegung der Kamera in der 3D-Ansicht über das Ziehen mit Maus oder Finger hinaus: weiches Auslaufen, Zoom zum Mauszeiger, per Doppelklick sanft hi …

### hallenplan-3d-texturen.ts (323 Z.)
Texturen der 3D-Halle, aus kleinen Canvas-Bildern gerechnet (keine Bilddateien): Bodenbeläge (Mosaikparkett, Sportboden, Estrich), Innenwand mit Pr …

### hallenplan-3d-tueren.ts (157 Z.)
Türen in den Eingängen der 3D-Halle (Entscheidung 028): geschlossen in der Öffnung, leicht zurückgesetzt in der Wand, von beiden Seiten zu sehen – …

### hallenplan-3d-welt.ts (564 Z.)
Die 3D-Szene der Halle: Licht, Landschaft, Boden, Wände, Käfige, Tiere, Volieren, Möbel, Beschriftungen, Kamera und Steuerung.

### hallenplan-3d.tsx (231 Z.)
Hallenplan in 3D: die Halle räumlich – drehen, zoomen, verschieben, von oben oder im Gang in Augenhöhe, mit Tasten oder Steuerkreuz gehen und als a …

### hallenplan-aktionen.ts (225 Z.)
Werkzeuge des Hallenplan-Editors für die Auswahl und für neue Teile: am Raster ausrichten, drehen, an den Platz zurück, Leeres entfernen, Teile und …

### hallenplan-ausrichten.test.ts (103 Z.)

### hallenplan-ausrichten.ts (76 Z.)
Käfige im Editor ausrichten, wenn sie gestellt werden (ohne React): nach Verschieben, Pfeiltasten, Drehen und Einsetzen.

### hallenplan-aussehen.tsx (107 Z.)
Abschnitt „Aussehen (3D)“ in den Eigenschaften der Halle (Entscheidung 028).

### hallenplan-befehle.ts (289 Z.)
Befehle des Hallenplan-Editors, die über den Entwurf hinausgehen: Rückgängig/Wiederholen, Tier versetzen, nach Plan nummerieren, Einstellungen der …
Prozeduren: katalog.nummernNachPlan, katalog.tierVersetzen, katalog.wandreiheStellen

### hallenplan-bereinigt.test.ts (26 Z.)

### hallenplan-bild-bedienung.ts (310 Z.)
Bedienung der Hallenplan-Zeichnung: Teile greifen, ziehen und loslassen (mit Prüfung gegen Wände und andere Teile), Auswahlrahmen, Fläche aufziehen …

### hallenplan-bild.tsx (489 Z.)
Zeichnung des Hallenplans (`PlanBild`): Reihen, Käfige, Flächen und Objekte als SVG, Auswahl, Ziehen und Zoomen.

### hallenplan-eigenschaften.tsx (520 Z.)
Eigenschaften im Hallenplan: rechte Leiste zur Auswahl (`Eigenschaften`) und die Einstellungen der Halle (`HalleEigenschaften`) mit ihren Eingabefe …

### hallenplan-entwuerfe.tsx (177 Z.)
Prozeduren: hallenentwurf.entscheiden, hallenentwurf.laden, hallenentwurf.liste, hallenentwurf.loeschen, hallenentwurf.speichern, hallenentwurf.umbenennen

### hallenplan-entwurf.ts (242 Z.)
Entwurf des Hallenplan-Editors und alles, was ihn speichert: jede Änderung wirkt sofort im Entwurf und geht der Reihe nach an den Server (`kette`), …
Prozeduren: katalog.halleSetzen, katalog.hallenplan, katalog.planFestschreiben, katalog.planNeuSetzen

### hallenplan-geometrie.ts (574 Z.)
Reine Rechnungen des Hallenplan-Editors (ohne React): Auswahl und Teile, Lage und Versatz von Reihen, Platten und Objekten, Hindernisse (`planKoerp …

### hallenplan-grundriss.tsx (206 Z.)
Grundriss der Halle bearbeiten (Entscheidung 019): Wände ziehen (rechtwinklig, 10-cm-Raster), eine Wand per Doppelklick teilen, „Rechteck“ setzt zu …

### hallenplan-laden.test.ts (21 Z.)

### hallenplan-laden.ts (20 Z.)
Was die Seite „Hallenplan“ beim Laden zeigt (Seite hallenplan.tsx).

### hallenplan-meterfeld.tsx (59 Z.)
Eingabefelder der Hallen-Eigenschaften: Zahl mit Einheit, Übernahme mit Enter, Meter-Feld (gespeichert in cm).

### hallenplan-nummerfolge.tsx (73 Z.)

### hallenplan-speichern.test.ts (23 Z.)

### hallenplan-speichern.ts (24 Z.)
Knopf „Speichern“ und Speicheranzeige im Hallenplan (Seite hallenplan.tsx).

### hallenplan-teile.tsx (269 Z.)
Kleine Teile des Hallenplans: Muster und Legende, Tiere ohne Platz, Sparten in den Reihen, Angaben zu einem Käfig, Schalter „Automatisch planen“.
Prozeduren: katalog.kaefigInfo

### hallenplan-tuer.tsx (29 Z.)
Auswahl „Tür“ eines gewählten Eingangs oder Ausgangs (3D, Entscheidung 028): wie Wand, Glastür, Holztür oder offen.

### hallenplan-uebersicht.tsx (219 Z.)
Anzeige unter dem Hallenplan: Legende der Zeichnung, „Platz“ (gestellt, ohne Platz, frei) und die Aufbauliste je Reihe.

### hallenplan-vorschlaege.tsx (208 Z.)
Stellvorschläge: dieselbe Halle in allen möglichen Aufstellungen, je mit Skizze (`HallenSkizze`).
Prozeduren: katalog.planNeuSetzen, katalog.stellVorschlaege, katalog.stellVorschlaegeEntwurf

### hallenplan-werkzeuge.tsx (303 Z.)
Bausteine der Werkzeugleiste im Hallenplan-Editor: Symbole, Werkzeugknöpfe mit Tooltip (Name und Tastenkürzel), Gruppen und aufklappbare Menüs.

### hallenplan-werkzeugleiste.tsx (212 Z.)
Werkzeugleiste des Hallenplan-Editors (Auswählen, Einsetzen, Drehen, Entfernen, Zoom, Menü „Plan“).

### hallenplan-wiederholen.test.ts (329 Z.)

### hallenplan-wiederholen.ts (122 Z.)
Automatisches Wiederholen beim Speichern im Hallenplan-Editor (hallenplan-entwurf.ts): rein, mit eingesetztem Senden und Warten.

### hallenplan.tsx (573 Z.) – `/schau/:schauId/hallenplan`
Seite „Hallenplan“: neue Halle anlegen und der Editor (`Plan`) mit Speichern, Rückgängig, Auswahl und Tastatur.
Prozeduren: katalog.halleSetzen, katalog.hallenplan

### hilfe.tsx (190 Z.) – `/hilfe`, `/hilfe/:teil`
Prozeduren: auth.status

### import.tsx (432 Z.) – `/import`
Prozeduren: datenimport.laeufe, datenimport.lesen, datenimport.pruefen, datenimport.uebernehmen, datenimport.zuruecknehmen, schau.liste

### kaefige.tsx (533 Z.) – `/schau/:schauId/kaefige`
Prozeduren: katalog.aufstellerSetzen, katalog.kaefigMassSetzen, katalog.kaefigRegelSetzen, katalog.kaefigbedarf, katalog.plattenSetzen, katalog.sockelBildEntfernen, katalog.sockelBildSetzen

### kassenbuch.tsx (337 Z.) – `/schau/:schauId/kassenbuch`
Prozeduren: kasse.belege, kasse.kassenbewegung, kasse.kassenbuch, kasse.tagesabschluss

### katalog-gestalten-aufbau.tsx (279 Z.)

### katalog-gestalten-bausteine.tsx (55 Z.)

### katalog-gestalten-bilder.tsx (184 Z.)
Prozeduren: katalogGestaltung.bildAngabenSetzen, katalogGestaltung.bildHochladen, katalogGestaltung.laden

### katalog-gestalten-form.ts (33 Z.)

### katalog-gestalten-teile.tsx (235 Z.)
Prozeduren: katalogGestaltung.beitraegeOrdnen, katalogGestaltung.beitragLoeschen, katalogGestaltung.beitragSpeichern

### katalog-gestalten-titelseite.tsx (100 Z.)
Prozeduren: katalogGestaltung.bildLoeschen

### katalog-gestalten.tsx (203 Z.) – `/schau/:schauId/katalog/gestalten`
Prozeduren: auth.status, katalogGestaltung.laden, katalogGestaltung.speichern, schau.get, termine.laden

### katalog-reihenfolge.tsx (96 Z.)
Prozeduren: schau.katalogSortierungSetzen

### katalog-vorschau.tsx (145 Z.)

### katalog.tsx (232 Z.) – `/schau/:schauId/katalog`
Prozeduren: auth.status, katalog.gedrucktSetzen, katalog.liste, katalog.nummernNachPlan, katalog.nummernStand, katalog.nummernVergeben, schau.get

### kommende-schauen.tsx (563 Z.)
Prozeduren: termine.aboAbrufen, termine.aboLoeschen, termine.aboSpeichern, termine.abweichung, termine.druckenSetzen, termine.laden, termine.loeschen, termine.pruefen, termine.speichern, termine.veroeffentlichenSetzen, termine.wahlSetzen

### kontoauszug.tsx (177 Z.) – `/schau/:schauId/kontoauszug`
Prozeduren: kontoauszug.buchen, kontoauszug.pruefen

### lastschrift.tsx (218 Z.) – `/schau/:schauId/lastschrift`
Prozeduren: lastschrift.buchen, lastschrift.datei, lastschrift.erstellen, lastschrift.ruecklastschrift, lastschrift.uebersicht, lastschrift.verwerfen

### meisterschaften.tsx (90 Z.) – `/schau/:schauId/meisterschaften`
Prozeduren: meisterschaft.ergebnisse

### meldung-bearbeiten.tsx (464 Z.) – `/schau/:schauId/meldungen/neu`, `/schau/:schauId/meldungen/:meldungId`
Prozeduren: meldung.adressVorschlaege, meldung.ausstellerSuche, meldung.bestaetigungSenden, meldung.get, meldung.speichern, meldung.statusSetzen, meldung.verfallBuchen, meldung.zahlungErfassen, meldung.zahlungStornieren, schau.get, stammdaten.suche

### meldungen.tsx (129 Z.) – `/schau/:schauId/meldungen`
Prozeduren: meldung.liste, schau.get

### oeffentlich.tsx (578 Z.) – `/s/:slug`, `/s/:slug/meldung/:token`, `/s/:slug/ergebnisse`, `/s/:slug/impressum`, `/s/:slug/datenschutz`
Prozeduren: oeffentlich.ergebnisse, oeffentlich.farbenschlagSuche, oeffentlich.meineMeldung, oeffentlich.melden, oeffentlich.onlineVeroeffentlichung, oeffentlich.rechtstexte, oeffentlich.schau

### preise.tsx (490 Z.) – `/schau/:schauId/preise`
Prozeduren: auth.status, preise.entfernen, preise.freigeben, preise.stiftungBarErhalten, preise.stiftungLoeschen, preise.stiftungSpeichern, preise.uebersicht, preise.vergeben, schau.get

### preisrichter-form.tsx (108 Z.)
Dialog „Preisrichter hinzufügen“ bzw. „Preisrichter bearbeiten“: Angaben, Sparten, BDRG-Gruppen, Obmann und Zusage.
Prozeduren: preisrichter.speichern, stammdaten.gliederung

### preisrichter-rassen.tsx (231 Z.)
Prozeduren: preisrichter.einteilungJugendSetzen, preisrichter.zuteilung, preisrichter.zuteilungSetzen, preisrichter.zuteilungVorschlagen

### preisrichter.tsx (352 Z.) – `/schau/:schauId/preisrichter`
Prozeduren: preisrichter.einteilungSetzen, preisrichter.einteilungVorschlagen, preisrichter.liste, preisrichter.loeschen, preisrichter.pinErzeugen, preisrichter.sperreAufheben, preisrichter.zuteilung, schau.get

### protokoll.tsx (138 Z.) – `/schau/:schauId/protokoll`
Prozeduren: schau.protokoll, schau.protokollPruefen

### rassebilder.tsx (282 Z.)
Prozeduren: rassebild.angabenSetzen, rassebild.hochladen, rassebild.liste, rassebild.loeschen

### richter-anmeldung.tsx (170 Z.)
Preisrichter-Tablet: Anmeldung mit Name und PIN, Hinweis auf noch nicht übertragene Bewertungen im Gerät.
Prozeduren: richter.anmeldeInfo, richter.anmelden

### richter-geraet.ts (97 Z.)
Preisrichter-Tablet: Datentypen und was im Gerät liegt (Schlüssel in IndexedDB/localStorage, gemerkter Preisrichter, Aufräumen).

### richter-karte.tsx (269 Z.)
Preisrichter-Tablet: Bewertungskarte eines Tieres (Note, Texte mit Bausteinen, Preise).

### richter-obmann.tsx (43 Z.)
Preisrichter-Tablet: Ansicht für den Obmann zum Bestätigen von Noten.

### richter-tablet.tsx (552 Z.)
Preisrichter-Tablet nach der Anmeldung: Tierliste, Ausgang und Abgleich mit dem Server, abgelehnte Bewertungen.

### richter.tsx (55 Z.) – `/richter/:slug`
Bewertung am Tablet für Preisrichter.
Prozeduren: auth.status

### schau-liste.tsx (209 Z.) – `/`
Prozeduren: auth.status, schau.anlegen, schau.liste

### spende-erfassen.tsx (184 Z.)
Prozeduren: spenden.erfassen, spenden.spender, spenden.spenderSpeichern

### spenden.tsx (174 Z.) – `/schau/:schauId/spenden`
Prozeduren: spenden.bestaetigen, spenden.liste, spenden.steuer, spenden.stornieren

### spender.tsx (187 Z.) – `/spender`
Prozeduren: spenden.bestaetigungStornieren, spenden.sammelbestaetigen, spenden.spender, spenden.spenderDetails, spenden.spenderSpeichern

### stammdaten-gruppen.tsx (71 Z.)
BDRG-Gruppen je Rasse eines eigenen Verzeichnisses pflegen (Rassen und Farbenschläge → „Gruppen“).
Prozeduren: stammdaten.gliederung, stammdaten.gruppenSetzen

### stammdaten.tsx (316 Z.) – `/stammdaten`
Prozeduren: auth.status, stammdaten.baum, stammdaten.ergaenzen, stammdaten.gliederung, stammdaten.importieren, stammdaten.loeschen, stammdaten.versionen

### uebersicht.tsx (280 Z.) – `/schau/:schauId`
Prozeduren: auth.status, schau.phaseSetzen, schau.uebersicht

### verein-abmeldung.tsx (56 Z.)
Prozeduren: verein.abmeldung, verein.abmeldungSpeichern

### verein-druckvorlagen.tsx (77 Z.)
Prozeduren: druckvorlage.liste, druckvorlage.loeschen

### verein-lastschrift.tsx (45 Z.)
Prozeduren: lastschrift.einstellungen, lastschrift.glaeubigerIdSetzen

### verein-steuer.tsx (78 Z.)
Prozeduren: spenden.steuer, spenden.steuerSpeichern

### verein.tsx (576 Z.) – `/verein`
Prozeduren: bewertung.textbausteinGrundbestand, bewertung.textbausteinLoeschen, bewertung.textbausteinSpeichern, bewertung.textbausteine, schau.postErneutSenden, schau.postausgang, stammdaten.gliederung, stammdaten.versionen, verein.auskunftPerson, verein.bereinigen, verein.get, verein.speichern

### verkauf.tsx (339 Z.) – `/schau/:schauId/verkauf`
Prozeduren: auth.status, kasse.angebot, kasse.offeneUeberweisungen, kasse.stornieren, kasse.tierSuchen, kasse.verkaeufe, kasse.verkaufen, kasse.zahlungseingangVerkauf, schau.get

## Weitere Dateien

Je Datei: Zeilen, Beschreibung, exportierte Namen.

### Server-Dienste mit Datenbank `apps/server/src/services`

- `aussteller.ts` (183 Z.) – Aussteller-Verwaltung des Vereins: anlegen, Stammdaten ändern, Vereinsmitglied (ohne Meldung, unter „Verein und Datenschutz“). · ausstellerVerwaltungEingabe, eigeneVereinsnamen, speichereAussteller, setzeVereinsnamen, vereinsangabenUebersicht
- `bewertung.ts` (193 Z.) · bewertungEingabe, RICHTER_PHASEN, speichereBewertung, setzeBewertungZurueck
- `bremse.ts` (224 Z.) · Bremse, Wartezeit, anschlussSchluessel, netz48Schluessel, istLokaleAdresse, adressSchluessel
- `datenschutz-lastschrift.ts` (75 Z.) – SEPA-Lastschrift im Datenschutz (Entscheidung 018): was über Mandate und Einzüge in die Auskunft gehört (Art. 15), was der Löschwunsch entfernt (Ar … · lastschriftAuskunft, loescheLastschriftDaten, bereinigeMandate
- `datenschutz.ts` (593 Z.) · ladeVereinsangaben, ladeAuskunft, ladeAuskunftPerson, loescheAussteller, bereinige, starteBereinigung
- `einteilung-vorschlag.ts` (189 Z.) – Vorschlag für die Einteilung nach Nummern (und über Nummern je Farbenschlag auch nach Rassen): Tiere in Katalogfolge auf die Preisrichter verteilen … · schlageEinteilungVor
- `einteilung.ts` (101 Z.) · sperreEinteilung, einteilTier, einteilSchluessel, ladeRegeln, jugendSeparatEingeteilt, bereicheDerSchau, rassenEinteilungAnwenden, einteilungNachStatus
- `eintraege.ts` (259 Z.) · ladeEintraege, NICHT_VEROEFFENTLICHT, verdeckeNamen, ausstellerAnzeige, bezeichnung, alsFolge, meldebetrag, meldebetraege, skalaVon
- `ersteinrichtung.ts` (111 Z.) – Ersteinrichtung: Verein und erster Administrator. · ersteinrichtungAngaben, BEREITS_EINGERICHTET, richteEinMitPasswort, richteEinPerBefehl
- `fehlertext.ts` (5 Z.) · kurzerFehler
- `gesundheitspruefung.ts` (66 Z.) – Angaben der Gesundheitsprüfung `GET /api/gesund` neben `ok` und `version` (Entscheidung 024): wann die letzte Sicherung lief, ob Migrationen offen … · GESUND_UNBEKANNT, gesundAngaben
- `import.ts` (384 Z.) – Import aus Altprogrammen (Entscheidung 015): Tabelle prüfen (Zeilen, Aussteller wiedererkennen, Rassen abgleichen), übernehmen (über dieselben Wege … · rassenSchluessel, importPruefen, importUebernehmen, importZuruecknehmen, importLaeufe
- `kasse.ts` (138 Z.) · sperreKasse, SEPA_ERSTELLT, SEPA_VERWORFEN, SEPA_GEBUCHT, offenerLauf, schliesseLauf, LASTSCHRIFT_OFFEN, offeneLastschrift, offeneLastschriftenDesVereins, inOffenerLastschrift, offeneStornoZahlungen, offeneUeberweisungsverkaeufe, pruefeNichtAbgeschlossen, pruefeNichtAbgerechnet
- `kassenbuch.ts` (241 Z.) · tagDe, ladeKassenbuch, sollBestand, archiviereBeleg, ladeBeleg, zweitschrift, belegListe, archiviereKaufbeleg, archiviereKassenbeleg, archiviereQuittung, archiviereSpendenquittung
- `meisterschaften.ts` (76 Z.) – Meisterschaftswertungen einer Schau (Entscheidung 014): Tiere aus Katalog und Bewertung für die Fachregel (packages/domain/src/meisterschaft.ts) au … · meisterschaftTiere, meisterschaftErgebnisse
- `meldung.ts` (509 Z.) · registriernummerFeld, ausstellerEingabe, positionEingabe, meldungEingabe, speichereMeldung, bindungen, hatAuszahlung
- `post.ts` (155 Z.) · smtpOptionen, ohneAdressen, mailStatus, POST_WIEDERHOLEN_MS, MAX_VERSUCHE, naechsterVersuch, sendeMail, sendeMailJetzt, versende, starteMailversand
- `preise.ts` (180 Z.) · vergebePreis, entfernePreis
- `preisrichter-speichern.ts` (128 Z.) – Preisrichter anlegen, ändern und löschen (`preisrichter.speichern`, `.loeschen`): Prüfung der Obmann-Zuordnung (unter Sperre der Preisrichter der S … · gruppenAusEingabe, speicherePreisrichter, loeschePreisrichter
- `protokoll-suche.ts` (136 Z.) · sucheProtokoll, pruefeProtokoll, eigenerKopf, kettenkopf
- `protokoll.ts` (37 Z.) · protokolliere
- `pruefung.ts` (390 Z.) · ONLINE_RESERVIERUNG_STUNDEN, belegteKaefige, zuteilung, offeneStiftungen, GESAMT, ausgestellt, kontingente, checkliste, pruefliste
- `rassebild.ts` (86 Z.) – Rassebilder für den Katalog: prüfen und speichern (Oberfläche und Einspielen aus dem Netz). · RASSEBILD_MAX_BYTES, jpegAnzeige, oeffneBild, pruefeRassebild, speichereRassebild
- `serienbrief.ts` (34 Z.) – Empfänger eines Serienbriefs: Vereinsmitglieder, alle Aussteller des Vereins oder die Aussteller mit bestätigter Meldung zu einer Schau. · SERIENBRIEF_AUSWAHL, serienbriefEmpfaenger
- `spenden-quittung.ts` (34 Z.) – Spendenquittung einer Spende erzeugen (für das Belegarchiv, services/kassenbuch.ts): Briefkopf und Farbe aus der Briefvorlage des Vereins, Hinweis … · spendenquittung
- `spenden.ts` (169 Z.) – Spenden (Entscheidung 013): Spender zum Aussteller finden oder anlegen, Spenden einer Schau mit Eingangstag und Bestätigungsstand laden, Bestätigun … · ladeSteuer, spenderFuerAussteller, meldungsspendeAnlegen, eingangMitMeldegeld, ladeSpenden, sperreBestaetigungen, naechsteBestaetigungsnummer, spenderFuerKatalog, spendenFuerAuskunft
- `termine.ts` (274 Z.) – Kommende Schauen: Termine für die Katalogseite, abonnierte Kalender (iCal) abrufen und abgleichen, eigene Schauen als Kalender. · KALENDER_MAX_BYTES, ladeKommende, eigeneSchauenFuerKalender, KalenderFehler, netzFehler, istInterneAdresse, sichereAufloesung, pruefeKalenderAdresse, holeKalender, aboAbrufen, alleAbosAbrufen, starteTerminabruf
- `testschau.ts` (164 Z.) – Testschauen (Üben, Vorführen) sind von echten Schauen getrennt: Aussteller, die in einer Testschau angelegt oder gemeldet werden, gehören nur ihr ( … · sperreTestschauGeteilt, ausstellerDerSchau, echteAussteller, testSchauIdFuer, pruefeAusstellerZurSchau, sperreTestschauExklusiv, testschauVorschau, KOPIE_AKTION, testKopienVon, kennzeichneAlsTestschau
- `textbausteine-gefieder.ts` (199 Z.) · BAUSTEINE_GEFIEDER
- `textbausteine-gestalt.ts` (124 Z.) · BAUSTEINE_GESTALT
- `textbausteine-grundbestand.ts` (14 Z.) · TEXTBAUSTEINE_LISTE
- `textbausteine-kopf.ts` (212 Z.) · BAUSTEINE_KOPF
- `textbausteine-rumpf.ts` (185 Z.) · BAUSTEINE_RUMPF
- `textbausteine.ts` (50 Z.) · TEXTBAUSTEINE_GRUNDBESTAND, legeTextbausteineAn, TEXTBAUSTEINE_MAX, sperreBausteine, ergaenzeGrundbestand
- `tiergesundheit.ts` (28 Z.) · heuteDe, nachweisStand
- `tierliste.ts` (106 Z.) · ladeTierliste
- `ueberweisung.ts` (54 Z.) – Überweisung des Meldegelds (Entscheidung 021): welche Bankverbindung Aussteller sehen, und je Meldung Verwendungszweck mit Referenz und GiroCode. · girocodeAktiv, bankAngabe, ueberweisung
- `vereinsverzeichnis.ts` (90 Z.) · verzeichnisVorschlaegeZwischengespeichert, verzeichnisVergessen, vereineEinspielen
- `verkaufsliste.ts` (55 Z.) · ladeVerkaufsliste
- `zuwendungsbestaetigung.ts` (95 Z.) – Zuwendungsbestätigungen ausstellen und stornieren (Entscheidung 013). · bestaetigeSpende, sammelbestaetige, storniereBestaetigung
- `zweifaktor.ts` (137 Z.) · base32, ausBase32, neuesGeheimnis, zeitschritt, totp, pruefeTotp, otpauthAdresse, lesbar, hashNotfallcode, neueNotfallcodes, starteZweiterSchritt, ladeZweiterSchritt, zweiterSchrittFehlgeschlagen, beendeZweiterSchritt
- `zwischenspeicher.ts` (38 Z.) · oeffentlichGeaendert, rassebilderGeaendert, termineGeaendert, oeffentlicherStand

### PDFs `apps/server/src/pdf`

- `a-bogen.ts` (324 Z.) – A-Bogen (Meldebogen) zum Ausdrucken: der Aussteller füllt ihn aus, unterschreibt und schickt ihn an die Meldestelle; mit der Unterschrift erkennt e … · aBogenPdf, aBogenFuerAusstellerPdf
- `auskunft.ts` (296 Z.) · auskunftPdf
- `basis.ts` (501 Z.) · MM, SERIF, SERIF_FETT, SERIF_KURSIV, SANS, SANS_FETT, SANS_KURSIV, schriftDatei, registriereSchriften, TINTE, GRAU, HAARLINIE, STANDARDFARBE, kontrast, lesbareFarbe, logoBild, design, mitVermerk, textOhnePlatzAuslassen, erzeugePdf, aufLinie, kicker, briefkopf, fusszeilen, teilSeite, seitenzahlen, tabelle, textImFeld, zeilenUmbrechen, textUmbrochen, angaben, hinweisKastenHoehe, hinweisKasten, unterschrift, ueberschrift, datumDe
- `beleg-blatt.ts` (28 Z.) – Papier der Belege (Kaufbeleg, Einzahlungsquittung, Eigenbeleg, Spendenquittung) nach der Formatvorgabe der Schau (Entscheidung 029): A5 quer wie bi … · belegSeite, schnittlinie
- `bewertungskarte.ts` (325 Z.) – Bewertungskarten nach der Druckvorlage der Schau (Format, Bausteine oder Vordruck-Felder, Versatz) – dazu die Vorschau für den Designer und der Pro … · ladeKartenVorlage, kartenKopf, bewertungskartenPdf, BEISPIEL_KARTEN, zeichneKartenPdf, probedruckPdf
- `bewertungsliste.ts` (142 Z.) – Bewertungsliste je Preisrichter (zum Mitnehmen in die Käfigreihe) wie die Papiervorlage: zwei Listen nebeneinander je A4-Seite, laufend (Formatvorg … · preisrichterListePdf
- `brief.ts` (136 Z.) – Briefe nach der Briefvorlage des Vereins (DIN 5008, Form A oder B): Briefkopf, Rücksendeangabe, Anschrift, Informationsblock, Falzmarken und Fußzeile. · BRIEF_RAENDER, ladeBriefVorlage, briefDesign, briefKopf, belegKopf, briefFuss, serienbriefPdf
- `dokumente-amt.ts` (245 Z.) – Listen für das Veterinäramt: abgegebene Tiere (Verkaufsliste) und Aussteller- und Tierliste. · verkaufslistePdf, tierlistePdf
- `dokumente-gemeinsam.ts` (36 Z.) – Gemeinsame Hilfen der Dokumente einer Schau (dokumente.ts, dokumente-kasse.ts, dokumente-amt.ts): Design aus der Katalog-Gestaltung, Vereinsname, K … · nr, klasse, tier, A4_RAENDER, ladeDesign, verein, kopfzeile, fusstext, breite, unten
- `dokumente-kasse.ts` (352 Z.) – Belege der Kasse: Kaufbeleg mit Ausgabeschein (Verkauf), Kassenbericht der Barkasse, Einzahlungsquittung und Eigenbeleg. · kaufbelegPdf, kassenberichtPdf, kassenbelegPdf
- `dokumente.ts` (500 Z.) · bewertungskartenPdf, ausstellerUnterlagenPdf, abrechnungPdf
- `girocode.ts` (38 Z.) – GiroCode im PDF (Entscheidung 021): QR-Code als Vektorgrafik (scharf in jedem Druck), daneben Bankverbindung und Verwendungszweck. · GIROCODE_GROESSE, qrZeichnen, giroCodeBlock
- `hallenplan.ts` (445 Z.) – Hallenplan als PDF: genau ein Blatt DIN A4 oder A3 (Formatvorgabe der Schau, Entscheidung 029) – der Plan füllt es (Querformat, wenn die Zeichnung … · hallenplanPdf, aufbaulistePdf
- `illustrationen.ts` (31 Z.) – Historische Stiche für Titelseite und Spartenköpfe (apps/server/stiche, Quellen in QUELLEN.md). · stichBild, stichFuer
- `katalog-anhang.ts` (152 Z.) – Katalog-PDF, Anhang: kommende Schauen, Anzeigen der Förderer und Notizseiten bis zur vollen Heftlage. · kommendeSchauenSeite, anzeigenSeiten, notizSeiten
- `katalog-hilfen.ts` (65 Z.) – Katalog-PDF, gemeinsame Hilfen ohne PDF: Kurzvorschau-Auswahl, Anzahltexte („3 Stämme“) und der Bildnachweis (Adressen kürzen, Urheber bereinigen, … · KURZ_JE_ABTEILUNG, kurzauswahl, anzahlText, kurzeAdresse, urheberKurz, bildnachweisTeile, bildnachweis
- `katalog-kontext.ts` (245 Z.) – Katalog-PDF, Grundlage für alle Teile: lädt die Daten der Schau, legt das PDF an und stellt die gemeinsamen Satzhilfen bereit (Seiten, Inhaltsverze … · katalogKontext
- `katalog-schrift.ts` (29 Z.) – Schrift des Katalogs (Entscheidung 032): eine Familie – die gewählte – in drei Schnitten, dazu höchstens die Auszeichnung für den Namen der Schau a … · NORMAL, FETT, KURSIV, AUSZEICHNUNG, ZIFFERN, registriereKatalogSchrift
- `katalog-tierteil.ts` (562 Z.) – Katalog-PDF, Tierteil: zwei oder drei Spalten bzw. Tabelle, Spartenköpfe mit Stich, Rassenköpfe mit Rassebild, Preisrichter-, Klassen- und Tierzeil … · nrVergleich, nrBereich, tierteilSetzen
- `katalog-titel.ts` (179 Z.) – Katalog-PDF, Titelseite: Hintergrund, Titel, Logo, Titelbild bzw. Stich und Termine je Stil. · titelseite
- `katalog-verzeichnisse.ts` (194 Z.) – Katalog-PDF, Verzeichnisse: Rassenverzeichnis, Bildnachweis, Ausstellerverzeichnis und das am Ende nachgetragene Inhaltsverzeichnis mit Impressum. · rassenverzeichnis, bildnachweisSeite, ausstellerverzeichnis, inhaltsverzeichnis
- `katalog-vorspann.ts` (313 Z.) – Katalog-PDF, Inhaltsteile vor dem Tierteil: Grußworte, Ausstellungsleitung und Termine, Preisrichter, Kennzahlen, Preise und Stifter, Bestimmungen, … · vorspann, ehrentafel
- `katalog.ts` (93 Z.) – Katalog-PDF, Einstieg: lädt die Grundlage (katalog-kontext.ts) und setzt die Teile der Reihe nach – Titelseite (katalog-titel.ts), Vorspann und Ehr … · katalogPdf
- `meisterschaften.ts` (54 Z.) – Ergebnisse der Meisterschaften als PDF (A4): je Meisterschaft und Rasse/Farbenschlag die Rangfolge mit den gewerteten Tieren (Katalognummer und Pun … · meisterschaftenPdf
- `preisverteilung.ts` (114 Z.) – Preisverteilung je Preisrichter als PDF: welche Preise er vergeben darf, mit Katalognummer, sobald vergeben, und leeren Zeilen zum Eintragen in der … · preisverteilungPdf
- `spenden.ts` (261 Z.) – Spenden: Zuwendungsbestätigung nach amtlichem Muster (Geld, Sache, Sammelbestätigung mit Anlage) und die einfache Spendenquittung für die Kasse. · zuwendungsbestaetigungPdf, spendenquittungPdf
- `verpflichtung.ts` (149 Z.) – Preisrichterverpflichtung: Brief nach der Briefvorlage des Vereins (Briefkopf, Anschrift im Fenster, Fußzeile wie der B-Bogen) mit der Bitte um Bew … · preisrichterVerpflichtungPdf

### Datenbank `apps/server/src/db`

- `client.ts` (11 Z.) · sql, db
- `geheim-bestand.ts` (64 Z.) – Stellt Altbestand im Klartext auf verschlüsselte Spalten um (läuft bei jedem Start nach den Migrationen; findet es nichts mehr, tut es nichts). · pruefeDatenschluessel, verschluesseleBestand
- `geheim.ts` (112 Z.) – Verschlüsselte Spalten: IBAN, Kontoinhaber, Bankdaten in SEPA-Dateien, Zwei-Faktor-Geheimnis. · PRAEFIX, erlaubeKlartext, datenschluessel, setzeDatenschluesselFuerTest, verschluessele, entschluessele, geheimText, geheimJsonLesen, geheimJson
- `schema-aufzaehlungen.ts` (20 Z.) – Aufzählungstypen der Datenbank (pgEnum) – Phasen, Meldearten, Status, Zahlarten u. a. Über schema.ts exportiert. · phaseEnum, meldeartEnum, gebuehrArtEnum, alterEnum, eingangEnum, meldungStatusEnum, eintragStatusEnum, sondernoteEnum, preisQuelleEnum, rolleEnum, zahlartEnum, erfasstAufEnum, rundungEnum, kontingentBasisEnum, zusageEnum
- `schema-betrieb.ts` (12 Z.) – Betrieb: Angaben für die Gesundheitsprüfung (Entscheidung 024). · sicherung
- `schema-bewertung.ts` (116 Z.) – Preisrichter und Bewertung: Vereinsverzeichnis, Preisrichter, Einteilung, Bewertung, Textbausteine. · vereinsverzeichnis, preisrichter, prEinteilung, prZuteilung, bewertung, textbaustein
- `schema-hallenentwurf.ts` (35 Z.) – Entwürfe des Hallenplans (Entscheidung 017): Je Schau mehrere Varianten speichern und laden; ist entschieden, gehen die übrigen ins Archiv des Vere … · hallenentwurf
- `schema-import.ts` (26 Z.) – Import aus Altprogrammen (Entscheidung 015): je Importlauf, was er angelegt hat – damit „Zurücknehmen“ genau das wieder entfernt, solange nichts we … · importlauf
- `schema-kasse.ts` (79 Z.) – Kassenbuch und Belegarchiv: Kassenbewegungen, Tagesabschlüsse, Belege; SEPA-Überweisungsläufe. · KASSENBEWEGUNG_ARTEN, kassenbewegung, kassenabschluss, beleg, sepaLauf
- `schema-katalog.ts` (142 Z.) – Katalog-Gestaltung: Druckvorlagen, Gestaltung, Bilder, Rassebilder, Beiträge (Grußworte, Anzeigen). · KATALOG_FORMATE, BEITRAG_ARTEN, ANZEIGE_GROESSEN, druckvorlage, katalogGestaltung, bild, rassebild, katalogBeitrag
- `schema-lastschrift.ts` (74 Z.) – SEPA-Lastschrift (Entscheidung 018): Mandate der Aussteller und Lastschriftläufe je Schau. · sepaMandat, lastschriftLauf
- `schema-mandant.ts` (135 Z.) – Mandant (Verein) mit Benutzern und Sitzungen; Stammdaten des Verzeichnisses (Sparten, Rassen, Farbenschläge je Version). · organisation, benutzer, sitzung, stammdatenVersion, sparte, rasse, farbenschlag
- `schema-meldung.ts` (174 Z.) – Aussteller und Meldungen: Aussteller, Meldung, Zahlung des Meldegelds, Katalogeinträge (Tiere). · aussteller, meldung, zahlung, katalogeintrag
- `schema-protokoll.ts` (73 Z.) – Protokoll und Post: Änderungsprotokoll mit Hash-Kette und ihren Vermerken, Postausgang. · aenderung, postausgang, aenderungKette, aenderungGeloescht, aenderungAnonymisiert
- `schema-schau.ts` (152 Z.) – Schau mit ihren Regeln: Schau, Gebühren, Preisarten. · schau, gebuehr, preisart
- `schema-spenden.ts` (115 Z.) – Spenden (Entscheidung 013): Spenderverzeichnis des Vereins, Spenden je Schau und Zuwendungsbestätigungen. · spender, spende, zuwendungsbestaetigung, bestaetigungSpende
- `schema-termine.ts` (68 Z.) – Kommende Schauen: abonnierte Kalender und Termine anderer Schauen für den Katalog. · TERMIN_STATUS, terminabo, schautermin
- `schema-verkauf.ts` (138 Z.) – Preise, Verkauf, Geld: Stiftungen, Preisvergabe, Verkauf mit Zahlungseingang, Tiergesundheit, Auszahlungen. · stiftung, preisvergabe, verkauf, verkaufZahlungseingang, gesundheit, auszahlung
- `schema.ts` (23 Z.) – Datenbankschema (Drizzle) – Einstieg für drizzle.config.ts und alle Importe im Server.
- `schutz.ts` (15 Z.) – Spielt die Schutz-Trigger (schutz.sql) ein: nach Migrationen, nach db:push und in den Tests. · schutzEinspielen
- `spalten.ts` (12 Z.) – Spaltenarten, die mehrere Schemadateien nutzen (die Teildateien schema-*.ts). · ts, created, createdNachSperre, bytea

### Server sonst `apps/server/src`

- `auth.ts` (203 Z.) · COOKIE, COOKIE_RICHTER, sha256, zufallsToken, hashPasswort, pruefePasswort, neueSitzung, sitzungWennUnveraendert, spracheDerSitzung, sitzungsId, beendeSitzung, ladeSitzung, cookieHeader
- `besucher-adresse.ts` (31 Z.) – Adresse des Besuchers für die Bremsen (tRPC-Kontext und öffentliche Dateien), auch hinter einem eigenen Proxy (TRUST_PROXY). · clientIp
- `config.ts` (34 Z.) · config
- `csv.ts` (15 Z.) – CSV für Excel: Semikolon, BOM, Schutz vor Formel-Injektion. · csv
- `datei-druckvorlage.ts` (130 Z.) – Datei-Adressen des Druckvorlagen-Designers (nur Ausstellungsleitung): POST /datei/druckvorlage/vorschau.pdf – Beispielkarten nach der (noch nicht g … · druckvorlageDateien, briefDateien
- `datei-exporte.ts` (318 Z.) – Datei-Adressen der Listen und Exporte (angemeldete Benutzer der eigenen Schau): Kassenbuch (CSV), Protokoll mit Hash-Kette (CSV, JSON), Verkaufslis … · exportDateien
- `datei-hilfen.ts` (49 Z.) – Gemeinsame Bausteine der Datei-Adressen (/datei/...): Zahlen und Daten aus der Adresse prüfen, Schau des angemeldeten Benutzers laden, Datei-Antwor … · zahlAus, datumAus, schauMitBenutzer, schauFuer, datei, pdf, archivPdf
- `datei-katalog.ts` (131 Z.) – Datei-Adressen für Bilder und Katalog (angemeldete Benutzer der eigenen Schau): GET /datei/:schauId/bild/:bildId – Vorschau hochgeladener Katalogbi … · katalogNacheinander, katalogDateien
- `datei-meisterschaften.ts` (47 Z.) – Datei-Adressen der Meisterschaften (angemeldete Benutzer der eigenen Schau): GET /datei/:schauId/meisterschaften.pdf – Ergebnisse zum Aushängen, Na … · meisterschaftDateien
- `datei-oeffentlich.ts` (141 Z.) – Öffentliche Dateien ohne Anmeldung, jeweils mit Bremse je Adresse: GET /o/:id/schauen.ics – eigene Schauen des Vereins als Kalender (iCal) GET /s/: … · katalogVerzeichnis, oeffentlicheDateien
- `datei-spenden.ts` (32 Z.) – Datei-Adresse der Zuwendungsbestätigungen (nur Ausstellungsleitung, nur eigener Verein): GET /datei/zuwendungsbestaetigung/:id.pdf – das beim Ausst … · spendenDateien
- `datei-sprache.ts` (37 Z.) – Fehlertexte der Datei-Adressen (/datei/…, /s/…, /o/…) in der Sprache der Oberfläche (Entscheidung 022). · DATEI_PFADE, dateiFehlerUebersetzen
- `datei-unterlagen.ts` (163 Z.) – Datei-Adressen der Unterlagen als PDF (angemeldete Benutzer der eigenen Schau): Bewertungskarten und -listen, Preisverteilung, Preisrichterverpflic … · unterlagenDateien
- `einrichten.ts` (68 Z.) – Ersteinrichtung über die Kommandozeile (Entscheidung 026), im Container aufgerufen von `schaufuchs einrichten`: bun src/einrichten.ts --verein "GZV …
- `index.ts` (278 Z.) – Einstieg des Servers (Hono): Sicherheits-Kopfzeilen, Gesundheitsprüfung, Schutz und Grenzen der tRPC-Anfragen, dann die Datei-Adressen (eigene Modu …
- `lesemodus.ts` (48 Z.) – Lesemodus (Entscheidung 025): Mit NUR_LESEN=1 nimmt der Server keine Änderungen an, z. B. während einer Wartung oder wenn der Betreiber eine Instal … · IM_LESEMODUS_ERLAUBT, trpcGesperrt, lesemodusSperre
- `migrate.ts` (17 Z.) – Spielt ausstehende Datenbank-Migrationen ein (Produktion, Docker-Start).
- `rassebilder-import.ts` (73 Z.) – Rassebilder aus einem Verzeichnis einspielen (z. B. aus Wikimedia Commons gesammelt): `ergebnis.json` mit {rasse, datei, urheber, lizenz, lizenzUrl … · rassebilderEinspielen
- `router.ts` (52 Z.) · appRouter
- `seed.ts` (552 Z.) – Demo-Daten für Entwicklung, Tests und Vorführung. · DEMO, demoEntfernen, seed, bisZurBewertung, komplett
- `testschau.ts` (519 Z.) – Testdaten für eine vorhandene, leere Schau: füllt sie wie eine echte Lokalschau bis nach der Einlieferung, damit die Ausstellungsleitung den Rest ( … · MERKMAL, DEMO_TIERE_HOECHSTENS, mitDemoSperre, fuellen, zuruecksetzen, entfernen
- `trpc.ts` (294 Z.) · kurzerPruefText, pruefeMeta, pruefeUmfang, strukturZuGross, sqlZustand, router, publicProcedure, fehler, dbId, kalenderdatum, benutzerProcedure, adminProcedure, richterProcedure, oeffentlichSichtbarProcedure, ladeSchau, pruefeNachFreigabe
- `vereinsverzeichnis-import.ts` (27 Z.) – Vereinsverzeichnis einspielen (Namen der Rassegeflügelzuchtvereine aus öffentlichen Verbandsseiten): bun src/vereinsverzeichnis-import.ts --datei < …

### Web-Bausteine `apps/web/src`

- `aussteller.tsx` (138 Z.) · leererAussteller, AusstellerFelder
- `girocode.tsx` (42 Z.) – Überweisung des Meldegelds für Aussteller (Entscheidung 021): Bankverbindung, Verwendungszweck mit Referenz und der GiroCode zum Scannen mit der Ba … · Ueberweisung
- `lesemodus.tsx` (48 Z.) – Hinweis im Lesemodus (Entscheidung 025): Der Server nimmt gerade keine Änderungen an. · LesemodusLeiste, LesemodusTablet, useLesemodusAussteller
- `positionen.tsx` (480 Z.) · neuePosition, alsEingabe, pruefePositionen, ausEintrag, FarbenschlagWahl, PositionenEditor
- `ablage.test.ts` (36 Z.)
- `ablage.ts` (43 Z.) · BILD_TYPEN, ziehtDateien, passtZu, dateiAusAblage, ablageAbfangen
- `abmeldung.tsx` (80 Z.) · eingabeVorMs, useAutoAbmeldung, AbmeldeHinweis
- `lib.ts` (51 Z.) · fehlerText, datum, datumZeit, heuteIso, centZuText, alterLabel
- `main.tsx` (22 Z.)
- `modus.ts` (46 Z.) · setzeFarbmodus, useFarbmodus
- `pdf-anzeige.tsx` (43 Z.) – PDF im Browser anzeigen (pdf.js), gemeinsam für die Live-Vorschauen von Katalog und Druckvorlagen. · pdfjs, PdfSeite
- `rahmen.tsx` (473 Z.) · useSchauId, AppRahmen, SchauRahmen, AnmeldeFlaeche, Anmelden
- `reiter-anker.test.ts` (23 Z.)
- `reiter-anker.ts` (14 Z.) · reiterAusAnker
- `rolle.ts` (9 Z.) · useIstAdmin
- `routes.tsx` (122 Z.) · router
- `seitenmenue.tsx` (202 Z.) – Seitenmenü (linke Leiste): Seiten der Schau nach dem Ablauf gruppiert, darunter Verein und Einrichtung. · schauGruppen, allgemeineGruppen, useKlappzustand, MenueGruppen
- `sprache-jetzt.ts` (20 Z.) – Sprache der Oberfläche für Code außerhalb von Komponenten (Fehlertexte, Datum, Rückfragen): `SpracheRahmen` setzt sie, Komponenten nehmen besser `u … · setzeAktuelleSprache, aktuelleSprache, ot
- `sprache.tsx` (199 Z.) – Sprache der Oberfläche. · istAusstellerSeite, SpracheRahmen, useSprache, useTexte, useOberflaeche, SprachWahl, fehlerFuerAussteller
- `symbole.tsx` (46 Z.) · Symbol
- `trpc.ts` (56 Z.) · trpc, queryClient, trpcClient, direkt
- `ui-ablage.tsx` (70 Z.) · useAblageAbfangen, DateiAblage
- `ui-basis.ts` (11 Z.) · cx, TON
- `ui-dialog.tsx` (128 Z.) – Dialog und Rückfragen als eigener Dialog (useFrage statt prompt/confirm). · Dialog, FragenAnbieter, useFrage
- `ui-felder.tsx` (71 Z.) – Formularfelder: Feld mit Beschriftung, Eingabe, Textfeld, Auswahl, Haken. · feldKlasse, Feld, Eingabe, Textfeld, Auswahl, Haken
- `ui-knoepfe.tsx` (45 Z.) – Knöpfe: Knopf, Link im Aussehen eines Knopfs und ihre Klassen. · knopfKlasse, Knopf, KnopfLink
- `ui-meldungen.tsx` (43 Z.) – Rückmeldungen als Toast unten rechts (useMeldung). · MeldungenAnbieter, useMeldung
- `ui-reiter.tsx` (130 Z.) · useReiter, ReiterLeiste, ReiterTafel, reiterKnopf, reiterTafel
- `ui-seite.tsx` (235 Z.) – Bausteine einer Seite: Hinweise, Marken, Seitenkopf, Abschnitte, Tabellenrahmen, Suche, Kennzahlen, Lade- und Leerzustand. · Hinweis, Marke, useSeitentitel, SEITENRAND, SEITE, SCHMAL, LESEBREITE, Seitenkopf, HilfeLink, Abschnitt, TabellenRahmen, Suchfeld, Segmente, Formular, FormAbschnitt, Kennzahlen, Leer, Laden, FehlerAnzeige
- `ui-speichern.tsx` (80 Z.) – Speichern in der Kopfleiste: Speicherleiste bei ungespeicherten Änderungen, Speicherstatus bei sofortigem Speichern. · SpeicherPlatz, Speicherleiste, SpeicherStatus
- `ui-ungespeichert.tsx` (65 Z.) – Warnung vor dem Verlassen mit ungespeicherten Eingaben (Formulare anmelden, ein Wächter im Wurzel-Layout). · useUngespeichertWarnung, useAenderungenWarnen, UngespeichertWaechter
- `ui.tsx` (35 Z.) – Einstieg für alle UI-Bausteine – Seiten importieren von hier.

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
- `14-konzept-audit.ts` (126 Z.) – Restpunkte aus Audit Runde 7 und Konzept-Abgleich: Meldephase nur mit Gebühren und Meldeschluss, Hinweise vor der Freigabe, Zahlungsweise (vorab od …
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
- `27-verschluesselung.ts` (116 Z.) – Verschlüsselte Spalten: IBAN, Kontoinhaber, SEPA-Datei, Zwei-Faktor-Geheimnis; Umstellung des Altbestands; falscher Schlüssel.
- `28-testschau.ts` (313 Z.) – Testschauen: eigene Aussteller, nie in echten Schauen, Vorschlägen oder der Verwaltung; Kennzeichnen und Löschen.
- `29-einteilung-rassen.ts` (101 Z.) – Preisrichter nach Rassen einteilen, vor den Katalognummern; die Bereiche folgen der Nummernvergabe.
- `30-einteilung-gegenpruefung.ts` (159 Z.) – Einteilung nach Rassen nach der Gegenprüfung: Sperre gegen gleichzeitige Nummernvergabe, Lücken, bewertete Tiere bei Nachmeldungen, Unternummern an …
- `31-stellvorschlaege.ts` (57 Z.) – Stellvorschläge für die Halle: abrufen, übernehmen (Eingänge bleiben, Handarbeit der alten Aufstellung fällt weg).
- `32-eingabepruefung.ts` (59 Z.) – Eingabeprüfung (zod 4): eigene Fehlertexte bleiben, Standardtexte auf Deutsch.
- `33-vereinsverzeichnis.ts` (57 Z.) – Vereinsverzeichnis: einspielen (nur Namen, nichts überschrieben, Prüfung auf Kontaktdaten, Protokoll) und Vorschläge in Verwaltung und öffentlicher …
- `34-katalog-gestaltung.ts` (304 Z.) – Druckkatalog: Schrift und Gestaltung wählbar, A4 als Vorgabe, Stiche je Sparte (einmal eingebettet), Öffnungszeiten untereinander.
- `35-pruefung-nachbesserung.ts` (577 Z.) – Nachbesserungen aus der Gesamtprüfung vom 13.11.2026 (interne Prüfung): Sperren nach Festschreiben und Abschluss, Geld-Lücken, Protokoll, rechtssic …
- `36-nach-plan-nummerieren.ts` (248 Z.) – Nach dem Umstellen im Hallenplan neu nummerieren: vor dem Festschreiben der Katalognummern die Katalognummern (und Käfigplätze) in der Reihenfolge …
- `37-kommende-schauen.ts` (204 Z.) – Kommende Schauen: Termine pflegen, Kalender abonnieren ohne stilles Überschreiben, Katalogseite mit Kreiswahl, eigener Kalender.
- `38-hallenplan-entfernen.ts` (88 Z.) – Leere Plätze im festen Hallenplan entfernen: über das Speichern der Halle (wie jede Änderung im Editor), nur leere Platten und Plätze im festen Pla …
- `39-hallenplan-druck.ts` (100 Z.) – Hallenplan drucken: genau ein Blatt A4 (quer, wenn die Zeichnung breiter als hoch ist), auch bei einer großen Halle mit vielen Käfigen, festgeschri …
- `40-hallenplan-neu-setzen.ts` (131 Z.) – Plan neu setzen (Rückmeldung 14.11.2026: „wenn ich quer auf längs gehe und neu anordne macht er quatsch“): Plan fest, Reihe und Platten verschoben, …
- `41-hallenplan-3d.ts` (93 Z.) – Hallenplan räumlich: Aufsteller je Schau einstellen, Daten für die 3D-Ansicht ohne Ausstellernamen.
- `42-hallenplan-moebel-etagen.ts` (105 Z.) – Hallenplan: Tische, Bänke und Garnituren als eingesetzte Teile (mit Maßen gespeichert, bleiben beim Neu-Setzen) und Etagen je Käfigart (Kapazität d …
- `43-katalog-sortierung.ts` (106 Z.) – Reihenfolge der Katalognummern wählbar: speichern (nur Ausstellungsleitung, Vorgabe als null, Protokoll), Vergabe nach der gewählten Folge, Sperre …
- `44-pruefliste-hallenplan.ts` (60 Z.) – Prüfliste ab der Phase „Halle & Katalog“: Hinweise zum Hallenplan (Tiere ohne Platz, Käfigfront zur Wand oder zu einer Reihe, Nummern nicht in Plan …
- `45-hallenplan-tier-versetzen.ts` (162 Z.) – Tiere im Halleneditor versetzen (Rückmeldung 15.11.2026: „ich will auch käfige frei zuordnen können im halleneditor und ggf tiere versetzen“): nur …
- `46-automatische-abmeldung.ts` (64 Z.) – Automatische Abmeldung nach Untätigkeit (Rückmeldung 15.11.2026): Frist je Rolle unter „Verein und Datenschutz“, nur die angebotenen Minuten, Proto …
- `47-druckvorlagen.ts` (112 Z.) – Druckvorlagen für Bewertungskarten: Vorlagen des Vereins speichern, je Schau wählen, für eine Schau abwandeln, löschen (Schau druckt dann wieder mi …
- `48-briefvorlage.ts` (116 Z.) – Briefvorlage des Vereins: speichern (Protokoll), eigene Texte im B-Bogen, Serienbrief an Mitglieder, alle Aussteller oder die einer Schau – ohne ge …
- `49-spenden.ts` (221 Z.) – Spenden (Entscheidung 013): steuerliche Angaben, Barspende mit Kassenbuch und Quittung, Spende bei der Meldung im offenen Betrag, Zuwendungsbestäti …
- `50-meisterschaften.ts` (60 Z.) – Meisterschaften (Entscheidung 014): Regeln speichern (Ausstellungsleitung, Protokoll), Wertung aus Katalog und Bewertung, PDF und CSV.
- `51-import.ts` (116 Z.) – Import aus Altprogrammen (Entscheidung 015): Datei lesen (CSV in Windows-1252, altes .xls abgelehnt), prüfen (Aussteller wiedererkennen, Rassen zuo …
- `52-import-befunde.ts` (153 Z.) – Import aus Altprogrammen, Befunde der Gegenprüfung (Entscheidung 015): große Dateien, einzelne fehlerhafte Zeilen, gleicher Name mit anderer Regist …
- `53-teilschauen.ts` (103 Z.) – Teilschauen (Entscheidung 016): anlegen, umbenennen, nicht entfernen solange Meldungen daran hängen; Meldung intern und online einer Teilschau zuor …
- `54-hallenentwuerfe.ts` (126 Z.) – Entwürfe des Hallenplans (Entscheidung 017): speichern, laden, umbenennen, löschen; entscheiden legt die übrigen ins Archiv; aus dem Archiv in eine …
- `55-lastschrift.ts` (219 Z.) – SEPA-Lastschrift (Entscheidung 018): Gläubiger-ID, Mandate, Lastschriftdatei nur für offenes Meldegeld mit gültigem Mandat, Vorabankündigung, Sperr …
- `56-grundriss.ts` (62 Z.) – Freier Grundriss der Halle (Entscheidung 019): speichern, prüfen (gültig, passt zu Breite/Länge, nichts außerhalb), ein Rechteck als Grundriss gilt …
- `57-sprachen.ts` (91 Z.) – Sprachen der Seiten und Mails für Aussteller (Entscheidung 020): Schauseite, Fehlermeldungen der Online-Meldung, Sprache an der Meldung, Bestätigun …
- `58-a-bogen.ts` (66 Z.) – A-Bogen (Meldebogen zum Ausfüllen und Unterschreiben): leer öffentlich über die Schauseite, leer und vorausgefüllt für die Ausstellungsleitung.
- `59-girocode.ts` (146 Z.) – Überweisung mit Referenz und GiroCode (Entscheidung 021): nur mit vollständigem Vereinskonto, Referenz je Meldung im Verwendungszweck, Code über de …
- `60-kontoauszug.ts` (138 Z.) – Kontoauszug-Import (Entscheidung 023): Datei prüfen (Zuordnung über Referenz bzw. Name und Betrag), ausgewählte Gutschriften buchen, Meldung bestät …
- `61-oberflaeche-sprache.ts` (62 Z.) – Sprache der Oberfläche (Entscheidung 022): am Konto gespeichert, nur die eigenen Sprachen, nur angemeldet.
- `62-gesundheitspruefung.ts` (127 Z.) – Gesundheitsprüfung `/api/gesund` (Entscheidung 024): neben `ok` und `version` die letzte Sicherung, offene Migrationen und laufende Schautage.
- `63-lesemodus.ts` (137 Z.) – Lesemodus (Entscheidung 025): Mit NUR_LESEN=1 nimmt der Server keine Änderungen an – außer Anmelden, Abmelden, Zwei-Faktor einrichten, eigenes Pass …
- `64-einrichten-befehl.ts` (249 Z.) – Ersteinrichtung über die Kommandozeile (Entscheidung 026): `schaufuchs einrichten` ruft im Container `bun src/einrichten.ts` auf.
- `65-a-bogen-mitglieder.ts` (103 Z.) – A-Bögen für die Vereinsmitglieder (Vereinsverwaltung, „Aussteller“): je Mitglied ein A-Bogen zur gewählten Schau, vorausgefüllt mit Name und Anschr …
- `66-preisverteilung.ts` (130 Z.) – Preisverteilung je Preisrichter als PDF (/datei/:schauId/preisverteilung.pdf): je Preisart so viele Zeilen wie sein Kontingent, vergebene mit Katal …
- `67-pokaltisch.ts` (38 Z.) – Hallenplan: Pokaltisch (Tisch für die Ehrenpreise) als eingesetztes Möbel – gespeichert mit Maßen, kein Käfigplatz, bleibt beim Neu-Setzen, im gedr …
- `68-kleinkram.ts` (161 Z.) – Kleinere Ergänzungen: Rückfrage beim Laden und Entscheiden eines Hallenplan-Entwurfs, wenn der Katalog gedruckt ist oder schon Tiere eingeliefert s …
- `69-preisrichter-gruppen.ts` (159 Z.) – Preisrichter, Stufe 1: BDRG-Gruppen je Rasse (Verzeichnis, CSV) und je Preisrichter mit Prüfung in der Einteilung, Zuordnung zu einem Obmann, Stand …
- `70-preisrichter-drucke.ts` (132 Z.) – Preisrichter, Stufe 2: Preisrichterverpflichtung als Brief mit Abschnitt zum Abtrennen (/datei/:schauId/preisrichter-verpflichtung.pdf) und die Bew …
- `71-preisrichter-gegenpruefung.ts` (103 Z.) – Preisrichter, Gegenprüfung: Zusage, Vorbehalt, Gruppen und Obmann in Auskunft, Bereinigung und Protokoll (Vorbehalt nur als „geändert“), Vorlage oh …
- `72-jugend-einteilung.ts` (155 Z.) – Jugend separat oder eingereiht: Katalognummern (eigener Block am Ende oder in der Rasse) und Preisrichter-Einteilung nach Rassen („mit der Rasse“ w …
- `73-jugend-gegenpruefung.ts` (65 Z.) – Jugend in der Einteilung, Gegenprüfung: Umschalten meldet Tiere ohne Preisrichter und Nachmeldungen wie das Speichern der Einteilung; gespeicherte …
- `74-zusatzpreise-je-pr.ts` (156 Z.) – Gestiftete Preisarten mit „zusätzlich je Preisrichter“: Die Zusatzpreise ohne Stiftung zählen je Preisrichter (bei Kontingent „je Schau“ für die ga …
- `75-halle-aussehen.ts` (88 Z.) – Aussehen der Halle in 3D (Entscheidung 028): gespeichert mit der Halle (begrenzt, nur Abweichungen, mit Protokoll), ändert im festen Plan weder Pla …
- `76-verpflichtung-zusage.ts` (124 Z.) – Preisrichterverpflichtung, Nachbesserung: Termin „Rückmeldung der Preisrichter bis“ in den Einstellungen der Schau (Prüfung, Protokoll, nicht aus d …
- `78-tueren.ts` (86 Z.) – Türen in den Eingängen (3D, Entscheidung 028): Türart je Eingang gespeichert mit der Halle (nur gültig, nur Abweichung von der Vorgabe, mit Protoko …
- `79-ablauf-halle.ts` (137 Z.) – Ablauf nach dem Meldeschluss (Rückmeldung eines Vereins): Einteilung nach Rassen → Käfige → Hallenplan → Katalognummern (nach dem Plan) → Katalog.
- `80-druck-formate.ts` (310 Z.) – Formatvorgaben der Drucke (Entscheidung 029, Rückmeldung „Bei den Druckeinstellungen fehlen die Formatvorgaben“): speichern, ablehnen, Protokoll, R …
- `81-jugend-kennzeichen.ts` (114 Z.) – Kennzeichen „Jgd.“ für Jugendtiere, wenn die Jugend in der Rasse eingereiht steht: im gedruckten Katalog (zwei Spalten, Tabelle, Kurzkatalog, Legen …
- `82-katalog-schriften.ts` (112 Z.) – Katalog-Schriften (Entscheidung 032): jedes Katalog-PDF – jede Schriftwahl, jede Aufteilung, A4 und A5, Kurzkatalog und /s/:slug/katalog.pdf – bett …
- `83-katalog-nicht-kuerzen.ts` (147 Z.) – Katalog kürzt nicht (Entscheidung 032, Rückmeldung eines Vereins: „Im Katalog wird abgekürzt, das darf nicht sein“): Testschau mit sehr langen Name …
- `86-gleichzeitig-katalog.ts` (236 Z.) – Gleichzeitiges Arbeiten in Katalog und Halle (Entscheidung 033): Nummern vergeben, nach Hallenplan vergeben und Festschreibung aufheben gegen eine …
- `kontext.ts` (55 Z.) – Gemeinsamer Zustand und Hilfen für den Schau-Ablauf (ablauf.test.ts und die Teile in diesem Ordner).
- Außerdem: `einteilung.test.ts`, `veterinaeraemter.test.ts`
