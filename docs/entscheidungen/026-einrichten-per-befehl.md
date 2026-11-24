# 026 Ersteinrichtung über die Kommandozeile

**Stand:** gilt (17.11.2026)

**Kontext:** Eine neue Installation wird bisher im Browser eingerichtet: Wer die Seite zuerst öffnet und den
Einrichtungscode kennt, legt Verein und ersten Administrator mit eigenem Passwort an. Wer SchauFUCHS für einen Verein
aufsetzt, ist oft nicht die Person, die später Administrator ist. Dann muss der Code weitergegeben werden, oder der
Betreuer legt ein Passwort fest und gibt es weiter. Bei automatisch aufgesetzten Installationen gibt es zudem niemanden,
der dafür die Seite öffnet.

**Entscheidung:**
- `schaufuchs einrichten --verein V --name N --email E` legt Verein und ersten Administrator an, ohne Passwort. Der
  Administrator bekommt eine Mail mit dem Link „Passwort setzen“. Das ist derselbe Einladungslink wie für neue
  Benutzer: gilt 7 Tage, nur einmal, in der Datenbank nur als Hash. Danach ist er angemeldet und richtet die
  Zwei-Faktor-Anmeldung ein.
- Der Befehl läuft im Container (`bun src/einrichten.ts`). Wer ihn aufrufen kann, verwaltet den Server und könnte
  ohnehin alles ändern. Deshalb entfällt der Einrichtungscode. Die Einrichtung im Browser bleibt, mit Code wie bisher.
  Beide Wege teilen den Kern (`services/ersteinrichtung.ts`): dieselbe Sperre gegen eine gleichzeitige zweite
  Einrichtung, dieselben Angaben, dieselben Textbausteine.
- **Ohne Mailversand** verweigert der Befehl, bevor er etwas anlegt, und nennt `--link-zeigen`: Dann steht der Link im
  Terminal statt in einer Mail. Das ist Absicht des Betreuers. Ein Link, der unbemerkt im Postausgang liegt, hilft
  niemandem, denn ohne Administrator liest den keiner.
- **Mail geht nicht hinaus** (Mailserver gestört): Der Befehl meldet den Fehler und endet mit 1. Die Mail bleibt im
  Postausgang, der Server versucht es weiter.
- **Noch einmal aufrufen**, solange genau dieser Administrator sein Passwort nicht gesetzt hat: Es gibt einen neuen
  Link, der alte gilt nicht mehr. Verein und Name bleiben, wie sie sind; weichen die Angaben ab, sagt der Befehl das.
  So kommt der Administrator auch an sein Konto, wenn die Mail nicht ankam oder der Link abgelaufen ist. In jedem
  anderen Fall gilt: „Die Einrichtung ist bereits erfolgt.“ Nichts wird überschrieben.
- **Alter oder abgelaufener Link vor dem ersten Passwort** (Nachtrag 24.11.2026): Solange kein Benutzer der Installation
  ein Passwort hat, sagt SchauFUCHS bei einem ungültigen Einladungslink nicht „Bitte die Ausstellungsleitung um eine
  neue Einladung“ – die gibt es noch nicht –, sondern „Die Einrichtung ist noch nicht abgeschlossen. Einen neuen Link
  erzeugt, wer diese SchauFUCHS-Installation betreut (Befehl „schaufuchs einrichten“).“ (`einladungFehler` in
  `routers/auth/gemeinsam.ts`). Danach gilt wieder der bisherige Text.
- **Alte Links im Postausgang:** Mit jedem neuen Link (auch bei einer erneuten Willkommensmail) werden noch nicht
  verschickte Mails mit einem älteren Link an dieselbe Adresse nicht mehr versendet, und der Link darin wird
  unkenntlich. Sonst käme Stunden später eine Mail mit totem Link.
- Im Lesemodus (Entscheidung 025) verweigert der Befehl. Das Passwort ließe sich dort ohnehin nicht setzen.
- Ins Änderungsprotokoll kommt jeder erfolgreiche Aufruf mit „Kommandozeile“ als Handelndem. Im Terminal steht der Link
  nur mit `--link-zeigen`.

**Folgen:** Das Hilfeskript `schaufuchs` bringt den Befehl ab 1.12.0 mit. Er braucht ein Programm ab 1.12.0 im
Container. Neue Angaben zur Ersteinrichtung kommen in `ersteinrichtungAngaben`, dann gelten sie für beide Wege.
