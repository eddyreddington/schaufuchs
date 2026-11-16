# 021 Überweisung mit Referenz und GiroCode

**Stand:** gilt (16.11.2026)

**Kontext:** Das Meldegeld kommt meist per Überweisung. Aussteller tippen IBAN und Verwendungszweck ab, der Kassierer
ordnet die Eingänge von Hand zu. Zahlungsanbieter (Karte, PayPal, Lastschrift über einen Dienst) kosten bei 25 € Meldegeld
2 bis 5 % plus Rückbuchungsrisiko. Die Abwägung steht in `docs/recherche/online-bezahlung.md`.

**Entscheidung:**
- Je Schau wählbar: „vorab per Überweisung mit GiroCode“ (`schau.girocode`). Dann gilt das Vereinskonto
  (`vereinKontoinhaber`, `vereinIban`, `vereinBic`) für Aussteller statt des freien Textes `bankverbindung`, damit Text
  und Code nie auseinanderlaufen. Speichern geht nur mit Kontoinhaber und IBAN, außerhalb des EWR auch mit BIC.
- Jede Meldung bekommt eine Referenz nach ISO 11649: „RF“, zwei Prüfziffern, Meldungsnummer siebenstellig (gleich
  lang, damit keine Referenz Anfang einer anderen ist). Sie steht **vorn im unstrukturierten Verwendungszweck**
  („RF540001234 Meldegeld Mueller, Hans“), nicht im Feld für strukturierte Referenzen. So sieht sie jeder: Banking-Apps
  zeigen sie, Aussteller ohne GiroCode tippen sie mit ab, ein späterer Kontoauszug-Import findet sie im Text. Der Name
  ist frei eingegeben und steht in der Mail des Vereins: wie die Anrede nur Buchstaben, keine Links.
- GiroCode nach EPC069-12 Version 002 (UTF-8, Fehlerkorrektur M, Ruhezone vier Module) über den **offenen** Betrag;
  ohne offenen Betrag oder bei stornierter bzw. abgelehnter Meldung kein Code. Auch kein Code ab der Einlieferung (dann
  zahlt man an der Kasse oder es wird mit Preisgeld und Verkauf verrechnet, ohne Zahlungsbuchung) und keiner, wenn das
  Meldegeld per Lastschrift kommt (gültiges Mandat oder Posten in der offenen Lastschriftdatei) – sonst drohte eine
  Doppelzahlung. Kontoinhaber höchstens 70 Zeichen (mehr fasst der Code nicht). Der Empfängername wird nicht umgeschrieben
  (die Bank vergleicht ihn mit dem Kontoinhaber); der Verwendungszweck kommt in den SEPA-Zeichensatz und wird
  gekürzt, falls der Inhalt sonst über 331 Byte käme.
- Zu sehen auf Dankseite, „Meine Meldung“, vorausgefülltem A-Bogen und B-Bogen; die Mail nennt den Verwendungszweck und
  verweist auf „Meine Meldung“ (reine Textmail, kein Bild). Der leere A-Bogen hat keinen Code (keine Meldung, keine
  Referenz).
- Das Paket `qrcode` (wie in der Oberfläche) zeichnet den Code auch im Server, als Vektorgrafik ins PDF.

**Folgen:** Kein Zahlungsanbieter, keine Gebühren, keine Daten an Dritte. Der Code meldet keinen Zahlungseingang;
gebucht wird weiter nach dem Kontoauszug. Offen und mit Steuerberater oder Jurist zu klären, bevor ein Anbieter dazukommt:
ob der Knopf „Verbindlich melden“ als „zahlungspflichtig“ gelten muss und ob ein Widerrufshinweis nötig ist.

**Wo:** `packages/domain/src/girocode.ts` (Referenz, Verwendungszweck, Inhalt des Codes; Test `girocode.test.ts`),
`apps/server/src/services/ueberweisung.ts` (`girocodeAktiv`, `bankAngabe`, `ueberweisung`), `pdf/girocode.ts`
(Zeichnen), `pdf/a-bogen.ts`, `pdf/dokumente.ts` (B-Bogen), `routers/oeffentlich.ts` (`melden`, `meineMeldung`,
`schau`), `routers/meldung.ts` (Mail), `routers/schau/einstellungen.ts` (Prüfung beim Speichern), Migration
`0063_girocode`; Web `komponenten/girocode.tsx`, `seiten/oeffentlich.tsx`, `seiten/einstellungen-stammangaben.tsx`;
Texte in allen Sprachen (`ueberweisung`, `mail.verwendungszweck`, `mail.giroCode`). Test: Server `59-girocode`.
