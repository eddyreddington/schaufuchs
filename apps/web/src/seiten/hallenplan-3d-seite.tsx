/**
 * Hallenplan in 3D als eigene Seite (eigener Browser-Tab, ohne Seitenleiste): zeigt den gespeicherten Stand des Plans. Kommt
 * man in den Tab zurück, lädt er den Plan neu (im Editor kann sich inzwischen etwas geändert haben). three.js lädt erst hier
 * (dynamischer Import der 3D-Ansicht).
 */
import { richterFolge } from "@schau/domain";
import { lazy, Suspense, useMemo } from "react";
import { Link, Navigate } from "react-router-dom";
import { useSchauId } from "../rahmen";
import { useOberflaeche } from "../sprache";
import { trpc } from "../trpc";
import { FehlerAnzeige, Laden, Leer, SCHMAL, SEITENRAND, useSeitentitel } from "../ui";

const Hallenplan3D = lazy(() => import("./hallenplan-3d"));

export function Hallenplan3DSeite() {
  const schauId = useSchauId();
  const t = useOberflaeche().halleBild.dreiD;
  const status = trpc.auth.status.useQuery();
  const angemeldet = !!status.data?.benutzer && !status.data.zweiFaktorPflicht;
  const schau = trpc.schau.get.useQuery({ id: schauId }, { enabled: angemeldet });
  // Zurück im Tab: neu laden (der Editor im anderen Tab hat vielleicht gespeichert).
  const q = trpc.katalog.hallenplan.useQuery({ schauId }, { enabled: angemeldet, refetchOnWindowFocus: true });
  useSeitentitel(schau.data ? t.seitentitel(schau.data.name) : t.halle);
  const d = q.data;
  const richterIndex = useMemo(() => (d?.plan ? new Map(richterFolge(d.plan, d.richter).map((r, i) => [r.id, i])) : new Map<number, number>()), [d]);
  if (status.isLoading) return <div className={SEITENRAND}><Laden /></div>;
  if (status.data?.zweiFaktorPflicht) return <Navigate to="/benutzer" replace />;
  if (status.error) return <div className={`${SEITENRAND} ${SCHMAL}`}><FehlerAnzeige fehler={status.error} nochmal={() => status.refetch()} /></div>;
  if (!status.data?.benutzer) return <Navigate to="/anmelden" replace />;
  const fehler = schau.error ?? q.error;
  if (fehler) return <div className={`${SEITENRAND} ${SCHMAL}`}><FehlerAnzeige fehler={fehler} nochmal={() => void Promise.all([schau.refetch(), q.refetch()])} /></div>;
  if (!d) return <div className={SEITENRAND}><Laden /></div>;
  if (!d.halle || !d.plan)
    return (
      <div className={`${SEITENRAND} ${SCHMAL} flex flex-col gap-4`}>
        <Leer titel={t.keineHalle} />
        <Link to={`/schau/${schauId}/hallenplan`}>{t.zumHallenplan}</Link>
      </div>
    );
  return (
    <Suspense fallback={<div className={SEITENRAND}><Laden /></div>}>
      <Hallenplan3D
        halle={d.halle}
        plan={d.plan}
        masse={d.masse}
        aufsteller={d.aufsteller}
        farben={d.farben}
        richter={d.richter}
        richterIndex={richterIndex}
        schauId={schauId}
        seite={{ stand: q.dataUpdatedAt, laedt: q.isFetching, aktualisieren: () => void q.refetch(), zurueck: `/schau/${schauId}/hallenplan`, schau: schau.data?.name ?? "" }}
      />
    </Suspense>
  );
}
