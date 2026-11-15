# SchauFUCHS 1.3 – Versionshinweise

## 1.3.0 (15.11.2026)

Gegenüber 1.2.1 ist neu:

### SEPA-Lastschrift

- Das Meldegeld per SEPA-Basislastschrift einziehen: Gläubiger-ID des Vereins, Mandate je Aussteller (IBAN
  verschlüsselt, nur Konten in EU/EWR, wiederkehrend oder einmalig, Widerruf, Verfall nach 36 Monaten).
- Seite „Lastschrift“: Fälligkeit (vorgeschlagen 14 Tage, frühestens der zweite Bankarbeitstag), Vorabankündigung per
  E-Mail, Datei für das Online-Banking (pain.008), Eingang buchen, Verwerfen, Rücklastschrift.
- Solange eine Lastschriftdatei offen ist, ändert nichts den eingezogenen Betrag (Zahlung, Storno, Gebühren, Absage,
  Auszahlung, Abschluss …); kein doppelter Einzug neben der Kasse. Bar und Überweisung bleiben überall möglich.

### Hallenplan

- Freier Grundriss: die Halle muss kein Rechteck sein – Wände ziehen und teilen (L-, T-, U-Form, Nischen); Planung,
  Druck und 3D richten sich danach.
- Entwürfe: mehrere Hallenpläne einer Schau speichern, laden und sich für einen entscheiden; die übrigen kommen ins
  Archiv und lassen sich in späteren Schauen laden.
- Oben rechts steht, ob alles gespeichert ist.
- 3D-Ansicht mit dezenter Umgebung: Himmel, Wiese, Parkplatz vor dem Haupteingang, Sportplatz, ein paar Bäume – die
  Halle bleibt im Mittelpunkt.

### Teilschauen

- Eine Ausstellung aus mehreren Abteilungen (z. B. Landesschau, Kreisschau, Jugendschau): Meldungen je Teilschau,
  Katalognummern fortlaufend über alle, Überschriften im Katalog.

### Datenschutz und Sicherheit

- Auskunft nach Art. 15 enthält Lastschriftmandate und Einzüge; beim Löschwunsch verschwinden Bankdaten und Namen
  auch aus früheren Lastschriftdateien, ebenso die Daten der Spender im Protokoll.
- Verschlüsselte Spalten nehmen in Produktion keinen unverschlüsselten Inhalt an.
- Datenschutzhinweise um Lastschrift und Mandate ergänzt.
- Weitere Prüfungen aus einem Audit: Teilschau nach dem Festschreiben fest, Datumsangaben in deutscher Zeit überall
  gleich, Zahlarten einheitlich beschriftet.

### Update

`sudo schaufuchs update` sichert vorher und holt 1.3.0. Die neuen Tabellen (Hallenplan-Entwürfe, Lastschrift) und
Spalten (Teilschau, Gläubiger-ID) legt SchauFUCHS beim Start selbst an; vorhandene Hallen bleiben Rechtecke, bis ein
Grundriss gezeichnet wird.
