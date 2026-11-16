/** Benutzer: gemeinsame Teile der Seiten (Rollennamen, Statusmarken, Rücklink, Neuladen nach Änderungen). */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { trpc, type Ausgabe } from "../trpc";
import { Marke, SEITE } from "../ui";

type Eintrag = Ausgabe["auth"]["benutzerListe"][number];
export const ROLLE = { admin: "Administrator", mitarbeiter: "Mitarbeiter" } as const;

export function Seite({ children }: { children: ReactNode }) {
  return <div className={SEITE}>{children}</div>;
}

export function Initialen({ name }: { name: string }) {
  const k = name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-band-hell text-sm font-semibold text-band-dunkel">{k || "?"}</span>;
}

export function einladungAbgelaufen(b: Pick<Eintrag, "einladungOffen" | "einladungBis">) {
  return b.einladungOffen && (!b.einladungBis || new Date(b.einladungBis) < new Date());
}

export function StatusMarken({ b }: { b: Pick<Eintrag, "aktiv" | "wartet" | "zweiFaktor" | "einladungOffen" | "einladungBis"> }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {!b.aktiv ? (
        <Marke ton="fehler">gesperrt</Marke>
      ) : b.einladungOffen ? (
        <Marke ton="warnung">{einladungAbgelaufen(b) ? "Einladung abgelaufen" : "eingeladen"}</Marke>
      ) : (
        <Marke ton="ok">aktiv</Marke>
      )}
      {b.zweiFaktor ? <Marke ton="ok">2FA</Marke> : <Marke ton="neutral">ohne 2FA</Marke>}
      {b.wartet && <Marke ton="warnung">Wartezeit</Marke>}
    </span>
  );
}

export function Zurueck() {
  return (
    <Link to="/benutzer" className="self-start text-sm text-grau no-underline hover:text-tinte hover:underline">
      ‹ Alle Benutzer
    </Link>
  );
}

export type Einzel = Ausgabe["auth"]["benutzerGet"];

export function useNeuLaden() {
  const utils = trpc.useUtils();
  return async () => {
    await Promise.all([utils.auth.benutzerGet.invalidate(), utils.auth.benutzerListe.invalidate(), utils.auth.status.invalidate()]);
  };
}
