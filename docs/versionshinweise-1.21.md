# SchauFUCHS 1.21 – Versionshinweise

## 1.21.0 (22.11.2026)

Gegenüber 1.20.0 ist neu:

### Ablauf: Hallenplan vor den Katalognummern

- **Reihenfolge nach dem Meldeschluss:** Einteilung nach Rassen → Käfige → Hallenplan → Katalognummern (nach dem Plan) →
  Katalog. Die Phase heißt jetzt „Halle & Katalog“; die Übersicht führt zuerst zum Hallenplan, die Prüfliste nennt ihn
  vor den Katalognummern.
- **Seite „Katalognummern“:** Steht ein fester, aktueller Hallenplan, ist „Nach Hallenplan vergeben“ der erste Weg;
  „Ohne Hallenplan vergeben“ fragt nach. Ein veralteter Plan wird als Hinweis gemeldet statt mit einem Fehler.
- **Preisrichter im Plan schon vor den Nummern:** Die Käfige tragen die Farbe aus der Einteilung nach Rassen (auch Jugend
  separat), in den Käfig-Angaben als „vorgesehen“. Die Farben richten sich nach der Lage im Plan und wechseln beim
  Nummerieren nicht mehr (Entscheidung 031).

### Hallenplan

- **Rückwand an Rückwand:** Stellt man Käfige, Grundplatten oder Volieren aneinander – beim Verschieben, Einsetzen und
  Drehen –, dreht das gestellte Teil so, dass Rückwand an Rückwand steht und keine Front verdeckt ist, auch an der
  Seitenwand eines Nachbarn. Gedreht wird nur, wenn die Front danach frei ist; eine Reihe dreht nur als Ganzes.
  Innenwände eines freien Grundrisses zählen jetzt als Wand, auch in der Prüfliste (Entscheidung 030).
- **Türen in 3D:** Jeder Eingang hat eine Tür – „wie Wand“ (Vorgabe, bündig in der Prallwand), Glastür, Holztür oder
  offen; ab 1,30 m zweiflügelig. Einstellbar beim gewählten Eingang.
- **Schatten in 3D** heller und weicher, die Sonne steht höher.
- Das heruntergeladene 3D-Modell enthält Wände und Türen voll sichtbar.

### Drucke

- **Formate aller Drucke** im Reiter „Druck“ als Übersicht; neu umstellbar: Bewertungsliste (A4 oder A5),
  Kaufbeleg und Kassenbelege (A5 quer oder A4 mit Schnittlinie), Hallenplan (A4 oder A3) (Entscheidung 029).
- Eine Schau aus der Vorlage übernimmt Formate und Kartenvorlage.
- **Behoben:** Einzahlungsquittung und Eigenbeleg ergaben drei Seiten statt einer.

### Jugend

- **„Jgd.“** bei „Jugend im Katalog: in der Rasse eingereiht“ hinter dem Aussteller im Katalog, als Marke „Jugend“ in
  den öffentlichen Ergebnissen. Wird es eng, kürzt der Katalog zuerst den Vornamen („Schmidt, W. Jgd.“).
- **Datenschutz:** Die öffentlichen Ergebnisse liefern kein verstecktes Merkmal „Jugend“ je Tier mehr aus – nur, was
  die Seite auch zeigt.

### Weitere

- Der Editor bereinigt die Halle beim Ändern genauso wie der Server: kein Schein-Konflikt und kein verlorenes
  „Rückgängig“ mehr nach dem Wechsel der Art einer Fläche.
- PDFs hängen nicht mehr, wenn ein Text keinen Platz hat (Schutz für alle Drucke).

Handbuch: Abschnitte Ablauf, Hallenplan (Ausrichten, Türen, 3D), Katalognummern, Druckformate und Jugend im Katalog.

### Update

`sudo schaufuchs update` sichert vorher und holt 1.21.0. Die Datenbank bekommt eine neue Spalte für die Formate der
Drucke; vorhandene Daten bleiben unverändert. Die Farben der Preisrichter im Hallenplan können sich einmalig ändern,
weil sie sich jetzt nach der Lage im Plan richten.
