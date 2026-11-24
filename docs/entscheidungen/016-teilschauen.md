# 016 Teilschauen: Abteilungen einer Schau mit fortlaufenden Katalognummern

**Stand:** gilt (15.11.2026)

**Kontext:** Große Ausstellungen bestehen oft aus mehreren Teilschauen in einer Halle – Landesschau, Kreisschau,
Jugendschau. Sie haben einen gemeinsamen Katalog, dessen Nummern über alle Teilschauen fortlaufend gezählt werden:
erst die ganze erste Teilschau, dann die nächste.

**Entscheidung:**
- Teilschauen sind keine eigenen Schauen, sondern eine Liste je Schau (`schau.teilschauen`, Kennung und Name, in
  Katalogfolge). Jede Meldung verweist auf eine Teilschau (`meldung.teilschau`); ohne Angabe gilt die erste. So bleiben
  Halle, Kasse, Abrechnung, Preisrichter und Bewertung unverändert eine Schau. Ein Name hat höchstens 80 Zeichen
  (`TEILSCHAU_NAME_MAX`); längere lehnt der Server ab, statt sie still zu kürzen.
- Die Teilschau ist der erste Schlüssel der Ausstellungsfolge (`vergleicheFolge` in `packages/domain/src/katalog.ts`),
  vor Jugend, Käfigblöcken und Sparten. Damit laufen Nummernvergabe, Nachmeldungen und Plan in derselben Reihenfolge.
- Kennungen („t1“, „t2“ …) bleiben beim Umbenennen und Umsortieren. Eine Teilschau mit Meldungen lässt sich nicht
  entfernen; nach dem Festschreiben der Nummern nur noch umbenennen. Änderungen stehen im Protokoll.
- Katalog: jede Teilschau ab neuer Seite, Name vor der Sparte und im Rassenverzeichnis.

**Folgen:** Preise, Meisterschaften und Abrechnung kennen die Teilschau (noch) nicht – sie gelten für die ganze Schau.
Eigene Meldegelder oder Meldeschlüsse je Teilschau gibt es nicht.
