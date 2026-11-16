/**
 * Seite „Hallenplan“: neue Halle anlegen und der Editor (`Plan`) mit Speichern, Rückgängig, Auswahl und Tastatur.
 * Zeichnung, Werkzeugleiste, Eigenschaften und Stellvorschläge liegen in den Dateien hallenplan-*.tsx daneben,
 * reine Rechnungen in hallenplan-geometrie.ts (Moduldoku: docs/module/halle.md).
 */
import { type Halle, type HallenFlaeche, halleSchluessel, type KaefigTyp, LOCALE, richterFolge, serverText } from "@schau/domain";
import { useEffect, useRef, useState } from "react";
import { fehlerText } from "../lib";
import { useSchauId } from "../rahmen";
import { useIstAdmin } from "../rolle";
import { useOberflaeche, useSprache } from "../sprache";
import { trpc } from "../trpc";
import { Abschnitt, Dialog, FehlerAnzeige, Feld, HilfeLink, Hinweis, Knopf, KnopfLink, Laden, Leer, Marke, SEITE, Seitenkopf, type SpeicherStand, SpeicherStatus, useMeldung } from "../ui";
import { useEditorAktionen } from "./hallenplan-aktionen";
import { usePlanBefehle } from "./hallenplan-befehle";
import { PlanBild } from "./hallenplan-bild";
import { Eigenschaften, HalleEigenschaften, MitEinheit } from "./hallenplan-eigenschaften";
import { HallenEntwuerfe } from "./hallenplan-entwuerfe";
import { useHallenEntwurf } from "./hallenplan-entwurf";
import { type Daten, meter, type Versetzen, type Ziel, zuCm, zweisprachig } from "./hallenplan-geometrie";
import { AutomatikSchalter, KaefigInfo, SpartenReihen } from "./hallenplan-teile";
import { Aufbauliste, PlanLegende, PlatzUebersicht } from "./hallenplan-uebersicht";
import { HallenSkizze, StellVorschlaege } from "./hallenplan-vorschlaege";
import { Werkzeugleiste } from "./hallenplan-werkzeugleiste";
import { kaefigNameIn } from "./kaefige";

export function Hallenplan() {
  const th = useOberflaeche().halle.hallenplan;
  const schauId = useSchauId();
  const istAdmin = useIstAdmin();
  const q = trpc.katalog.hallenplan.useQuery({ schauId });
  if (q.error) return <FehlerAnzeige fehler={q.error} nochmal={() => q.refetch()} />;
  if (!q.data) return <Laden />;
  const d = q.data;
  // Ein Halleneditor für alles: Einstellungen der Halle, Eingänge und Flächen, Stellvorschläge und freies Planen. Mit Plan
  // setzt der Editor den Seitenkopf selbst (Stand des Plans, Vollansicht).
  return (
    <div className={`druck-quer ${SEITE}`}>
      {d.plan && d.halle ? (
        <Plan d={d} halle={d.halle} plan={d.plan} schauId={schauId} istAdmin={istAdmin} />
      ) : (
        <>
          <Seitenkopf titel={th.titel} hilfe="hallenplan" />
          {!d.halle && !istAdmin && <Leer titel={th.keineHalle} />}
          {!d.halle && istAdmin && <NeueHalle schauId={schauId} vorgabe={d.vorgabe} />}
        </>
      )}
    </div>
  );
}

/** Neue Schau ohne Halle: Maße eintragen, „Halle anlegen“ – danach geht es im Halleneditor weiter. */
function NeueHalle({ schauId, vorgabe }: { schauId: number; vorgabe: Halle }) {
  const t = useOberflaeche().halle;
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const [w, setW] = useState({ breite: meter(vorgabe.breite), laenge: meter(vorgabe.laenge), gang: meter(vorgabe.gang) });
  const anlegen = trpc.katalog.halleSetzen.useMutation({
    onSuccess: async () => {
      await utils.katalog.hallenplan.invalidate({ schauId });
      meldung(t.hallenplan.angelegt);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const cm = { breite: zuCm(w.breite), laenge: zuCm(w.laenge), gang: zuCm(w.gang) };
  const ok = cm.breite >= 300 && cm.laenge >= 300 && cm.gang >= 50 && cm.breite <= 50000 && cm.laenge <= 50000;
  return (
    <Abschnitt titel={t.hallenplan.neueHalle}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <HallenSkizze breite={ok ? cm.breite : vorgabe.breite} laenge={ok ? cm.laenge : vorgabe.laenge} flaechen={[]} />
        <form
          className="flex flex-col gap-4"
          aria-label={t.hallenplan.halleAnlegen}
          onSubmit={(e) => {
            e.preventDefault();
            if (!ok) return meldung(t.hallenplan.masseFalsch, "fehler");
            // Nur, wenn es noch keine Halle gibt (ein zweiter Tab kann sie inzwischen angelegt haben).
            anlegen.mutate({ schauId, basis: halleSchluessel(null), halle: { ...vorgabe, ...cm } });
          }}
        >
          {(
            [
              ["breite", t.breite, t.hallenplan.kurzeSeite],
              ["laenge", t.laenge, undefined],
              ["gang", t.gangMindestens, undefined],
            ] as const
          ).map(([k, label, hinweis]) => (
            <Feld key={k} label={label} hinweis={hinweis}>
              {(id) => <MitEinheit id={id} einheit="m" aria-label={t.inMetern(label)} inputMode="decimal" value={w[k]} onChange={(e) => setW({ ...w, [k]: e.target.value })} />}
            </Feld>
          ))}
          <Knopf type="submit" variante="primaer" className="self-start" laedt={anlegen.isPending}>
            {t.hallenplan.halleAnlegen}
          </Knopf>
        </form>
      </div>
    </Abschnitt>
  );
}

function Plan({ d, halle, plan, schauId, istAdmin }: { d: Daten; halle: Halle; plan: NonNullable<Daten["plan"]>; schauId: number; istAdmin: boolean }) {
  const t = useOberflaeche();
  const th = t.halle.hallenplan;
  const sprache = useSprache();
  // Farben in Reihenfolge der Katalognummern: wer im Katalog nebeneinander liegt, bekommt Nachbarfarben.
  const richterReihe = richterFolge(plan, d.richter);
  const richterIndex = new Map(richterReihe.map((r, i) => [r.id, i]));
  const meldung = useMeldung();
  // Die Ausstellungsleitung plant immer im Editor (kein eigener Bearbeiten-Modus); Helfer sehen den Plan nur an.
  const bearbeiten = istAdmin && !d.abgeschlossen;
  /** Stellvorschläge als Schublade über dem Plan. */
  const [vorschlaegeOffen, setVorschlaegeOffen] = useState(false);
  /** Werkzeug „Fläche aufziehen“ (aus dem Menü Einsetzen): Art der nächsten Fläche. */
  const [zeichnen, setZeichnen] = useState<HallenFlaeche["art"] | null>(null);
  const vorschlaegeOffenRef = useRef(vorschlaegeOffen);
  vorschlaegeOffenRef.current = vorschlaegeOffen;
  const zeichnenRef = useRef(zeichnen);
  zeichnenRef.current = zeichnen;
  const [auswahl, setAuswahl] = useState<Ziel[]>([]);
  /** Schalter „Mehrfachauswahl“ (Tablet): Antippen nimmt Teile in die Auswahl auf oder heraus. */
  const [mehrfach, setMehrfach] = useState(false);
  const [voll, setVoll] = useState(false);
  /** Zoom der Zeichnung im Editor: 1 = ganze Halle in der Breite. */
  const [zoom, setZoom] = useState(1);
  const [infoId, setInfoId] = useState<number | null>(null);
  const hatAuswahl = bearbeiten && auswahl.length > 0;
  /** Tier versetzen: dieses Tier, das Ziel wird im Plan angeklickt (Esc bricht ab). */
  const [versetzen, setVersetzen] = useState<Versetzen | null>(null);
  useEffect(() => {
    if (!voll && infoId == null && !hatAuswahl && !zeichnen && !vorschlaegeOffen && !versetzen) return;
    // Esc schließt zuerst die Käfig-Angaben, hebt dann die Auswahl auf und schließt zuletzt die Vollansicht.
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (infoId != null) return setInfoId(null);
      if (vorschlaegeOffenRef.current) return setVorschlaegeOffen(false);
      if (zeichnenRef.current) return setZeichnen(null);
      if (versetzen) return setVersetzen(null);
      // Esc in einem Eingabefeld (Name einer Fläche) oder in einem Rückfrage-Dialog gehört dorthin.
      const ziel = e.target instanceof Element ? e.target : null;
      if (ziel?.closest("input, textarea, select, dialog, [role=dialog], [role=alertdialog], [role=menu]")) return;
      if (hatAuswahl) setAuswahl([]);
      else setVoll(false);
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [voll, infoId, hatAuswahl, zeichnen, vorschlaegeOffen, versetzen]);
  const e = useHallenEntwurf({ schauId, halle, plan, auswahlAufheben: () => setAuswahl([]) });
  const { entwurf, offen, offenZahl, kette, verlauf, aendern, setzen, festschreiben, neuSetzen } = e;
  /**
   * 3D-Ansicht in einem neuen Tab, mit dem gespeicherten Stand: Ist noch etwas auf dem Weg, geht der Tab gleich auf (sonst
   * blockt ihn der Browser) und lädt die 3D-Seite erst, wenn alles gespeichert ist.
   */
  const dreiDOeffnen = () => {
    const url = `/schau/${schauId}/hallenplan/3d`;
    if (offen.current === 0) {
      window.open(url, "_blank", "noopener");
      return;
    }
    const tab = window.open("", "_blank");
    if (!tab) return meldung(th.tabBlockiert, "warnung");
    tab.opener = null;
    const warten = async () => {
      while (offen.current > 0) await kette.current.catch(() => undefined);
    };
    void warten().then(() => tab.location.replace(url));
  };
  const b = usePlanBefehle({ d, plan, schauId, e, setAuswahl, versetzen, setVersetzen });
  const { grundrissSetzen, rueckgaengig, wiederholen, zielGewaehlt, versetzenMut, nachPlan, nachPlanFragen, anWaendenAusrichten, neuSetzenFragen, automatikUmschalten, aendernHalle, wandreihe, anWandFragen } = b;
  const { aktionen, einsetzen, fehlendeSetzen, flaecheAufgezogen } = useEditorAktionen({ d, plan, schauId, e, auswahl, setAuswahl, zeichnen, setZeichnen, anWandFragen });
  const { ausrichten, drehen } = aktionen;
  const entfernenFragen = aktionen.entfernen;
  const STUFEN = [1, 1.5, 2, 3, 4];
  const zoomen = (r: 1 | -1) => setZoom((z) => STUFEN[Math.max(0, Math.min(STUFEN.length - 1, STUFEN.indexOf(z) + r))]!);
  /** Pfeiltasten außerhalb der Zeichnung (z. B. nach einem Knopf der Leiste): die Zeichnung verschiebt die Auswahl. */
  const pfeilRef = useRef<((e: KeyboardEvent) => boolean) | null>(null);
  const tastenRef = useRef<(e: KeyboardEvent) => void>(() => undefined);
  tastenRef.current = (e) => {
    const ziel = e.target instanceof Element ? e.target : null;
    if (e.defaultPrevented || e.altKey || ziel?.closest("input, textarea, select, [contenteditable=true], dialog, [role=dialog], [role=alertdialog], [role=menu]")) return;
    const k = e.key;
    if (e.ctrlKey || e.metaKey) {
      if (k === "z" || k === "Z") {
        e.preventDefault();
        return e.shiftKey ? wiederholen() : rueckgaengig();
      }
      if (k === "y" || k === "Y") {
        e.preventDefault();
        return wiederholen();
      }
      return;
    }
    const tun = (f: () => void) => {
      e.preventDefault();
      f();
    };
    // Ohne Auswahl tun Entf und R nichts (keine Meldung bei jedem Tastendruck).
    if (k === "Delete" || k === "Backspace") return auswahl.length ? tun(() => void entfernenFragen()) : undefined;
    if (k === "r" || k === "R") return auswahl.length ? tun(drehen) : undefined;
    // A nur mit Auswahl – „alles ausrichten“ gibt es mit einem Klick auf den Knopf, nicht aus Versehen über die Tastatur.
    if (k === "a" || k === "A") return auswahl.length ? tun(ausrichten) : undefined;
    if (k === "m" || k === "M") return tun(() => setMehrfach(!mehrfach));
    if (k === "v" || k === "V") return tun(() => setMehrfach(false));
    if (k === "f" || k === "F") return tun(() => setVoll(!voll));
    if (k === "+" || k === "=") return tun(() => zoomen(1));
    if (k === "-") return tun(() => zoomen(-1));
    if (k === "0") return tun(() => setZoom(1));
    if (k.startsWith("Arrow") && !ziel?.closest("svg") && pfeilRef.current?.(e)) e.preventDefault();
  };
  useEffect(() => {
    if (!bearbeiten) return;
    const h = (e: KeyboardEvent) => tastenRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [bearbeiten]);
  useEffect(() => {
    if (!bearbeiten) setZoom(1);
  }, [bearbeiten]);

  // Tiere in eingesetzten Volieren zählen mit.
  const inTeilen = plan.objekte.filter((o) => o.tier).map((o) => ({ ...o.tier!, typ: "voliere" as KaefigTyp }));
  const imBlock = plan.objekte.reduce((n, o) => n + (o.kaefige?.length ?? 0), 0);
  const platziert = plan.reihen.reduce((n, r) => n + r.kaefige.length, 0) + plan.volieren.length + inTeilen.length + imBlock;
  const versetzt = (entwurf.reihenVersatz ?? []).length;
  const plattenVersetzt = (entwurf.plattenVersatz ?? []).length;
  const entferntZahl = (entwurf.entfernt ?? []).length;
  const kannPlanen = istAdmin;
  /** Tiere versetzen: Ausstellungsleitung, solange die Schau läuft (Plan festschreiben erledigt die Software). */
  const versetzbar = kannPlanen && !d.abgeschlossen;
  const [halleDialog, setHalleDialog] = useState(false);
  const [detailDialog, setDetailDialog] = useState(false);
  const hallePanel = (
    <HalleEigenschaften
      halle={entwurf}
      plan={plan}
      masse={d.masse}
      platziert={platziert}
      aendernHalle={aendernHalle}
      grundriss={kannPlanen && !d.abgeschlossen ? grundrissSetzen : undefined}
      automatik={kannPlanen && !d.abgeschlossen ? automatikUmschalten : undefined}
      setzen={bearbeiten ? fehlendeSetzen : undefined}
      vorschlaege={() => {
        setHalleDialog(false);
        setVorschlaegeOffen(true);
      }}
    />
  );
  const festAm = plan.fest ? new Date(plan.fest.am).toLocaleString(LOCALE[sprache], { dateStyle: "short", timeStyle: "short" }) : null;
  // Der Editor speichert jede Änderung sofort – statt „Speichern“ steht oben rechts, ob alles gespeichert ist.
  // Alle Wege, auf denen der Editor speichert; maßgeblich für „Nicht gespeichert“ ist der zuletzt abgeschickte.
  const speicherwege = [setzen, festschreiben, nachPlan, neuSetzen, versetzenMut, wandreihe];
  const zuletzt = speicherwege.reduce<(typeof speicherwege)[number] | null>((a, m) => (m.submittedAt > (a?.submittedAt ?? 0) ? m : a), null);
  const speichertGerade = offenZahl > 0 || speicherwege.some((m) => m.isPending);
  const speicherStand: SpeicherStand | null = !bearbeiten ? null : speichertGerade ? "speichert" : zuletzt?.isError ? "fehler" : "gespeichert";
  return (
    <>
      <SpeicherStatus stand={speicherStand} />
      <Seitenkopf
        titel={th.titel}
        unter={th.unter(meter(halle.breite), meter(halle.laenge), meter(halle.gang), platziert)}
        hilfe="hallenplan"
        marke={festAm ? <Marke ton="ok">{th.automatikAus}</Marke> : <Marke ton="info">{th.automatikAn}</Marke>}
        aktionen={
          <span className="nicht-drucken flex flex-wrap gap-2">
            {!bearbeiten && <Knopf onClick={() => setVoll(true)}>{th.vollansicht}</Knopf>}
            {!bearbeiten && <Knopf onClick={dreiDOeffnen}>3D</Knopf>}
            <HallenEntwuerfe schauId={schauId} darfAendern={bearbeiten} />
            <KnopfLink href={`/datei/${schauId}/hallenplan.pdf`} target="_blank" rel="noreferrer">
              {th.planDrucken}
            </KnopfLink>
            <KnopfLink href={`/datei/${schauId}/aufbauliste.pdf`} target="_blank" rel="noreferrer">
              {th.aufbauliste}
            </KnopfLink>
          </span>
        }
      />

      <section aria-label={th.plan} className="flex min-w-0 flex-col gap-3">
        {plan.warnungen.length > 0 && (
          <Hinweis ton="warnung" className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <span className="min-w-0 flex-1">
              {plan.warnungen.map((w) => serverText(w, sprache)).join(" ")}
              {plan.fehlendeMasse.length > 0 && th.massFehlt(plan.fehlendeMasse.map((x) => kaefigNameIn(t, x as KaefigTyp)).join(", "))}
            </span>
            {plan.fest?.veraltet && kannPlanen && (
              <Knopf className="shrink-0" laedt={neuSetzen.isPending} onClick={neuSetzenFragen}>
                {th.planNeuSetzen}
              </Knopf>
            )}
            {kannPlanen && !d.abgeschlossen && plan.warnungen.some((w) => /Front zur Wand/.test(w)) && (
              <Knopf className="shrink-0" onClick={() => void anWaendenAusrichten()}>
                {th.anWaenden}
              </Knopf>
            )}
          </Hinweis>
        )}
        {d.anzahl === 0 && <Hinweis>{th.keineTiere}</Hinweis>}
        {d.ohneNummer > 0 && (
          <Hinweis>{d.ohneNummer === 1 ? th.ohneNummerEins : th.ohneNummer(d.ohneNummer)}</Hinweis>
        )}
        <SpartenReihen plan={plan} />
        {/* Vollansicht: der Plan füllt den Bildschirm (Esc oder „Schließen“). Klick auf einen Käfig zeigt seine Angaben. Im
            Editor: Werkzeugleiste oben, Eigenschaften der Auswahl rechts (am Tablet als feste Zeile über dem Plan). */}
        <div
          className={`${voll ? "fixed inset-0 z-50 flex flex-col gap-2 bg-weiss p-3 print:static print:block print:p-0" : "relative"} ${
            bearbeiten ? (voll ? "gap-0 p-0" : "rounded-xl border border-linie bg-weiss shadow-[0_1px_2px_rgb(16_20_28/0.04)]") : ""
          }`}
        >
          {voll && !bearbeiten && (
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">{th.titel}</h2>
              <Knopf className="ml-auto" onClick={() => setVoll(false)}>
                {t.allgemein.schliessen}
              </Knopf>
            </div>
          )}
          {bearbeiten && (
            <Werkzeugleiste
              masse={d.masse}
              voll={voll}
              setVoll={setVoll}
              zoom={zoom}
              setZoom={setZoom}
              zoomen={zoomen}
              mehrfach={mehrfach}
              setMehrfach={setMehrfach}
              kannZurueck={verlauf.current.zurueck.length > 0}
              kannVor={verlauf.current.vor.length > 0}
              zurueckWas={verlauf.current.zurueck.at(-1)?.was}
              vorWas={verlauf.current.vor.at(-1)?.was}
              rueckgaengig={rueckgaengig}
              wiederholen={wiederholen}
              einsetzen={einsetzen}
              flaecheEinsetzen={(art) => {
                setAuswahl([]);
                setZeichnen(art);
              }}
              vorschlaege={() => setVorschlaegeOffen(!vorschlaegeOffen)}
              vorschlaegeOffen={vorschlaegeOffen}
              dreiD={dreiDOeffnen}
              a={aktionen}
              hatAuswahl={auswahl.length > 0}
              plan={{
                nummerieren: plan.fest && !d.abgeschlossen ? { text: d.katalogGedruckt ? th.kaefigplaetzeNachPlan : th.nachPlanNummerieren, tun: nachPlanFragen } : null,
                reihenZurueck: versetzt,
                plattenZurueck: plattenVersetzt,
                alleReihenZurueck: () => aendern((h) => ({ ...h, reihenVersatz: [] }), zweisprachig((x) => x.halle.hallenplan.alleReihenZurueck)),
                allePlattenZurueck: () => aendern((h) => ({ ...h, plattenVersatz: [] }), zweisprachig((x) => x.halle.hallenplan.allePlattenZurueck)),
                neuSetzen: neuSetzenFragen,
                anWaenden: kannPlanen && !d.abgeschlossen ? () => void anWaendenAusrichten() : null,
              }}
            />
          )}
          <div className={`${voll ? "flex min-h-0 flex-1 flex-col" : ""} ${bearbeiten ? "flex flex-col lg:flex-row" : ""}`}>
            {bearbeiten && (
              <Eigenschaften kompakt halle={entwurf} plan={plan} masse={d.masse} auswahl={auswahl} a={aktionen} aendern={aendern} mehrfach={mehrfach} zeichnen={zeichnen} zeichnenAus={() => setZeichnen(null)} angaben={setInfoId} hallePanel={hallePanel} halleOeffnen={() => setHalleDialog(true)} detailsOeffnen={() => setDetailDialog(true)} versetzen={versetzbar ? (t) => { setDetailDialog(false); setVersetzen(t); } : undefined} />
            )}
            <div className={`relative min-w-0 ${voll ? "min-h-0 flex-1" : ""} ${bearbeiten ? "lg:flex-1 lg:border-r lg:border-linie" : ""}`}>
              <PlanBild
                halle={entwurf}
                plan={plan}
                richterIndex={richterIndex}
                bearbeiten={bearbeiten}
                auswahl={auswahl}
                waehlen={setAuswahl}
                aendern={aendern}
                mehrfach={mehrfach}
                melden={(t) => meldung(t, "warnung")}
                voll={voll}
                zoom={bearbeiten ? zoom : 1}
                pfeilRef={pfeilRef}
                zeigeKaefig={bearbeiten ? undefined : setInfoId}
                markiert={infoId}
                zeichnen={bearbeiten ? zeichnen : null}
                gezeichnet={flaecheAufgezogen}
                anWand={(nr, seite) => void anWandFragen(nr, seite)}
                zielWahl={bearbeiten && versetzen ? { tierId: versetzen.tierId, typ: versetzen.typ, waehlen: (p) => void zielGewaehlt(p), falsch: () => meldung(th.andereGroesse, "warnung") } : null}
              />
              {bearbeiten && versetzen && (
                <div className="nicht-drucken absolute left-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] items-center gap-3 rounded-lg border border-band bg-weiss px-3 py-2 text-sm shadow-lg" role="status">
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">{t.halle.nr(versetzen.nr ?? "–")}</span> {th.zielAnklicken(versetzen.rasse)}
                  </span>
                  <Knopf variante="leise" className="min-h-8 shrink-0 px-2" onClick={() => setVersetzen(null)}>
                    {t.allgemein.abbrechen}
                  </Knopf>
                </div>
              )}
              {infoId != null && <KaefigInfo schauId={schauId} id={infoId} schliessen={() => setInfoId(null)} />}
              {bearbeiten && vorschlaegeOffen && (
                <div className="nicht-drucken absolute inset-y-0 right-0 z-30 flex w-[min(40rem,100%)] flex-col border-l border-linie bg-weiss shadow-xl" role="dialog" aria-label={t.halle.stellvorschlaege}>
                  <div className="flex min-h-12 items-center gap-2 border-b border-linie px-4 py-1.5">
                    <h3 className="font-sans text-base font-semibold">{t.halle.stellvorschlaege}</h3>
                    <Knopf variante="leise" className="ml-auto" onClick={() => setVorschlaegeOffen(false)}>
                      {t.allgemein.schliessen}
                    </Knopf>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto p-4">
                    <StellVorschlaege schauId={schauId} d={d} eingebettet schmal schliessen={() => setVorschlaegeOffen(false)} />
                  </div>
                </div>
              )}
            </div>
            {bearbeiten && (
              <Eigenschaften halle={entwurf} plan={plan} masse={d.masse} auswahl={auswahl} a={aktionen} aendern={aendern} mehrfach={mehrfach} zeichnen={zeichnen} zeichnenAus={() => setZeichnen(null)} angaben={setInfoId} hallePanel={hallePanel} halleOeffnen={() => setHalleDialog(true)} versetzen={versetzbar ? (t) => { setDetailDialog(false); setVersetzen(t); } : undefined} />
            )}
          </div>
          <Dialog offen={halleDialog} onSchliessen={() => setHalleDialog(false)} titel={th.halle}>
            {hallePanel}
          </Dialog>
          <Dialog offen={detailDialog && auswahl.length === 1} onSchliessen={() => setDetailDialog(false)} titel={t.halle.eigenschaftenTitel}>
            <Eigenschaften
              imDialog
              halle={entwurf}
              plan={plan}
              masse={d.masse}
              auswahl={auswahl}
              a={aktionen}
              aendern={aendern}
              mehrfach={mehrfach}
              zeichnen={null}
              zeichnenAus={() => setZeichnen(null)}
              angaben={(id) => {
                setDetailDialog(false);
                setInfoId(id);
              }}
              versetzen={versetzbar ? (t) => { setDetailDialog(false); setVersetzen(t); } : undefined}
              hallePanel={hallePanel}
              halleOeffnen={() => setHalleDialog(true)}
            />
          </Dialog>
          {bearbeiten && (
            <div className={`nicht-drucken flex min-h-9 flex-wrap items-center gap-x-4 gap-y-1 border-t border-linie bg-papier px-3 py-1 text-[0.82rem] text-grau ${voll ? "" : "rounded-b-xl"}`}>
              <AutomatikSchalter an={!festAm} umschalten={kannPlanen && !d.abgeschlossen ? automatikUmschalten : undefined} festAm={festAm} />
              <span>
                {th.verschoben} <span className="text-tinte">{th.reihen(versetzt)}</span>, <span className="text-tinte">{th.platten(plattenVersetzt)}</span>
              </span>
              {entferntZahl > 0 && (
                <span>
                  {th.entfernt} <span className="text-tinte">{th.leer(entferntZahl)}</span>
                </span>
              )}
              {/* In der Vollansicht ist die Kopfleiste verdeckt: der Zustand steht dann auch hier. */}
              {voll && <SpeicherStatus stand={speicherStand} eingebettet />}
              <span className="ml-auto">
                <HilfeLink abschnitt="hallenplan-bearbeiten">{th.hilfeEditor}</HilfeLink>
              </span>
            </div>
          )}
        </div>
        {/* Nach dem Umstellen: freie Plätze mitten in den Reihen oder Nummern nicht in Planfolge. Unter dem Plan, damit der
            Plan beim Bearbeiten nicht springt, wenn der Hinweis erscheint. */}
        {kannPlanen && plan.fest && !d.abgeschlossen && d.unordnung && (d.unordnung.freiDazwischen > 0 || d.unordnung.nichtInFolge > 0) && (
          <Hinweis ton="warnung" className="nicht-drucken flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span className="min-w-0 flex-1">
              {[
                d.unordnung.freiDazwischen > 0 && (d.unordnung.freiDazwischen === 1 ? th.freiDazwischenEins : th.freiDazwischen(d.unordnung.freiDazwischen)),
                d.unordnung.nichtInFolge > 0 && (d.katalogGedruckt ? th.kaefignummernNichtInFolge : th.nummernNichtInFolge),
              ]
                .filter(Boolean)
                .join(", ")}
              .
            </span>
            {(d.unordnung.nichtInFolge > 0 || !d.eingeliefert) && (
              <Knopf className="shrink-0" laedt={nachPlan.isPending} onClick={nachPlanFragen}>
                {d.katalogGedruckt ? th.jetztKaefigplaetze : th.jetztNummerieren}
              </Knopf>
            )}
          </Hinweis>
        )}
        <PlanLegende plan={plan} richterReihe={richterReihe} richterIndex={richterIndex} />
      </section>

      <PlatzUebersicht plan={plan} halle={halle} masse={d.masse} platziert={platziert} />

      <Aufbauliste plan={plan} masse={d.masse} richter={d.richter} />
    </>
  );
}
