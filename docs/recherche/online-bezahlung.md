# Entscheidungsvorlage: Meldegeld online bezahlen in SchauFUCHS

Stand der Recherche: 16.11.2026. Das ist eine Zusammenfassung von Recherchen und keine Rechts- oder Steuerberatung. Unsichere Aussagen sind mit **[unsicher]** markiert, eigene Rechnungen oder Ableitungen mit **[eigene Rechnung]** bzw. **[eigene Ableitung]**.

---

## 1. Executive Summary

**Empfehlung:** Wir fangen nicht mit einem Zahlungsanbieter an, sondern mit zwei kostenlosen Bausteinen.
- **Stufe 1:** Ein EPC-QR-Code (GiroCode) auf Meldebestätigung, Schauseite und A-/B-Bogen. Er hat eine eindeutige Referenz je Aussteller.
- **Stufe 2:** Ein Import des Kontoauszugs (camt.053 oder Bank-CSV). Damit erkennt die Software eingegangene Zahlungen automatisch.

Beides kostet den Verein keine Gebühren, braucht keinen Vertrag und keine BaFin-Frage, und SchauFUCHS berührt dabei kein Geld.

**Später und für jeden Verein freiwillig:** ein Zahlungsanbieter mit Checkout. Als ersten empfehle ich Stripe:
- bei Karten am günstigsten (1,5 % + 0,25 €),
- günstige Bankverfahren (SEPA-Lastschrift 0,35 €, iDEAL | Wero 0,29 €),
- der e. V. ist dort ausdrücklich als Rechtsform belegt,
- der Schlüssel lässt sich auf wenige Rechte begrenzen (keine Auszahlungen),
- es gibt einen Abfrageweg für Installationen ohne öffentliche Adresse.

Mollie wäre die zweite Wahl. PayPal nur, wenn Vereine es ausdrücklich verlangen: ohne genehmigten Vereinstarif ist es am teuersten und technisch am aufwendigsten.

**Zwei Punkte gelten für jede Variante mit Anbieter:**
- **Eine Zahlung je Aussteller statt je Meldung.** Das senkt die festen Gebühren stark.
- **Absage der Schau:** Bei einer Absage, etwa wegen Geflügelpest, sind die Anbietergebühren weitgehend verloren.

---

## 2. Kernkonzepte

1. **Wer das Geld empfängt, entscheidet über die Aufsicht.**
   - Der Verein zieht seine eigene Forderung ein und braucht dafür keine BaFin-Erlaubnis.
   - SchauFUCHS bleibt erlaubnisfrei, solange das Geld nie über ein Konto des Softwareanbieters oder des Hosters läuft (Ausnahme für technische Dienstleister, § 2 Abs. 1 Nr. 9 ZAG).
   - Erlaubt ist deshalb nur: Zahlung direkt aufs Vereinskonto oder aufs Konto des Vereins beim Zahlungsanbieter.
2. **Bezahlen und Abgleichen sind zwei Aufgaben.**
   - Ein QR-Code oder eine Überweisung sagt der Software nicht, ob gezahlt wurde.
   - Das leistet erst ein Kontoauszug-Import oder beim Zahlungsanbieter eine Rückmeldung per Webhook bzw. per Abfrage.
3. **Feste Gebühren je Zahlung sind bei kleinen Beträgen der größte Kostenfaktor.** Ein Warenkorb je Aussteller (mehrere Meldungen, eine Zahlung) senkt sie stark.
4. **Rückbuchungen und Absagen sind das eigentliche Risiko.**
   - Ein verlorener Streitfall kostet 14–50 € und frisst bei 25 € Meldegeld fast den ganzen Betrag.
   - Bei einer Erstattung nach Absage behalten die Anbieter ihre Gebühr ganz oder teilweise.
5. **Bestellstrecke nach Verbraucherrecht, vorsorglich.**
   - Ob der Verein gegenüber Ausstellern „Unternehmer“ ist, ist nicht entschieden. Die Vereinsportale gehen davon aus.
   - Deshalb vorsorglich: Button „zahlungspflichtig bestellen“, Gesamtpreis, Hinweis „kein Widerrufsrecht“, vollständiges Impressum.

---

## 3. Erkenntnisse

### 3.1 Gebühren der Anbieter und Zahlungsarten (Listenpreise, Inland/EWR)

| Anbieter / Zahlungsart | Gebühr | Stand / Quelle |
|---|---|---|
| **PayPal Checkout** | 2,99 % + 0,39 € | Gebühren-PDF vom 04.11.2026 |
| PayPal, Tarif für gemeinnützige Organisationen | 1,50 % + 0,35 € (nur auf Antrag und nach Genehmigung) | PDF 04.11.2026 |
| PayPal „Waren und Dienstleistungen“ | 2,49 % + 0,35 € | PDF 04.11.2026 |
| PayPal SEPA-Lastschrift (Online-Kartendienste) | 0,35 € | PDF 04.11.2026 |
| **Stripe, Standardkarte EWR** | 1,5 % + 0,25 € | Preisseite, abgerufen 16.11.2026 |
| Stripe, Premiumkarte EWR | 2,8 % + 0,25 € | dto. |
| Stripe, Karte außerhalb des EWR (z. B. CH) | 3,15 % + 0,25 € | dto. |
| Stripe SEPA-Lastschrift | 0,35 € | dto. |
| Stripe iDEAL \| Wero (NL) | 0,29 € | dto. |
| Stripe BLIK (PL, nur PLN) | 1,6 % + 0,25 € (+2 % Umrechnung) | dto. |
| Stripe Przelewy24 (PL) | 2,2 % + 0,25 € | dto. |
| Stripe TWINT (CH, nur CHF) | 2,6 % + 0,25 € (+2 % Umrechnung) | dto. |
| Stripe Bancontact (BE) | 1,4 % + 0,25 € | dto. |
| Stripe SEPA-Banküberweisung | 0,5 %, höchstens 5 € | dto. |
| **Mollie, Verbraucherkarte EWR** | 1,80 % + 0,25 € | Preisseite, abgerufen 16.11.2026 |
| Mollie, Karte außerhalb des EWR | 3,25 % + 0,25 € | dto. |
| Mollie SEPA-Lastschrift | 0,35 € | dto. |
| Mollie SEPA-Banküberweisung | 0,25 € | dto. |
| Mollie iDEAL \| Wero | 0,42 € | dto. |
| Mollie Wero (andere Länder, z. B. DE) | 0,90 % + 0,25 € | dto. |
| Mollie BLIK / P24 / TWINT | 1,60 % / 2,20 % / 2,30 % + 0,25 € | dto. |
| **SumUp online** | 2,50 % | Preisseite ohne Datum |
| **PAYONE** | Disagio individuell, 2,95 €/Monat, +0,35 % Service, 0,09 € Secure, 3D-Secure 69 €/Jahr | Preisverzeichnis 03/2026 |
| **Unzer** | keine öffentlichen Preise (Drittquelle: 1,5 % + 0,20 €) **[unsicher]** | — |
| **Wero über Sparkasse** (E-Payment-Plattform) | 0,77 %, Paketpreis unbekannt | Sparkasse, ohne Datum |
| Wero über VR Payment | 0,85 % + 0,05 €, nach 12 Monaten 24,90 €/Monat, 12 Monate Laufzeit | VR Payment |
| **EPC-QR / normale Überweisung** | 0 € beim Anbieter, nur die Buchungsposten der Hausbank (Höhe je Bank unbekannt) | — |

**Streitfälle und Rückbuchungen:**

| Anbieter / Fall | Gebühr |
|---|---|
| PayPal, Konfliktgebühr | 14 € |
| PayPal, Kartenzahlung ohne PayPal-Konto | 16 € |
| Stripe, Karte | 20 € je Streitfall, bei Widerspruch weitere 20 € (zurück nur bei Erfolg) |
| Stripe, SEPA-Anfechtung | 15 € |
| Stripe, fehlgeschlagene SEPA-Zahlung | 3,50 € |
| PAYONE, Chargeback | 50 € |
| Mollie | nicht offiziell belegt (Drittquellen 19–35 €) **[unsicher]** |

**Rückerstattung:**
- **PayPal:** behält die Festgebühr (0,39 € bzw. 0,35 €).
- **Stripe:** erstattet die Bearbeitungsgebühr nicht.
- **PAYONE:** 1,30 € je Gutschrift.
- **Mollie:** unklar **[unsicher]**.

**Rabatte für Vereine:**
- **Stripe:** Den Rabatt gibt es nur, wenn mindestens 80 % des Volumens Spenden sind. Anmeldegebühren zählen ausdrücklich nicht. Für Meldegeld also kein Rabatt.
- **PayPal:** Der Vereinstarif gilt laut PDF nach Genehmigung für alle geschäftlichen Zahlungen. Antragsweg und Nachweise sind nicht öffentlich **[unsicher]**.

**Ausländische Aussteller:**

| Land | Was die Recherche ergeben hat |
|---|---|
| NL, PL, CZ, FR | EUR-Zahlungen über PayPal gelten als Inland. |
| CH | PayPal +1,99 % (im Vereinstarif sogar +2,99 %). Stripe 3,15 % + 0,25 €. TWINT nur in CHF. |
| PL | BLIK nur in PLN. |
| NL | iDEAL wird auf Wero umgestellt; Abschaltung von iDEAL voraussichtlich 2027/28. |
| Wero allgemein | Live in DE, FR, BE und LU. Nicht in PL, CZ und CH. |

### 3.2 Rechenbeispiel: 300 Meldungen à 25 € = 7.500 €

**Fall A: 300 Einzelzahlungen**

| Weg | Gebühren | Bleibt beim Verein | Anteil |
|---|---|---|---|
| PayPal Standard | 341,25 € | 7.158,75 € | 4,55 % |
| PayPal Vereinstarif | 217,50 € | 7.282,50 € | 2,90 % |
| Stripe Premiumkarte | 285,00 € | 7.215,00 € | 3,80 % |
| Mollie Karte EWR | 210,00 € | 7.290,00 € | 2,80 % |
| Stripe Standardkarte | 187,50 € | 7.312,50 € | 2,50 % |
| SumUp online | 187,50 € | 7.312,50 € | 2,50 % |
| Mollie Wero DE | 142,50 € | 7.357,50 € | 1,90 % |
| SEPA-Lastschrift (Stripe/Mollie/PayPal) | 105,00 € | 7.395,00 € | 1,40 % |
| Stripe iDEAL \| Wero | 87,00 € | 7.413,00 € | 1,16 % |
| Mollie SEPA-Banküberweisung | 75,00 € | 7.425,00 € | 1,00 % |
| Wero über Sparkasse | 57,75 € (+ unbekannte Paketkosten) | 7.442,25 € | 0,77 % |
| **Überweisung mit EPC-QR** | **0 €** (+ Buchungsposten der Hausbank) | **7.500 €** | — |

- **Angenommene Mischung bei Stripe:** 120 Standardkarten, 45 Premiumkarten, 90 SEPA, 15 iDEAL und 30 Schweizer Karten. Das ergibt ≈ 184,73 € Gebühren.
- **Ein Schweizer Zahler à 25 €:** PayPal Standard 1,64 €, Stripe 1,04 €.

**Fall B: Ein Warenkorb je Aussteller (60 Zahlungen à 125 €)**

| Weg | Gebühren | Anteil |
|---|---|---|
| PayPal Standard | 247,65 € | 3,30 % |
| SumUp | 187,50 € | 2,50 % |
| Mollie Karte | 150,00 € | 2,00 % |
| PayPal Vereinstarif | 133,50 € | 1,78 % |
| Stripe Standardkarte | 127,50 € | 1,70 % |
| Wero über Sparkasse | 57,75 € **[eigene Rechnung, rein prozentual, also unverändert]** | 0,77 % |
| Stripe SEPA-Lastschrift | 21,00 € | 0,28 % |
| Stripe iDEAL \| Wero | 17,40 € | 0,23 % |

**Fall C: Die Schau wird abgesagt, alle 300 Zahlungen aus Fall A werden erstattet**

| Weg | Verlust |
|---|---|
| PayPal Standard | 117,00 € |
| PayPal Vereinstarif | 105,00 € |
| Stripe Karte | 187,50 € |
| Stripe SEPA | 105,00 € |
| Mollie Karte | 210 € (eventuell +75 €) **[unsicher]** |
| PAYONE | 390 € für Gutschriften plus das nicht erstattete Disagio **[eigene Rechnung]** |
| Überweisung | Rücküberweisung, nur Kosten der Hausbank |

Ausstellungsverbote wegen Geflügelpest gab es 2025/2026 mehrfach per Allgemeinverfügung. Das Absagerisiko ist also real.

### 3.3 Recht, Steuer, Datenschutz (Kurzfassung)

**ZAG (Zahlungsaufsicht):**
- Nur die Zahlung direkt auf das Konto des Vereins beim Anbieter ist erlaubnisfrei: Stripe Direct Charges, Mollie Connect for Platforms oder ein eigenes Konto des Vereins.
- Nicht in Frage kommen „Separate Charges and Transfers“, Marktplatzmodelle oder ein Sammelkonto des Hosters.
- Die Ausnahme für Handelsvertreter wendet die BaFin bei Plattformen praktisch nie an.
- Hält der Hoster API-Schlüssel des Vereins, dann nur mit eingeschränkten Rechten (keine Auszahlungen, keine Kontoänderungen). Grundlage sind die BaFin-Kriterien zur Kontovollmacht; dafür gibt es nur eine lesbare Quelle **[unsicher]**.

**Bestellstrecke:**
- Button „zahlungspflichtig bestellen“. „Jetzt anmelden“ hielt das LG Berlin für unzulässig. Ohne eindeutigen Button kommt kein Vertrag zustande.
- Widerrufsrecht: Es entfällt wahrscheinlich nach § 312g Abs. 2 Nr. 9 BGB (Freizeit mit festem Termin). Für Tierschauen ist das nicht entschieden **[unsicher]**.
- Widerrufsbutton (Pflicht seit 19.06.2026): nur nötig, wenn irgendein Angebot widerrufbar ist, z. B. Katalog- oder Warenverkauf ohne Termin.
- Preisangaben (PAngV): Gesamtpreis inklusive USt bzw. Hinweis auf § 19 UStG.
- Impressum nach § 5 DDG mit Vorstand, Registergericht und Registernummer.

**Aufschläge für Zahlarten (§ 270a BGB):**
- Für SEPA-Überweisung, SEPA-Lastschrift und Verbraucherkarten verboten.
- Für PayPal oder Ähnliches erlaubt, höchstens in Höhe der tatsächlichen Kosten (BGH I ZR 203/19).

**Ausländische Aussteller:** Die Schau findet in Deutschland statt. Deshalb gilt voraussichtlich deutsches Recht (Art. 6 Abs. 4 lit. a Rom I). Die Schweiz wurde nicht weiter geprüft.

**Umsatzsteuer:**
- Laut UStAE 12.3 Abs. 3 Nr. 6 gelten 7 % für Standgelder bei Tierzucht-Ausstellungen.
- Offen ist, ob Hobby-Rassegeflügel als „für landwirtschaftliche Zwecke geeignete Tierzucht“ gilt **[unsicher]**.
- Kleinunternehmergrenze: 25.000 € im Vorjahr, 100.000 € im laufenden Jahr.

**Ertragsteuer:**
- Besteuerungsgrenze nach § 64 Abs. 3 AO seit 2026: 50.000 €.
- Ob die Schau Zweckbetrieb ist, ist offen **[unsicher]**.

**Buchhaltung:**
- Erlöse brutto buchen, Gebühren getrennt als Ausgabe. Je Zahlung Transaktions-ID, Brutto, Gebühr, Netto und Datum festhalten.
- Belege 8 bzw. 10 Jahre elektronisch aufbewahren. Die Übergangsregel ist widersprüchlich **[unsicher]**.

**Datenschutz:**

| Anbieter | Rolle | Drittland |
|---|---|---|
| Stripe | Doppelrolle (Auftragsverarbeiter und eigener Verantwortlicher), Vertrag über Stripe Payments Europe (Irland) | USA über DPF, SCC als Rückfall |
| PayPal | eigener Verantwortlicher (gemeinsame Verantwortung ist umstritten) | DPF-Status nicht geprüft **[unsicher]** |
| Mollie (NL) | „independent controller“ | — |

Das EU-US-Datenschutzabkommen (DPF) gilt weiter, das Rechtsmittel C-703/25 P ist anhängig. Für jeden Anbieter braucht der Verein einen Abschnitt in den Datenschutzhinweisen.

**Barrierefreiheit (BFSG):** Typische Vereine sind als Kleinstunternehmen ausgenommen (unter 10 Beschäftigte, Ehrenamtliche zählen nicht). Der Verein muss das aber auf Nachfrage der Behörde belegen können.

### 3.4 Technik

**Gemeinsamer Ablauf:** Alle drei Anbieter gehen ohne SDK, also nur mit `fetch` und ohne neue npm-Pakete: Zahlung anlegen, weiterleiten, Rückkehrseite, dann Bestätigung per Webhook. Die Rückkehrseite allein reicht nicht. Webhooks können doppelt kommen, die Buchung muss also idempotent sein.

| | Stripe | Mollie | PayPal |
|---|---|---|---|
| Einrichtung durch den Kassierer | eingeschränkten Schlüssel `rk_live_…` kopieren; Webhook legt die App selbst an | Live-Schlüssel kopieren (nicht einschränkbar) | REST-App im Entwicklerportal anlegen, Client-ID und Secret kopieren |
| Prüfung des Webhooks | HMAC-SHA256 (mit `node:crypto`) | keine Signatur, Server holt den Status selbst ab | RSA plus CRC32 oder Rückfrage-Aufruf |
| Ohne öffentliche Adresse | `GET /v1/events` (30 Tage) | `GET /v2/payments/{id}` | `GET /v2/checkout/orders/{id}` |
| Grober Aufwand **[eigene Einschätzung]** | ca. 300–400 Zeilen | ca. 200–300 Zeilen | ca. 450–650 Zeilen |

**Bausteine für A und B:**
- **EPC-QR:** Version 002 mit UTF-8, Name bis 70 Zeichen, IBAN, Betrag in EUR, strukturierte RF-Referenz (ISO 11649) bis 35 Zeichen. Höchstens 331 Byte.
- **Empfängerüberprüfung (seit 09.10.2025):** Der Name im QR-Code muss genau dem Kontoinhaber bei der Bank entsprechen. Sonst sieht der Aussteller „ähnlich“ oder „kein Treffer“.
- **Kontoauszug:** camt.053 Version 08 (MT940 ist bei EBICS seit November 2025 abgeschaltet). Im Onlinebanking gibt es Bank-CSV, etwa „CSV-CAMT“ bei Sparkassen.

**Was SchauFUCHS schon hat** (im Repo geprüft):
- Die Bibliothek `qrcode` 1.5.4 ist in `apps/web` vorhanden.
- Der A-Bogen entsteht aber auf dem Server mit pdfkit (`apps/server/src/pdf/a-bogen.ts`), und `apps/server` hat kein QR-Paket. Für den QR-Code auf Bogen und PDF braucht es also entweder `qrcode` auch im Server-Paket (vorher fragen) oder einen eigenen Encoder.
- SEPA-Lastschrift (pain.008, ADR `docs/entscheidungen/018-sepa-lastschrift.md`) und Zahlungsbuchung gibt es schon. Daran können Abgleich und Anbieterzahlungen anknüpfen.

---

## 4. Optionen für SchauFUCHS

### (A) EPC-QR-Code (GiroCode) auf Bestätigung, Schauseite und A-/B-Bogen

**Aufwand:** gering.
- Reine Fachfunktion in `packages/domain`: Zeichenkette nach EPC069-12 und RF-Referenz mit Prüfziffer, mit Test.
- Ausgabe im Web (Bibliothek vorhanden), in der Mail und im PDF (QR-Paket für den Server vorher fragen).

**Kosten für den Verein:** 0 € beim Anbieter. Nur Buchungsposten der Hausbank, deren Höhe je Bank unbekannt ist.

**Recht und Datenschutz:**
- Kein Kontozugang, keine Daten an Dritte. Nach BaFin-Merkblatt nicht reguliert **[eigene Ableitung]**.
- Name, IBAN und Betrag erscheinen ohnehin auf der Bestätigung.

**Nutzen für Aussteller:**
- **DE, AT, BE, NL, FI:** Banking-App scannen, prüfen, freigeben. Echtzeitüberweisung ist möglich und darf nicht mehr kosten als eine normale Überweisung.
- **NL:** nur „einige Banken“.
- **CZ, PL, CH:** ob die Apps EPC-Codes lesen, ist nicht belegt **[unsicher]**. Diese Aussteller überweisen weiter von Hand.
- Wer am Rechner im Browser bucht, braucht ein Smartphone zum Scannen.

**Risiken:**
- Der Zahler kann Betrag und Verwendungszweck ändern.
- Es kommt kein Signal über den Zahlungseingang zurück.
- Betrüger können ebenfalls gültige Codes erzeugen (Warnung der Betaalvereniging).
- Der Standard ist nur „informative“: Banken müssen ihn nicht unterstützen.

### (B) Kontoauszug-Import (camt.053 / Bank-CSV) zum automatischen Abgleich

**Aufwand:** mittel.
- Parser für camt.053 Version 08 plus zwei bis drei CSV-Varianten.
- Zuordnung über die RF-Referenz aus (A), unsichere Fälle zur Bestätigung durch den Kassierer.
- Buchung als Zahlung über `protokolliere()`.
- FinTS-Abruf nur später und nur für selbst betriebene Installationen. Dafür ist eine Registrierung nötig (10–15 Arbeitstage); ob Open Source zugelassen ist, ist offen.

**Kosten für den Verein:** 0 €. PSD2-Aggregatoren (finAPI ab 100–200 €/Monat, Enable Banking nur auf Anfrage) wären für einzelne Vereine zu teuer.

**Recht und Datenschutz:**
- Ein Datei-Upload gibt der Software keinen Kontozugang und keine Zugangsdaten. Laut BaFin-Merkblatt ist das kein Kontoinformationsdienst **[eigene Ableitung]**.
- Achtung beim gehosteten Dienst: Würde er PIN oder FinTS-Zugang des Vereins speichern, wäre das sehr wahrscheinlich ein registrierungspflichtiger Kontoinformationsdienst (§ 34 ZAG).
- Kontoauszüge enthalten auch fremde Umsätze. Nur die zugeordneten Posten speichern, den Rest verwerfen **[eigene Ableitung]**.

**Nutzen für Aussteller:** indirekt. Der Bezahlt-Status stimmt schneller, und weniger Nachfragen gehen hin und her. Das gilt für alle Länder, weil jede Überweisung im Auszug steht.

**Risiken:**
- CSV-Formate unterscheiden sich je Bank.
- Exporte sind teils auf 90 Tage begrenzt **[unsicher]**.
- Aussteller vergessen die Referenz. Dann muss der Kassierer von Hand zuordnen.

### (C) Ein Zahlungsanbieter mit Checkout und Webhook: zuerst Stripe

**Warum Stripe zuerst:**
1. Bei Karten in der EU am günstigsten (1,5 % + 0,25 €).
2. Sehr günstige Bankverfahren: iDEAL | Wero 0,29 €, SEPA 0,35 €.
3. Deckt die Auslandsfälle ab: NL über iDEAL, PL über BLIK und P24, BE über Bancontact, CH über Karte bzw. TWINT.
4. Der e. V. ist als Rechtsform ausdrücklich belegt (Vereinsregisterauszug, „VR“).
5. Eingeschränkter Schlüssel mit genau den nötigen Rechten (Checkout Sessions, Refunds, Webhook Endpoints, Events). Keine Auszahlungsrechte, das passt zu den BaFin-Kriterien zur Kontovollmacht.
6. Die App legt den Webhook selbst an. Der Kassierer kopiert nur einen Schlüssel.
7. Abfrage über `GET /v1/events` für Installationen ohne öffentliche Adresse.
8. Gute Testumgebung, auch SEPA-Anfechtung und Rückerstattung lassen sich simulieren.

**Mollie als Alternative:**
- Technisch noch einfacher, Firma in der EU (NL).
- Aber: Schlüssel nicht einschränkbar, Live-Betrieb erst nach Freischaltung, Erstattungs- und Rückbuchungsgebühren unklar, SEPA-Lastschrift vor allem für wiederkehrende Zahlungen. Der e. V. ist dort nicht ausdrücklich belegt.

**PayPal:** nicht zuerst. Ohne Vereinstarif kostet es am meisten, braucht den meisten Code, und der Kassierer muss im Entwicklerportal eine App anlegen.

**Aufwand:** ca. 300–400 Zeilen **[eigene Einschätzung]**. Dazu kommen:
- Tabelle „Zahlungsvorgang“,
- Schlüssel verschlüsselt speichern (AES-256-GCM, Hauptschlüssel nicht in der Datenbank, in der Oberfläche nur die letzten 4 Zeichen),
- Rückerstattung,
- Buchhaltungsexport.

**Kosten für den Verein:** siehe Tabellen; bei einem Warenkorb je Aussteller etwa 0,2–1,7 %. Keine Grundgebühr.

**Recht und Datenschutz:**
- Direct Charges bzw. ein eigenes Konto des Vereins, keine Weiterleitung über SchauFUCHS.
- Datenschutzhinweis zu Stripe (Doppelrolle, USA über DPF).
- Button-Lösung, Hinweis zum Widerrufsrecht, Impressum.
- Kein Aufschlag für Karte oder SEPA.

**Nutzen für Aussteller:** sofortige Zahlung und Bestätigung, gewohnte Zahlarten in DE, NL, BE, PL und CH. CZ hat keine eigene lokale Methode, dort zahlt man per Karte.

**Risiken:**
- Rückbuchungen: 20 € je Kartenstreitfall, 15 € je SEPA-Anfechtung; SEPA-Lastschriften sind bis zu 8 Wochen ohne Grund rückgängig zu machen.
- Gebühren gehen bei Absage verloren.
- SEPA über Stripe: Bestätigung erst nach etwa 6 Werktagen, zusätzliche Identitätsprüfung.
- Wero für deutsche Kunden laut Support noch in „privater Vorschau“ **[unsicher]**.
- Rechtlich ist Direct Charges nur durch Anbieterquellen belegt.

### (D) Mehrere Anbieter wählbar (Stripe, Mollie, PayPal)

**Aufwand:**
- Gemeinsame Schnittstelle plus je Anbieter: Stripe ca. 300–400, Mollie ca. 200–300, PayPal ca. 450–650 Zeilen **[eigene Einschätzung]**.
- Mehr Tests, mehr Doku und mehr Pflege bei API-Änderungen.

**Kosten:** Der Verein wählt. PayPal lohnt sich nur mit Vereinstarif (Fall B: 1,78 %) oder wenn viele Aussteller es ausdrücklich wollen.

**Recht und Datenschutz:** je Anbieter eigene Rolle und eigener Datenschutztext. PayPal ist umstritten (Rolle, DPF-Status).

**Nutzen:** Mehr Vereine finden „ihren“ Anbieter, und Aussteller zahlen mit PayPal, wenn sie es gewohnt sind.

**Risiken:** Pflegelast für ein ehrenamtliches Projekt, Fehler in selten genutzten Wegen.

**Empfehlung:** erst bauen, wenn (C) im Einsatz ist und Vereine nach einem zweiten Anbieter fragen. Die Datenstruktur aus (C) von Anfang an anbieterneutral halten.

---

## 5. Empfohlener Stufenplan

**Stufe 1 (sofort): EPC-QR und saubere Bankangaben**
- QR-Code mit RF-Referenz je Aussteller auf Meldebestätigung (Web und Mail), Schauseite und A-/B-Bogen.
- Hinweis „gern als Echtzeitüberweisung“.
- Button-Text der Meldung prüfen („zahlungspflichtig bestellen“). Hinweis zum Widerrufsrecht und Preisangabe ergänzen.
- **Was der Verein tun muss:**
  - Kontoinhabernamen genau so eintragen, wie die Bank ihn führt (vollständiger e.V.-Name).
  - IBAN prüfen.
  - Impressum vervollständigen (Vorstand nach § 26 BGB, Registergericht und -nummer).

**Stufe 2 (danach): Kontoauszug-Import**
- camt.053 und gängige Bank-CSV hochladen, automatische Zuordnung über die RF-Referenz, Rest von Hand bestätigen.
- **Was der Verein tun muss:**
  - Im Onlinebanking den Export finden (Sparkasse: CSV-CAMT; Volksbank: CSV oder MT940, CAMT nur nach Freischaltung).
  - Während der Meldefrist regelmäßig hochladen.

**Stufe 3 (freiwillig je Verein): Stripe-Checkout**
- Warenkorb je Aussteller.
- Webhook, oder Abfrage, wenn keine öffentliche Adresse vorhanden ist.
- Rückerstattung, auch als Sammelerstattung bei Absage.
- Export mit Brutto, Gebühr, Netto und Transaktions-ID.
- Schlüsseländerungen über `protokolliere()`.
- Neue Entscheidung (ADR) anlegen.
- **Was der Verein tun muss:**
  - Stripe-Konto als e. V. eröffnen (Vereinsregisterauszug, Ausweise des Vorstands, wahrscheinlich Satzung und Transparenzregister **[unsicher]**).
  - Eingeschränkten Schlüssel mit den vorgegebenen Rechten erzeugen und einmalig in SchauFUCHS eintragen.
  - Zahlarten auswählen, etwa ohne TWINT und BLIK, solange es keine Fremdwährung gibt.
  - Datenschutzhinweise ergänzen.
  - Mit dem Steuerberater klären: USt-Satz des Meldegelds und Umsatzsteuer auf Stripe-Gebühren (Reverse Charge oder steuerfrei).
  - Entscheiden, ob Absagen über die Ausschreibung geregelt werden (wer trägt die Gebühren).

**Stufe 4 (nur bei Nachfrage): weitere Anbieter**
- Mollie, z. B. für Wero DE (0,90 % + 0,25 €) oder Vereine nahe NL/BE.
- PayPal nur mit genehmigtem Vereinstarif.
- Gehosteter Dienst: Stripe Connect bzw. Mollie Connect for Platforms erst nach juristischer Prüfung.

**Unabhängig davon** bleibt die vorhandene SEPA-Lastschrift (pain.008) der günstigste Weg für Stammaussteller mit Mandat. Ihre Bankkosten wurden in dieser Recherche nicht untersucht.

---

## 6. Kritische Analyse

**Belegstand allgemein:**
- Drei unabhängige Quellen gibt es nicht für jede Zahl. Anbieterpreise und API-Details stehen meist nur beim Anbieter selbst.
- Gut belegt sind PayPal (PDF vollständig gelesen) und Stripe (offizielle Preisseite).
- Teilweise belegt sind Mollie, SumUp und PAYONE. Unzer hat keine Preise.

**Widersprüche zwischen den Quellen:**
- **Stripe-Kartenpreise:** Drittquellen nennen 1,9 % (Premium) bzw. 3,25 % (außerhalb EWR), die offizielle Seite 2,8 % bzw. 3,15 %.
- **Stripe Wero:** Die Doku nennt DE als Kundenland, der Support spricht von „privater Vorschau“. Einen deutschen Wero-Preis gibt es nicht.
- **Wero und Rückbuchungen:** Die Sparkasse wirbt mit „ohne Rückbuchungsrisiko“, Mollie und VR Payment nennen Reklamationen bis 120 Tage.
- **PayPal-Vereinstarif:** Der Auslandsaufschlag für die Schweiz ist dort höher (+2,99 %) als im Standardtarif (+1,99 %).
- **Mollie:** Rückerstattungsgebühr 0,25 € ja oder nein, Hilfeseiten gesperrt.
- **EPC069-12:** v3.0 ist belegt; „v3.1“ und neue Leitlinien ab 01.02.2026 sind nicht bestätigt.
- **iDEAL → Wero:** Die Termine für NL schwanken je nach Quelle.
- **Aufbewahrung 8/10 Jahre:** Die Übergangsregel ist widersprüchlich.

**Lücken:**
- Buchungspostenentgelte der Vereinskonten. Sie entscheiden über die echten Kosten von Überweisung und EPC-QR; siehe den Inklu-Fusion-Fall mit 770 € Gebühren bei 8.000 Cent-Zahlungen per Wero.
- Ob Banking-Apps in CZ, PL und CH EPC-Codes lesen.
- Nachweise für den PayPal-Vereinstarif. Ob kleine Zuchtvereine ihn bekommen.
- Ob PayPal-Käuferschutz bei Meldegeld greift. Die offiziellen Bedingungen waren nicht abrufbar.
- Ob FinTS-Registrierung für Open Source möglich ist.
- Ob Hosting im Auftrag ein Kontoinformationsdienst ist. Das Merkblatt sagt nichts dazu.
- Kosten der Sparkasse-Wero-Pakete. Ob einmalige SEPA-Lastschrift über Mollie geht.
- Unterlagenlisten für Vereinskonten bei PayPal, Mollie und SumUp.

**Ein Steuerberater sollte bestätigen:**
- USt-Satz des Meldegelds: 7 % nach § 12 Abs. 2 Nr. 4 UStG trotz „landwirtschaftlich geeignet“, oder über einen Zweckbetrieb.
- Zweckbetrieb oder wirtschaftlicher Geschäftsbetrieb.
- Kleinunternehmergrenze im Verein.
- Umsatzsteuer auf Anbietergebühren: steuerfrei nach § 4 Nr. 8 UStG oder 19 % Reverse Charge.
- Buchung brutto/netto.

**Ein Jurist sollte bestätigen:**
- Ist der Verein gegenüber Ausstellern „Unternehmer“?
- Gilt § 312g Abs. 2 Nr. 9 BGB für Ausstellungsmeldungen?
- Löst ein anderes SchauFUCHS-Angebot (Katalog- oder Tierverkauf) den Widerrufsbutton aus?
- Ist die Button-Formulierung zulässig?
- Gilt die ZAG-Einordnung von Stripe Direct Charges bzw. Mollie Connect für den gehosteten Dienst, und dürfen dort Vereinsschlüssel gehalten werden? Dafür gibt es nur Anbieterquellen und eine Kanzleizusammenfassung des BaFin-Merkblatts.
- PayPal-Datenschutz (DPF-Status, gemeinsame Verantwortung).

**Recht im Wandel:**
- PSD3/PSR ist noch nicht im Amtsblatt (Plenum indikativ 14.12.2026). Die Ausnahme für Handelsvertreter wird eher enger.
- Das DPF-Rechtsmittel C-703/25 P ist offen.

---

## 7. Quellenverzeichnis

**Anbieter und Gebühren**
- [PayPal Händlergebühren DE, 04.11.2026 (PDF)](https://www.paypalobjects.com/marketing/ua/pdf/DE/de/de-de-merchant-fees-04-Nov-2026.pdf)
- [PayPal Händlergebühren DE, 15.07.2026 (PDF)](https://www.paypalobjects.com/marketing/ua/pdf/DE/de/de-de-merchant-fees-15-jul-2026.pdf)
- [PayPal Händlergebühren 11.04.2026 (PDF)](https://www.paypalobjects.com/marketing/ua/OA/merchant-fees/de-DE-110426.pdf)
- [lexware PayPal-Gebührenrechner](https://www.lexware.de/tools/paypal-gebuehrenrechner/)
- [Finanztip PayPal-Gebührenrechner](https://finanztip.de/online-banking/paypal/paypalgebuehrenrechner/)
- [Händlerbund: PayPal-Konfliktgebühr](https://ohn.haendlerbund.de/themen/payment-finance/134385-paypal-fuehrt-konfliktgebuehr-haendler-ein)
- [yagemi: PayPal-Gebühren 2026](https://www.yagemi.de/blog/e-commerce/paypal-gebuehren-haendler/)
- [monsterdealz: PayPal-Käuferschutz 2026](https://www.monsterdealz.de/magazin/paypal-kaeuferschutz)
- [GIGA: Käuferschutz digitale Tickets](https://www.giga.de/tech/paypal-kaeuferschutz-bei-digitalen-tickets-das-solltet-ihr-wissen--01KGFCE5TB7CSQ8JVAYKYYEWX2)
- [PayPal Käuferschutz](https://www.paypal.com/de/digital-wallet/buyer-purchase-protection)
- [PayPal Sandbox](https://developer.paypal.com/tools/sandbox/)
- [Stripe Preise DE](https://stripe.com/de/pricing)
- [Stripe lokale Zahlungsmethoden DE](https://stripe.com/de/pricing/local-payment-methods)
- [sellfy Stripe-Gebührenrechner](https://sellfy.com/de/tools/stripe-gebuehrenrechner/)
- [qualimero: Shopware-Zahlungsanbieter 2026](https://qualimero.com/blog/shopware-zahlungsanbieter)
- [Stripe Doku BLIK](https://docs.stripe.com/payments/blik)
- [Stripe Doku TWINT](https://docs.stripe.com/payments/twint)
- [Stripe Doku Wero](https://docs.stripe.com/payments/wero)
- [Stripe Support iDEAL→Wero](https://support.stripe.com/questions/ideal-to-wero-migration?locale=de-DE)
- [Stripe Doku iDEAL | Wero](https://docs.stripe.com/payments/ideal?locale=de-DE)
- [Stripe Support: Dispute-Preise Juni 2025](https://support.stripe.com/questions/june-2025-pricing-updates-for-disputes)
- [Redo: Stripe-Chargeback-Kosten](https://redo.com/resources/articles/comparisons/stripe-chargeback-alerts-cost)
- [Stripe Rechtsformen DE](https://support.stripe.com/questions/supported-business-entity-types-in-germany)
- [Stripe Dokumente Non-Profits](https://support.stripe.com/questions/documents-for-business-verification-of-unincorporated-entities-partnerships-or-non-profits)
- [Startnext Hilfe: Registernummer bei Stripe](https://help.startnext.com/en/article/stripe-is-asking-for-a-business-registration-number-what-should-i-do-now)
- [Stripe Support: Vergünstigung Non-Profits (DE)](https://support.stripe.com/questions/fee-discount-for-nonprofit-organizations?locale=de-DE)
- [Stripe Support: Fee discount (EN)](https://support.stripe.com/questions/fee-discount-for-non-profit-organizations)
- [checkoutpage: Stripe für Non-Profits](https://checkoutpage.com/blog/stripe-for-nonprofits)
- [Stripe Doku Testing](https://docs.stripe.com/testing)
- [Stripe Connect Preise DE](https://stripe.com/de/connect/pricing)
- [Mollie Preise DE](https://www.mollie.com/de/pricing)
- [gocardless: Mollie oder Stripe](https://gocardless.com/de/handbuch/artikel/mollie-oder-stripe)
- [Mollie Hilfe: Dispute-Gebühren](https://help.mollie.com/hc/en-us/articles/35795203499154-What-fees-do-I-pay-for-disputes)
- [finexer: Mollie Pricing](https://blog.finexer.com/mollie-pricing/)
- [usagepricing: Mollie](https://www.usagepricing.com/blueprint/mollie)
- [Mollie Verifizierung](https://help.mollie.com/hc/en-us/articles/25897821634322)
- [Mollie Doku Testing](https://docs.mollie.com/reference/testing)
- [SumUp Preise DE](https://www.sumup.com/de-de/preise/)
- [SumUp Developer Online Payments](https://developer.sumup.com/online-payments/)
- [Wix: SumUp als Zahlungsanbieter](https://support.wix.com/de/article/sumup-als-zahlungsanbieter-einrichten)
- [OMR: Unzer Pricing](https://omr.com/de/reviews/product/unzer/pricing)
- [für-gründer.de: Unzer](https://www.fuer-gruender.de/wissen/unternehmen-fuehren/e-commerce/zahlungsdienstleister/unzer-financial-services/)
- [retail-news: Wero-Start](https://retail-news.de/wero-ecommerce-deutschland-start-erste-haendler/)
- [PAYONE Preisverzeichnis 03/2026 (PDF)](https://a.storyblok.com/f/64176/x/f819e7bf00/payone_plv_prasenz-fernabsatz_terminal_2026-03_de.pdf)
- [Sparkasse: PAYONE](https://www.sparkasse.de/fk/produkte/konto-und-zahlungsverkehr/kassieren-im-internet/payone.html)
- [trusted.de: PAYONE Kosten](https://trusted.de/payone-kosten)
- [Sparkasse: Wero für Händler](https://www.sparkasse.de/fk/produkte/konto-und-zahlungsverkehr/kassieren-im-internet/wero.html)
- [GIGA: Wero Pro Gebühren](https://www.giga.de/tech/wero-kosten-gebuehren-und-unterschiede-bei-wero-pro--01K4CW94WGWJX7CFAAFV4XHGQB)
- [IHK München: Konkurrenz für PayPal](https://www.ihk-muenchen.de/magazin/standortpolitik/konkurrenz-fuer-paypal-und-co.html)
- [mobiflip: Wero im Onlinehandel](https://www.mobiflip.de/wero-startet-im-onlinehandel-wer-mitmacht-und-wie-der-kaeuferschutz-funktioniert/)
- [VR Payment: Wero im Onlinehandel](https://www.vr-payment.de/produkte/e-commerce-payment/e-commerce-zahlungen/wero-im-onlinehandel)
- [yagemi: Wero für Händler](https://www.yagemi.de/blog/e-commerce/wero-onlineshop-haendler/)
- [Handelsblatt: Wero günstiger als PayPal](https://www.handelsblatt.com/finanzen/banken-versicherungen/banken/wero-guenstiger-als-paypal-so-will-der-bezahldienst-wero-den-handel-locken/100166024.html)
- [Sparkasse: Vereinskonto](https://www.sparkasse.de/fk/produkte/konto-und-zahlungsverkehr/geschaeftskonto/vereinskonto.html)
- [Qonto: Konto für e.V.](https://support-de.qonto.com/hc/en-us/articles/44165097961745-How-do-I-open-a-Qonto-account-for-my-registered-association-e-V)
- [VR Bank Prignitz: Unterlagen Vereine (PDF)](https://www.vrbprignitz.de/content/dam/f2697-0/Dokumente/Formulare/neukunde-kontoeroeffnung-vereine.pdf)
- [Berlin-Reinickendorf: Allgemeinverfügung 2026](https://www.berlin.de/ba-reinickendorf/aktuelles/pressemitteilungen/2026/pressemitteilung.1671863.php)
- [Landkreis Görlitz: Veranstaltungsverbot 01/2026 (PDF)](https://www.kodersdorf.de/wp-content/uploads/2026-01-09-AV-Veranstaltungsverbot-Gefluegel_Endfassung.pdf)
- [Hessen: Merkblatt Rassegeflügelausstellungen 08/2026 (PDF)](https://landwirtschaft.hessen.de/sites/landwirtschaft.hessen.de/files/2026-08/20260828_durchfuehrung_von_rassegefluegelausstellungen-maerkten_und_veranstaltungen_aehnlicher_art.pdf)

**Recht, Steuer, Datenschutz**
- [§ 2 ZAG](https://www.gesetze-im-internet.de/zag_2018/__2.html)
- [ZAG gesamt](https://www.gesetze-im-internet.de/zag_2018/BJNR244610017.html)
- [§ 34 ZAG (buzer)](https://www.buzer.de/34_ZAG.htm)
- [BaFin-Merkblatt ZAG](https://www.bafin.de/SharedDocs/Veroeffentlichungen/DE/Merkblatt/mb_111222_zag.html)
- [YPOG-Briefing ZAG-Merkblatt (PDF)](https://www.ypog.law/hubfs/YPOG%20Briefing_Aktualisierung%20ZAG%20Merkblatt_L%C3%B6sing.pdf)
- [Bird & Bird: BaFin ZAG Guidance](https://www.twobirds.com/en/insights/2023/germany/amendment-to-bafins-zag-guidance-notes)
- [Mollie Connect Overview](https://docs.mollie.com/docs/connect-overview)
- [Stripe Connect](https://stripe.com/en-id/connect)
- [UniCredit/Thede: Marktplatzmodelle (PDF)](https://gtgdownload.unicreditgroup.de/UniCredit_Marktplatzmodelle_Zahlungsdienste_15102025.pdf)
- [deutsche-startups.de: BaFin-Lizenz für Marktplätze](https://www.deutsche-startups.de/2015/04/23/ueber-die-erforderlichkeit-einer-bafin-lizenz-fuer-marktplaetze/?amp=1)
- [Rose & Partner: Lieferheld](https://www.rosepartner.de/blog/lieferheld-bafin-lizenz-finanztransfergeschaeft.html)
- [Rose & Partner: Finanztransfergeschäft](https://www.rosepartner.de/finanztransfergeschaeft-zag-anwalt.html)
- [Lackhoff, ZfgK 2010 (PDF)](https://www.kreditwesen.de/sites/default/files/content/articledownloads/2015/09/zf_12_10_503-504.pdf)
- [paytechlaw: Commercial Agent Exemption](https://paytechlaw.com/en/commercial-agent-exemption-zag/)
- [fin-law.de: Handelsvertreterausnahme](https://fin-law.de/en/zag/commercial-agent-exemption-in-the-zag/)
- [Worldline: PSD3/PSR](https://worldline.com/en/home/main-navigation/resources/blogs/2026/the-scope-and-timeline-are-locked-in-for-psd3-and-psr-what-should-psps-know)
- [KPMG Law: PSD3 und PSR](https://kpmg-law.de/psd3-und-psr-neue-payment-regulierung-fuer-zahlungsdienstleister-und-banken/)
- [Clifford Chance 04/2026 (PDF)](https://www.cliffordchance.com/content/dam/cliffordchance/briefings/2026/04/impact-of-psd3-are-you-ready.pdf)
- [Mondaq: PSD3 final compromise texts](https://www.mondaq.com/ireland/financial-services/1782218/psd3-and-psr-final-compromise-texts-published)
- [nexvyra: PSD3-Status](https://nexvyra.de/fakten/psd3-zahlungsdiensterichtlinie.html)
- [Haufe: Unternehmer § 14 BGB](https://www.haufe.de/id/beitrag/27-kaufrecht-aa-unternehmer-HI17045500.html)
- [OLG Brandenburg](https://gerichtsentscheidungen.brandenburg.de/gerichtsentscheidung/26139)
- [VIBSS: Widerrufsbutton § 356a BGB](https://www.vibss.de/vereinsmanagement/recht/besondere-rechtsthemen/der-widerrufsbutton-im-neuen-356a-bgb?type=123)
- [VIBSS: BFSG für Vereine](https://www.vibss.de/vereinsmanagement/recht/besondere-rechtsthemen/barrierefreiheitsstaerkungsgesetz?type=123)
- [§ 312g BGB](https://www.gesetze-im-internet.de/bgb/__312g.html)
- [IT-Recht Kanzlei: BGH Widerrufsausschluss Tickets](https://www.it-recht-kanzlei.de/bgh-widerrufsausschluss-veranstaltungstickets.html)
- [AG Würzburg 13.11.2020](https://www.gesetze-bayern.de/Content/Pdf/Y-300-Z-BECKRS-B-2020-N-49300?all=False)
- [IHK Darmstadt: Widerrufsfunktion](https://www.ihk.de/darmstadt/servicemarken/news/service/neue-widerrufs-funktion-im-online-handel-ab-juni-2026-6968218)
- [Rödl & Partner: Widerrufsbutton](https://www.roedl.com/insights/widerrufsbutton-neue-pflichten-online-haendler/)
- [IHK Frankfurt: Widerrufsbutton](https://www.frankfurt-main.ihk.de/recht/uebersicht-alle-rechtsthemen/vertragsrecht-und-e-commerce-recht/rechtliche-anforderungen-fuer-online-shops/uebersicht/widerrufsbutton-6933526)
- [§ 312j BGB](https://www.gesetze-im-internet.de/bgb/__312j.html)
- [IT-Recht Kanzlei: zwei Bestellbuttons LG Berlin](https://www.it-recht-kanzlei.de/zwei-bestellbuttons-verschiedene-Vertraege-lg-Berlin.html)
- [Otto Schmidt IT-Recht-Blog: Button-Lösung](https://www.otto-schmidt.de/blog/it-recht-blog/die-button-losung-im-online-handel-aktuelle-anforderungen-und-rechtliche-vorgaben-ITBLOG0007859.html)
- [beck-aktuell: EuGH C-400/22 Conny](https://www.beck-aktuell.de/heute-im-recht/rechtsprechung/eugh-c400-22-conny-mietrecht-verbraucherschutz-bestell-button-2024-05-31)
- [§ 1 PAngV](https://www.gesetze-im-internet.de/pangv_2022/__1.html)
- [IHK Köln: Preisangaben](https://www.ihk.de/koeln/hauptnavigation/recht-steuern/preisangaben-gegenueber-verbrauchern-5224662)
- [IHK Schleswig-Holstein: PAngV](https://www.ihk.de/schleswig-holstein/recht/wettbewerbsrecht/preisangabenverordnung-1359682)
- [LTO: BGH I ZR 203/19](https://www.lto.de/recht/nachrichten/n/bgh-i-zr203-19-zusatz-gebuehren-entgelt-zahlung-paypal-sofortueberweisung)
- [CMS: Entgelte für PayPal und Sofortüberweisung](https://cms.law/de/deu/legal-updates/bgh-entgelte-fuer-paypal-und-sofortueberweisung-rechtmaessig)
- [beck-aktuell: BGH PayPal-Gebühr](https://www.beck-aktuell.de/heute-im-recht/rechtsprechung/bgh-gebuehr-fuer-zahlung-per-sofortueberweisung-oder-paypal-zulaessig-2021-03-25)
- [ARAG: Impressum für Vereine](https://www.arag.de/vereinsversicherung/sicheres-impressum-fuer-vereine/)
- [MTH Partner: Impressum e. V.](https://www.mth-partner.de/internetrecht-aufbau-und-notwendige-angaben-des-impressums-eines-eingetragenen-vereins-e-v/)
- [IHK Aachen: Impressumspflicht](https://www.ihk.de/aachen/recht/rechtsinformationen/aktuelle-dokumente-zum-thema-recht/impressumspflicht-im-internet-607352)
- [lexmea: Art. 6 Rom I](https://lexmea.de/de/gesetz/rom-i-vo/art-6)
- [nexvyra: Gerichtsstand/Rom I](https://nexvyra.de/fakten/gerichtsstand-anwendbares-recht-auslandsreise-bruessel-ia-rom-i)
- [WKO: anwendbares Recht B2C (PDF)](https://www.wko.at/oe/handel/versandhandel/anwendbares-recht-bei-internationalen-vertraegen-b2c.pdf)
- [§ 52 AO](https://www.gesetze-im-internet.de/ao_1977/__52.html)
- [NWB: UStAE 12.3](https://datenbank.nwb.de/Dokument/378652_12___3/)
- [Haufe: UStAE 12.3](https://www.haufe.de/id/norm/umsatzsteuer-anwendungserlass-stand-zum-31122013-123-vatertierhaltung-foerderung-der-tierzucht-usw-12-abs-2-nr-4-ustg-HI6332664_p12.3.html)
- [Anlage 2 UStG](https://www.gesetze-im-internet.de/ustg_1980/anlage_2.html)
- [FG Nürnberg 2 K 114/19](https://rewis.io/urteile/urteil/rnp-21-01-2020-2-k-11419/)
- [IHK München: Grenzwerte Kleinunternehmer](https://www.ihk-muenchen.de/magazin/solo-selbststaendige/unternehmen-in-oberbayern/grenzwerte-beachten.html)
- [Haufe: Kleinunternehmer](https://www.haufe.de/thema/kleinunternehmer/)
- [Lexware: Kleinunternehmerregelung](https://www.lexware.de/artikel/die-kleinunternehmerregelung-im-ueberblick)
- [buzer: StÄndG 2025 Art. 5](https://www.buzer.de/gesetz/17325/a335481.htm)
- [CMS: Gemeinnützigkeitsrecht 2026](https://cms.law/de/deu/legal-updates/Vereinfachungen-im-Gemeinnuetzigkeitsrecht-zum-Jahr-2026)
- [ADVANT Beiten: StÄndG 2025](https://www.advant-beiten.com/aktuelles/steueraenderungsgesetz-2025-was-aendert-sich-im-gemeinnuetzigkeitsrecht)
- [BFH I R 15/07 (PDF)](https://kommunsense.de/wp_16/wp-content/uploads/promemoria/bfh/bfh_22_04_2009.pdf)
- [Finanzamt NRW: Tätigkeitsbereiche](https://www.finanzamt.nrw.de/en/node/276)
- [Lexware: Auszahlungen von Zahlungsdienstleistern verbuchen](https://help.lexware.de/de-form/articles/548916-auszahlungen-von-zahlungsdienstleistern-verbuchen-stripe-ebay-etsy-mollie-amazon-etc)
- [FreeFinance: Kartenabrechnungen](https://freefinance.at/anwendung/bankverbindung/kartenabrechnungen-buchen-und-abstimmen.html)
- [beancount: Stripe brutto/netto](https://beancount.io/de/blog/2026/08/25/how-to-reconcile-stripe-payouts-gross-vs-net-fees-refunds-guide)
- [Stripe Support: Global taxation of Stripe fees](https://support.stripe.com/questions/global-taxation-of-stripe-fees)
- [kostenlose-erechnung.de: PayPal/Stripe-Rechnung](https://kostenlose-erechnung.de/ratgeber/paypal-stripe-rechnung-zahlungslink/)
- [ELSTER-Forum: USt auf Gebühren](https://forum.elster.de/anwenderforum/forum/elster-webanwendungen/mein-elster/334864-umsatzsteuer-für-gebühren-von-payment-anbieter-sitz-in-irland)
- [IHK Frankfurt: Aufbewahrung](https://www.frankfurt-main.ihk.de/recht/uebersicht-alle-rechtsthemen/steuerrecht/abgabenordnung/aufbewahrung-von-geschaeftsunterlagen-5195530)
- [IHK Aschaffenburg: Aufbewahrung](https://www.ihk.de/aschaffenburg/recht/steuern/aufbewahrung-von-geschaeftsunterlagen-6837046)
- [Ecovis: Aufbewahrung](https://ecovis-kso.com/?p=24478)
- [drweb: Aufbewahrungsfristen 2026](https://www.drweb.de/aufbewahrungsfristen-2026-was-endlich-in-den-schredder-darf/)
- [e-recht24: Datenschutzerklärung PayPal](https://www.e-recht24.de/dsg/12713-paypal.html)
- [heise: Gutachten PayPal-Datenschutz](https://heise.de/-11112066)
- [retail-news: PayPal-Gutachten](https://retail-news.de/paypal-datenschutz-verstoesse-gutachten/)
- [xictron: Auftragsverarbeitung im Online-Shop](https://www.xictron.com/de/blog/auftragsverarbeitung-dienstleisterkontrolle-online-shop/)
- [Stripe DPA](https://stripe.com/legal/dpa)
- [Stripe DPA FAQ](https://stripe.com/en-fr/legal/dpa/faqs)
- [Stripe DPF Policy](https://stripe.com/legal/hr-data-privacy-framework)
- [Stripe Data Transfers Addendum](https://stripe.com/en-jp/legal/dta)
- [Mollie Help: DPA nötig?](https://help.mollie.com/hc/en-gb/articles/360002761193-Do-I-have-to-sign-a-data-processing-agreement-with-Mollie)
- [Mollie Help: What is the DPA](https://help.mollie.com/hc/en-gb/articles/14826542080786-What-is-the-Data-Processing-Agreement)
- [Mollie DPA](https://www.mollie.com/legal/data-processing-agreement)
- [EUR-Lex C/2025/6610](https://eur-lex.europa.eu/eli/C/2025/6610/oj)
- [Lewis Silkin: Latombe](https://www.lewissilkin.com/insights/2025/09/03/transatlantic-trouble-not-this-time-latombes-challenge-to-eu-us-data-transfers-fails)
- [digitalpolicyalert: Latombe-Rechtsmittel](https://digitalpolicyalert.org/event/35459-latombe-filed-appeal-against-general-court-dismissal-of-challenge-to-european-unionunited-states-data-protection-framework-adequacy-decision-in-latombe-v-commission)
- [eucrim: DPF bestätigt](https://eucrim.eu/news/general-court-confirms-adequacy-of-us-data-protection/)
- [Lexware Muster-Datenschutzerklärung (PDF)](https://lexware.de/fileadmin/wissen-tipps/basic-tools/muster-datenschutzerklaerung24.pdf)
- [PayPal Data Protection Addendum](https://www.paypal.com/de/webapps/mpp/ua/bt-data-protection)
- [§ 3 BFSG](https://www.gesetze-im-internet.de/bfsg/__3.html)
- [§ 2 BFSG](https://www.gesetze-im-internet.de/bfsg/__2.html)
- [ehrenamt24: Factsheet BFSG (PDF)](https://www.ehrenamt24.de/fileadmin/user_upload/Dokumente_von_e24/Factsheet-Barrierefreiheitsgesetz-fuer-Vereine.pdf)
- [Händlerbund: Kleinstunternehmen-Ausnahme](https://ohn.haendlerbund.de/recht/rechtsfragen/kleinstunternehmen-bfsg-ausnahme)
- [IHK Coburg: BFSG-Vortrag (PDF)](https://www.ihk.de/blueprint/servlet/resource/blob/6610142/b27882265f8da4b04123ebfc27ca9240/vortrag-ihk-coburg-bfsg-2025-6-6-barrierefrei-data.pdf)
- [§ 675x BGB](https://www.gesetze-im-internet.de/bgb/__675x.html)
- [Verbraucherzentrale: SEPA-Lastschrift](https://www.verbraucherzentrale.de/wissen/geld-versicherungen/sparen-und-anlegen/bezahlen-per-lastschrift-16639)
- [Sparkasse: SEPA-Lastschrift](https://www.sparkasse.de/pk/produkte/konten-und-karten/banking/ueberweisung/sepa/sepa-lastschrift.html)

**Technik**
- [Stripe: Bestellungen ausführen](https://docs.stripe.com/checkout/fulfillment?ui=full-page)
- [Stripe: Create a Checkout Session](https://docs.stripe.com/api/checkout/sessions/create)
- [Stripe: Metadata](https://docs.stripe.com/api/metadata)
- [Stripe: Webhooks](https://docs.stripe.com/webhooks)
- [Stripe: Create a webhook endpoint](https://docs.stripe.com/api/webhook_endpoints/create)
- [Stripe: List all events](https://docs.stripe.com/api/events/list)
- [Stripe: Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [Stripe: SEPA-Lastschriftzahlungen](https://docs.stripe.com/payments/sepa-debit)
- [Stripe: Refunds API](https://docs.stripe.com/api/refunds/create)
- [Stripe: Payment Links](https://docs.stripe.com/payment-links)
- [Stripe: Payment-Links-URL-Parameter](https://docs.stripe.com/payment-links/url-parameters)
- [Stripe: API-Schlüssel](https://docs.stripe.com/keys)
- [Stripe Apps: RAK-Authentifizierung](https://docs.stripe.com/stripe-apps/api-authentication/rak)
- [Stripe: Connect OAuth-Referenz](https://docs.stripe.com/connect/oauth-reference)
- [Bun Hashing](https://bun.com/docs/api/hashing)
- [PayPal: Authentication](https://developer.paypal.com/api/rest/authentication/)
- [PayPal: Orders v2](https://developer.paypal.com/docs/api/orders/v2/)
- [PayPal: Checkout-Webhooks](https://developer.paypal.com/payment-methods/webhooks)
- [PayPal: Idempotency](https://developer.paypal.com/api/rest/reference/idempotency/)
- [PayPal: Webhooks (REST)](https://developer.paypal.com/api/rest/webhooks/rest/)
- [PayPal: Webhooks v1](https://developer.paypal.com/docs/api/webhooks/v1/)
- [PayPal: Payments v2](https://developer.paypal.com/docs/api/payments/v2/)
- [PayPal: Seller onboarding](https://developer.paypal.com/platforms/seller-onboarding/)
- [PayPal: Build onboarding](https://developer.paypal.com/platforms/seller-onboarding/build-onboarding)
- [Mollie: Create payment](https://docs.mollie.com/reference/create-payment)
- [Mollie: Create refund](https://docs.mollie.com/reference/create-refund)
- [Mollie: Webhooks](https://docs.mollie.com/reference/webhooks)
- [Mollie: Next-gen webhooks](https://docs.mollie.com/reference/webhooks-new)
- [Mollie: Webhooks Best practices](https://docs.mollie.com/reference/webhooks-best-practices)
- [Hookdeck: Mollie-Webhooks](https://hookdeck.com/webhooks/platforms/guide-to-mollie-webhooks-features-and-best-practices)
- [Mollie: API idempotency](https://docs.mollie.com/reference/api-idempotency)
- [Mollie: Handling payment status](https://docs.mollie.com/docs/handling-payment-status)
- [Mollie Hilfe: offener Status](https://help.mollie.com/hc/en-us/articles/360036089653-Why-is-a-transaction-still-open)
- [Mollie: SEPA Direct Debit](https://docs.mollie.com/docs/sepa-direct-debit)
- [Mollie: Authentication](https://docs.mollie.com/reference/authentication)
- [Mollie Hilfe: What is an API key?](https://help.mollie.com/hc/en-us/articles/115000328205)
- [Odoo-Doku: Mollie](https://www.odoo.com/documentation/17.0/applications/finance/payment_providers/mollie.html)
- [Mollie: Authentication via OAuth](https://docs.mollie.com/docs/authentication-via-oauth)
- [Mollie: Create payment link](https://docs.mollie.com/reference/create-payment-link)
- [OWASP: Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

**Alternativen (EPC-QR, SEPA Instant, Wero, Abgleich)**
- [EPC069-12 v3.0 (PDF)](https://europeanpaymentscouncil.eu/sites/default/files/kb/file/2022-09/EPC069-12%20v3.0%20Quick%20Response%20Code%20-%20Guidelines%20to%20Enable%20the%20Data%20Capture%20for%20the%20Initiation%20of%20an%20SCT_0.pdf)
- [Wikipedia: EPC QR code](https://en.wikipedia.org/wiki/EPC_QR_code)
- [Febelfin: QR auf Rechnung (PDF)](https://febelfin.be/media/pages/publicaties/2023/febelfin-standaarden-voor-online-bankieren/93f44d7850-1744012292/febelfin-ig-qroninvoice.pdf)
- [Sparkasse: GiroCode](https://www.sparkasse.de/pk/produkte/konten-und-karten/banking/ueberweisung/girocode.html)
- [Betaalvereniging: QR codes](https://www.betaalvereniging.nl/en/knowledge-base/online-payments/qr-codes/)
- [Finanssiala: QR-koodin käyttö (PDF)](https://www.finanssiala.fi/wp-content/uploads/2021/03/QR_koodin_kaytto_tilisiirtolomakkeella.pdf)
- [Bank Austria MobileBanking](https://apps.apple.com/at/app/bank-austria-mobilebanking/id425126662)
- [QR-platba-Standard ČBA (PDF)](https://qr-platba.cz/wp-content/uploads/QR_platba_standard_CBA.pdf)
- [SIX: QR-Rechnung light](https://www.six-group.com/de/site/pay-magazine/experts/qr-bill-light-in-sepa.html)
- [Payment Expert: neuer QR-Standard](https://paymentexpert.com/2026/01/23/new-european-qr-code-standard/)
- [kostenlose-erechnung.de: GiroCode auf Rechnung](https://kostenlose-erechnung.de/ratgeber/girocode-auf-rechnung/)
- [Bundesbank FAQ Echtzeitüberweisungen/VoP](https://www.bundesbank.de/dynamic/action/de/aufgaben/unbarer-zahlungsverkehr/veroeffentlichungen/fragen-und-antworten-zu-echtzeitueberweisungen-und-empfaengerueberpruefung/963980/fragen-und-antworten-zu-echtzeitueberweisungen-und-empfaengerueberpruefung-)
- [BaFin FAQ VO Echtzeitüberweisungen](https://www.bafin.de/SharedDocs/Fragen-antworten/DE/faq-voechtzeitueberweisungen/faq-voechtzeitueberweisungen_node.html)
- [WKO: EU-Instant-Payment-Verordnung](https://www.wko.at/bank-versicherung/eu-instant-payment-verordnung)
- [KPMG: Instant-Payment-Verordnung](https://kpmg.com/de/de/branchen/finanzbranche/banken/instant-payment-verordnung.html)
- [Art. 5b VO 260/2012 (gesetze.legal)](https://gesetze.legal/eu/vo_eu_2012_260/5b)
- [Verbraucherzentrale Niedersachsen: Empfängerüberprüfung](https://verbraucherzentrale-niedersachsen.de/themen/finanzen/banken-zahlungsverkehr/empfaengerueberpruefung-soll-ueberweisen-sicherer-machen)
- [BaFin: Empfängerüberprüfung](https://www.bafin.de/DE/verbraucherinnen-verbraucher/themen-finanzprodukte/konten-zahlungen/zahlungen/ueberweisungen-und-lastschriften/empfaengerueberpruefung/empfaengerueberpruefung_node.html)
- [Öko-Test: Echtzeitüberweisung](https://www.oekotest.de/geld-versicherungen/Mehr-Schutz-bei-sekundenschnellem-Ueberweisen--das-aendert-sich-fuer-Bankkunden-_15789_1.html)
- [cash-online: vzbv-Kritik](https://www.cash-online.de/a/empfaengerueberpruefung-vzbv-fehlalarme-727448/)
- [EPI: Wero in Luxemburg](https://epicompany.eu/media-insights/epi-initiates-wero-in-luxembourg/)
- [EPI Key Figures](https://epicompany.eu/key-figures/)
- [iDEAL: Übergang zu Wero](https://ideal.nl/en/ideal-vanaf-2026-stapsgewijs-over-naar-wero)
- [Rabobank: iDEAL wordt Wero](https://www.rabobank.nl/bedrijven/service/betalen-en-ontvangen/idealnaarwero)
- [DutchNews: iDEAL verschwindet](https://www.dutchnews.nl/2025/12/ideal-to-disappear-as-european-payment-system-wero-rolls-out/)
- [teltarif: Giropay-Abschaltung](https://www.teltarif.de/arch/2025/kw01/s97450.html)
- [ING: Wero online](https://ing.com/news/2026/wero-expands-to-online-shopping-in-germany.html)
- [banking.vision: Wero 2025/2026](https://banking.vision/en/development-wero-2025-2026)
- [mobiflip: Wero-Verzögerung](https://www.mobiflip.de/europas-grosse-payment-hoffnung-wero-fuer-online-shopping-verzoegert-sich/)
- [heise: Wero für Solo-Selbstständige](https://www.heise.de/news/Wero-fuer-Solo-Selbststaendige-geht-in-Betrieb-10369701.html)
- [Volksbank pur: Wero](https://www.volksbank-pur.de/banking-und-vertraege/banking/banking-app/wero.html)
- [Sparkasse: Wero (PRO-Merkmal)](https://www.sparkasse.de/pk/produkte/konten-und-karten/bezahlverfahren/wero.html)
- [WinFuture: Wero-Cent-Zahlungen an Verein](https://winfuture.de/news,161647.html)
- [demoshops.de: Inklu Fusion](https://demoshops.de/mit-wero-spenden-inklufusion/)
- [KSK Esslingen: Wero-Vereinskampagne](https://www.ksk-es.de/de/home/ihre-sparkasse/kee/unser-engagement/wero-vereinskampagne.html)
- [VR Memmingen: Abschaltung MT940](https://www.vr-memmingen.de/banking-und-vertraege/banking/banking-firmenkunden/abschaltung-mt940-format.html)
- [Sparkasse Nürnberg: Formatabkündigung](https://www.sparkasse-nuernberg.de/fi/home/produkte/banking-und-software/weitere-services/formatabkuendigung.html)
- [VR Nordoberpfalz: Abschaltung MT-Formate](https://www.vr-nordoberpfalz.de/banking-und-vertraege/banking/banking-firmenkunden/abschaltung-mt-formate.html)
- [Volksbank Backnang: Umsätze exportieren (PDF)](https://www.volksbank-backnang.de/content/dam/f0012-0/cloud-transfer/dokumente/downloads---leitfäden/Anleitung%20zum%20Export%20von%20Umsätzen%20im%20OnlineBanking.pdf)
- [CTAN bankstatement](https://ctan.org/pkg/bankstatement)
- [fints.org: Produktregistrierung](https://www.fints.org/de/hersteller/produktregistrierung)
- [Volksbank Allgäu-Oberschwaben: Hinweise FinTS (PDF)](https://www.volksbank-allgaeu-oberschwaben.de/content/dam/f0100-0/dateien_vbao/zahlungsverkehr/Download/Hinweise%20f%C3%BCr%20Nutzer%20von%20FINTS.pdf)
- [KMyMoney-Mailingliste](https://mail.kde.org/pipermail/kmymoney/2020-December/003575.html)
- [VKB-Bank: 90 → 180 Tage](https://developer.vkb-bank.at/announcement-increase-account-access-account-information-without-sca-90-180-days)
- [EBA Q&A 2023_6820](https://www.eba.europa.eu/single-rule-book-qa/qna/view/publicId/2023_6820)
- [CMS: Kontoinformationsdienste](https://cms.law/de/deu/publication/neue-regelungen-fuer-kontoinformationsdienste)
- [GoCardless: new signups disabled](https://bankaccountdata.gocardless.com/new-signups-disabled)
- [Actual Budget: GoCardless](https://actualbudget.org/docs/advanced/bank-sync/gocardless/)
- [Enable Banking FAQ](https://enablebanking.com/docs/faq)
- [Enable Banking: restricted mode](https://enablebanking.com/docs/api/linked-accounts/)
- [finAPI Preise](https://www.finapi.io/en/prices/)
- [Open Banking Tracker: Free APIs 2026](https://www.openbankingtracker.com/guides/free-open-banking-apis)

---

**Für die Umsetzung im Repo (geprüft, nichts geändert):**
- `qrcode` 1.5.4 liegt in `apps/web/package.json`.
- Der A-Bogen entsteht in `apps/server/src/pdf/a-bogen.ts` (pdfkit, kein QR-Paket im Server).
- Die vorhandene SEPA-Logik steht in `packages/domain/src/sepa.ts`, `packages/domain/src/lastschrift.ts` und `docs/entscheidungen/018-sepa-lastschrift.md`.
