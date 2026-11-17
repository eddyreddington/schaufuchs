# SchauFUCHS 1.9 – Versionshinweise

## 1.9.1 (17.11.2026)

Gegenüber 1.9.0:

- Fehlermeldungen beim Öffnen von PDFs und Dateien (z. B. „keine Berechtigung“, „Katalog noch nicht veröffentlicht“)
  erscheinen in der gewählten Sprache – auch im neuen Browser-Tab und auf den Seiten für Aussteller.
- Kalender-Abo: Kann der Kalender nicht abgerufen werden, steht ein verständlicher Grund da (z. B. „Der Server lehnt die
  Verbindung ab“, „Das Zertifikat ist abgelaufen“) statt einer technischen Meldung – in allen Sprachen.
- Unerwartete Fehler beim Erstellen der SEPA-Dateien, beim Kontoauszug-Import, beim Einspielen von Demodaten und beim
  Kalender-Abo zeigen keine technischen Einzelheiten mehr, sondern einen allgemeinen Satz („Interner Fehler …“ bzw. „Die
  Datei ließ sich nicht lesen.“); die Einzelheiten stehen im Protokoll des Servers. Fehler in den Angaben (IBAN,
  Gläubiger-ID, unbekanntes Dateiformat) werden wie bisher genannt.

`sudo schaufuchs update` holt 1.9.1; an den Daten ändert sich nichts.

## 1.9.0 (17.11.2026)

Gegenüber 1.8.0 ist neu:

### Die ganze Oberfläche in sieben Sprachen

- Anmeldung, Verwaltung (Ausstellungsleitung und Helfer), Preisrichter-Tablet und die Fehlermeldungen gibt es jetzt auf
  Deutsch, Deutsch (Schweiz), Englisch, Französisch, Niederländisch, Polnisch und Tschechisch. Bisher waren nur die
  Seiten für Aussteller übersetzt (1.5.0).
- Die Sprache wählen Sie auf der Anmeldeseite unten oder angemeldet im Benutzermenü unten in der Seitenleiste. Sie wird
  mit Ihrem Zugang gespeichert und gilt auf jedem Gerät; jeder Helfer stellt seine eigene ein. Das Preisrichter-Tablet
  merkt sich die Wahl am Gerät und bleibt offline benutzbar.
- Ohne eigene Wahl bleibt alles deutsch – wer bisher deutsch arbeitet, merkt vom Update nichts.
- Deutsch bleiben Ihre eigenen Texte, das Rassen- und Farbenschlagverzeichnis, Bewertungstexte, alle Drucke und PDFs,
  Impressum, Datenschutz, Protokoll, Mails an Benutzer und die Handbücher. Handbuch: Abschnitt 1.6.

### Update

`sudo schaufuchs update` sichert vorher und holt 1.9.0. Die Tabelle der Benutzer bekommt eine Spalte für die Sprache;
vorhandene Daten ändern sich nicht.
