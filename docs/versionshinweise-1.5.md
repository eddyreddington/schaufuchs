# SchauFUCHS 1.5 – Versionshinweise

## 1.5.0 (16.11.2026)

Gegenüber 1.4.0 ist neu:

### Online-Meldung in mehreren Sprachen

- Schauseite, Meldeformular, „Meine Meldung“, Ergebnisse, Impressum und Datenschutz gibt es auf Deutsch, Deutsch
  (Schweiz), Englisch, Französisch, Niederländisch, Polnisch und Tschechisch. Die Seite öffnet in der Sprache des
  Browsers, oben rechts lässt sie sich umstellen; `?sprache=en` im Link wählt sie fest.
- Die Sprache steht an der Meldung: Eingangsbestätigung, Absage und SEPA-Vorabankündigung gehen in dieser Sprache hinaus.
- Texte des Vereins, Rassen und Farbenschläge, Bewertungen, Impressum und Datenschutzhinweise bleiben deutsch; die
  Seiten sagen das in der Sprache des Ausstellers. Die Oberfläche des Vereins bleibt deutsch.
- Die Übersetzungen sind noch nicht von Muttersprachlern geprüft – Verbesserungen bitte als Issue.

### Update

`sudo schaufuchs update` sichert vorher und holt 1.5.0. Die Datenbank bekommt eine Spalte (Sprache der Meldung);
bestehende Meldungen stehen auf Deutsch.
