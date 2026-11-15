# 011 Druckvorlagen: Verein legt fest, Schau wählt

**Stand:** gilt (15.11.2026)

**Kontext:** Vereine drucken Bewertungskarten unterschiedlich: auf A4 mit vier A6-Karten, größer auf A5 oder A4, auf
gekaufte Verbandsvordrucke oder auf Endlospapier im Nadeldrucker. Was auf der Karte steht und wie, soll der Verein selbst
entscheiden, ohne dass jede Schau neu eingerichtet werden muss.

**Entscheidung:**
- Druckvorlagen gehören dem Verein (Tabelle `druckvorlage`); jede Schau wählt eine (`schau.vorlageBewertungskarteId`,
  leer = Vorgabe wie bisher). „Für diese Schau anpassen“ legt eine Kopie mit `schauId` an – die Vereinsvorlage bleibt.
- Zwei Arten: „eigen“ (ganze Karte aus Bausteinen, Reihenfolge und Auswahl frei, Höhen gerechnet) und „vordruck“
  (nur die Daten, jedes Feld frei in Millimetern). Freies Positionieren gibt es nur für Vordrucke – eigene Karten
  bleiben dadurch immer ordentlich gesetzt.
- Die Rechnung (Bogen, Lage der Karten, Versatz, Längenkorrektur, Bausteinhöhen, Maßstab nach der engeren Richtung)
  steht rein in `packages/domain/src/druckvorlage.ts` und ist getestet; der Server zeichnet nur
  (`apps/server/src/pdf/bewertungskarte.ts`). Gespeicherte Werte werden immer über `kartenVorlageLesen()` begrenzt.
- Vorschau und Probedruck erzeugt der Server aus dem ungespeicherten Stand (nur Ausstellungsleitung).
- Erklärungen zum Drucker (Treiber-Formular, Perforation) stehen im Handbuch, nicht in der Oberfläche (008).

**Folgen:** Briefe (Meldebestätigung, Abrechnung, Quittungen, Spendenquittung, Serienbrief) bekommen eine eigene
Briefvorlage nach demselben Muster (Art „brief“ in derselben Tabelle).
