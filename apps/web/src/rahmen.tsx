import { anmeldeZiel, ruecksprungZiel, VERSION, type OberflaecheTexte, type Phase } from "@schau/domain";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useMatch, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AbmeldeHinweis, useAutoAbmeldung } from "./abmeldung";
import { LesemodusLeiste } from "./komponenten/lesemodus";
import { fehlerText } from "./lib";
import { useFarbmodus, type Farbmodus } from "./modus";
import { allgemeineGruppen, leistenLink, MenueGruppen, schauGruppen, useKlappzustand } from "./seitenmenue";
import { SprachWahl, useOberflaeche } from "./sprache";
import { Symbol, type SymbolName } from "./symbole";
import { direkt, trpc } from "./trpc";
import { Eingabe, FehlerAnzeige, Feld, Hinweis, Knopf, Laden, Marke, SCHMAL, SEITENRAND, SpeicherPlatz, useMeldung, useSeitentitel } from "./ui";

export function useSchauId(): number {
  return Number(useParams().schauId);
}

/** Bezeichnung der aktuellen Seite für die Pfadzeile. */
function seitenName(pfad: string, imSchau: boolean, istAdmin: boolean, t: OberflaecheTexte): string {
  const a = t.rahmen.app, m = t.rahmen.menue;
  if (imSchau) {
    const rest = pfad.replace(/^\/schau\/\d+\/?/, "").replace(/\/$/, "");
    for (const g of schauGruppen(t)) for (const s of g.seiten) if (s.pfad === rest) return s.label;
    if (rest === "protokoll") return a.protokoll;
    if (rest.startsWith("meldungen/")) return rest === "meldungen/neu" ? a.neueMeldung : a.meldung;
    return "";
  }
  if (pfad === "/") return a.schauen;
  if (pfad.startsWith("/stammdaten")) return m.stammdaten;
  if (pfad.startsWith("/benutzer")) return istAdmin ? m.benutzer : m.meinZugang;
  if (pfad.startsWith("/aussteller")) return m.aussteller;
  if (pfad.startsWith("/spender")) return m.spender;
  if (pfad.startsWith("/import")) return m.import;
  if (pfad.startsWith("/verein")) return m.vereinDatenschutz;
  return "";
}

export function AppRahmen() {
  const status = trpc.auth.status.useQuery();
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const meldung = useMeldung();
  const t = useOberflaeche();
  const ta = t.rahmen.app;
  const ort = useLocation();
  const [menueOffen, setMenueOffen] = useState(false);
  /** Platz in der Kopfleiste für „Speichern“ (Speicherleiste der Seiten). */
  const [speicherPlatz, setSpeicherPlatz] = useState<HTMLElement | null>(null);
  const menueKnopf = useRef<HTMLButtonElement>(null);
  const schublade = useRef<HTMLDivElement>(null);
  useEffect(() => setMenueOffen(false), [ort.pathname]);
  // Sprungmarke in der Adresse (z. B. …/katalog#reihenfolge): hinscrollen, sobald der Abschnitt geladen ist.
  useEffect(() => {
    if (!ort.hash) return;
    const ziel = decodeURIComponent(ort.hash.slice(1));
    let versuche = 0;
    const t = setInterval(() => {
      const el = document.getElementById(ziel);
      if (el || ++versuche > 30) clearInterval(t);
      // Unter der stehenden Kopfleiste (h-12) mit etwas Luft.
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 64 });
    }, 100);
    return () => clearInterval(t);
  }, [ort.pathname, ort.hash]);
  // Schmales Menü: Fokus hinein, Esc schließt, Tab bleibt im Menü, danach Fokus zurück auf den Knopf.
  useEffect(() => {
    if (!menueOffen) return;
    const knopf = menueKnopf.current;
    schublade.current?.querySelector<HTMLElement>("a, button")?.focus();
    const taste = (e: KeyboardEvent) => {
      if (e.key === "Escape") return setMenueOffen(false);
      if (e.key !== "Tab" || !schublade.current) return;
      const ziele = [...schublade.current.querySelectorAll<HTMLElement>("a, button")];
      const erstes = ziele[0], letztes = ziele.at(-1);
      if (e.shiftKey && document.activeElement === erstes) { e.preventDefault(); letztes?.focus(); }
      else if (!e.shiftKey && document.activeElement === letztes) { e.preventDefault(); erstes?.focus(); }
    };
    document.addEventListener("keydown", taste);
    return () => {
      document.removeEventListener("keydown", taste);
      knopf?.focus();
    };
  }, [menueOffen]);
  const schauTreffer = useMatch("/schau/:schauId/*");
  const schauId = schauTreffer ? Number(schauTreffer.params.schauId) : null;
  const phase = trpc.schau.get.useQuery({ id: schauId ?? 0 }, { enabled: !!schauId }).data?.phase as Phase | undefined;
  const klapp = useKlappzustand();
  const abmelden = trpc.auth.abmelden.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      navigate("/anmelden");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  // Automatische Abmeldung nach Untätigkeit; danach zurück auf diese Seite (siehe ruecksprung.ts).
  const rest = useAutoAbmeldung(
    status.data?.benutzer ? status.data.abmeldung.benutzer : null,
    () => direkt.auth.status.query(),
    () => {
      const ziel = anmeldeZiel(window.location.pathname, window.location.search);
      void direkt.auth.abmelden.mutate().finally(() => window.location.assign(`${ziel}${ziel.includes("?") ? "&" : "?"}untaetig=1`));
    },
  );
  if (status.isLoading) return <div className={SEITENRAND}><Laden /></div>;
  // Administrator ohne Zwei-Faktor-Anmeldung: erst einrichten, dann verwalten.
  if (status.data?.zweiFaktorPflicht && ort.pathname !== "/benutzer") return <Navigate to="/benutzer" replace />;
  if (status.error) return <div className={`${SEITENRAND} ${SCHMAL}`}><FehlerAnzeige fehler={status.error} nochmal={() => status.refetch()} /></div>;
  if (!status.data?.benutzer) return <Navigate to={anmeldeZiel(ort.pathname, ort.search)} replace />;
  const b = status.data.benutzer;
  const istAdmin = b.rolle === "admin";
  // Hilfe im neuen Tab: die Arbeit hier (Formulare, Kasse) bleibt offen.
  const hilfe = (
    <a href="/hilfe" target="_blank" rel="noreferrer" className={leistenLink({ isActive: false })}>
      <Symbol name="hilfe" />
      {t.allgemein.hilfe}
    </a>
  );
  // In einer Schau sind Verein und Einrichtung ohne gemerkte Wahl eingeklappt, sonst offen.
  const allgemeineLinks = <MenueGruppen gruppen={allgemeineGruppen(istAdmin, t)} vorgabeOffen={() => !schauId} klapp={klapp} label={schauId ? ta.allgemein : ta.hauptnavigation} nachher={hilfe} />;
  const leiste = (
    <div className="flex min-h-full flex-col gap-4 px-2.5 py-3 text-[0.95rem]">
      <Link to="/" className="flex items-center gap-3 px-1.5 py-1 font-display text-[1.15rem] font-bold text-tinte no-underline [font-stretch:112%]">
        <img src="/icon.svg" alt="" className="size-11" />
        <span className="flex flex-col leading-tight">
          {status.data.appName}
          {/* Version dezent unter dem Namen: hilft bei Rückfragen und zeigt, ob ein Update angekommen ist. */}
          <span className="font-sans text-xs font-normal text-grau [font-stretch:100%]">{ta.version} {VERSION}</span>
        </span>
      </Link>
      {schauId ? (
        <>
          <SchauWahl id={schauId} />
          <MenueGruppen gruppen={schauGruppen(t).map((g) => ({ ...g, seiten: g.seiten.filter((x) => !x.nurAdmin || istAdmin) }))} basis={`/schau/${schauId}`} vorgabeOffen={(g) => !!phase && !!g.phasen?.includes(phase)} klapp={klapp} label={ta.bereicheDerSchau} />
          <div className="mt-auto border-t border-linie pt-3">{allgemeineLinks}</div>
        </>
      ) : (
        <div className="mb-auto">{allgemeineLinks}</div>
      )}
      <BenutzerMenue name={b.name} verein={status.data.organisationName ?? ""} rolle={b.rolle} abmelden={() => abmelden.mutate()} meldetAb={abmelden.isPending} />
    </div>
  );
  const seite = seitenName(ort.pathname, !!schauId, b.rolle === "admin", t);
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] print:block">
      <a href="#inhalt" className="sprunglink nicht-drucken">{ta.zumInhalt}</a>
      {/* Breit: feste Seitenleiste. Schmal: oben eine Zeile mit „Menü“, die Leiste fährt von links herein. */}
      <aside className="nicht-drucken hidden border-r border-linie bg-papier lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto">{leiste}</aside>
      {menueOffen && (
        <div className="nicht-drucken fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={ta.menue}>
          <button type="button" aria-label={ta.menueSchliessen} className="absolute inset-0 bg-kopf/40" onClick={() => setMenueOffen(false)} />
          {/* Ein Link im Menü schließt es, auch wenn er auf die aktuelle Seite oder in einen neuen Tab führt. */}
          <div ref={schublade} onClick={(e) => (e.target as HTMLElement).closest("a") && setMenueOffen(false)} className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto border-r border-linie bg-papier shadow-xl">{leiste}</div>
        </div>
      )}
      <div className="flex min-w-0 flex-col">
        {/* Kopfleiste bleibt oben stehen: rechts erscheint „Speichern“, sobald eine Seite Ungespeichertes hat (Speicherleiste). */}
        <div className="nicht-drucken sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-linie bg-weiss px-4 lg:px-6">
          <button ref={menueKnopf} type="button" aria-expanded={menueOffen} onClick={() => setMenueOffen(true)} className="-ml-1.5 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-tinte hover:bg-papier lg:hidden" aria-label={ta.menueOeffnen}>
            <Symbol name="menue" className="size-5" />
          </button>
          <Pfad schauId={schauId} seite={seite} />
          {/* Mehrere Formulare mit Ungespeichertem (z. B. Einstellungen und Gebühren): der Hinweistext nur einmal. */}
          <div ref={setSpeicherPlatz} className="flex shrink-0 items-center gap-3 empty:hidden [&>*+*_.speicher-text]:!hidden" />
        </div>
        <LesemodusLeiste />
        {/* Den Rand setzt der Rahmen für alle Seiten; die Seiten selbst begrenzen ihre Breite nicht (siehe SEITENRAND in ui.tsx). */}
        <main id="inhalt" tabIndex={-1} className={`outline-none ${SEITENRAND}`}>
          <SpeicherPlatz.Provider value={speicherPlatz}>
            <Outlet />
          </SpeicherPlatz.Provider>
        </main>
        <AbmeldeHinweis rest={rest} />
      </div>
    </div>
  );
}

/** Pfadzeile: Schau / Seite, rechts Kennzeichen wie „Testschau“. */
function Pfad({ schauId, seite }: { schauId: number | null; seite: string }) {
  const schau = trpc.schau.get.useQuery({ id: schauId ?? 0 }, { enabled: !!schauId });
  const s = schauId ? schau.data : undefined;
  const t = useOberflaeche();
  const uebersicht = t.rahmen.menue.uebersicht;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-[0.93rem] text-grau">
      {s && (
        <>
          <Link to={`/schau/${s.id}`} className="truncate text-grau no-underline hover:text-tinte hover:underline">{s.name}</Link>
          {seite && seite !== uebersicht && <span aria-hidden className="text-grau/60">/</span>}
        </>
      )}
      {seite && !(s && seite === uebersicht) && <span className="truncate font-medium text-tinte">{seite}</span>}
      {s && (
        <span className="ml-auto flex shrink-0 gap-2">
          {s.test && <Marke ton="warnung">{t.rahmen.app.testschau}</Marke>}
          {s.abgesagtAm && <Marke ton="fehler">{t.rahmen.app.abgesagt}</Marke>}
        </span>
      )}
    </div>
  );
}

/** Aufklapper wie ein Menü: schließt bei Klick daneben und mit Esc. */
function useAufklapper() {
  const [offen, setOffen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ort = useLocation();
  useEffect(() => setOffen(false), [ort.pathname]);
  useEffect(() => {
    if (!offen) return;
    const klick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOffen(false);
    };
    const taste = (e: KeyboardEvent) => e.key === "Escape" && setOffen(false);
    document.addEventListener("mousedown", klick);
    document.addEventListener("keydown", taste);
    return () => {
      document.removeEventListener("mousedown", klick);
      document.removeEventListener("keydown", taste);
    };
  }, [offen]);
  return { offen, setOffen, ref };
}

/** Schau oben in der Leiste: Name, Ort und Phase; ein Klick wechselt zu einer anderen Schau. */
function SchauWahl({ id }: { id: number }) {
  const schau = trpc.schau.get.useQuery({ id });
  const { offen, setOffen, ref } = useAufklapper();
  const liste = trpc.schau.liste.useQuery(undefined, { enabled: offen });
  const s = schau.data;
  const t = useOberflaeche();
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={offen}
        onClick={() => setOffen(!offen)}
        className="flex w-full flex-col gap-1 rounded-lg border border-linie-stark bg-weiss px-3 py-2.5 text-left hover:border-feldrand"
      >
        <span className="flex w-full items-start justify-between gap-2 font-semibold leading-snug text-tinte">
          <span className="min-w-0 break-words">{s?.name ?? "…"}</span>
          <Symbol name="runter" className="mt-0.5 size-4 text-grau" />
        </span>
        {s && (
          <span className="flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[0.85rem] text-grau">
            <span className="min-w-0 truncate">{s.ort}</span>
            <Marke ton="info">{t.fach.PHASEN_LABEL[s.phase as Phase]}</Marke>
          </span>
        )}
      </button>
      {offen && (
        <div className="absolute inset-x-0 top-full z-40 mt-1.5 max-h-80 overflow-y-auto rounded-lg border border-linie-stark bg-weiss p-1.5 shadow-xl">
          {liste.data?.map((x) => (
            <Link key={x.id} to={`/schau/${x.id}`} className={`flex flex-col rounded-md px-2.5 py-2 no-underline hover:bg-papier ${x.id === id ? "bg-band-hell" : ""}`}>
              <span className="font-medium text-tinte">{x.name}</span>
              <span className="text-[0.85rem] text-grau">{t.rahmen.app.phaseTest(t.fach.PHASEN_LABEL[x.phase as Phase], x.test)}</span>
            </Link>
          ))}
          {!liste.data && <p className="px-2.5 py-2 text-grau">{t.allgemein.laden}</p>}
          <Link to="/" className="mt-1 block border-t border-linie px-2.5 pb-1 pt-2 text-[0.9rem] no-underline">{t.rahmen.app.alleSchauen}</Link>
        </div>
      )}
    </div>
  );
}

/** Farbmodi mit Symbol; die Beschriftung kommt aus den Texten (benutzerMenue[wert]). */
const MODI: { wert: Farbmodus; symbol: SymbolName }[] = [
  { wert: "system", symbol: "bildschirm" },
  { wert: "hell", symbol: "sonne" },
  { wert: "dunkel", symbol: "mond" },
];

/** Angemeldeter Benutzer unten in der Leiste; ein Klick zeigt Verein, Farbmodus, „Mein Zugang“ und „Abmelden“. */
function BenutzerMenue({ name, verein, rolle, abmelden, meldetAb }: { name: string; verein: string; rolle: string; abmelden: () => void; meldetAb: boolean }) {
  const { offen, setOffen, ref } = useAufklapper();
  const [modus, setModus] = useFarbmodus();
  const t = useOberflaeche().rahmen.benutzerMenue;
  const teile = name.trim().split(/\s+/).filter(Boolean);
  const initialen = ((teile[0]?.[0] ?? "") + (teile.length > 1 ? (teile.at(-1)?.[0] ?? "") : "")).toLocaleUpperCase("de");
  return (
    <div ref={ref} className="relative border-t border-linie pt-2">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={offen}
        title={verein ? `${name}, ${verein}` : name}
        onClick={() => setOffen(!offen)}
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-grau hover:bg-linie/60 hover:text-tinte"
      >
        <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-band-hell text-xs font-bold text-band">
          {initialen || "?"}
        </span>
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <Symbol name="runter" className="size-4 rotate-180" />
      </button>
      {offen && (
        <div className="absolute inset-x-0 bottom-full z-40 mb-2 rounded-lg border border-linie-stark bg-weiss p-4 text-tinte shadow-xl">
          <p className="font-semibold">{name}</p>
          {verein && <p className="text-grau">{verein}</p>}
          {/* Produktname, in allen Sprachen gleich (bleibt deutsch) */}
          <p className="mt-1 text-xs text-grau">{rolle === "admin" ? t.administrator : t.mitarbeiter}, SchauFUCHS {VERSION}</p>
          <div className="mt-3 flex flex-col gap-1.5 border-t border-linie pt-3">
            <span className="text-[0.85rem] text-grau" id="farbmodus-label">{t.darstellung}</span>
            <div role="group" aria-labelledby="farbmodus-label" className="grid grid-cols-3 gap-0.5 rounded-md border border-linie-stark bg-papier p-0.5">
              {MODI.map((m) => (
                <button
                  key={m.wert}
                  type="button"
                  aria-pressed={modus === m.wert}
                  onClick={() => setModus(m.wert)}
                  className={`flex items-center justify-center gap-1.5 rounded px-1.5 py-1 text-[0.85rem] ${modus === m.wert ? "bg-weiss font-semibold text-tinte shadow-sm" : "text-grau hover:text-tinte"}`}
                >
                  <Symbol name={m.symbol} className="size-3.5" />
                  {t[m.wert]}
                </button>
              ))}
            </div>
          </div>
          <SprachWahl hell mitLabel className="mt-3 border-t border-linie pt-3" />
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-linie pt-3">
            <NavLink to="/benutzer" onClick={() => setOffen(false)} className="rounded px-1 py-1">
              {t.meinZugang}
            </NavLink>
            <Knopf className="ml-auto" disabled={meldetAb} onClick={abmelden}>
              {t.abmelden}
            </Knopf>
          </div>
        </div>
      )}
    </div>
  );
}

export function SchauRahmen() {
  const id = useSchauId();
  const schau = trpc.schau.get.useQuery({ id });
  if (schau.error) return <div className={SCHMAL}><FehlerAnzeige fehler={schau.error} nochmal={() => schau.refetch()} /></div>;
  if (!schau.data) return <Laden />;
  return <Outlet />;
}

/** Rahmen der Anmeldeseiten: Karte mittig auf zurückgesetzter Fläche. */
export function AnmeldeFlaeche({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-papier px-4 py-10">{children}</div>;
}

export function Anmelden() {
  const status = trpc.auth.status.useQuery();
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [zweiterSchritt, setZweiterSchritt] = useState<string | null>(null);
  const [einmalcode, setEinmalcode] = useState("");
  // Nach dem Anmelden zurück auf die Seite, von der man kam (nur eigene Seiten, siehe ruecksprungZiel).
  const [suche] = useSearchParams();
  const ziel = ruecksprungZiel(suche.get("weiter"));
  const fertig = { onSuccess: async () => { await utils.auth.status.invalidate(); navigate(ziel, { replace: true }); } };
  const anmelden = trpc.auth.anmelden.useMutation({
    onSuccess: async (r) => {
      if (r.zweiterFaktor) {
        setZweiterSchritt(r.token);
        setPasswort("");
        return;
      }
      await fertig.onSuccess();
    },
  });
  const anmeldenCode = trpc.auth.anmeldenCode.useMutation({
    ...fertig,
    onError: (e) => {
      // Abgelaufen oder zu viele Versuche: zurück zum Passwort.
      if (e.message.includes("abgelaufen")) setZweiterSchritt(null);
    },
  });
  const einrichten = trpc.auth.einrichten.useMutation(fertig);
  const t = useOberflaeche().rahmen.anmelden;
  useSeitentitel(t.titel);

  if (status.isLoading) return <Laden />;
  if (status.data?.benutzer) return <Navigate to={ziel} replace />;
  const ersteinrichtung = status.data && !status.data.eingerichtet;
  const m = ersteinrichtung ? einrichten : anmelden;

  if (zweiterSchritt) {
    return (
      <AnmeldeFlaeche>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            anmeldenCode.mutate({ token: zweiterSchritt, code: einmalcode });
          }}
          className="w-full max-w-md rounded-xl border border-linie-stark bg-weiss p-8 shadow-xl"
        >
          <h1 className="text-2xl font-bold">{t.bestaetigungscode}</h1>
          <p className="mb-6 mt-1 text-grau">{t.codeHinweis}</p>
          <div className="flex flex-col gap-4">
            <Feld label={t.code}>
              {(id) => (
                <Eingabe id={id} value={einmalcode} onChange={(e) => setEinmalcode(e.target.value)} required autoFocus autoComplete="one-time-code" inputMode="text" className="nummer text-center text-2xl tracking-[0.3em]" maxLength={9} />
              )}
            </Feld>
            {anmeldenCode.error && <Hinweis ton="fehler">{fehlerText(anmeldenCode.error)}</Hinweis>}
            <Knopf type="submit" variante="primaer" gross laedt={anmeldenCode.isPending}>{t.anmelden}</Knopf>
            <button type="button" className="text-sm text-band underline" onClick={() => { setZweiterSchritt(null); setEinmalcode(""); }}>
              {t.zurueck}
            </button>
          </div>
        </form>
      </AnmeldeFlaeche>
    );
  }

  const senden = (e: FormEvent) => {
    e.preventDefault();
    if (ersteinrichtung) einrichten.mutate({ organisation, name, email, passwort, code });
    else anmelden.mutate({ email, passwort });
  };

  return (
    <AnmeldeFlaeche>
      <form onSubmit={senden} className="w-full max-w-md rounded-xl border border-linie-stark bg-weiss p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <img src="/icon.svg" alt="" className="size-16" />
          <div>
            <h1 className="text-2xl font-bold">{status.data?.appName ?? "SchauFUCHS"}</h1>
            <p className="text-grau">{ersteinrichtung ? t.ersteinrichtung : t.anmeldungFuer}</p>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          {suche.get("untaetig") && !ersteinrichtung && <Hinweis>{t.untaetig}</Hinweis>}
          {ersteinrichtung && (
            <>
              <Feld label={t.vereinName}>{(id) => <Eingabe id={id} value={organisation} onChange={(e) => setOrganisation(e.target.value)} required />}</Feld>
              <Feld label={t.ihrName}>{(id) => <Eingabe id={id} value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />}</Feld>
              {status.data?.einrichtungsCodeNoetig && (
                <Feld label={t.einrichtungscode} hinweis={t.einrichtungscodeHinweis}>
                  {(id) => <Eingabe id={id} type="password" value={code} onChange={(e) => setCode(e.target.value)} required autoComplete="off" />}
                </Feld>
              )}
            </>
          )}
          <Feld label={t.email}>{(id) => <Eingabe id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />}</Feld>
          <Feld label={t.passwort} hinweis={ersteinrichtung ? t.mindestens10 : undefined}>
            {(id) => <Eingabe id={id} type="password" value={passwort} onChange={(e) => setPasswort(e.target.value)} required autoComplete={ersteinrichtung ? "new-password" : "current-password"} />}
          </Feld>
          {m.error && <Hinweis ton="fehler">{fehlerText(m.error)}</Hinweis>}
          <Knopf type="submit" variante="primaer" gross laedt={m.isPending}>
            {ersteinrichtung ? t.vereinAnlegen : t.anmelden}
          </Knopf>
          <a href="/hilfe" target="_blank" rel="noreferrer" className="text-center text-sm text-band">
            {t.hilfe}
          </a>
          <SprachWahl hell className="mx-auto w-44" />
        </div>
      </form>
    </AnmeldeFlaeche>
  );
}
