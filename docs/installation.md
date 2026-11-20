# SchauFUCHS installieren und betreiben – Anleitung für Vereine

Diese Anleitung führt Schritt für Schritt vom eigenen Rechner im Verein bis zur abgesicherten, erreichbaren Schau. Sie
brauchen keine Fachleute, aber etwa zwei Stunden Zeit, einen Computer mit Internet und einen Passwortmanager (oder einen
verschlossenen Ordner für Ausdrucke). Wer SchauFUCHS anders betreibt, passt die Schritte selbst an.

**So lesen Sie die Befehle:** Alles in grauen Kästen wird kopiert und im Terminal eingefügt, eine Zeile nach der anderen.
In den Beispielen heißt der Benutzer auf dem Rechner `verwalter`, der Rechner hat im Vereinsnetz die Adresse `192.0.2.20`,
der Internetanschluss die öffentliche Adresse `203.0.113.10`, und SchauFUCHS soll unter `schau.example.org` erreichbar
sein. Ersetzen Sie diese Werte durch Ihre eigenen. Fragt ein Befehl mit `sudo` nach einem Passwort, ist das Passwort
Ihres Benutzers auf dem Rechner gemeint.

## Der Weg im Überblick

1. SSH-Schlüssel auf Ihrem Computer erzeugen – damit melden Sie sich am Rechner an, ohne Passwort.
2. Rechner einrichten: Betriebssystem, feste Adresse im Vereinsnetz, Dauerbetrieb.
3. Adresse einrichten: DNS-Eintrag, Portweiterleitung im Router, bei Bedarf DynDNS.
4. Eigenen Benutzer mit sudo – gearbeitet wird nie als root.
5. Rechner absichern: SSH nur mit Schlüssel und ohne root, Firewall, automatische Sicherheitsupdates, Notzugang.
6. SchauFUCHS installieren.
7. Notfallblatt sichern.
8. Verein einrichten.
9. Mailversand einrichten (optional).

Danach: „Im laufenden Betrieb“ – Updates, Sicherungen, Neustart, Meldungen, Notfälle. Nur zum Ausprobieren oder für eine
Schulung geht es auch auf dem Laptop (am Ende der Anleitung).

## Was Sie brauchen

| | Wofür | Beispiel |
|---|---|---|
| **Rechner** | Hier läuft SchauFUCHS, rund um die Uhr | Mini-PC, alter PC oder Raspberry Pi 4/5 mit Ubuntu 24.04 oder Debian 12 (Intel/AMD oder ARM, 64 Bit), 2 CPU-Kerne, 4 GB Arbeitsspeicher, 40 GB Speicher |
| **Internetanschluss** | Online-Meldung, Helfer und Preisrichter von außerhalb, HTTPS-Zertifikat | Ein Anschluss mit öffentlicher IPv4-Adresse, bei dem sich im Router Ports freigeben lassen |
| **Domain** | Unter ihr erreichen Helfer, Preisrichter und Aussteller SchauFUCHS | `schau.example.org` – eine Subdomain der Vereinsdomain; Zugang zur DNS-Verwaltung beim Anbieter der Domain |
| **E-Mail-Adresse** | Für das HTTPS-Zertifikat (Let's Encrypt schreibt nur bei Problemen) | `technik@example.org` |
| **Passwortmanager** | Für SSH-Schlüssel, Benutzerpasswort und Notfallblatt | Der Passwortmanager des Vereins, sonst Ausdrucke im verschlossenen Ordner |
| **Optional: Mailpostfach** | Damit SchauFUCHS Bestätigungen an Aussteller verschickt | Zugangsdaten (SMTP) eines Postfachs des Vereins |

**Welches System?** **Ubuntu 24.04 LTS** ist die erste Wahl: Es bekommt Sicherheitsupdates bis 2029. **Debian 12** geht
genauso; es wird seit Juli 2026 nur noch vom Debian-LTS-Team gepflegt, längstens bis 30. Juni 2028. Neuere Versionen
(Debian 13, Ubuntu 26.04) sollten gehen, sind aber nicht geprüft.

**Datenschutz:** Die Daten liegen im Verein. Der Rechner gehört deshalb an einen sicheren, abschließbaren Ort, und die
Sicherungen gehören zusätzlich auf einen zweiten Datenträger außer Haus (siehe „Datensicherung“).

## Schritt 1 – SSH-Schlüssel auf Ihrem Computer erzeugen

Am Rechner melden Sie sich mit einem **SSH-Schlüssel** an statt mit einem Passwort. Der Schlüssel besteht aus zwei
Dateien: Der **private Teil** bleibt auf Ihrem Computer, der **öffentliche Teil** (Endung `.pub`) kommt auf den Rechner.
Wer den privaten Teil nicht hat, kommt nicht hinein – auch nicht mit dem richtigen Passwort.

Terminal öffnen – **Mac:** Programm „Terminal“; **Windows 10/11:** Programm „PowerShell“; **Linux:** Terminal. Dann:

```bash
ssh-keygen -t ed25519 -C "schaufuchs"
```

- Die Frage nach dem Speicherort mit Enter bestätigen.
- Dann eine **Passphrase** eingeben (zweimal). Sie schützt den Schlüssel, falls der Computer gestohlen wird. Die Passphrase
  in den Passwortmanager schreiben.

Die Ausgabe von `cat ~/.ssh/id_ed25519.pub` (Mac, Linux) bzw. `type $env:USERPROFILE\.ssh\id_ed25519.pub` (Windows) ist
eine Zeile, die mit `ssh-ed25519` beginnt: der öffentliche Teil. Sie darf jeder sehen; den privaten Teil (`id_ed25519`
ohne `.pub`) geben Sie nie weiter. **Mehrere Betreuer:** Jede Person erzeugt ihren eigenen Schlüssel auf ihrem eigenen
Computer. Planen Sie mindestens zwei Personen mit Zugang ein, damit eine Vertretung da ist.

## Schritt 2 – Rechner einrichten

1. Auf dem Rechner **Ubuntu Server 24.04** oder **Debian 12** installieren (beim Raspberry Pi: „Raspberry Pi OS Lite
   (64-bit)“ oder Ubuntu Server für Raspberry Pi; im „Raspberry Pi Imager“ lassen sich Benutzer und SSH-Schlüssel gleich
   eintragen).
   - Bei der Installation den **SSH-Server** mit auswählen und einen **Benutzer** anlegen, z. B. `verwalter`, mit einem
     langen Passwort (in den Passwortmanager).
   - **Debian:** Das Feld für das **root-Passwort leer lassen**. Nur dann richtet Debian `sudo` ein und gibt es Ihrem
     Benutzer.
2. Dem Rechner im Router eine **feste Adresse im Vereinsnetz** geben (z. B. `192.0.2.20`; der Router zeigt die Adresse
   unter „Heimnetz“ oder „Netzwerk“).
3. Der Rechner muss durchlaufen: Energiesparmodus aus. Im BIOS „nach Stromausfall einschalten“ („Restore on AC Power
   Loss“) setzen, damit er nach einem Stromausfall von selbst wieder startet.

## Schritt 3 – Adresse einrichten

Legen Sie den DNS-Eintrag gleich jetzt an: Es kann bis zu einer Stunde dauern, bis er überall bekannt ist, und ohne ihn
gibt es in Schritt 6 kein Zertifikat.

### Portweiterleitung und DynDNS im Router

1. **Portweiterleitung:** Im Router die Ports **80 (TCP)** und **443 (TCP und UDP)** an die feste Adresse des Rechners
   weiterleiten („Portfreigabe“). **Port 22 nicht** freigeben – den Rechner verwalten Sie aus dem Vereinsnetz.
2. **DynDNS:** Hat der Anschluss keine feste öffentliche IP-Adresse (bei vielen Anschlüssen üblich), im Router einen
   DynDNS-Dienst einrichten (viele Router bringen einen mit, z. B. „MyFRITZ!“). Er liefert eine Adresse, die immer auf
   den Anschluss zeigt; auf sie zeigt dann der DNS-Eintrag.
3. **Achtung „DS-Lite“:** Viele Kabel- und Glasfaseranschlüsse haben keine eigene öffentliche IPv4-Adresse. Dann lässt
   sich Port 80/443 über IPv4 nicht weiterleiten. Fragen Sie beim Anbieter des Anschlusses nach einer öffentlichen
   IPv4-Adresse („Dual Stack“).

### DNS-Eintrag

Beim Anbieter Ihrer Domain (dort, wo `example.org` verwaltet wird) im Bereich „DNS“ anlegen:

| Typ | Name | Wert | Wann |
|---|---|---|---|
| A | `schau` | Öffentliche IPv4-Adresse des Anschlusses, z. B. `203.0.113.10` | Anschluss mit fester IPv4-Adresse |
| CNAME | `schau` | DynDNS-Adresse, z. B. `verein.dyndns.example.net` | Anschluss ohne feste IPv4-Adresse – **statt** A |
| AAAA | `schau` | IPv6-Adresse des Rechners | Nur wenn der Router IPv6 für den Rechner freigibt und die Adresse fest ist |

Ein **falscher AAAA-Eintrag** ist schlimmer als keiner: Let's Encrypt prüft bevorzugt über IPv6, und viele Besucher kommen
über IPv6. Tragen Sie ihn nur ein, wenn die Adresse wirklich zum Rechner gehört und der Router sie durchlässt.

Prüfen, ob der Eintrag schon wirkt: auf Ihrem Computer `nslookup schau.example.org` eingeben. Unter „Address“ muss die
öffentliche Adresse des Anschlusses stehen.

### Woher das HTTPS-Zertifikat kommt

Sie müssen kein Zertifikat kaufen oder hochladen. SchauFUCHS bringt den Webserver **Caddy** mit. Beim ersten Start holt
Caddy für die Adresse aus der Einstellung `SCHAUFUCHS_DOMAIN` ein kostenloses Zertifikat bei **Let's Encrypt**:

1. Caddy meldet sich mit der E-Mail-Adresse aus `ACME_EMAIL` bei Let's Encrypt.
2. Let's Encrypt ruft `schau.example.org` aus dem Internet über Port 80 bzw. 443 auf und prüft so, dass die Adresse
   wirklich zu diesem Rechner gehört.
3. Caddy legt das Zertifikat im Docker-Speicher `caddy_daten` ab (es bleibt bei Updates erhalten) und erneuert es
   rechtzeitig vor Ablauf selbst.

Dafür müssen der DNS-Eintrag stimmen und die Ports 80 und 443 aus dem Internet erreichbar sein. Klappt es nicht, zeigt
`sudo schaufuchs logs` Zeilen von `caddy` mit dem Grund. Caddy versucht es von selbst weiter; nach mehreren Fehlversuchen
lässt Let's Encrypt eine Stunde lang keine neuen Versuche zu. Nach einer Korrektur an DNS oder Router genügt
`sudo schaufuchs neustart`.

## Schritt 4 – Eigenen Benutzer mit sudo

Gearbeitet wird als **eigener Benutzer** (`verwalter` aus Schritt 2), nicht als `root`. Für Befehle, die
Verwalterrechte brauchen, steht `sudo` davor; der Rechner fragt dann nach dem Passwort des Benutzers.

Den öffentlichen Schlüssel von Ihrem Computer auf den Rechner übertragen. Der Rechner fragt einmal nach dem Passwort des
Benutzers; beim ersten Mal fragt Ihr Computer außerdem, ob er dem Rechner vertrauen soll: mit `yes` bestätigen.

**Mac, Linux:**

```bash
ssh-copy-id verwalter@192.0.2.20
```

**Windows** (PowerShell, eine Zeile):

```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh verwalter@192.0.2.20 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Weitere Betreuer: Ihren öffentlichen Schlüssel genauso übertragen (dann mit Ihrem eigenen Benutzer), oder ihre Zeile in
`~/.ssh/authorized_keys` des Benutzers anhängen.

**Prüfen** – in einem **neuen** Terminalfenster:

```bash
ssh verwalter@192.0.2.20
sudo whoami
```

Die Anmeldung fragt höchstens nach der Passphrase des Schlüssels (nicht nach dem Passwort des Rechners), und
`sudo whoami` antwortet nach Ihrem Passwort mit `root`. Erst dann weiter. Danach das System aktualisieren:

```bash
sudo apt update && sudo apt -y full-upgrade
```

## Schritt 5 – Rechner absichern

Alle Befehle als `verwalter`. **Lassen Sie während des ganzen Schritts ein angemeldetes Fenster offen.** Läuft etwas
schief, machen Sie es darin rückgängig.

### 5.1 SSH: nur mit Schlüssel, kein root

Eine eigene Einstellungsdatei schaltet die Anmeldung als root und mit Passwort ab. Sie heißt `00-…`, damit sie vor
anderen Dateien gelesen wird (bei SSH gilt der erste Wert; manche Systeme bringen `50-cloud-init.conf` mit
`PasswordAuthentication yes` mit).

```bash
printf 'PermitRootLogin no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\n' | sudo tee /etc/ssh/sshd_config.d/00-absichern.conf
sudo sshd -t
sudo sshd -T | grep -Ei '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication) '
```

`sshd -t` gibt nichts aus, wenn die Einstellungen in Ordnung sind. Der letzte Befehl muss dreimal `no` zeigen. Dann SSH
neu starten (bestehende Verbindungen bleiben bestehen):

```bash
sudo systemctl restart ssh
```

**Jetzt in einem zweiten Fenster prüfen,** bevor Sie das erste schließen: `ssh verwalter@192.0.2.20` muss klappen,
`ssh root@192.0.2.20` muss mit `Permission denied` abgewiesen werden. Klappt die Anmeldung als `verwalter` nicht, im
ersten Fenster die Datei wieder entfernen und von vorn prüfen:

```bash
sudo rm /etc/ssh/sshd_config.d/00-absichern.conf && sudo systemctl restart ssh
```

### 5.2 Firewall: nur 22, 80 und 443

```bash
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443
sudo ufw enable
sudo ufw status verbose
```

`ufw enable` warnt, dass SSH-Verbindungen unterbrochen werden könnten: mit `y` bestätigen – Port 22 ist ja freigegeben.
`443` ohne Zusatz gibt TCP und UDP frei (UDP für das schnellere HTTP/3). Port 22 ist nur im Vereinsnetz erreichbar, weil
der Router ihn nicht weiterleitet (Schritt 3). Gut zu wissen: Docker öffnet die Ports von
SchauFUCHS (80 und 443) selbst, auch an ufw vorbei. Andere Ports veröffentlicht SchauFUCHS nicht; die Datenbank ist von
außen nicht erreichbar.

### 5.3 Automatische Sicherheitsupdates

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

Die Frage, ob Updates automatisch eingespielt werden sollen, mit „Ja“ beantworten. Prüfen: `apt-config dump
APT::Periodic::Unattended-Upgrade` muss `"1"` zeigen. Damit kommen Sicherheitsupdates des Betriebssystems täglich von
selbst. Einen automatischen Neustart schalten wir bewusst nicht ein – er könnte mitten in eine Schau fallen. Wann ein
Neustart fällig ist, zeigt `sudo schaufuchs pruefen` (siehe „Neustart“).

### 5.4 fail2ban (optional)

Weil nur Schlüssel gelten und Port 22 nicht aus dem Internet erreichbar ist, ist fail2ban nicht nötig. Wer es trotzdem
möchte (etwa, weil SSH doch weitergeleitet wird):

```bash
sudo apt install -y fail2ban python3-systemd
printf '[sshd]\nenabled = true\nbackend = systemd\n' | sudo tee /etc/fail2ban/jail.d/sshd.local
sudo systemctl restart fail2ban
sudo fail2ban-client status sshd
```

(`backend = systemd` ist nötig, weil Debian 12 die Datei `/var/log/auth.log` nicht mehr anlegt.)

### 5.5 Notzugang, wenn SSH nicht mehr geht

- Bildschirm und Tastatur an den Rechner anschließen und als `verwalter` mit dem **Passwort** des Benutzers anmelden
  (Schlüssel gelten dort nicht). Dort können Sie z. B. die Datei aus 5.1 entfernen oder einen neuen Schlüssel eintragen.
- **Schlüssel verloren oder Computer gestohlen:** Eine andere Person mit Zugang löscht die betroffene Zeile aus
  `~/.ssh/authorized_keys`; sonst direkt am Rechner. Danach einen neuen Schlüssel erzeugen und eintragen.

Das Benutzerpasswort gehört deshalb in den Passwortmanager und auf das Notfallblatt (Schritt 7).

## Schritt 6 – SchauFUCHS installieren

Als `verwalter` angemeldet diesen einen Befehl eingeben (kopieren und einfügen). `sudo` fragt nach Ihrem Passwort.

```bash
curl -fsSL https://raw.githubusercontent.com/eddyreddington/schaufuchs/main/deploy/install.sh | sudo sh
```

Der Installer fragt nach

1. der **Adresse** (z. B. `schau.example.org`) – er prüft, ob der DNS-Eintrag schon eingetragen ist; zeigt er auf die
   Adresse des Internetanschlusses, weist er auf die Portweiterleitung hin (mit `ja` bestätigen) – und
2. der **E-Mail-Adresse** für das Zertifikat.

Er installiert bei Bedarf Docker (Frage mit `ja` beantworten), erzeugt alle Schlüssel und startet SchauFUCHS unter
`/opt/schaufuchs`. Nach einigen Minuten zeigt er die Adresse zum Öffnen, den **Einrichtungscode** und den Hinweis auf das
**Notfallblatt**. Starten Sie ihn als root (ohne eigenen Benutzer), warnt er und fragt nach.

Danach prüfen, ob die Absicherung aus Schritt 5 greift (ab SchauFUCHS 1.2.1): `sudo schaufuchs pruefen`. Der Befehl fragt SSH, Firewall, Updates, fail2ban, die letzte Sicherung und den freien Platz ab und gibt nur Hinweise; er
ändert nichts. Jeder Hinweis nennt, was zu tun ist.

## Schritt 7 – Notfallblatt sichern (wichtig!)

Der Installer hat in Ihrem Benutzerordner die Datei `schaufuchs-notfallblatt.txt` mit zwei Schlüsseln angelegt
(bei einer Installation als root: `/root/schaufuchs-notfallblatt.txt`). Ohne sie lässt sich nach einem Ausfall keine
Sicherung zurückspielen.

```bash
cat ~/schaufuchs-notfallblatt.txt
```

Den Text in den Passwortmanager des Vereins kopieren **oder** ausdrucken. Ergänzen Sie dabei die Zeilen zum Ausfüllen:

| Was | Wozu |
|---|---|
| Sicherungsschlüssel, Datenschlüssel | Stehen schon darauf – zum Zurückspielen einer Sicherung |
| Wo der Rechner steht, seine Adresse im Vereinsnetz | Anmeldung, Notzugang mit Bildschirm und Tastatur |
| Zugang zum Router, Portweiterleitung, DynDNS | Erreichbarkeit aus dem Internet |
| Wo die Domain verwaltet wird | DNS ändern, z. B. bei einem neuen Internetanschluss |
| Benutzer (`verwalter`), wo Passwort und SSH-Schlüssel liegen | Anmeldung, Konsole, `sudo` |
| Wo die Sicherungen außer Haus liegen | Wiederherstellung nach einem Totalausfall |
| Wer Zugang hat (Namen der Betreuer) | Vertretung, Schlüssel entfernen |

Das Blatt in den Vereinsunterlagen ablegen, wo es im Notfall jemand findet. Danach die Datei auf dem Rechner löschen:

```bash
rm ~/schaufuchs-notfallblatt.txt
```

## Schritt 8 – Verein einrichten

1. Im Browser die Adresse öffnen, z. B. `https://schau.example.org`. Das Schloss in der Adresszeile zeigt, dass das
   Zertifikat da ist.
2. Name des Vereins, Ihren Namen, E-Mail-Adresse, ein Passwort und den **Einrichtungscode** eingeben.
3. SchauFUCHS führt Sie zur **Zwei-Faktor-Anmeldung** (App auf dem Telefon, z. B. eine Authenticator-App). Die
   Notfallcodes ausdrucken.
4. Unter „Verein und Datenschutz“ Impressum und Datenschutzhinweise ausfüllen, unter „Benutzer“ weitere
   Ausstellungsleiter und Helfer einladen. Alles Weitere erklärt das Handbuch unter „Hilfe“.

**Oder auf dem Server einrichten** (ab SchauFUCHS 1.12.0), etwa wenn jemand anderes Ausstellungsleiter wird als der,
der installiert. Dafür ist kein Einrichtungscode nötig:

```bash
sudo schaufuchs einrichten --verein "GZV Musterstadt" --name "Erika Muster" --email erika@example.org
```

Der Ausstellungsleiter bekommt eine Mail mit dem Link „Passwort setzen“. Der Link gilt 7 Tage und nur einmal. Danach
geht es weiter mit Punkt 3. Das braucht den Mailversand aus Schritt 9. Ohne Mailversand den Befehl mit `--link-zeigen`
aufrufen: Dann steht der Link im Terminal, zum Weitergeben nur an diese Person. Kam die Mail nicht an oder ist der Link
abgelaufen, den Befehl noch einmal aufrufen. Der neue Link ersetzt den alten.

**Rassen und Farbenschläge:** SchauFUCHS bringt nur eine kleine Beispielliste mit. Die Liste für Ihre Schau spielen Sie
unter „Rassen und Farbenschläge“ als CSV-Datei ein (Aufbau im Handbuch).

## Schritt 9 – Mailversand einrichten (optional)

```bash
sudo schaufuchs einstellungen
```

In der Zeile `SMTP_URL=` die Zugangsdaten des Postfachs eintragen, z. B.
`SMTP_URL=smtps://schau%40example.org:PASSWORT@mail.example.net:465` (das `@` im Benutzernamen als `%40`),
und bei `MAIL_FROM=` den Absender. Speichern (bei nano: Strg+O, Enter, Strg+X) – SchauFUCHS startet neu.

## Im laufenden Betrieb

Anmelden aus dem Vereinsnetz mit `ssh verwalter@192.0.2.20`. Alle `schaufuchs`-Befehle laufen mit `sudo`.

| Was | Befehl |
|---|---|
| Läuft alles? | `sudo schaufuchs status` |
| Verein und ersten Ausstellungsleiter anlegen (statt im Browser) | `sudo schaufuchs einrichten --verein … --name … --email …` |
| Absicherung prüfen | `sudo schaufuchs pruefen` (ab 1.2.1) |
| Neue Version einspielen | `sudo schaufuchs update` – sichert vorher automatisch |
| Update ging schief | `sudo schaufuchs zuruecknehmen` |
| Sicherung anlegen / anzeigen | `sudo schaufuchs sichern` / `sudo schaufuchs sicherungen` |
| Sicherung zurückspielen | `sudo schaufuchs wiederherstellen DATEI` |
| Meldungen anzeigen | `sudo schaufuchs logs` |
| SchauFUCHS neu starten | `sudo schaufuchs neustart` |
| Alle Befehle | `sudo schaufuchs hilfe` |

### Updates

- **SchauFUCHS:** `sudo schaufuchs update` holt die neueste Version, sichert vorher und startet neu (einige Minuten
  Unterbrechung). Nicht am Schautag und nicht während der Bewertung. Läuft die neue Version nicht, bringt
  `sudo schaufuchs zuruecknehmen` die alte Version mit der Sicherung von vor dem Update zurück – Eingaben seit dem Update
  gehen dabei verloren. Das Update braucht mindestens 3 GB freien Platz und bricht sonst ab, bevor es etwas ändert.
  Danach behält es nur die neue und die vorige Version, ältere löscht es (ab 1.12.1).
- **Betriebssystem:** Sicherheitsupdates kommen automatisch (Schritt 5.3). Einmal im Monat, nicht am Schautag, auch die
  übrigen Updates einspielen; dazu gehört Docker, das dabei SchauFUCHS kurz neu startet:

  ```bash
  sudo apt update && sudo apt full-upgrade
  ```

- **Neue Hauptversion des Betriebssystems** (z. B. Ubuntu 26.04): kein Routine-Update. Vorher eine Sicherung außer Haus
  kopieren; alternativ den Rechner neu aufsetzen und die Sicherung dort zurückspielen (siehe „Totalausfall“).

### Datensicherung

**Automatisch:** SchauFUCHS sichert alle zwei Stunden, wenn sich etwas geändert hat, sonst einmal täglich, und vor jedem
Update. Jede Sicherung ist **verschlüsselt** (Schlüssel auf dem Notfallblatt) und wird gleich nach dem Anlegen **geprüft**,
indem sie vollständig gelesen wird. Aufgehoben werden die Sicherungen der letzten 48 Stunden, danach eine je Tag bis
30 Tage. Sie liegen in `/opt/schaufuchs/backups`.

**Außer Haus kopieren:** Fällt der Rechner aus (Defekt, Brand, Diebstahl), sind die Sicherungen auf ihm mit weg.
Kopieren Sie sie deshalb regelmäßig auf einen anderen Computer, eine externe Platte oder in einen Cloud-Speicher –
mindestens vor und nach jeder Schau und einmal im Monat. Auf Ihrem Computer im Vereinsnetz (kein `sudo` nötig, die
Dateien gehören Ihrem Benutzer):

**Mac, Linux** (kopiert nur, was neu ist):

```bash
rsync -av verwalter@192.0.2.20:/opt/schaufuchs/backups/ ~/schaufuchs-sicherungen/
```

**Windows** (PowerShell):

```powershell
scp -r verwalter@192.0.2.20:/opt/schaufuchs/backups .\schaufuchs-sicherungen
```

Weil die Dateien verschlüsselt sind, dürfen sie auch in einem Cloud-Speicher liegen. (Installationen vor 1.2.1: Dort
gehören die Sicherungen root. Nach dem Update auf 1.2.1 mit `sudo schaufuchs einstellungen` die Zeilen
`BACKUP_UID=1000` und `BACKUP_GID=1000` ergänzen – Ihre Werte zeigen `id -u` und `id -g` – und einmal
`sudo chown -R verwalter: /opt/schaufuchs/backups` ausführen.)

**Zurückspielen:** Die Liste zeigt `sudo schaufuchs sicherungen`. Dann zum Beispiel:

```bash
sudo schaufuchs wiederherstellen schau-2026-11-15-1200.dump.age
```

Der Befehl fragt nach dem Sicherungsschlüssel vom Notfallblatt (beginnt mit `AGE-SECRET-KEY-`; die Eingabe bleibt
unsichtbar) und nach einer Bestätigung. Er prüft die Sicherung zuerst, sichert den jetzigen Stand, ersetzt dann die
Datenbank und startet SchauFUCHS neu. Alles, was nach der Sicherung eingegeben wurde, ist danach weg.

**Probe aufs Exempel (einmal im Jahr, vor der Saison):** Ob Sicherung und Notfallblatt wirklich zusammenpassen, merkt man
sonst erst im Ernstfall. Probieren Sie es auf einem Laptop, nie auf dem echten Rechner:

1. SchauFUCHS auf dem Laptop installieren (siehe unten), Adresse `localhost`.
2. Den **Datenschlüssel** vom Notfallblatt eintragen: `~/SchauFUCHS/schaufuchs einstellungen`, die Zeile
   `DATENSCHLUESSEL=` ersetzen, speichern.
3. Eine Sicherung aus `~/schaufuchs-sicherungen` nach `~/SchauFUCHS/backups/` kopieren und zurückspielen:
   `~/SchauFUCHS/schaufuchs wiederherstellen schau-….dump.age` (mit dem Sicherungsschlüssel vom Notfallblatt).
4. `https://localhost` öffnen, anmelden, eine Schau ansehen und unter „Protokoll“ die Prüfung laufen lassen.
5. Die Probe enthält echte Daten von Ausstellern: danach wieder löschen (in `~/SchauFUCHS` erst
   `docker compose down -v`, dann den Ordner löschen).

**Totalausfall (Rechner weg):** Einen neuen Rechner nach den Schritten 2 bis 6 einrichten (am einfachsten mit derselben
festen Adresse im Vereinsnetz, dann passt die Portweiterleitung). Dann `sudo schaufuchs einstellungen`,
`DATENSCHLUESSEL` vom Notfallblatt eintragen, die neueste Sicherung von Ihrem Computer hochladen
(`scp schau-….dump.age verwalter@192.0.2.20:/opt/schaufuchs/backups/`) und mit `sudo schaufuchs wiederherstellen`
zurückspielen. Einzelheiten: [betrieb.md](betrieb.md).

### Neustart

- **Nur SchauFUCHS:** `sudo schaufuchs neustart` – z. B. wenn die Anwendung hängt.
- **Ganzer Rechner:** `sudo reboot` – nötig, wenn `sudo schaufuchs pruefen` „Neustart nötig“ meldet (nach Updates am
  Kern des Systems). SchauFUCHS startet danach von selbst; nach zwei Minuten mit `sudo schaufuchs status` nachsehen. Nicht
  am Schautag; die Tablets der Preisrichter arbeiten in der Zeit ohne Netz weiter.

### Meldungen (Logs)

| Was | Befehl |
|---|---|
| Anwendung, HTTPS (Caddy) und Sicherung | `sudo schaufuchs logs` (die letzten 200 Zeilen; mehr: `sudo schaufuchs logs 2000`) |
| Nur Fehler | `sudo schaufuchs logs 2000 \| grep -i fehler` bzw. `… \| grep -i error` |
| Anmeldungen am Rechner | `sudo journalctl -u ssh --since today` |
| Fehler des Betriebssystems seit dem letzten Start | `sudo journalctl -b -p err` |

Docker begrenzt die Meldungen je Dienst auf 50 MB, ältere werden überschrieben.

### Regelmäßig

| Wann | Was |
|---|---|
| Vor jeder Schau | `sudo schaufuchs status`, `sudo schaufuchs pruefen`, Sicherungen außer Haus kopieren; kein Update in der Schauwoche |
| Nach jeder Schau | Sicherungen außer Haus kopieren |
| Monatlich | `sudo apt update && sudo apt full-upgrade`, bei Bedarf `sudo reboot`, `sudo schaufuchs update` |
| Jährlich | Probe aufs Exempel, Notfallblatt aktuell? Wer hat Zugang (`~/.ssh/authorized_keys`)? Domain verlängert? |

### Notfälle

| Was passiert | Was tun |
|---|---|
| Seite nicht erreichbar | `sudo schaufuchs status`, dann `sudo schaufuchs logs`. Ist der Rechner selbst weg: Strom, Netzwerkkabel und Router prüfen |
| Von außen nicht erreichbar, im Vereinsnetz schon | Portweiterleitung und DynDNS im Router, DNS-Eintrag (Schritt 3) |
| Browser warnt vor dem Zertifikat | DNS-Eintrag und Ports 80/443 prüfen (Schritt 3), dann `sudo schaufuchs logs` (Zeilen von `caddy`) |
| SSH geht nicht mehr | Notzugang mit Bildschirm und Tastatur (Schritt 5.5) |
| Update ging schief | `sudo schaufuchs zuruecknehmen` |
| Daten versehentlich gelöscht | Passende Sicherung zurückspielen (siehe „Datensicherung“) |
| Rechner verloren | „Totalausfall“ oben |
| Kein Administrator kommt mehr hinein | [betrieb.md](betrieb.md), Abschnitt „Zwei-Faktor-Anmeldung“ |

## Einstellungen

Alle Einstellungen stehen in `/opt/schaufuchs/.env` (nur für root lesbar). `sudo schaufuchs einstellungen` öffnet die
Datei und startet SchauFUCHS nach dem Speichern neu.

| Einstellung | Bedeutung |
|---|---|
| `SCHAUFUCHS_DOMAIN`, `PUBLIC_URL` | Adresse von SchauFUCHS. Bei einem Wechsel zuerst den DNS-Eintrag anlegen, dann beide Zeilen ändern. |
| `ACME_EMAIL` | E-Mail für das HTTPS-Zertifikat |
| `SMTP_URL`, `MAIL_FROM` | Mailversand (Schritt 9); leer: Mails bleiben im Postausgang (Verein und Datenschutz) |
| `BACKUP_INTERVALL_MINUTEN`, `BACKUP_TAGE` | Abstand der Sicherungen (Vorgabe 120 Minuten) und Aufbewahrung (Vorgabe 30 Tage) |
| `BACKUP_UID`, `BACKUP_GID` | Benutzer, dem die Sicherungsdateien gehören (setzt der Installer); leer: root |
| `APP_NAME` | Name in der Oberfläche |
| `APP_SPEICHER` | Arbeitsspeicher-Grenze der Anwendung (Vorgabe `2g`) |
| `ZWEI_FAKTOR_PFLICHT` | Nur im Notfall `0` (siehe [betrieb.md](betrieb.md)) – sonst nicht eintragen |
| `DATENSCHLUESSEL`, `POSTGRES_PASSWORD`, `BACKUP_EMPFAENGER`, `EINRICHTUNG_CODE` | Vom Installer erzeugt – nicht ändern. Sicherungs- und Datenschlüssel stehen auf dem Notfallblatt (Schritt 7). |

## Zum Ausprobieren: auf dem Laptop (Mac oder Windows)

SchauFUCHS läuft auch auf einem Laptop – zum Ausprobieren, für Schulungen oder für die Probe einer Wiederherstellung.
Es ist dann unter `https://localhost` erreichbar. Die Schritte 1 bis 5 entfallen.

**Was auf dem Laptop nicht geht:** SchauFUCHS ist nur erreichbar, solange der Laptop an ist, und nur von ihm selbst.
Aussteller können sich nicht online melden. Andere Geräte (z. B. die Tablets der Preisrichter) zeigen eine
Zertifikatswarnung, weil es ohne Internet-Adresse kein öffentliches Zertifikat gibt – dann funktioniert die Bewertung
ohne Netz (App auf dem Startbildschirm) nicht. Für eine Schau nehmen Sie den Rechner im Verein.

**Mac** (ab SchauFUCHS 1.2.1; geprüft mit OrbStack auf einem Mac mit Apple-Chip, mit Docker Desktop nicht geprüft):

1. **Docker Desktop** (docker.com) oder **OrbStack** (orbstack.dev) installieren und starten.
2. Programm „Terminal“ öffnen und eingeben – ohne `sudo`:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/eddyreddington/schaufuchs/main/deploy/install.sh | sh
   ```

3. Als Adresse `localhost` eingeben, dazu eine E-Mail-Adresse. SchauFUCHS liegt danach im Ordner `SchauFUCHS` in Ihrem
   Benutzerordner, das Notfallblatt in `~/SchauFUCHS/notfallblatt.txt`. Die Befehle rufen Sie als
   `~/SchauFUCHS/schaufuchs …` auf (z. B. `~/SchauFUCHS/schaufuchs status`).

**Windows** (nicht geprüft – Rückmeldungen bitte über „Issues“ auf GitHub):

1. **WSL2 mit Ubuntu** einrichten: PowerShell als Administrator öffnen, `wsl --install` eingeben, neu starten und in
   Ubuntu einen Benutzer anlegen.
2. **Docker Desktop** installieren und unter „Settings → Resources → WSL Integration“ für Ubuntu einschalten.
3. Ubuntu öffnen (Startmenü) und dort den Installer wie auf dem Rechner im Verein aufrufen – mit `sudo`:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/eddyreddington/schaufuchs/main/deploy/install.sh | sudo sh
   ```

4. Als Adresse `localhost` eingeben. SchauFUCHS ist dann im Windows-Browser unter `https://localhost` erreichbar. Das
   Notfallblatt liegt in Ubuntu unter `~/schaufuchs-notfallblatt.txt`, die Befehle laufen mit `sudo schaufuchs …`.

Beim ersten Öffnen warnt der Browser vor dem selbst ausgestellten Zertifikat; für `localhost` ist das unbedenklich.
Docker Desktop muss laufen, damit SchauFUCHS erreichbar ist.

## Hilfe

Fragen und Fehler: im Projekt auf GitHub unter „Issues“. Sicherheitslücken bitte nicht öffentlich melden, sondern wie in
[SECURITY.md](../SECURITY.md) beschrieben.
