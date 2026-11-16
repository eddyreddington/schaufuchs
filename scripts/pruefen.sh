#!/usr/bin/env bash
# Prüfkette wie in der CI (.gitea/workflows/pruefen.yml): Typecheck, Modulkarte aktuell, Dateigrößen (Warnung),
# Domain-Tests, Sprachen der Oberfläche, Server-Tests. Lokal ohne TEST_DATABASE_URL startet sie die Entwicklungsdatenbank wie `bun run test`.
set -euo pipefail
cd "$(dirname "$0")/.."
GRENZE=600
schritt() { printf '\n▸ %s\n' "$1"; }

schritt "Typecheck"
bun run typecheck

schritt "Modulkarte"
bun scripts/modulkarte.ts
if ! git diff --quiet -- docs/modulkarte.md; then
  if [ -n "${CI:-}" ]; then
    git --no-pager diff --stat -- docs/modulkarte.md
    echo "Fehler: docs/modulkarte.md ist nicht aktuell – lokal „bun run modulkarte“ ausführen und mit committen." >&2
    exit 1
  fi
  echo "Hinweis: docs/modulkarte.md hat sich geändert – bitte mit committen."
fi

schritt "Dateigrößen (Grenze $GRENZE Zeilen)"
gross=$(git ls-files -- 'packages/*/src/*' 'apps/*/src/*' \
  | grep -E '\.tsx?$' | grep -vE '\.test\.ts$|/src/tests/' \
  | tr '\n' '\0' | xargs -0 wc -l | grep -v ' total$' \
  | awk -v g="$GRENZE" '$1 > g { printf "  %6d  %s\n", $1, $2 }' | sort -rn)
if [ -n "$gross" ]; then
  echo "Warnung: $(printf '%s\n' "$gross" | wc -l | tr -d ' ') Dateien über $GRENZE Zeilen (beim nächsten Anfassen teilen):"
  printf '%s\n' "$gross"
else
  echo "Keine Datei über $GRENZE Zeilen."
fi

schritt "Datenbank"
if [ -z "${TEST_DATABASE_URL:-}" ]; then
  ./scripts/dev-db.sh start
else
  echo "Test-Datenbank aus TEST_DATABASE_URL."
fi

schritt "Domain-Tests"
(cd packages/domain && bun test)

schritt "Sprachen (Reste, Deutsch unverändert, Servermeldungen)"
bun test scripts/sprachen-scan.test.ts

schritt "Server-Tests"
# 30 s je Test: Demodaten und Katalog-PDFs brauchen auf dem CI-Runner (begrenzte CPU) mehr als die 5 s Vorgabe.
(cd apps/server && bun test --timeout 30000)

printf '\n✓ Alle Prüfungen bestanden.\n'
