# 032 Eine Schriftfamilie im Katalog

**Stand:** gilt (22.11.2026)

**Kontext:** Rückmeldung eines Vereins: „Es werden verschiedene Schriften im Katalog genommen, das ist alles
unharmonisch.“ Bestandsaufnahme mit `pdffonts` auf echten Katalog-PDFs (jede Schriftwahl, jede Aufteilung, A4 und A5,
Kurzkatalog): Vier der sechs Wahlen waren Paare aus Titel- und Textschrift. „Klassisch“ (Vorgabe) setzte Seitentitel,
Spartenköpfe, Rassen, Farbenschläge (kursiv), Grußworte, Stifter und den Schaunamen in Spectral, Tierzeilen, Angaben,
Verzeichnisse, Kopf- und Fußzeilen in IBM Plex Sans Condensed; „Traditionell“ EB Garamond mit Source Sans 3, „Buch,
schmal“ EB Garamond mit Plex, „Ausgewogen“ Spectral mit Source Sans 3. In einer Tierspalte standen so Rasse und
Farbenschlag in der einen, Nummer, Note und Aussteller in der anderen Familie. Dazu 25 verschiedene Schriftgrößen (6 bis
34 pt) über die Teile verteilt. Helvetica oder Times kamen nicht vor. „Gut lesbar“ (Atkinson) und „Modern“ (Source
Sans 3) waren schon einheitlich.

**Entscheidung:**
- Ein Katalog nutzt genau **eine Schriftfamilie** – die gewählte – für Titel, Köpfe, Fließtext, Tabellen und Zahlen.
  Unterschieden wird nur durch den Schnitt (normal, fett, kursiv derselben Familie) und die Größe.
- Je Wahl (`KATALOG_SCHRIFT_FAMILIE` in `packages/domain/src/katalog-typografie.ts`; die gespeicherten Schlüssel bleiben,
  keine Migration): Klassisch = IBM Plex Sans Condensed, Traditionell = EB Garamond, Gut lesbar = Atkinson Hyperlegible,
  Modern = Source Sans 3, Buch schmal = IBM Plex Sans Condensed, Ausgewogen = Source Sans 3.
- Eine **Auszeichnungsschrift** gibt es nur für den Namen der Schau auf der Titelseite und nur bei den Wahlen, die sie in
  ihrer Beschreibung ausdrücklich nennen: „Buch, schmal“ (EB Garamond) und „Ausgewogen“ (Spectral). Sonst steht auch der
  Name in der Familie. Ab Seite 2 nie eine zweite Familie.
- **Größenstufen** zentral (`KATALOG_GROESSEN`, A5-Heft; A4 alle mal 1,22 über `katalogGroessen()`): titel 32, h1 21,
  h2 13, h3 10,5, text 9,5, liste 8,2, klein 7,2, fein 6,2 pt. Alle Katalog-Teile nehmen ihre Größe daraus (im Kontext
  `G`, im Tierteil `GT` mit dem Faktor der Spalten). Untergrenzen beim Einpassen (`textImFeld`, Aussteller) sind keine
  Stufen und bleiben, wo sie waren.
- **Fehlende Schnitte** ersetzt die Regular derselben Familie (`schnittDatei()`), nie eine andere Schrift. Der Server
  registriert für den Katalog die drei Schnitte (`pdf/katalog-schrift.ts`: `NORMAL`, `FETT`, `KURSIV`, `AUSZEICHNUNG`) und
  legt auch die allgemeinen Rollen (`SANS`, `SERIF` …) auf die Familie, damit keine Hilfe aus `basis.ts` auf eine fremde
  Schrift oder Helvetica fällt.
- **Zahlen** in derselben Familie; Katalognummern mit gleich breiten Ziffern (`KATALOG_ZIFFERN`, OpenType `tnum`), wo die
  Schrift sie hat (Atkinson setzt sonst proportional).
- Nichts wird gekürzt: Passt „nicht veröffentlicht“ in einer schmalen Spalte nicht (Atkinson, dreispaltig), steht dort
  „nicht veröff.“ statt „nicht…“. Der Schutz `textOhnePlatzAuslassen` bleibt.
- Briefe, Belege, Bewertungskarten und alle anderen Drucke behalten ihre Schriften (`registriereSchriften` in `basis.ts`).

**Folgen:** Wer bisher „Klassisch“ hatte, sieht Überschriften, Rassen und Farbenschläge jetzt in Plex statt Spectral,
Grußworte und Stifter in Plex. Seitenzahl, Aufteilung und Umbruch bleiben im Wesentlichen gleich (Tierzeilen unverändert
8,2 pt). Geprüft im Servertest `82-katalog-schriften` (pdffonts und pdftotext für jede Wahl, jede Aufteilung, A4 und A5,
Kurzkatalog und `/s/:slug/katalog.pdf`) und im Domain-Test `katalog-typografie.test.ts`.
