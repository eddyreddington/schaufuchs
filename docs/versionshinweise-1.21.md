# SchauFUCHS 1.21 – Versionshinweise

## 1.21.6 (24.11.2026)

- **Erster Administrator:** Öffnet er einen alten oder abgelaufenen Link „Passwort setzen“, bevor irgendjemand in der
  Installation ein Passwort hat, steht dort jetzt „Die Einrichtung ist noch nicht abgeschlossen. Einen neuen Link
  erzeugt, wer diese SchauFUCHS-Installation betreut (Befehl „schaufuchs einrichten“).“ – statt der Bitte an eine
  Ausstellungsleitung, die es noch nicht gibt. Danach bleibt alles wie bisher (Entscheidung 026).

## 1.21.5 (24.11.2026)

- **Kontoauszug:** Kann eine ganz bezahlte Meldung nach dem Buchen nicht automatisch bestätigt werden (sie war gerade
  anderweitig in Bearbeitung), meldet die Seite das jetzt – „bezahlte Meldung nicht bestätigt – bitte von Hand
  bestätigen“ – statt still zu schweigen. Die Zahlung ist gebucht.
- **Briefvorlage:** Im Reiter „Preisrichterverpflichtung“ zeigt die Vorschau rechts jetzt die Verpflichtung mit dem
  Abschnitt zum Abtrennen (an einen Beispiel-Preisrichter), schon vor dem Speichern – bisher den Serienbrief.
- **Katalog:** Die Spaltenköpfe „PREIS“ und „AUSSTELLER“ stoßen bei großer Schrift nicht mehr aneinander. Die kleine
  Versalzeile über einer Sparte bricht bei langen Teilschau-Namen um, statt in Bild oder Titel zu laufen; ebenso die
  Zeile über dem Titel einer Testschau („modern“, A5). Die Teilschau steht jetzt vor der Art („LANDESSCHAU · SPARTE“)
  statt angehängt („LANDESSCHAUABTEILUNG“) (Entscheidung 032).
- **3D-Rundgang:** Volieren aus älteren festen Plänen (ohne festgelegte Front) werden von allen Seiten angesehen.
- Mehr Tests für gleichzeitiges Arbeiten: Lastschrift buchen im Mischbetrieb, Wartestellen ohne feste Wartezeit.

## 1.21.4 (24.11.2026)

### Gleichzeitiges Arbeiten abgesichert

Alle 165 Schreibwege wurden auf gleichzeitiges Arbeiten mehrerer Personen, Tabs und Tablets geprüft; 32 Fälle sind
behoben, jeder mit einem Test, der das gleichzeitige Arbeiten nachstellt (Entscheidung 033). Im Alltag mit einer Person
traten sie kaum auf, mit mehreren Helfern und Tablets am Schautag aber schon. Unter anderem:

- **Ergebnisse freigeben, Preise vergeben und Noten** sperren einander richtig: keine Freigabe, während noch eine Note
  geändert wird, kein Preis an einem Tier, dessen Note gerade sinkt.
- **Rücklastschrift und Spendenbestätigung** können sich nicht mehr überholen.
- **Meldung bearbeiten:** Haben zwei Fenster dieselbe Meldung offen, wird das zweite nicht mehr still überschrieben –
  „wurde inzwischen geändert – bitte neu laden“ mit Knopf „Neu laden“. Eine Meldung wird auch bei wiederholtem
  Absenden nur einmal angelegt.
- **Schau-Einstellungen:** Speichert ein anderer Tab zwischendurch, übernimmt das Formular die neuen Werte, die eigenen
  Eingaben bleiben, und man speichert erneut.
- **Zahlung auf der Meldungsseite** wird nicht doppelt gebucht; **Schau absagen** nimmt keine Online-Meldung mehr an.
- **Passwort und Zwei-Faktor**, Postausgang (keine doppelte Mail), Nummernvergabe, Impfnachweis, Logo hochladen u. a.
- **Verklemmungen:** Eine feste Reihenfolge der Sperren für den ganzen Server; das Protokoll wird am Ende geschrieben.
  Wartet ein Vorgang länger als 10 Sekunden auf einen anderen, kommt „Bitte noch einmal versuchen“ statt zu hängen
  (Tablets senden dann später von selbst). Während eines großen Imports können andere Änderungen kurz so melden.
- **Prüfliste** meldet jetzt auch verdeckte Fronten eingesetzter Volieren.

### 3D-Rundgang

- Der Rundgang beginnt am **Haupteingang**, geht **jede Käfigfront einmal** ab und kehrt zum Eingang zurück; er geht
  nicht an leeren Wänden entlang und nicht um Bänke und Tische. Der Parkplatz steht vor demselben Eingang.

### Update

Die Datenbank bekommt für Meldungen eine Kennung gegen doppeltes Anlegen (Migration 0072, nur hinzufügend).

## 1.21.3 (22.11.2026)

- **Katalog kürzt nichts mehr:** Lange Rassen, Farbenschläge, Sparten, Preisrichter, Aussteller, Vereine und Titel
  werden nicht mehr mit „…“ abgeschnitten. Sie werden erst kleiner gesetzt und brechen dann um; die Zeilen darunter
  rücken nach. Das gilt für alle Schriften und Layouts, Verzeichnisse, Kolumnentitel und Fußzeile (Entscheidung 032).
- **Behoben:** Im Rassenverzeichnis konnte ein langer Name über die Spalte „Sparte · Anzahl“ laufen.

## 1.21.2 (22.11.2026)

- **3D-Rundgang ohne Käfige und Decke:** Der Rundgang sucht seinen Weg nur über freie Fläche, mit Abstand zu Käfigen,
  Volieren, Möbeln, Sperrflächen und Wänden, und bleibt immer in Augenhöhe – er hebt nicht mehr über die Reihen (das
  wirkte mit hoher Decke wie ein Sprung an die Decke). Gänge ohne freien Weg lässt er aus, Sackgassen geht er zurück;
  der Blick dreht an Ecken langsam.
- **Gehen im Gang:** Pfeiltasten und Steuerkreuz gleiten an Käfigen und Wänden entlang statt hindurch.

## 1.21.1 (22.11.2026)

- **Katalog in einer Schrift:** Jeder Katalog steht jetzt in genau einer Schriftfamilie – der unter „Katalog gestalten“
  gewählten – für Titel, Köpfe, Text, Tabellen und Zahlen; unterschieden wird nur durch fett, kursiv und feste
  Größenstufen (Entscheidung 032). Nur „Buch, schmal“ und „Ausgewogen“ setzen den Schaunamen auf der Titelseite in
  einer Auszeichnungsschrift. Wer „Klassisch“ nutzt, sieht Überschriften, Rassen, Farbenschläge und Grußworte jetzt in
  Plex Condensed statt Spectral.
- In schmalen Spalten steht „nicht veröff.“ statt eines gekürzten „nicht…“.

Handbuch: Abschnitt „Katalog gestalten“ (Schrift).

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
