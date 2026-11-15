import { trpc } from "./trpc";

/**
 * Ist der angemeldete Benutzer Administrator (Ausstellungsleitung)? Admin-Aktionen zeigt die Oberfläche nur dann –
 * der Server prüft die Rolle ohnehin, so scheitert ein Klick aber nicht erst hinterher.
 */
export function useIstAdmin(): boolean {
  return trpc.auth.status.useQuery().data?.benutzer?.rolle === "admin";
}
