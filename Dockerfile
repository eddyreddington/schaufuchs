# Ein Container: API-Server liefert auch die gebaute Oberfläche aus.

# 1. Oberfläche bauen (braucht alle Entwicklungswerkzeuge)
# Basis-Images per Digest festgelegt: ein Neubau nimmt genau dieses Image (Aktualisieren: Digest bewusst ändern).
FROM oven/bun:1.3@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4 AS bau
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY packages/domain/package.json packages/domain/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile
COPY . .
RUN cd apps/web && bun run build

# 2. Laufzeit: nur Server, Fachlogik, gebaute Oberfläche und Produktionsabhängigkeiten des Servers
FROM oven/bun:1.3-slim@sha256:d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04
WORKDIR /app
ENV NODE_ENV=production PORT=8787
COPY package.json bun.lock tsconfig.base.json ./
COPY packages/domain packages/domain
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile --production --filter "@schau/server" && rm -rf ~/.bun/install/cache
COPY apps/server/src apps/server/src
COPY apps/server/drizzle apps/server/drizzle
COPY apps/server/seed apps/server/seed
COPY apps/server/fonts apps/server/fonts
COPY apps/server/stiche apps/server/stiche
COPY --from=bau /app/apps/web/dist apps/web/dist
RUN rm -f apps/server/src/*.test.ts
USER bun
EXPOSE 8787
# /api/gesund prüft auch die Datenbank.
HEALTHCHECK --interval=30s --timeout=5s CMD bun -e "fetch('http://localhost:8787/api/gesund').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# exec: der Server ersetzt die Shell und bekommt SIGTERM direkt (sauberes Beenden).
CMD ["sh", "-c", "cd apps/server && bun src/migrate.ts && exec bun src/index.ts"]
