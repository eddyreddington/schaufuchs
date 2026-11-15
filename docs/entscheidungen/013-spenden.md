# 013 Spenden: Spenderverzeichnis, Kassenbuch, Zuwendungsbestätigung nach amtlichem Muster

**Stand:** gilt (15.11.2026)

**Kontext:** Vereine bekommen zu einer Schau Spenden – von Ausstellern bei der Tiermeldung, von anderen (z. B. die
Gemeinde) bar oder per Überweisung, auch Sachen. Jede Spende braucht einen Beleg, Barspenden gehören ins Kassenbuch,
und gemeinnützige Vereine sollen Zuwendungsbestätigungen ausstellen können, ohne den amtlichen Wortlaut abzutippen.

**Entscheidung:**
- Eigene Tabellen (`db/schema-spenden.ts`): `spender` je Verein, `spende` je Schau, `zuwendungsbestaetigung` je Verein
  mit fortlaufender Nummer und dem PDF als Doppel (§ 50 Abs. 7 EStDV), `bestaetigung_spende` als Zuordnung.
  Spenden und Bestätigungen sind wie Kassendaten unveränderbar, nur einmal stornierbar (`db/schutz.sql`).
- Barspenden stehen als Einnahme im Kassenbuch (Quelle ist die Spende selbst, kein zweiter Datensatz) und bekommen eine
  Spendenquittung im Belegarchiv (Belegart `spende` bzw. `spende-storno`, Nummer = Spende).
- Spende bei der Tiermeldung: freiwilliger eigener Posten (nie vorausgewählt), zählt wie die Ehrenpreisstiftung zum
  geforderten Betrag der Meldung (`gefordertCent`), ist aber kein Meldegeld. Eingegangen ist sie, wenn die Meldung ganz
  bezahlt oder in der Abrechnung verrechnet ist – erst dann ist sie bestätigungsfähig.
- Zuwendungsbestätigung nur nach dem amtlichen Muster (BMF-Schreiben vom 7.11.2013, Anlagen 3, 4 und 14): Wortlaut
  unverändert in `packages/domain/src/zuwendungsbestaetigung.ts`, nur zutreffende Varianten, der Satz „kein
  Mitgliedsbeitrag“ immer (Förderung der Tierzucht, § 52 Abs. 2 Nr. 23 AO: Mitgliedsbeiträge sind nicht abziehbar,
  § 10b Abs. 1 Satz 8 Nr. 4 EStG). Sperren in `bestaetigungsSperren`: nicht gemeinnützig, Angaben fehlen, Bescheid zu
  alt (§ 63 Abs. 5 AO: 5 bzw. 3 Jahre, taggenau), Gegenleistung (Sponsoring), Storno, schon bestätigt, nicht
  eingegangen, Anschrift unvollständig, Sache ohne Bezeichnung oder Wert.
- Immer mit eigenhändiger Unterschrift: Das maschinelle Verfahren ohne Unterschrift (R 10b.1 Abs. 4 EStR) bräuchte eine
  Anzeige beim Finanzamt und eine eingeblendete Unterschrift und gilt nicht für Sachspenden – nicht umgesetzt.
- Die Ehrenpreisstiftung bleibt getrennt und bekommt keine Zuwendungsbestätigung: Wer einen Preis stiftet, kann ihn
  oft selbst gewinnen (Gegenleistung bzw. fehlende endgültige Belastung, H 10b.1 EStH). Eine amtliche Aussage zu genau
  diesem Fall gibt es nicht; im Zweifel entscheidet das Finanzamt.
- Im gedruckten Katalog stehen Spender nur mit Einwilligung, getrennt für Name und Betrag; im Online-Katalog nie.
  Testschauen stellen keine Zuwendungsbestätigungen aus (keine Nummern aus der echten Reihe). Eine Spende mit dem
  Meldegeld lässt sich nach der Abrechnung des Ausstellers nicht mehr stornieren (Saldo und SEPA-Datei). Nach der Belegfrist (Jahresende +
  8 Jahre) löscht die Bereinigung die Bestätigungen und anonymisiert Spender; die Beträge bleiben für die Kasse.

**Folgen:** Ein Verein, der Spenden über das Konto bekommt, gleicht sie weiter selbst mit dem Kontoauszug ab – es gibt
kein Bank-Kassenbuch. Der vereinfachte Nachweis bis 300 € (§ 50 Abs. 4 EStDV, Beleg ohne Spenderdaten) ist nicht
eingebaut.
