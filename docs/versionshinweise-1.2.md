# SchauFUCHS 1.2.0 – Versionshinweise

15.11.2026

Die Schauverwaltung heißt jetzt **SchauFUCHS** und hat ein eigenes Zeichen: einen Fuchs mit Schreibunterlage. Name und Zeichen
stehen in der Seitenleiste, auf der Anmeldeseite, im Browser-Tab, auf dem Preisrichter-Tablet, in den Mails und in den PDFs.
Eine installierte App behält ihren Platz auf dem Startbildschirm und zeigt nach dem nächsten Öffnen Name und Zeichen neu.
Die Versionsnummer steht im Benutzermenü und unter `/api/gesund`. Gegenüber 1.0.0 (13.11.2026) ist neu:

## Ablauf

- Seitenleiste nach dem Ablauf einer Schau: Vorbereitung, Meldephase, nach dem Meldeschluss (Käfige, Hallenplan,
  Katalognummern, Katalog), Schautag. Die Phase „Katalog“ heißt „Katalog & Halle“; der Hallenplan steht in der Prüfliste.
- Katalognummern: Sortierreihenfolge wählbar, auch nach Verein und Ausstellernummer.
- Speichern oben rechts: Die Kopfleiste bleibt beim Scrollen stehen und zeigt bei ungespeicherten Änderungen „Verwerfen“ und
  „Speichern“.
- Nach abgelaufener Anmeldung führt die Anmeldung zurück auf die Seite, die man öffnen wollte.
- Automatische Abmeldung nach Untätigkeit, je Rolle einstellbar (Administratoren, Mitarbeiter, Preisrichter; 5 bis 120
  Minuten) unter „Verein und Datenschutz“; Hinweis in der letzten Minute.
- Preisrichter-Einteilung verteilt im Verhältnis der Höchstzahlen (Obmann bekommt weniger Tiere).
- Veterinärämter: alle zuständigen Ämter Deutschlands als Vorschläge im Feld „Zuständiges Veterinäramt“.

## Hallenplan

- Ein Halleneditor für alles: Einstellungen der Halle, Eingänge und Flächen im Plan, Stellvorschläge, automatisches
  Festschreiben, Rückgängig, Zoom, Tastenkürzel, mehrere Teile zugleich verschieben.
- Lückenlose Reihen: Sparten und Käfigarten laufen ohne Lücke durch, Reihen gleich lang, Restplätze dürfen gemischt werden.
- Käfigfront zum Gang, Rückwände von oben erkennbar, Käfige an der Wand mit der Rückwand zur Wand.
- Tische, Bänke und Garnituren stehen frei und verschieben nie Käfige.
- Fehlende Käfige anzeigen und einsetzen, Etagen je Käfigart, Reihennamen am Rand.
- Tiere im Editor versetzen oder tauschen; „Nach Plan nummerieren“ lässt versetzte Tiere stehen.
- Druck auf einem Blatt DIN A4, Aufbauliste als eigenes PDF.
- Hallenplan in 3D im eigenen Tab: Wände wie in einer Turnhalle, weiße Sockelverkleidung, Ausstellungskäfige und Volieren.

## Katalog

- Seite „Katalog“ mit Reitern, Gliederung und Live-Vorschau; mehr Farben und Gestaltung.
- Seite „Kommende Schauen“ mit Kreiswahl, Terminpflege und Kalender-Abos.

## Technik

- Prüfkette (CI) bei jedem Push: Typprüfung, Modulkarte, Domain- und Server-Tests.
- Wegweiser für die Weiterentwicklung: `docs/architektur.md`, `docs/modulkarte.md`, Entscheidungen in `docs/entscheidungen/`.
