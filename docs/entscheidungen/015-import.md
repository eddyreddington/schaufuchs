# 015 Import aus Altprogrammen: zuordnen statt festes Format, nur über die normalen Wege

**Stand:** gilt (15.11.2026)

**Kontext:** Vereine, die zu SchauFUCHS wechseln, haben ihre Aussteller und oft die Meldungen der laufenden Schau
in einem anderen Programm. Diese Programme exportieren Tabellen mit eigenen Überschriften, Trennzeichen und
Zeichensätzen; ein gemeinsames Austauschformat gibt es nicht. Rassen und Farbenschläge sind dort frei geschrieben und
weichen vom Verzeichnis der Schau ab. Ein Import darf vorhandene Daten nicht überschreiben (Projektregel) und muss
sich rückgängig machen lassen, wenn die Zuordnung falsch war.

**Entscheidung:**
- Kein Format je Programm, sondern ein Assistent: CSV (Trennzeichen erkannt, UTF-8, sonst Windows-1252) oder Excel
  (.xlsx, gelesen ohne Fremdbibliothek in `apps/server/src/import/xlsx.ts`, Grenze gegen ZIP-Bomben). SchauFUCHS rät
  die Spalten aus den Überschriften, die Ausstellungsleitung prüft und ändert die Zuordnung. Das alte .xls-Format wird
  nicht gelesen.
- Die Fachregeln (Lesen, Raten, Zeilen prüfen, Wiedererkennen, Rassen-Vorschläge) stehen rein und getestet in
  `packages/domain/src/import.ts`. Übernommen wird ausschließlich über `speichereAussteller` und `speichereMeldung` –
  mit denselben Prüfungen und demselben Protokoll wie in der Oberfläche, in einer Transaktion.
- Jede Zeile wird vor dem Übernehmen mit denselben Schemata geprüft wie beim Speichern (`ausstellerEingabe`,
  `positionEingabe`, Auslandsregel der Schau). Was scheitern würde, ist ein Fehler der Zeile; ein Import bricht nie an
  einer einzelnen Zeile ab. Die Tabelle kommt als ein JSON-Text an den Server und wird dort begrenzt (5000 Zeilen,
  60 Spalten, 500 Zeichen je Zelle) – als Liste läge sie weit über den allgemeinen Grenzen jeder Anfrage.
- Aussteller werden wiedererkannt über die Registriernummer, sonst über Vor- und Nachname und PLZ – über den Namen
  nur, wenn keine andere Registriernummer dagegen steht; passt eine Zeile ohne Nummer zu mehreren Nummern (Datei und
  Verzeichnis zusammen), ist sie ein Fehler statt geraten. Vorhandene Aussteller bleiben unverändert; gesperrte und
  gelöschte werden nicht importiert; wer in der Schau schon gemeldet ist, wird übersprungen. Ein zweiter Import
  derselben Datei legt deshalb nichts doppelt an, auch in einer Testschau (dort nur Test-Aussteller).
- Rassen: genauer Treffer, sonst Vorschläge nach Ähnlichkeit; die Wahl der Ausstellungsleitung lernt der Verein
  (`organisation.import_zuordnungen`, gespeichert über die Namen, damit sie auch für einen neuen Verzeichnisstand gilt).
- Jeder Import ist ein Importlauf (`importlauf`) mit den angelegten Meldungen und Ausstellern. Zurücknehmen löscht
  genau diese – nur bis zur Phase „Halle & Katalog“, solange niemand die Meldungen danach bearbeitet hat (Protokoll
  nach dem Eintrag „Import“) und nichts daran hängt (Zahlung, Katalognummer, Bewertung, Preis, Verkauf, Stiftung,
  Spende, Abrechnung, offene SEPA-Datei); sonst bleibt alles stehen. Neu angelegte Aussteller bleiben, wenn sie danach
  bearbeitet wurden oder anderswo gebraucht werden. Jede gelöschte Meldung erhält einen eigenen Protokolleintrag.
- Der Excel-Leser sucht Elemente linear (kein Regex über offene Tags), begrenzt Spalten und Zeilen schon beim Lesen.

**Folgen:** Bankdaten, Geburtsdaten, Stiftungen und Spenden werden nicht importiert. Eine Rasse, die im Verzeichnis
fehlt, lässt sich nur auslassen; sie wird vorher im Verzeichnis ergänzt. Zeilennummern beziehen sich auf die gelesene
Tabelle ohne leere Zeilen.
