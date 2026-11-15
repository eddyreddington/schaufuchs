import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink, httpLink, splitLink } from "@trpc/client";
import { createTRPCReact, type inferReactQueryProcedureOptions } from "@trpc/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { anmeldeZiel } from "@schau/domain";
import superjson from "superjson";
import { eingabeVorMs } from "./abmeldung";
import type { AppRouter } from "../../server/src/router";

export const trpc = createTRPCReact<AppRouter>();
export type Ausgabe = inferRouterOutputs<AppRouter>;
export type Optionen = inferReactQueryProcedureOptions<AppRouter>;

/**
 * Abgelaufene Anmeldung: zurück zur Anmeldeseite statt endlos „Wird geladen …“.
 * Nicht auf den öffentlichen Seiten und am Preisrichter-Tablet – die haben eigene Anmeldungen.
 */
function beiFehler(e: unknown) {
  const code = (e as { data?: { code?: string } } | null)?.data?.code;
  if (code !== "UNAUTHORIZED") return;
  const pfad = window.location.pathname;
  if (pfad === "/anmelden" || pfad.startsWith("/s/") || pfad.startsWith("/richter/")) return;
  // Mit Ziel: nach dem Anmelden geht es zurück auf diese Seite.
  window.location.assign(anmeldeZiel(pfad, window.location.search));
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: beiFehler }),
  // Bei Mutationen nicht wegleiten: das Formular mit den Eingaben bleibt stehen, die Seite zeigt den Fehler
  // („Bitte anmelden“) – nach Anmeldung in einem zweiten Tab lässt es sich erneut senden.
  mutationCache: new MutationCache({}),
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 5_000 },
  },
});

const holen = (url: URL | RequestInfo, opts?: RequestInit) => fetch(url, { ...opts, credentials: "same-origin" });
/** Für die automatische Abmeldung: wie lange die letzte Eingabe her ist (siehe abmeldung.tsx). */
const kopf = () => ({ "x-eingabe-vor": String(Math.round(eingabeVorMs())) });
/**
 * Bündeln höchstens 10 Aufrufe (Grenze des Servers); öffentliche Aufrufe und Anmeldungen gehen einzeln –
 * der Server lehnt sie gebündelt ab, damit seine Bremsen greifen.
 */
const einzeln = (pfad: string) => pfad.startsWith("oeffentlich.") || pfad === "auth.anmelden" || pfad === "auth.anmeldenCode" || pfad === "richter.anmelden";
const links = () => [
  splitLink({
    condition: (op) => einzeln(op.path),
    true: httpLink({ url: "/trpc", transformer: superjson, fetch: holen, headers: kopf }),
    false: httpBatchLink({ url: "/trpc", transformer: superjson, maxItems: 10, fetch: holen, headers: kopf }),
  }),
];

export const trpcClient = trpc.createClient({ links: links() });

/** Direkter Client ohne React Query – für das Preisrichter-Tablet, das selbst zwischenspeichert. */
export const direkt = createTRPCClient<AppRouter>({ links: links() });
