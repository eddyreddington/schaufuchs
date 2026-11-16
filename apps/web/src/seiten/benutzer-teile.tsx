/** Benutzer: gemeinsame Teile der Seiten (Rollennamen, Statusmarken, Rücklink, Neuladen nach Änderungen). */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useOberflaeche } from "../sprache";
import { trpc, type Ausgabe } from "../trpc";
import { Marke, SEITE } from "../ui";

type Eintrag = Ausgabe["auth"]["benutzerListe"][number];

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
  const o = useOberflaeche().verein.benutzer;
  const t = o.teile;
  return (
    <span className="flex flex-wrap gap-1.5">
      {!b.aktiv ? (
        <Marke ton="fehler">{t.gesperrt}</Marke>
      ) : b.einladungOffen ? (
        <Marke ton="warnung">{einladungAbgelaufen(b) ? t.einladungAbgelaufen : t.eingeladen}</Marke>
      ) : (
        <Marke ton="ok">{o.aktiv}</Marke>
      )}
      {b.zweiFaktor ? <Marke ton="ok">{t.zweiFa}</Marke> : <Marke ton="neutral">{t.ohne2fa}</Marke>}
      {b.wartet && <Marke ton="warnung">{t.wartezeit}</Marke>}
    </span>
  );
}

export function Zurueck() {
  const t = useOberflaeche().verein.benutzer.teile;
  return (
    <Link to="/benutzer" className="self-start text-sm text-grau no-underline hover:text-tinte hover:underline">
      {t.alleBenutzer}
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
