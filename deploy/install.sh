#!/bin/sh
# SchauFUCHS installieren – auf einem Linux-Server (Debian oder Ubuntu) mit eigener Adresse, oder zum Ausprobieren
# auf einem Mac (Docker Desktop oder OrbStack) bzw. unter Windows in WSL2 (Ubuntu) mit der Adresse „localhost“.
#
#   Linux, Windows (WSL2):  curl -fsSL https://raw.githubusercontent.com/eddyreddington/schaufuchs/main/deploy/install.sh | sudo sh
#   Mac:                    curl -fsSL https://raw.githubusercontent.com/eddyreddington/schaufuchs/main/deploy/install.sh | sh
#
# Linux: als eigener Benutzer mit sudo aufrufen, nicht als root angemeldet (Anleitung: docs/installation.md). Dieser
# Benutzer bekommt das Notfallblatt in seinen Ordner und darf die verschlüsselten Sicherungen lesen und kopieren.
#
# Fragt Adresse und E-Mail, installiert bei Bedarf Docker, erzeugt alle Schlüssel, startet SchauFUCHS mit HTTPS und
# zeigt am Ende den Einrichtungscode und das Notfallblatt (Schlüssel zum Aufheben).
# Zum Ausprobieren ohne eigene Adresse: Adresse „localhost“ eingeben (HTTPS mit selbst ausgestelltem Zertifikat).
#
# Ohne Rückfragen (z. B. für automatische Einrichtung): SCHAUFUCHS_ADRESSE und SCHAUFUCHS_EMAIL setzen und
# SCHAUFUCHS_JA=1 (beantwortet alle Ja/Nein-Fragen mit Ja, installiert also auch Docker).
#
# Für Entwickler (Probelauf mit lokal gebauten Images und Dateien):
#   SCHAUFUCHS_QUELLE=/pfad/zum/repo SCHAUFUCHS_IMAGE=schaufuchs-lokal SCHAUFUCHS_VERSION=test sh install.sh
set -eu
# Alles in geschweiften Klammern: Beim Aufruf über „curl … | sh“ liest die Shell so erst das ganze Skript, bevor sie
# etwas ausführt – sonst könnte ein Befehl, der von der Eingabe liest, den Rest des Skripts verschlucken.
{

KONTO="eddyreddington"
VERSION="${SCHAUFUCHS_VERSION:-1.13.0}"
IMAGE="${SCHAUFUCHS_IMAGE:-ghcr.io/$KONTO/schaufuchs}"
QUELLE="${SCHAUFUCHS_QUELLE:-https://raw.githubusercontent.com/$KONTO/schaufuchs/v$VERSION}"
SYSTEM="$(uname -s)"
# Mac: im eigenen Benutzerordner, ohne root (Docker Desktop/OrbStack laufen als Benutzer).
if [ "$SYSTEM" = "Darwin" ]; then ZIEL="${SCHAUFUCHS_ZIEL:-$HOME/SchauFUCHS}"; else ZIEL="${SCHAUFUCHS_ZIEL:-/opt/schaufuchs}"; fi

fett() { printf '\033[1m%s\033[0m\n' "$*"; }
fehler() { printf '\033[31mFehler:\033[0m %s\n' "$*" >&2; exit 1; }
# Eingaben kommen vom Bildschirm, auch wenn das Skript per „curl … | sh“ läuft.
frage() {
  printf '%s ' "$1" > /dev/tty
  read -r antwort < /dev/tty || antwort=""
  printf '%s' "$antwort"
}
ja() {
  [ "${SCHAUFUCHS_JA:-0}" = "1" ] && return 0
  [ "$(frage "$1 [ja/nein]")" = "ja" ]
}
zufall_hex() { od -An -tx1 -N"$1" /dev/urandom | tr -d ' \n'; }

# ── Voraussetzungen ───────────────────────────────────────────────────────
# Linux: Docker und /opt brauchen root-Rechte. Aufgerufen wird mit sudo von einem eigenen Benutzer (SUDO_USER); der
# bekommt Notfallblatt und Sicherungen. Wer direkt als root angemeldet ist, wird gewarnt.
benutzer=""
case "$SYSTEM" in
  Linux)
    [ "$(id -u)" = "0" ] || fehler "Bitte mit sudo starten: curl -fsSL https://raw.githubusercontent.com/$KONTO/schaufuchs/main/deploy/install.sh | sudo sh"
    if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then benutzer="$SUDO_USER"; fi
    ;;
  Darwin) ;;
  *) fehler "Dieses System wird nicht unterstützt. Unter Windows bitte in WSL2 (Ubuntu) ausführen – siehe Anleitung." ;;
esac
[ ! -f "$ZIEL/.env" ] || fehler "SchauFUCHS ist hier schon installiert ($ZIEL). Aktualisieren mit: schaufuchs update"

fett "SchauFUCHS $VERSION – Installation"
echo
if [ "$SYSTEM" = "Linux" ] && [ -z "$benutzer" ]; then
  echo "Achtung: Sie sind direkt als root angemeldet. Sicherer ist ein eigener Benutzer mit sudo, und die Anmeldung"
  echo "als root per SSH gehört abgeschaltet (Anleitung, Abschnitt „Server absichern“). Notfallblatt und Sicherungen"
  echo "gehören dann root."
  ja "Trotzdem als root installieren?" || fehler "Abgebrochen. Erst einen eigenen Benutzer anlegen, dann mit ihm und sudo neu starten."
  echo
fi

if [ "$SYSTEM" = "Darwin" ]; then
  # Auf dem Mac installiert der Installer Docker nicht selbst: Docker Desktop oder OrbStack vorher installieren und starten.
  command -v docker > /dev/null 2>&1 || fehler "Docker fehlt. Bitte zuerst Docker Desktop (docker.com) oder OrbStack (orbstack.dev) installieren und starten."
  docker info > /dev/null 2>&1 || fehler "Docker läuft nicht. Bitte Docker Desktop bzw. OrbStack starten und den Installer noch einmal aufrufen."
elif ! command -v docker > /dev/null 2>&1; then
  echo "Docker ist nicht installiert. Es wird mit dem offiziellen Skript von docker.com installiert."
  ja "Docker jetzt installieren?" || fehler "Ohne Docker geht es nicht. Abgebrochen."
  command -v curl > /dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq curl; }
  curl -fsSL https://get.docker.com | sh
fi
docker compose version > /dev/null 2>&1 || fehler "„docker compose“ fehlt. Bitte Docker aktualisieren (https://docs.docker.com/engine/install/)."

# ── Fragen ────────────────────────────────────────────────────────────────
echo "Unter welcher Adresse soll SchauFUCHS erreichbar sein? Beispiel: schau.example.org"
echo "Die Adresse muss schon auf diesen Rechner zeigen (DNS-Eintrag, im Router die Portweiterleitung für 80 und 443)."
echo "Nur auf diesem Rechner ausprobieren: localhost"
domain=$(printf '%s' "${SCHAUFUCHS_ADRESSE:-$(frage "Adresse:")}" | tr 'A-Z' 'a-z' | sed -E 's#^https?://##; s#/.*$##')
[ -n "$domain" ] || fehler "Keine Adresse angegeben."
if [ "$domain" != "localhost" ]; then
  ziel_ip=$(getent ahostsv4 "$domain" 2> /dev/null | awk 'NR==1{print $1}')
  if [ -z "$ziel_ip" ]; then
    echo "Achtung: $domain ist (noch) nicht im DNS eingetragen. Ohne Eintrag gibt es kein HTTPS-Zertifikat."
    ja "Trotzdem fortfahren?" || fehler "Abgebrochen. Erst den DNS-Eintrag anlegen, dann neu starten."
  elif ! (hostname -I 2> /dev/null || true) | tr ' ' '\n' | grep -qx "$ziel_ip"; then
    echo "Hinweis: $domain zeigt auf $ziel_ip – diese Adresse hat der Rechner selbst nicht. Das ist richtig, wenn der"
    echo "Router die Anfragen weiterleitet (Portweiterleitung für 80 und 443); sonst stimmt der DNS-Eintrag nicht."
    ja "Fortfahren?" || fehler "Abgebrochen."
  fi
fi
echo
echo "E-Mail-Adresse für das HTTPS-Zertifikat (Let's Encrypt schreibt nur, wenn etwas nicht stimmt):"
email="${SCHAUFUCHS_EMAIL:-$(frage "E-Mail:")}"
case "$email" in *@*.*) ;; *) fehler "Bitte eine gültige E-Mail-Adresse angeben." ;; esac

# ── Dateien holen ─────────────────────────────────────────────────────────
mkdir -p "$ZIEL/backups" "$ZIEL/scripts"
chmod 700 "$ZIEL/backups"
# Die Sicherungen sind verschlüsselt; der eigene Benutzer darf sie lesen und außer Haus kopieren (BACKUP_UID unten).
if [ -n "$benutzer" ]; then
  benutzer_uid=$(id -u "$benutzer")
  benutzer_gid=$(id -g "$benutzer")
  chown "$benutzer_uid:$benutzer_gid" "$ZIEL/backups"
fi
hole() {
  case "$QUELLE" in
    http*) curl -fsSL "$QUELLE/$1" -o "$2" || fehler "Konnte $1 nicht laden ($QUELLE)." ;;
    *) cp "$QUELLE/$1" "$2" ;;
  esac
}
hole deploy/docker-compose.yml "$ZIEL/docker-compose.yml"
hole deploy/Caddyfile "$ZIEL/Caddyfile"
hole deploy/schaufuchs "$ZIEL/schaufuchs"
hole scripts/wiederherstellen.sh "$ZIEL/scripts/wiederherstellen.sh"
chmod 755 "$ZIEL/schaufuchs"
# Befehl „schaufuchs“ überall aufrufbar – auf dem Mac nur, wenn /usr/local/bin ohne root beschreibbar ist.
if [ "$SYSTEM" = "Linux" ] || [ -w /usr/local/bin ]; then
  ln -sf "$ZIEL/schaufuchs" /usr/local/bin/schaufuchs
  befehl="schaufuchs"
else
  befehl="$ZIEL/schaufuchs"
fi
if [ "$SYSTEM" = "Linux" ]; then befehl="sudo $befehl"; fi

# ── Schlüssel ─────────────────────────────────────────────────────────────
echo
echo "Lade die Programme (einmalig einige hundert MB) …"
export SCHAUFUCHS_IMAGE="$IMAGE" SCHAUFUCHS_VERSION="$VERSION"
case "$IMAGE" in */*) docker pull -q "$IMAGE-backup:$VERSION" < /dev/null > /dev/null ;; esac
schluesselpaar=$(docker run --rm --entrypoint age-keygen "$IMAGE-backup:$VERSION" < /dev/null 2> /dev/null) || fehler "Sicherungsschlüssel ließ sich nicht erzeugen."
sicherung_privat=$(printf '%s\n' "$schluesselpaar" | grep '^AGE-SECRET-KEY-')
sicherung_oeffentlich=$(printf '%s\n' "$schluesselpaar" | sed -n 's/^# public key: //p')
[ -n "$sicherung_privat" ] && [ -n "$sicherung_oeffentlich" ] || fehler "Sicherungsschlüssel unvollständig."
datenschluessel=$(head -c 32 /dev/urandom | base64 | tr -d '\n')
einrichtung=$(zufall_hex 3)-$(zufall_hex 3)
oeffentlich="https://$domain"

umask 077
cat > "$ZIEL/.env" << ENV
# SchauFUCHS – Einstellungen (angelegt von install.sh am $(date '+%d.%m.%Y %H:%M')).
# Nach Änderungen: schaufuchs neustart
SCHAUFUCHS_IMAGE=$IMAGE
SCHAUFUCHS_VERSION=$VERSION
SCHAUFUCHS_DOMAIN=$domain
ACME_EMAIL=$email
PUBLIC_URL=$oeffentlich
APP_NAME=SchauFUCHS
POSTGRES_PASSWORD=$(zufall_hex 32)
DATENSCHLUESSEL=$datenschluessel
EINRICHTUNG_CODE=$einrichtung
BACKUP_EMPFAENGER=$sicherung_oeffentlich
BACKUP_INTERVALL_MINUTEN=120
BACKUP_TAGE=30
${benutzer:+# Sicherungsdateien gehören diesem Benutzer ($benutzer), damit er sie ohne sudo kopieren kann.
BACKUP_UID=$benutzer_uid
BACKUP_GID=$benutzer_gid}
# E-Mail-Versand (leer = Mails bleiben im Postausgang). Format: smtp://benutzer:passwort@server:587
# Sonderzeichen in Benutzer/Passwort kodieren: @ → %40, # → %23, / → %2F, ? → %3F, % → %25, : → %3A
SMTP_URL=
MAIL_FROM="SchauFUCHS <noreply@$domain>"
ENV
umask 022

# ── Starten ───────────────────────────────────────────────────────────────
echo "Starte SchauFUCHS …"
cd "$ZIEL"
case "$IMAGE" in */*) docker compose pull -q < /dev/null ;; esac
docker compose up -d < /dev/null
printf 'Warte auf den Start '
bereit=""
for _ in $(seq 1 90); do
  if docker compose exec -T app bun -e "fetch('http://localhost:8787/api/gesund').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" < /dev/null > /dev/null 2>&1; then
    bereit=1
    break
  fi
  printf '.'
  sleep 2
done
echo
[ -n "$bereit" ] || fehler "SchauFUCHS ist nicht gestartet. Hinweise: $befehl logs"

# ── Notfallblatt ──────────────────────────────────────────────────────────
# Linux: im Ordner des Benutzers, der sudo aufgerufen hat (sonst root); Mac: im Installationsordner. Nur für den
# Besitzer lesbar.
if [ "$SYSTEM" = "Darwin" ]; then
  blatt="$ZIEL/notfallblatt.txt"
elif [ -n "$benutzer" ]; then
  blatt="$(getent passwd "$benutzer" | cut -d: -f6)/schaufuchs-notfallblatt.txt"
else
  blatt=/root/schaufuchs-notfallblatt.txt
fi
umask 077
cat > "$blatt" << BLATT
SchauFUCHS – Notfallblatt für $domain (erstellt $(date '+%d.%m.%Y'))
================================================================================
Diese beiden Schlüssel braucht der Verein, wenn der Server ausfällt oder eine Sicherung zurückgespielt werden muss.
Ausdrucken oder im Passwortmanager des Vereins ablegen – NICHT nur auf diesem Server.

Sicherungsschlüssel (entschlüsselt die Sicherungen):
$sicherung_privat

Datenschlüssel (entschlüsselt IBAN und Zwei-Faktor-Geheimnisse in der Datenbank):
$datenschluessel

Sicherungen liegen auf dem Server unter $ZIEL/backups – bitte regelmäßig zusätzlich außer Haus kopieren.

Zum Ausfüllen von Hand (Anleitung: docs/installation.md, Schritt „Notfallblatt sichern“):
  Server-Anbieter, Kundennummer, Zugang zur Konsole: ______________________________________________
  IP-Adressen des Servers (IPv4, IPv6):              ______________________________________________
  Domain verwaltet bei:                              ______________________________________________
  Benutzer auf dem Server:                           ${benutzer:-______________________________________________}
  SSH-Schlüssel und Benutzerpasswort liegen bei:     ______________________________________________
  Sicherungen außer Haus liegen bei:                 ______________________________________________
BLATT
umask 022
[ -z "$benutzer" ] || chown "$benutzer_uid:$benutzer_gid" "$blatt"

echo
fett "SchauFUCHS läuft."
echo
echo "  1. Öffnen Sie $oeffentlich"
echo "  2. Legen Sie Verein und ersten Administrator an. Einrichtungscode: $einrichtung"
echo
fett "  WICHTIG – Notfallblatt:"
echo "  Die Schlüssel für Sicherungen stehen in $blatt"
echo "  Bitte ausdrucken oder im Passwortmanager ablegen und die Datei danach löschen:"
echo "      cat $blatt      (anzeigen)"
echo "      rm $blatt       (danach löschen)"
echo "  Ohne diese Schlüssel lässt sich keine Sicherung zurückspielen."
echo
if [ "$domain" = "localhost" ]; then
  echo "  Der Browser warnt einmal vor dem selbst ausgestellten Zertifikat – für localhost unbedenklich."
fi
# „pruefen“ gibt es im Befehl schaufuchs ab 1.2.1.
if [ "$SYSTEM" = "Linux" ] && grep -q '^  pruefen)' "$ZIEL/schaufuchs"; then
  echo "  Absicherung des Servers prüfen (SSH, Firewall, Updates): $befehl pruefen"
fi
echo "  Weitere Befehle: $befehl hilfe"
}
