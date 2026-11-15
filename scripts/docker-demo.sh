#!/bin/sh
# Spielt die Demo im laufenden Container ein – nur auf einer Test- oder Vorführinstallation: Der Demo-Verein bringt
# einen eigenen Administrator mit (Zugang wird einmal angezeigt) und blockiert auf einer frischen Installation die
# Ersteinrichtung des echten Vereins. Entfernen: bun run docker:demo:entfernen
#   bun run docker:demo -- --testinstallation
# Liegt das vollständige Verzeichnis lokal vor (lokal/verzeichnis/rassenverzeichnis-2024.csv, nicht im Repo), wird es
# in den Container kopiert und genutzt.
set -e
cd "$(dirname "$0")/.."
erlaubt=""
for a in "$@"; do [ "$a" = "--testinstallation" ] && erlaubt=ja; done
if [ -z "$erlaubt" ]; then
  echo "Die Demo ist nur für Test- und Vorführinstallationen gedacht (eigener Administrator, blockiert die Ersteinrichtung)." >&2
  echo "Wenn das hier eine Testinstallation ist: bun run docker:demo -- --testinstallation" >&2
  exit 1
fi
DATEI=lokal/verzeichnis/rassenverzeichnis-2024.csv
VERZEICHNIS=""
if [ -f "$DATEI" ]; then
  docker compose cp "$DATEI" app:/tmp/verzeichnis.csv
  VERZEICHNIS="SCHAU_VERZEICHNIS=/tmp/verzeichnis.csv"
fi
docker compose exec -T -e SCHAU_DEMO_ERLAUBT=ja app sh -c "cd apps/server && $VERZEICHNIS bun src/seed.ts --komplett"
