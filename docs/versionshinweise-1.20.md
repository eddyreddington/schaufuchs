# SchauFUCHS 1.20 – Versionshinweise

## 1.20.0 (22.11.2026)

Gegenüber 1.19.0 ist neu:

### Hallenplan in 3D

- **Aussehen der Halle:** In den Eigenschaften der Halle neu „Aussehen (3D)“: Boden (Parkett, Sportboden, Estrich),
  Boden mit Folie abgedeckt, Farbe und Höhe der Prallwand, Wand- und Firsthöhe (Satteldach), Fenster, Holzdecke mit
  Leuchten, Spielfeldlinien und Sportgeräte. Wer die Holzdecke einschaltet, bekommt eine Halle mit 7 m Wand und 9 m First
  vorgeschlagen; die Leuchten hängen nie tiefer als 1,50 m über den Käfigen. Das Aussehen ändert nur die Darstellung –
  der Plan, die Käfige und die Katalognummern bleiben (Entscheidung 028).
- **Folie:** In der 3D-Ansicht schaltet der Knopf „Folie“ die Bodenabdeckung ein und aus, ohne etwas zu speichern.
- **Realistischer:** Parkett im Würfelmuster, Prallwand mit Paneelen, Fenster, wärmeres und weicheres Licht. Die Farben
  der Käfige entsprechen der Legende. Das Meterraster gehört nicht mehr zum heruntergeladenen 3D-Modell.

### Jugend

- **Jugend im Katalog:** In den Einstellungen unter „Katalog und Preise“ jetzt eine Auswahl statt eines Hakens:
  „eigener Block am Ende“ (wie bisher) oder „in der Rasse eingereiht“. Gilt für Katalognummern, Nachmeldungen, Hallenplan,
  Katalog, Kurzkatalog, Rassenverzeichnis und öffentliche Ergebnisse. Nach dem Festschreiben der Nummern gesperrt.
- **Jugend in der Preisrichter-Einteilung:** Im Reiter „Einteilung nach Rassen“ wählbar: „mit der Rasse“ (wie bisher)
  oder „separat“ – dann bekommt die Jugend je Rasse eigene Zeilen („Jugend: Brahma“) mit eigenem Preisrichter;
  „Gleichmäßig verteilen“ berücksichtigt sie. Beim Umschalten meldet SchauFUCHS Tiere, die danach ohne Preisrichter sind.

### Preisrichter

- **Rückmeldetermin:** Unter „Termine“ neu „Rückmeldung der Preisrichter bis“. Steht er fest, nennen ihn der
  Verpflichtungsbrief und der Abschnitt zum Abtrennen.
- **Eigener Brieftext:** In der Briefvorlage des Vereins neuer Reiter „Preisrichterverpflichtung“ mit Betreff und Text,
  Platzhalter z. B. {Schau}, {Ort}, {Bewertungstag}, {Rückmeldung}. Leer bleibt der feste Text.
- **Schau aus Vorlage:** Preisrichter kommen mit Sparten, Gruppen und Obmann mit; die Zusage beginnt wieder bei „offen“,
  „zugesagt für“ und Vorbehalt sind leer.

### Preise

- **Zusatzpreise je Preisrichter:** Gestiftete Preisarten mit „zusätzlich je Preisrichter“ zählen die Preise ohne Stiftung
  jetzt je Preisrichter – keiner kann mehr vergeben, als ihm zusteht, auch wenn ein anderer weniger nutzt. Bei Kontingent
  „je Schau“ gilt die Summe für die ganze Schau. Preise aus einer Stiftung zählen weiter gegen die Stiftung. Vergabe,
  Seite „Preise“, Prüfliste und Preisverteilung rechnen gleich. Liegt eine noch nicht freigegebene Schau darüber, sind
  vor der Freigabe Preise zu entfernen; bei schon freigegebenen ist es nur ein Hinweis.

Handbuch: Abschnitte Hallenplan in 3D, Katalog, Preisrichter, Briefvorlage und Preise, mit neuen Bildern.

### Update

`sudo schaufuchs update` sichert vorher und holt 1.20.0. Die Datenbank bekommt neue Spalten für die Jugend in der
Einteilung und den Rückmeldetermin; vorhandene Daten bleiben unverändert.
