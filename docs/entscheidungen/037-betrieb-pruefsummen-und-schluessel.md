# 037 Betrieb: Prüfsummen und Digests, Notfallblatt, Einrichtungscode im Selbstbau

**Stand:** gilt (26.11.2026)

**Kontext:** Die fertige Installation (`deploy/install.sh`, Befehl `schaufuchs`) lud Dateien und Programme nur über
Namen: die Dateien aus dem Tag auf GitHub, die Programme über den Tag in der Registry (`…/schaufuchs:1.21.7`). Tags in
der Registry lassen sich überschreiben; ein ersetztes Programm liefe beim nächsten Update oder Zurücknehmen als root mit
allen Schlüsseln der Installation. Das Notfallblatt lag im Ordner des Benutzers, dem auch die verschlüsselten
Sicherungen gehören – wer dieses eine Konto übernimmt, hätte Sicherungen und Schlüssel zusammen. Im Selbstbau ohne
`EINRICHTUNG_CODE` konnte der erste Besucher einer frisch gestarteten Installation den Verein anlegen und Administrator
werden.

**Entscheidung:**
- **Prüfsummen je Release.** Der Workflow „Veröffentlichen“ hängt an jedes Release eine Datei `SHA256SUMS` mit den
  SHA-256-Summen von `deploy/docker-compose.yml`, `deploy/Caddyfile`, `deploy/schaufuchs`,
  `scripts/wiederherstellen.sh` und den Digests der beiden Programme (`image/schaufuchs`, `image/schaufuchs-backup`,
  jeweils der Digest des Index für alle Plattformen). `install.sh` und `schaufuchs update` laden sie mit, prüfen die
  Dateien vor dem Ablegen und die Programme nach dem Ziehen (`RepoDigests`). Weicht etwas ab, bleibt alles, wie es war.
  Der Verein tut dafür nichts.
- **Digests in der `.env`.** `SCHAUFUCHS_DIGEST_APP` und `SCHAUFUCHS_DIGEST_BACKUP` (dazu `SCHAUFUCHS_VORHER_DIGEST_…`)
  merken sich, was installiert wurde. `schaufuchs zuruecknehmen` nimmt das vorige Programm nur, wenn es noch diesen
  Digest hat; es zieht nur, wenn es nicht mehr vorliegt. Die Compose-Datei bleibt bei Name und Tag (das Aufräumen alter
  Versionen bleibt unverändert, ebenso Betreiber mit eigener Compose-Datei).
- **Ältere Releases** haben keine `SHA256SUMS` (Antwort 404): Dann läuft alles wie bisher, mit Hinweis. Jeder andere
  Fehler beim Laden der Prüfsummen bricht ab.
- **Notfallblatt** liegt unter Linux im Installationsordner (`/opt/schaufuchs/notfallblatt.txt`), nur für root lesbar,
  nicht mehr beim Benutzer der Sicherungen. Am Bildschirm zeigt der Installer es an und löscht die Datei, sobald der
  Verein bestätigt, dass er es abgelegt hat. `schaufuchs status`, `update` und `pruefen` warnen, solange ein Blatt auf
  dem Server liegt (auch am alten Ort im Benutzerordner).
- **Einrichtungscode im Selbstbau.** Ist `EINRICHTUNG_CODE` in Produktion leer, erzeugt der Server beim Start einen
  Zufallscode und schreibt ihn, solange noch nichts eingerichtet ist, einmal ins Log
  (`docker compose logs app | grep Einrichtungscode`). Die Einrichtung im Browser verlangt ihn. Er gilt bis zum
  nächsten Neustart. Installer (setzt den Code) und `schaufuchs einrichten` sind davon nicht betroffen; Entwicklung und Tests
  brauchen weiter keinen Code. `scripts/docker-start.sh` weist auf den leeren Code hin und auf eine `.env`, die alle
  Benutzer lesen können.
- **Zwischendatei der `.env`** (`schaufuchs`, Funktion `setze`) entsteht nur für den Besitzer lesbar und wird bei
  einem Fehler gelöscht; das Skript bricht dann ab, statt ohne den neuen Wert weiterzumachen.

**Beim Release (Tag):** nichts von Hand. Der Workflow „Veröffentlichen“ baut die Programme, schreibt `SHA256SUMS` aus
den Digests der Build-Schritte und hängt die Datei an das Release. Prüfen nach dem Lauf: Das Release hat die Datei
`SHA256SUMS` mit sechs Zeilen. Fehlt sie, laufen Updates auf diese Version ungeprüft (mit Hinweis) – dann den Workflow
neu starten, nicht den Tag verschieben. Ein Tag oder Programm in der Registry wird nie nachträglich ersetzt; ein Fehler
wird mit einer neuen Version behoben.

**Folgen:** Wer nur Programme in die Registry schreiben kann (Token mit `packages:write`), kann ein veröffentlichtes
Programm nicht mehr unbemerkt ersetzen. Gegen die Übernahme des GitHub-Kontos selbst helfen Prüfsummen aus demselben
Konto nicht; dafür bräuchte es eine Signatur mit einem Schlüssel außerhalb von GitHub (siehe Nachtrag). Die Prüfung
greift ab dem Update, das das neue `schaufuchs` installiert hat – das Update dorthin läuft noch mit dem alten Befehl.

**Nachtrag (26.11.2026) – Signatur außerhalb von GitHub:**

- Der Workflow legt das Release nur als **Entwurf** an; `SHA256SUMS` nennt in der Zeile `release` auch die Version, damit
  sich eine signierte Datei nicht unter eine andere Version kopieren lässt. Der Maintainer baut mit
  `scripts/release-signieren.sh` die erwarteten Prüfsummen aus dem Tag (der lokal, auf Gitea und auf GitHub derselbe sein
  und auf `main` von Gitea liegen muss) und der Registry nach, vergleicht sie mit dem Entwurf, signiert `SHA256SUMS` mit einem SSH-Schlüssel
  (`ssh-keygen -Y sign`, Namensraum `schaufuchs-release`), hängt `SHA256SUMS.sig` an und veröffentlicht erst dann. Der
  private Schlüssel liegt nie auf GitHub; der öffentliche steht als `RELEASE_SCHLUESSEL` in `deploy/schaufuchs` und
  `deploy/install.sh`.
- **Ab 1.22.1** nehmen `schaufuchs update` und `install.sh` ein Release nur mit Prüfsummen **und** gültiger Signatur an,
  deren `release`-Zeile zur verlangten Version passt – kein Rückfall auf „ungeprüft“. Ausgenommen sind nur reine
  Versionsnummern unter 1.22.1 (ältere, unsignierte Releases); jede andere Schreibweise (rc, zweistellig, mit v …)
  verlangt die Signatur. Lokale Probeläufe (`SCHAUFUCHS_QUELLE=/pfad`, Version `test`) sind ausgenommen.
- Auf GitHub sind Versions-Tags geschützt (nicht löschen, nicht umhängen) und Releases unveränderlich: ein
  veröffentlichtes Release lässt sich nicht mehr austauschen.
- Grenze: Die erste Installation lädt `install.sh` selbst von GitHub – wer das Konto übernimmt, könnte dort einen anderen
  Schlüssel eintragen. Laufende Installationen prüfen dagegen mit dem Schlüssel, der schon bei ihnen liegt.
- Den privaten Schlüssel sicher aufbewahren (Passwortmanager). Ein neuer Schlüssel kommt nur über ein Release, das noch
  mit dem alten signiert ist; geht der alte verloren, nehmen laufende Installationen keine Updates mehr an, bis sie
  `schaufuchs` von Hand neu laden.
