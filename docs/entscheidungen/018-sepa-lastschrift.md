# 018 SEPA-Lastschrift für das Meldegeld

**Stand:** gilt (15.11.2026)

**Kontext:** Viele Vereine ziehen Beiträge per Lastschrift ein; für das Meldegeld wollen sie das auch. Bar und
Überweisung bleiben daneben überall möglich. Die SEPA-Basislastschrift (CORE) verlangt eine Gläubiger-ID, ein
unterschriebenes Mandat je Zahler, eine Vorabankündigung und die Einreichung als pain.008-Datei.

**Entscheidung:**
- Fachregeln rein in `packages/domain/src/lastschrift.ts`: Prüfung der Gläubiger-ID (Mod 97, Geschäftsbereich zählt
  nicht mit), Mandatsreferenz (1–35 Zeichen SEPA-Zeichensatz, ohne Leerzeichen), Gültigkeit eines Mandats (nicht
  widerrufen, 36 Monate seit letzter Nutzung, einmalig nur einmal), Löschfrist eines Mandats (`mandatLoeschbar`: 14
  Monate nach Widerruf bzw. Verfall), früheste Fälligkeit (zweiter Bankarbeitstag nach heute nach TARGET2: Einreichung am nächsten Bankarbeitstag, D-1 und ein
  Tag Puffer), vorgeschlagene Fälligkeit (14 Tage Vorabankündigung, dann Bankarbeitstag),
  Erzeugung pain.008.001.08 mit je einem Block für RCUR und OOFF.
- Gläubiger-ID am Verein (`organisation.glaeubiger_id`), Mandate in `sepa_mandat` (IBAN und Kontoinhaber verschlüsselt,
  nur Konten in EU/EWR (außerhalb verlangt SEPA BIC und Anschrift), Referenz eindeutig je Verein; ohne eigene Referenz `SF-M` und die Nummer des Mandats, damit nach der Bereinigung
  keine Referenz wiederkehrt), Läufe in `lastschrift_lauf` (höchstens ein offener je Schau, Posten verschlüsselt).
  Eigene Tabellen statt `sepa_lauf`, damit Überweisungs- und Lastschriftlauf sich nicht gegenseitig sperren.
- Eingezogen wird nur offenes Meldegeld bestätigter Meldungen mit gültigem Mandat zur Fälligkeit, nicht bei
  Ausstellern, deren Meldegeld die Kasse schon verrechnet hat (gültige Auszahlung oder offene SEPA-Überweisung). Ein
  einmaliges Mandat steht in höchstens einer offenen Datei des Vereins. Gebucht wird genau der Inhalt der Datei als
  Zahlung `lastschrift` (Zahlart, nicht im Kassenbuch; `letzte_nutzung_am` nur vorwärts); zurück nur als Rücklastschrift (nicht über „Zahlung
  stornieren“), und nicht, solange zu einer Spende mit diesem Meldegeld eine gültige Zuwendungsbestätigung besteht.
- Gleichzeitigkeit: Erstellen liest die Mandate unter Zeilensperre (Widerruf und Einmal-Mandat einer anderen Schau
  warten), Mandat erfassen und Löschwunsch sperren die Ausstellerzeile, Abschluss und Erstellen laufen unter der
  Kassensperre und lesen die Phase frisch.
- Die offene Datei hält die Beträge fest. Die gemeinsame Prüfung liegt in `services/kasse.ts` (`offeneLastschrift`,
  `inOffenerLastschrift`). Gesperrt sind Zahlung, Storno, Betragsänderung der Meldung, Gebühren, Stiftung und Spende
  mit dem Meldegeld, Absage, Import-Rücknahme, Mandatswiderruf und Löschwunsch; ebenso Auszahlung an diese Aussteller
  (die Abrechnung weist `imEinzug` aus), SEPA-Überweisungsdatei und Abschluss der Schau (nie „trotzdem“).
- Vorabankündigung per E-Mail über den Postausgang (optional beim Erstellen); die Frist (in der Regel 14 Tage) trägt
  der Verein selbst.
- Datenschutz (`services/datenschutz-lastschrift.ts`): nach Buchen/Verwerfen keine Bankdaten mehr im Lauf; Löschwunsch
  widerruft Mandate, löscht die Bankverbindung und den Namen in früheren Läufen; Mandate 14 Monate nach Widerruf bzw.
  Verfall gelöscht (Nachweispflicht bei Widerspruch); Mandate und Einzüge stehen in der Auskunft nach Art. 15. In
  Produktion liest eine verschlüsselte JSON-Spalte keinen Klartext (`geheimJsonLesen`), wie `geheimText`.

**Nachtrag (26.11.2026, Entscheidung 034):** Online-Meldungen zieht ein Mandat erst ein, wenn der Aussteller sie
bestätigt hat (Link aus der Mail oder Haken „Meldebogen ist unterschrieben“ der AL), und dann nur das Meldegeld. Online
zugesagte Stiftung und Spende bleiben für Überweisung oder Kasse offen; die Vorschau nennt beides mit Betrag.

**Folgen:** Kein Mandatsformular als PDF (Vordruck der Bank). Keine Änderung eines Mandats (neue IBAN = neues Mandat).
Keine Prüfung gegen das ISO-Schema in der CI (Aufbau im Domain-Test). FRST wird nicht verwendet (seit 2016 nicht
mehr nötig).
