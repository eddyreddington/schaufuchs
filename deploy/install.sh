#!/bin/sh
# SchauFUCHS installieren – für einen Linux-Server (Debian oder Ubuntu) mit eigener Adresse.
#
#   curl -fsSL https://raw.githubusercontent.com/eddyreddington/schaufuchs/main/deploy/install.sh | sudo sh
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

KONTO="eddyreddington"
VERSION="${SCHAUFUCHS_VERSION:-1.2.0}"
IMAGE="${SCHAUFUCHS_IMAGE:-ghcr.io/$KONTO/schaufuchs}"
QUELLE="${SCHAUFUCHS_QUELLE:-https://raw.githubusercontent.com/$KONTO/schaufuchs/v$VERSION}"
ZIEL="${SCHAUFUCHS_ZIEL:-/opt/schaufuchs}"

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
[ "$(id -u)" = "0" ] || fehler "Bitte mit sudo bzw. als root ausführen."
[ "$(uname -s)" = "Linux" ] || fehler "Der Installer ist für Linux-Server (Debian, Ubuntu)."
[ ! -f "$ZIEL/.env" ] || fehler "SchauFUCHS ist hier schon installiert ($ZIEL). Aktualisieren mit: schaufuchs update"

fett "SchauFUCHS $VERSION – Installation"
echo

if ! command -v docker > /dev/null 2>&1; then
  echo "Docker ist nicht installiert. Es wird mit dem offiziellen Skript von docker.com installiert."
  ja "Docker jetzt installieren?" || fehler "Ohne Docker geht es nicht. Abgebrochen."
  command -v curl > /dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq curl; }
  curl -fsSL https://get.docker.com | sh
fi
docker compose version > /dev/null 2>&1 || fehler "„docker compose“ fehlt. Bitte Docker aktualisieren (https://docs.docker.com/engine/install/)."

# ── Fragen ────────────────────────────────────────────────────────────────
echo "Unter welcher Adresse soll SchauFUCHS erreichbar sein? Beispiel: schau.mein-verein.de"
echo "Die Adresse muss schon auf diesen Server zeigen (DNS-Eintrag beim Anbieter der Domain)."
domain=$(printf '%s' "${SCHAUFUCHS_ADRESSE:-$(frage "Adresse:")}" | tr 'A-Z' 'a-z' | sed 's#^https\?://##; s#/.*$##')
[ -n "$domain" ] || fehler "Keine Adresse angegeben."
if [ "$domain" != "localhost" ]; then
  ziel_ip=$(getent ahostsv4 "$domain" 2> /dev/null | awk 'NR==1{print $1}')
  if [ -z "$ziel_ip" ]; then
    echo "Achtung: $domain ist (noch) nicht im DNS eingetragen. Ohne Eintrag gibt es kein HTTPS-Zertifikat."
    ja "Trotzdem fortfahren?" || fehler "Abgebrochen. Erst den DNS-Eintrag anlegen, dann neu starten."
  elif ! (hostname -I 2> /dev/null || true) | tr ' ' '\n' | grep -qx "$ziel_ip"; then
    echo "Hinweis: $domain zeigt auf $ziel_ip – diese Adresse hat der Server selbst nicht. Das ist richtig, wenn ein"
    echo "Router oder Anbieter die Anfragen weiterleitet; sonst stimmt der DNS-Eintrag nicht."
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
ln -sf "$ZIEL/schaufuchs" /usr/local/bin/schaufuchs

# ── Schlüssel ─────────────────────────────────────────────────────────────
echo
echo "Lade die Programme (einmalig einige hundert MB) …"
export SCHAUFUCHS_IMAGE="$IMAGE" SCHAUFUCHS_VERSION="$VERSION"
case "$IMAGE" in */*) docker pull -q "$IMAGE-backup:$VERSION" > /dev/null ;; esac
schluesselpaar=$(docker run --rm --entrypoint age-keygen "$IMAGE-backup:$VERSION" 2> /dev/null) || fehler "Sicherungsschlüssel ließ sich nicht erzeugen."
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
# E-Mail-Versand (leer = Mails bleiben im Postausgang). Format: smtp://benutzer:passwort@server:587
# Sonderzeichen in Benutzer/Passwort kodieren: @ → %40, # → %23, / → %2F, ? → %3F, % → %25, : → %3A
SMTP_URL=
MAIL_FROM="SchauFUCHS <noreply@$domain>"
ENV
umask 022

# ── Starten ───────────────────────────────────────────────────────────────
echo "Starte SchauFUCHS …"
cd "$ZIEL"
case "$IMAGE" in */*) docker compose pull -q ;; esac
docker compose up -d
printf 'Warte auf den Start '
bereit=""
for _ in $(seq 1 90); do
  if docker compose exec -T app bun -e "fetch('http://localhost:8787/api/gesund').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" > /dev/null 2>&1; then
    bereit=1
    break
  fi
  printf '.'
  sleep 2
done
echo
[ -n "$bereit" ] || fehler "SchauFUCHS ist nicht gestartet. Hinweise: schaufuchs logs"

# ── Notfallblatt ──────────────────────────────────────────────────────────
blatt=/root/schaufuchs-notfallblatt.txt
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
BLATT
umask 022

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
echo "  Weitere Befehle: schaufuchs hilfe"
