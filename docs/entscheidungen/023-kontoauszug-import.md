# 023 Kontoauszug-Import

**Stand:** gilt (16.11.2026)

**Kontext:** Mit Referenz und GiroCode (Entscheidung 021) ist jede Meldegeld-Überweisung eindeutig einer Meldung
zuzuordnen. Der Kassierer tippte die Eingänge bisher einzeln von Hand an der Meldung ein. Ein automatischer Abruf beim
Bankkonto (FinTS, PSD2-Dienste) bräuchte Zugangsdaten des Vereins, eine Registrierung oder einen kostenpflichtigen
Dienst; ein gehosteter Dienst, der PIN oder Zugang speichert, wäre sehr wahrscheinlich ein registrierungspflichtiger
Kontoinformationsdienst (siehe `docs/recherche/online-bezahlung.md`).

**Entscheidung:**
- Nur Datei-Upload: Der Kassierer lädt den Umsatzexport aus dem Onlinebanking hoch – camt.053 (XML) oder Bank-CSV
  (Spalten werden am Namen erkannt, Trenner `;`/`,`/Tab, UTF-8 oder Windows-1252). Kein Kontozugang, keine Zugangsdaten.
- Gelesen werden nur Gutschriften in Euro mit gültigem Datum: camt nur Status `BOOK`, CSV ohne „vorgemerkt“ (Spalten
  „Info“/„Status“), ohne Saldo-Zeilen; im alten VR-Format zählt das S/H-Kennzeichen. Sammelbuchungen in Einzelposten,
  ohne Einzelbeträge als ein Posten über den Gesamtbetrag (nie vervielfacht).
- Zuordnung: sicher nur über die Referenz (gültige Prüfziffer, Meldung dieser Schau offen oder bestätigt), auch mit
  Leerzeichen, klein geschrieben oder mit Anhang. Ohne Referenz ein **Vorschlag**, wenn genau eine Meldung mit diesem
  Nachnamen (bei mehreren: und Vornamen, ganze Wörter) im Namen des Zahlers steht – nicht im Zweck, dort stehen auch
  Tiere („1,0 Hahn“) – und der Betrag genau dem offenen Betrag entspricht. Steht eine gültige Referenz einer anderen
  Meldung im Zweck, kein Vorschlag. Vorausgewählt wird nur, was über die Referenz passt und keine Überzahlung ist.
- Zweistufig: „prüfen“ bucht nichts; „buchen“ liest die Datei erneut, Betrag und Datum kommen aus der Datei, nicht aus
  dem Browser. Gebucht wird als Zahlung „Überweisung“ über `protokolliere()`; volle Zahlung bestätigt die Meldung wie
  bei der Handbuchung. Gleiche Sperren wie dort (Kasse, offene Lastschriftdatei, abgeschlossene Schau). Alle Posten
  werden vorher geprüft; unter der Kassensperre wird der offene Betrag neu gerechnet und mit dem verglichen, den
  „prüfen“ gezeigt hat (abzüglich der Buchungen dieses Laufs) – sonst „inzwischen anders bezahlt“. Bestätigt werden am
  Ende alle berührten Meldungen, auch nach einem Fehler.
- Gegen Doppelbuchung je Gutschrift ein Fingerabdruck (SHA-256 aus Verein, Datum, Betrag, IBAN, Name, Zweck und
  laufender Nummer gleicher Posten) in `zahlung.bank_buchung`, eindeutig. Vom Auszug wird sonst nichts gespeichert:
  fremde Umsätze nie, auch nicht IBAN oder Name des Zahlers im Protokoll.
- Nur Administratoren (wie Überweisungen an der Meldung).

**Folgen:** Ein Bankformat, das die Spaltennamen anders nennt, wird abgelehnt („Spalten Buchungstag und Betrag fehlen“)
und lässt sich mit einem weiteren Namen in `SPALTEN` ergänzen. Echte Bankexporte waren für die Tests nicht verfügbar;
die Testdateien sind nach den üblichen Spaltennamen erfunden.

**Wo:** `packages/domain/src/kontoauszug.ts` (Lesen, Schlüssel, Zuordnung; Test `kontoauszug.test.ts`),
`apps/server/src/routers/kontoauszug.ts` (`pruefen`, `buchen`), Spalte `zahlung.bank_buchung` (Migration
`0064_kontoauszug`), Web `seiten/kontoauszug.tsx` (Menü „Meldephase“ → „Kontoauszug“). Test: Server `60-kontoauszug`.
