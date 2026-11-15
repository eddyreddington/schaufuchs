#!/bin/sh
# Spielt eine Sicherung zurück – immer in eine leere Datenbank, alles oder nichts:
#   1. Sicherung prüfen (lesbar, vollständig) – vorher wird nichts verändert,
#   2. den aktuellen Stand sichern (backups/schau-…-vor-wiederherstellung.dump.age),
#   3. Sicherung in eine NEUE Datenbank „schau_neu“ einspielen (--single-transaction --exit-on-error), während die App
#      weiterläuft – scheitert das, bleibt alles, wie es war,
#   4. erst dann App und Sicherung anhalten, die alte Datenbank löschen und die neue umbenennen, 5. App starten.
# Beim Start bringt die App den Stand per Migration auf ihre Version und spielt die Schutz-Trigger ein.
#
# Aufruf:
#   sh scripts/wiederherstellen.sh --schluessel /pfad/sicherung-schluessel.txt backups/schau-JJJJ-MM-TT-HHMM.dump.age
#   sh scripts/wiederherstellen.sh --schluessel … --vorherige-version backups/schau-JJJJ-MM-TT-HHMM-vor-update.dump.age
# Verschlüsselte Sicherungen (.age) brauchen den privaten Schlüssel (aus dem Tresor, z. B. KeePass): kurz als Datei
# ablegen, nach dem Zurückspielen wieder löschen. Entschlüsselt wird im Sicherungs-Container; der Klartext fließt
# direkt in pg_restore und landet nie auf der Platte. Alte, unverschlüsselte .dump-Dateien gehen ohne Schlüssel.
# Mit --vorherige-version wird zusätzlich das Programm auf den Stand vor dem letzten Update zurückgesetzt
# (Image gefluegelschau-app:vorher, angelegt von scripts/docker-start.sh). So lässt sich ein Update mit neuer
# Migration vollständig zurücknehmen; ohne den Schalter migrierte die neue Version die alte Sicherung sofort wieder.
set -eu
# Scheitert die Entschlüsselung in der Pipe, soll das auffallen (dash kennt pipefail erst in neueren Fassungen).
(set -o pipefail) 2> /dev/null && set -o pipefail
version=""
schluessel=""
while [ $# -gt 1 ]; do
  case "$1" in
    --vorherige-version) version="vorher"; shift ;;
    --schluessel) schluessel="${2:?Bitte die Schlüsseldatei angeben.}"; shift 2 ;;
    *) break ;;
  esac
done
datei="${1:?Bitte die Sicherungsdatei angeben, z. B. backups/schau-2026-11-06-1800.dump}"
# Pfad festhalten, bevor ins Projektverzeichnis gewechselt wird.
case "$datei" in /*) ;; *) datei="$(pwd)/$datei" ;; esac
[ -f "$datei" ] || { echo "Datei nicht gefunden: $datei" >&2; exit 1; }
[ -r "$datei" ] || {
  echo "Keine Leserechte für $datei. Unter Linux gehören die Sicherungen root – mit sudo aufrufen oder BACKUP_UID in der .env setzen." >&2
  exit 1
}
case "$datei" in
  *.age)
    [ -n "$schluessel" ] || { echo "Die Sicherung ist verschlüsselt – bitte mit --schluessel DATEI den privaten Schlüssel angeben." >&2; exit 1; }
    case "$schluessel" in /*) ;; *) schluessel="$(pwd)/$schluessel" ;; esac
    [ -r "$schluessel" ] || { echo "Schlüsseldatei nicht lesbar: $schluessel" >&2; exit 1; }
    # Die Datei braucht es bis zum Ende (zweimal gelesen) – am besten in /dev/shm (Arbeitsspeicher), danach löschen.
    ;;
esac
cd "$(dirname "$0")/.."
# Sicherung als Klartext auf die Standardausgabe – verschlüsselte über age im Sicherungs-Container.
lesen() {
  case "$datei" in
    *.age) docker compose run --rm -T --no-deps -v "$schluessel:/schluessel.txt:ro" --entrypoint age backup -d -i /schluessel.txt < "$datei" ;;
    *) cat "$datei" ;;
  esac
}
if [ -n "$version" ] && ! docker image inspect gefluegelschau-app:vorher > /dev/null 2>&1; then
  echo "Kein Programmstand vor dem letzten Update gefunden (gefluegelschau-app:vorher). Ohne --vorherige-version aufrufen." >&2
  exit 1
fi

docker compose up -d db > /dev/null
# 1. Prüfen, bevor irgendetwas gelöscht wird: ganz durchlesen (--list allein bemerkte eine abgeschnittene Datei nicht).
if ! lesen | docker compose exec -T db pg_restore -f /dev/null; then
  echo "Die Sicherung lässt sich nicht lesen oder ist unvollständig – es wurde nichts verändert." >&2
  exit 1
fi

printf 'Die laufende Datenbank wird durch %s ERSETZT%s. Fortfahren? [ja/nein] ' "$datei" "${version:+ und das Programm auf den Stand vor dem letzten Update gesetzt}"
read -r antwort
[ "$antwort" = "ja" ] || { echo "Abgebrochen."; exit 1; }

# 2. Den jetzigen Stand sichern – falls die falsche Datei gewählt wurde.
docker compose run --rm --no-deps backup einmal vor-wiederherstellung

# 3. In eine neue Datenbank einspielen, die laufende bleibt unberührt.
docker compose exec -T db dropdb -U schau --if-exists schau_neu
docker compose exec -T db createdb -U schau schau_neu
if ! lesen | docker compose exec -T db pg_restore -U schau -d schau_neu --single-transaction --exit-on-error --no-owner; then
  docker compose exec -T db dropdb -U schau --if-exists schau_neu
  echo "Einspielen fehlgeschlagen – die laufende Datenbank ist unverändert." >&2
  exit 1
fi
# 4.–5. Tauschen: nur jetzt ist die App kurz aus.
docker compose stop app backup
docker compose exec -T db dropdb -U schau schau
docker compose exec -T db psql -U schau -d postgres -v ON_ERROR_STOP=1 -c 'ALTER DATABASE schau_neu RENAME TO schau'
if [ -n "$version" ]; then
  docker tag gefluegelschau-app:latest gefluegelschau-app:zurueckgenommen
  docker tag gefluegelschau-app:vorher gefluegelschau-app:latest
  docker compose up -d --no-build --force-recreate app backup
  echo "Programm auf den Stand vor dem Update gesetzt (das zurückgenommene Image heißt gefluegelschau-app:zurueckgenommen)."
else
  # Neu erstellen statt nur starten: hat sich die Version in der .env geändert (schaufuchs zuruecknehmen), startet so
  # gleich die richtige – nie kurz die neuere, die die zurückgespielte Datenbank sonst sofort wieder migrierte.
  docker compose up -d --no-build --force-recreate app backup
fi
echo "Zurückgespielt. Bitte anmelden und unter Protokoll „Unveränderbarkeit prüfen“ ausführen."
