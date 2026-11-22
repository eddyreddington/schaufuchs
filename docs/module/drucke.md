# Modul Drucke (Übersicht und Formate)

**Zweck:** Alle Drucksachen einer Schau mit ihrem Papierformat an einer Stelle: Reiter „Druck“ in den Einstellungen der
Schau. Wo ein anderes Format fachlich sinnvoll ist, wählt die Ausstellungsleitung es je Schau
([Entscheidung 029](../entscheidungen/029-druckformate.md)); Katalog und Bewertungskarten behalten ihre eigene Einstellung
(eine Quelle), Briefe bleiben A4 nach DIN 5008. Vollständige Liste der Funktionen: [Modulkarte](../modulkarte.md).

## Einstiegspunkte

| Wo | Datei | Wichtig |
|---|---|---|
| Fachregeln | `packages/domain/src/druck-formate.ts` | `DRUCK_FORMAT_WAHL` (Wahl je Drucksache, Vorgabe vorn), `druckFormateLesen()` (Bereinigung), `belegBlatt()`, `bewertungslisteBlatt()`, `hallenplanBlatt()`, `DRUCKSACHEN` (Übersicht mit festen Formaten) |
| Datenbank | `apps/server/src/db/schema-schau.ts` | `schau.druckFormate` (jsonb, Vorgabe `{}`; Migration `0071_druck_formate`) |
| Server | `apps/server/src/routers/druck-formate.ts` (Teil von `druckvorlage`) | `druckvorlage.formate` (alle Angemeldeten), `druckvorlage.formateSetzen` (nur Ausstellungsleitung, Protokoll „Druckformate“) |
| Vorlage | `apps/server/src/routers/schau/anlegen.ts` | Formate und Kartenvorlage kommen mit (Vereinsvorlage gleich, Fassung der alten Schau als eigene Kopie) |
| PDF | `pdf/bewertungsliste.ts`, `pdf/hallenplan.ts`, `pdf/dokumente-kasse.ts`, `pdf/spenden.ts`, `pdf/beleg-blatt.ts` | Seitengröße nach der Formatvorgabe; Belege auf A4 oben mit Schnittlinie |
| Web | `apps/web/src/seiten/einstellungen-druck.tsx` | Tabelle „Drucksache – Format – Einstellung“; Texte `schau.einstellungen.druck.formate` (`sprachen/oberflaeche/<sprache>/schau-druck-formate.ts`) |
| Test | `apps/server/src/tests/80-druck-formate.ts`, `packages/domain/src/druck-formate.test.ts` | Seitengröße aus der MediaBox, Text über pdftotext, feste Formate der Übersicht gegen die echten PDFs |

## Bestandsaufnahme (Stand 22.11.2026)

| Drucksache | Adresse | Erzeuger | Format | Einstellung | Anderes Format sinnvoll? |
|---|---|---|---|---|---|
| A-Bogen (Meldebogen) | `/datei/:id/a-bogen.pdf`, `a-bogen-mitglieder.pdf`, `/s/:slug/a-bogen.pdf` | `pdf/a-bogen.ts` | A4 hoch | fest | nein – Formular zum Ausfüllen und Unterschreiben |
| B-Bogen mit Ringkarten | `/datei/:id/aussteller.pdf` | `pdf/dokumente.ts` | A4 hoch, DIN 5008 | Briefvorlage (Texte, Form A/B) | nein – Fensterumschlag |
| Katalog (auch Vorschau, öffentlich) | `/datei/:id/katalog.pdf`, `katalog-vorschau.pdf`, `/s/:slug/katalog.pdf` | `pdf/katalog*.ts` | A4 hoch (Vorgabe) oder A5 (Heft) | Katalog gestalten (`katalogGestaltung.format`) | ja – besteht, im Reiter verlinkt |
| Bewertungskarten (hängen als Käfigkarte am Käfig) | `/datei/:id/bewertungskarten.pdf` | `pdf/bewertungskarte.ts` | A6, vier je A4 (Vorgabe); A5 zwei je A4 quer; A4; Endlospapier | Druckvorlage (011), im Reiter wählbar | ja – besteht |
| Druckvorlage: Vorschau, Probedruck | `POST /datei/druckvorlage/{vorschau,probedruck}.pdf` | `pdf/bewertungskarte.ts` | wie die Vorlage | Designer | – |
| Bewertungsliste je Preisrichter | `/datei/:id/preisrichter/:prId/liste.pdf` | `pdf/bewertungsliste.ts` | A4 hoch, zwei Listen nebeneinander | **neu:** A4 oder A5 (eine Liste je Seite) | ja – Klemmbrett in der Käfigreihe |
| Preisrichterverpflichtung | `/datei/:id/preisrichter-verpflichtung.pdf` | `pdf/verpflichtung.ts` | A4 hoch, DIN 5008 | Briefvorlage | nein – Brief |
| Preisverteilung | `/datei/:id/preisverteilung.pdf` | `pdf/preisverteilung.ts` | A4 hoch | fest | nein – Tabelle mit Zeilen zum Eintragen, auf A5 zu schmal |
| Meisterschaften | `/datei/:id/meisterschaften.pdf` | `pdf/meisterschaften.ts` | A4 hoch | fest | nein – A3 brächte nur mehr Zeilen, keine größere Schrift (zum Aushang am Kopierer vergrößern) |
| Kaufbeleg mit Ausgabeschein | `/datei/:id/kaufbeleg/:id.pdf` (Belegarchiv) | `pdf/dokumente-kasse.ts` | A5 quer | **neu:** A5 quer oder A4 hoch (Beleg oben, Schnittlinie) | ja – Drucker ohne A5-Fach; Kassenbon (80 mm) nicht: anderes Layout |
| Einzahlungsquittung, Eigenbeleg | `/datei/:id/beleg/{einzahlung,eigenbeleg}/:nr.pdf` | `pdf/dokumente-kasse.ts` | A5 quer | **neu:** wie Kaufbeleg (Schlüssel `kassenbeleg`) | ja |
| Spendenquittung | `/datei/:id/beleg/spende/:nr.pdf` | `pdf/spenden.ts` | A5 quer | **neu:** mit den Kassenbelegen | ja |
| Kassenbericht | `/datei/:id/kassenbericht.pdf` | `pdf/dokumente-kasse.ts` | A4 hoch | fest | nein |
| Abrechnung und Quittung je Aussteller | `/datei/:id/abrechnung.pdf?aussteller=` | `pdf/dokumente.ts` | A4 hoch, DIN 5008 | Briefvorlage | nein – Beleg mit Unterschriften |
| Abrechnung aller Aussteller | `/datei/:id/abrechnung.pdf` | `pdf/dokumente.ts` | A4 quer | fest | nein – neun Spalten |
| Zuwendungsbestätigung | `/datei/zuwendungsbestaetigung/:id.pdf` | `pdf/spenden.ts` | A4 hoch, amtliches Muster | fest | nein – amtliches Muster |
| Serienbrief, Probebrief | `POST /datei/serienbrief.pdf`, `/datei/druckvorlage/brief.pdf` | `pdf/brief.ts` | A4 hoch, DIN 5008 | Briefvorlage | nein |
| Listen für das Veterinäramt | `/datei/:id/tierliste.pdf`, `verkaufsliste.pdf` | `pdf/dokumente-amt.ts` | A4 quer | fest | nein – breite Tabellen |
| Hallenplan | `/datei/:id/hallenplan.pdf` | `pdf/hallenplan.ts` | A4, ein Blatt, quer oder hoch nach der Zeichnung | **neu:** A4 oder A3 | ja – Aushang, große Hallen |
| Aufbauliste | `/datei/:id/aufbauliste.pdf` | `pdf/hallenplan.ts` | A4 hoch | fest | nein |
| Auskunft nach Art. 15 DSGVO (Verein, nicht im Reiter) | `/datei/aussteller/:id/auskunft.pdf` | `pdf/auskunft.ts` | A4 hoch | fest | nein |

Eigene Käfigkarten oder Käfigschilder, Etiketten und Urkunden gibt es als Drucksache nicht: Am Käfig hängt die
Bewertungskarte, Preise stehen auf der Karte und im Katalog.

## Regeln und Invarianten

- Gelesen wird immer über `druckFormateLesen()`: fehlend, unbekannt oder ungültig = Vorgabe (das bisherige Format), je
  Drucksache für sich. Gespeichert wird der vollständige, bereinigte Stand; `formateSetzen` ändert nur die genannten
  Drucksachen und lehnt fremde Schlüssel und Formate ab (zod, `strict`).
- Belege: Der Beleg bleibt A5 quer groß; auf A4 reicht der untere Rand bis unter die Schnittlinie, Text bricht also genau
  so um. Belege werden beim Buchen archiviert – ein späterer Formatwechsel ändert archivierte Belege nicht.
- Katalogformat und Kartenvorlage werden nicht doppelt gespeichert: der Reiter liest sie (`druckvorlage.formate`) und
  verlinkt „Katalog gestalten“ bzw. bedient die bestehende Kartenwahl (`druckvorlage.waehlen`).
- Jede Änderung mit `protokolliere()` (Aktion „Druckformate“, alt und neu vollständig).
- Bewertungsliste: Ränder, Lücke, Spaltenbreiten und Kopf (Angaben 62 mm, auf A5 50 mm; Name 20 bzw. 16 pt) rechnet
  `bewertungslisteBlatt()`; die Klasse behält in jedem Format mindestens 15 mm (Domain-Test).
- Schutz für alle PDFs (`textOhnePlatzAuslassen()` in `pdf/basis.ts`, in `erzeugePdf` und im Katalog): Text mit einer Breite
  ≤ 1 pt oder nicht endlich wird ausgelassen und im Log genannt. pdfkit 0.15 begrenzt die Breite nur bei Zeilenumbruch;
  mit `lineBreak: false` und negativer Breite lief sein Zeilenumbruch endlos und hielt den ganzen Server an.
- Schau aus Vorlage: die Kartenvorlage der alten Schau kommt als Kopie wie bei „Für diese Schau anpassen“ (begrenzt über
  `kartenVorlageLesen()`, Name „Neue Schau: Vorlage“, Protokoll „Druckvorlage aus der Vorlage übernommen“).
