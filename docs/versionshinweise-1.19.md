# SchauFUCHS 1.19 – Versionshinweise

## 1.19.0 (22.11.2026)

Gegenüber 1.18.0 ist neu:

### Hallenplan

- **Pokaltisch:** Unter „Einsetzen“ gibt es „Pokaltisch (Ehrenpreise)“ – ein Tisch mit Pokalen, im Plan und im Druck mit
  Pokalsymbol und eigener Legende, in 3D mit Pokalen auf der Platte. Wie alle Möbel keine Sperrfläche.
- **Speichern ohne Netz:** Bricht die Verbindung ab, sendet der Editor die Änderung von selbst erneut, sobald der Server
  wieder erreichbar ist. Oben rechts steht dann „Keine Verbindung – wird erneut gesendet“; wer die Seite verlassen will,
  wird gewarnt. Kam die Änderung doch schon an, gilt sie als gespeichert.
- **Entwurf laden:** Ist der Katalog gedruckt oder sind schon Tiere eingeliefert, fragt SchauFUCHS vor dem Laden oder
  Entscheiden nach.

### Preisrichter

- **Gruppen:** Rassen bekommen eine Gruppe (z. B. A–M, Z1–Z3), pflegbar unter „Rassen und Farbenschläge“ und per Import.
  Preisrichter lassen sich für Gruppen zulassen; die Einteilung prüft das wie bei den Sparten. Rassen ohne Gruppe
  schränken nicht ein.
- **Obmann für einen Preisrichter:** Im Dialog „Preisrichter bearbeiten“ wählbar, steht im Kopf der Bewertungsliste.
- **Zusage:** offen, zugesagt oder abgesagt, mit „zugesagt für“ und Vorbehalt; als Marke in der Liste.
- **Preisrichterverpflichtung (PDF):** Brief mit Abschnitt zum Abtrennen (Zusage, Gruppen zum Ankreuzen, Vorbehalt,
  Datum, Unterschrift) – je Preisrichter oder für alle.
- **Bewertungsliste** wie die Papiervorlage: zweispaltig, Zwischenköpfe je Rasse und Farbenschlag, Spalten für Note,
  Punkte und Preis, Obmann im Kopf.

### Weitere

- **Preisverteilung:** Gestiftete Preise „zusätzlich je Preisrichter“ bekommen auf dem Blatt jedes Preisrichters ihre
  Zeilen zum Eintragen; Preise aus einer Stiftung stehen zusätzlich darauf.
- **Bilder hineinziehen:** In Bildfeldern (z. B. Grußwort, Katalogbilder) nimmt SchauFUCHS ein ins Fenster gezogenes Bild
  an; der Browser will die Seite nicht mehr verlassen.

Handbuch: Abschnitte Hallenplan, Preisrichter, Preise und Katalog.

### Update

`sudo schaufuchs update` sichert vorher und holt 1.19.0. Die Datenbank bekommt neue Spalten für Gruppen, Obmann und
Zusage der Preisrichter; vorhandene Daten bleiben unverändert.
