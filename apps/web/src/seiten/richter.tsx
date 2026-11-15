/**
 * Bewertung am Tablet für Preisrichter.
 * Arbeitet ohne Netz weiter: Tiere und Bewertungen liegen im Gerät (IndexedDB),
 * neue Bewertungen warten im Ausgang und werden übertragen, sobald wieder Verbindung besteht.
 */
import { bausteinFuerTier, bewertungsText, brauchtObmann, erlaubtePunkte, MELDEART_LABEL, PHASEN, PHASEN_LABEL, SONDERNOTE_LABEL, SONDERNOTEN, sortiereGruppen, type NotenStufe, type Sondernote } from "@schau/domain";
import { del, delMany, get, keys, set, update } from "idb-keyval";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { AbmeldeHinweis, useAutoAbmeldung } from "../abmeldung";
import { fehlerText, formatKatalognummer } from "../lib";
import { direkt, trpc, type Ausgabe } from "../trpc";
import { Hinweis, Knopf, knopfKlasse, Laden, Leer, useFrage, useMeldung } from "../ui";

type Daten = Ausgabe["richter"]["daten"];
type Tier = Daten["tiere"][number];
type Ergebnis = Ausgabe["richter"]["abgleich"]["ergebnisse"][number];
interface Richter {
  id: number;
  name: string;
}
interface Ausgang {
  katalogeintragId: number;
  punkte: number | null;
  sondernote: Sondernote | null;
  vorzuege: string;
  wuensche: string;
  maengel: string;
  geraetZeit: string;
  /** Katalognummer zur Anzeige (fehlt bei älteren Einträgen). */
  nr?: string;
  /** Wer bewertet hat. Ältere Einträge ohne Angabe gehören dem gerade angemeldeten Preisrichter. */
  preisrichterId?: number;
  preisrichterName?: string;
  /** Stand am Server beim Bewerten (Versionszähler) – zur Konflikterkennung ohne Geräteuhr. */
  basisVersion?: number | null;
  /** Nach Rückfrage trotz Änderung anderswo senden. */
  erzwingen?: boolean;
}
/** Vom Server abgelehnte Bewertung: bleibt im Gerät, bis der Preisrichter sie erneut sendet oder verwirft. */
type Abgelehnt = Ausgang & { meldung: string; konflikt?: boolean };
/** Was die Karte zum Speichern übergibt. */
type Eingabe = Omit<Ausgang, "geraetZeit" | "nr" | "preisrichterId" | "preisrichterName" | "basisVersion" | "erzwingen">;
/** Bewertungsstand einer Karte; Texte wie am Server getrimmt, damit eigenes Speichern nicht als fremde Änderung gilt. */
type Stand = Pick<Ausgang, "punkte" | "sondernote" | "vorzuege" | "wuensche" | "maengel">;
const standVon = (t: Stand): Stand => ({ punkte: t.punkte, sondernote: t.sondernote, vorzuege: t.vorzuege.trim(), wuensche: t.wuensche.trim(), maengel: t.maengel.trim() });
const gleicherStand = (a: Stand, b: Stand) => JSON.stringify(standVon(a)) === JSON.stringify(standVon(b));

/** Grenze des Servers je Textfeld (services/bewertung.ts). */
const MAX_TEXT = 500;
const TEXT_ZU_LANG = `Text zu lang (höchstens ${MAX_TEXT} Zeichen).`;

const datenSchluessel = (slug: string, richterId: number) => `richter:${slug}:${richterId}`;
const zuletztSchluessel = (slug: string) => `richter-zuletzt:${slug}`;
/** Gemeinsamer Ausgang aller Preisrichter dieses Geräts; jeder Eintrag nennt seinen Preisrichter. */
const ausgangSchluesselVon = (slug: string) => `richter-ausgang:${slug}`;
const abgelehntSchluesselVon = (slug: string) => `richter-abgelehnt:${slug}`;
/** Liest public/start.html, damit die installierte App direkt auf dem Tablet startet. */
const LETZTE_SCHAU = "letzteRichterSchau";

const gleicherEintrag = (a: Ausgang, b: Ausgang) => a.katalogeintragId === b.katalogeintragId && a.geraetZeit === b.geraetZeit;
const fehlerCode = (e: unknown) => (e as { data?: { code?: string } | null } | null)?.data?.code;

function leseZuletzt(slug: string): Richter | null {
  try {
    const r = JSON.parse(localStorage.getItem(zuletztSchluessel(slug)) ?? "null") as Richter | null;
    return r && typeof r.id === "number" ? r : null;
  } catch {
    return null;
  }
}

function merkeZuletzt(slug: string, r: Richter | null) {
  try {
    if (r) {
      localStorage.setItem(zuletztSchluessel(slug), JSON.stringify({ id: r.id, name: r.name }));
      localStorage.setItem(LETZTE_SCHAU, slug);
    } else {
      localStorage.removeItem(zuletztSchluessel(slug));
      if (localStorage.getItem(LETZTE_SCHAU) === slug) localStorage.removeItem(LETZTE_SCHAU);
    }
  } catch {
    // Ohne localStorage startet die App eben auf der Startseite.
  }
}

/**
 * Nach dem Abschluss der Schau (oder wenn es sie nicht mehr gibt): gespeicherte Tierlisten und Bausteine aller
 * Preisrichter dieser Schau und den gemerkten Preisrichter vom Gerät löschen. Nicht übertragene Bewertungen bleiben – sie
 * sind die einzige Kopie und werden nur bewusst gelöscht. Rückgabe: ob etwas gelöscht wurde.
 */
async function raeumeGeraetAuf(slug: string): Promise<boolean> {
  merkeZuletzt(slug, null);
  try {
    const weg = (await keys()).filter((k): k is string => typeof k === "string" && k.startsWith(`richter:${slug}:`));
    if (weg.length) await delMany(weg);
    const [a, b] = await Promise.all([get<Ausgang[]>(ausgangSchluesselVon(slug)), get<Abgelehnt[]>(abgelehntSchluesselVon(slug))]);
    if (a && !a.length) await del(ausgangSchluesselVon(slug));
    if (b && !b.length) await del(abgelehntSchluesselVon(slug));
    return weg.length > 0;
  } catch {
    return false;
  }
}

export function RichterApp() {
  const { slug = "" } = useParams();
  const status = trpc.auth.status.useQuery(undefined, { retry: false });
  const [angemeldet, setAngemeldet] = useState(false);
  const [zuletzt] = useState(() => leseZuletzt(slug));
  const [offlineDaten, setOfflineDaten] = useState<boolean | null>(null);
  const richter = status.data?.richter;
  // Tablet: größere Grundschrift (Ziele mindestens 44 px), nur solange diese Seite offen ist.
  useEffect(() => {
    document.documentElement.classList.add("tablet");
    return () => document.documentElement.classList.remove("tablet");
  }, []);

  // Ohne Netz: wenn Daten des zuletzt angemeldeten Preisrichters im Gerät liegen, direkt mit ihnen arbeiten.
  useEffect(() => {
    if (!zuletzt) return setOfflineDaten(false);
    get(datenSchluessel(slug, zuletzt.id)).then(
      (d) => setOfflineDaten(!!d),
      () => setOfflineDaten(false),
    );
  }, [slug, zuletzt]);

  // Die Sitzung gilt nur für ihre Schau: ein Link zu einer anderen Schau zeigt die Anmeldung.
  const passend = richter && richter.slug === slug ? richter : null;
  // Endet die Sitzung während der Arbeit (z. B. neue PIN), bleibt das Tablet stehen: es zeigt „Anmeldung abgelaufen“,
  // statt die Karte mit ungespeicherten Eingaben ohne Rückfrage zu verlassen.
  const [aktiv, setAktiv] = useState<Richter | null>(null);
  useEffect(() => {
    if (passend) {
      merkeZuletzt(slug, passend);
      setAktiv({ id: passend.id, name: passend.name });
    }
  }, [slug, passend?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status.isLoading || offlineDaten === null) return <Laden />;
  if (passend) return <Tablet key={passend.id} slug={slug} richter={{ id: passend.id, name: passend.name }} abmeldung={status.data?.abmeldung.richter ?? null} />;
  if (aktiv && !richter) return <Tablet key={aktiv.id} slug={slug} richter={aktiv} abmeldung={null} />;
  if (status.isError && offlineDaten && zuletzt) return <Tablet key={zuletzt.id} slug={slug} richter={zuletzt} abmeldung={null} />;
  if (angemeldet && status.isFetching) return <Laden />;
  return <RichterAnmeldung slug={slug} andereSchau={!!richter && !passend} fertig={() => { setAngemeldet(true); status.refetch(); }} />;
}

/** Ohne HTTPS gibt es keinen Service Worker: das Tablet startet dann ohne Netz nicht neu. */
function HttpsHinweis() {
  if (window.isSecureContext) return null;
  return (
    <div className="bg-stroh px-4 py-2 text-sm text-tinte">
      Ohne HTTPS lässt sich die Seite ohne Netz nicht neu öffnen. Bitte die Adresse mit https:// verwenden.
    </div>
  );
}

/** Länge der Tablet-PIN (die AL erzeugt sie unter „Preisrichter“). */
const PIN_LAENGE = 8;

function RichterAnmeldung({ slug, andereSchau, fertig }: { slug: string; andereSchau: boolean; fertig: () => void }) {
  const info = trpc.richter.anmeldeInfo.useQuery({ slug });
  const { bestaetige } = useFrage();
  useEffect(() => {
    if (info.data) document.title = `Preisrichter-Anmeldung – ${info.data.name}`;
  }, [info.data]);
  const [wer, setWer] = useState<{ id: number; name: string } | null>(null);
  const [pin, setPin] = useState("");
  // Noch nicht übertragene oder abgelehnte Noten dieses Geräts – auch ohne Anmeldung sichtbar (z. B. nach dem
  // Abschluss der Schau), damit sie nicht still im Gerät bleiben.
  const [imGeraet, setImGeraet] = useState<Ausgang[]>([]);
  useEffect(() => {
    Promise.all([get<Ausgang[]>(ausgangSchluesselVon(slug)), get<Abgelehnt[]>(abgelehntSchluesselVon(slug))]).then(
      ([a, b]) => setImGeraet([...(a ?? []), ...(b ?? [])]),
      () => {},
    );
  }, [slug]);
  // Schau abgeschlossen oder gelöscht: das Gerät räumt seine Daten dieser Schau auf (nur mit Netz – dann ist der Stand sicher).
  const schauVorbei = !!info.data?.abgeschlossen || fehlerCode(info.error) === "NOT_FOUND";
  const [aufgeraeumt, setAufgeraeumt] = useState(false);
  useEffect(() => {
    if (schauVorbei) raeumeGeraetAuf(slug).then(() => setAufgeraeumt(true));
  }, [schauVorbei, slug]);
  const restLoeschen = async () => {
    if (
      !(await bestaetige({
        titel: `${imGeraet.length} nicht übertragene Bewertung${imGeraet.length === 1 ? "" : "en"} löschen?`,
        text: "Das lässt sich nicht rückgängig machen.",
        knopf: "Endgültig löschen",
        gefahr: true,
      }))
    )
      return;
    await Promise.all([del(ausgangSchluesselVon(slug)), del(abgelehntSchluesselVon(slug))]).catch(() => {});
    setImGeraet([]);
  };
  const anmelden = trpc.richter.anmelden.useMutation({ onSuccess: fertig, onError: () => setPin("") });
  useEffect(() => {
    if (pin.length === PIN_LAENGE && wer) anmelden.mutate({ slug, preisrichterId: wer.id, pin });
  }, [pin]); // eslint-disable-line react-hooks/exhaustive-deps

  if (info.isLoading) return <Laden />;
  if (info.error)
    return (
      <div className="p-8">
        <Hinweis ton="fehler">{fehlerText(info.error)}</Hinweis>
        {schauVorbei && aufgeraeumt && <p className="mt-3 text-grau">Gespeicherte Daten dieser Schau wurden von diesem Gerät gelöscht.</p>}
      </div>
    );
  return (
    <div className="flex min-h-screen flex-col items-center bg-papier px-4 py-10 text-tinte">
      <div className="w-full max-w-md"><HttpsHinweis /></div>
      {andereSchau && (
        <Hinweis ton="warnung" className="mb-4 w-full max-w-md text-sm">
          Dieses Gerät ist für eine andere Schau angemeldet. Die Anmeldung hier ersetzt sie.
        </Hinweis>
      )}
      {imGeraet.length > 0 && (
        <details open className="mb-4 w-full max-w-md rounded-lg border border-kamm/25 bg-kamm-hell px-4 py-3 text-kamm">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">
            {imGeraet.length} Bewertung{imGeraet.length === 1 ? "" : "en"} auf diesem Gerät noch nicht übertragen.{" "}
            {info.data?.offen
              ? "Nach der Anmeldung werden sie gesendet."
              : schauVorbei
                ? "Die Schau ist abgeschlossen – bitte der Ausstellungsleitung zeigen, dann löschen."
                : "Bitte der Ausstellungsleitung zum Nachtragen geben."}
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-tinte">
            {imGeraet.map((a) => (
              <li key={`${a.katalogeintragId}-${a.geraetZeit}`}>
                Nr. {a.nr ?? "?"}: <b>{bewertungsText(a)}</b>
                {a.preisrichterName ? ` (${a.preisrichterName})` : ""}
                {[a.vorzuege && `Vorzüge: ${a.vorzuege}`, a.wuensche && `Wünsche: ${a.wuensche}`, a.maengel && `Mängel: ${a.maengel}`].filter(Boolean).map((t) => <span key={t as string} className="block text-sm">{t}</span>)}
              </li>
            ))}
          </ul>
          {schauVorbei && (
            <Knopf variante="gefahr" className="mt-3 min-h-11" onClick={restLoeschen}>
              Endgültig von diesem Gerät löschen
            </Knopf>
          )}
        </details>
      )}
      <img src="/icon.svg" alt="" className="size-14" />
      <h1 className="mt-3 text-center text-3xl font-bold leading-tight text-tinte">{info.data?.name}</h1>
      <p className="mt-1 text-grau">Bewertung am Tablet</p>
      {!wer ? (
        <div className="mt-8 w-full max-w-md">
          {!info.data?.abgeschlossen && <h2 className="mb-3 font-sans text-lg font-semibold text-tinte">Wer bewertet?</h2>}
          <ul className="flex flex-col gap-2">
            {info.data?.richter.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setWer(r)} className="w-full rounded-xl border border-linie-stark bg-weiss px-5 py-4 text-left text-xl font-semibold hover:border-band">
                  {r.name}
                </button>
              </li>
            ))}
          </ul>
          {info.data?.abgeschlossen ? (
            <p className="mt-3 text-grau">
              Die Schau ist abgeschlossen.{aufgeraeumt && " Tierlisten und Textbausteine dieser Schau wurden von diesem Gerät gelöscht."}
            </p>
          ) : (
            info.data &&
            !info.data.offen && (
              <p className="mt-3 text-grau">Anmeldung nur in den Phasen Einlieferung, Bewertung und Preise.</p>
            )
          )}
          {info.data?.offen && info.data.richter.length === 0 && <Leer titel="Noch keine Preisrichter angelegt" />}
        </div>
      ) : (
        <div className="mt-8 w-full max-w-xs text-center">
          <p className="text-lg font-semibold">{wer.name}</p>
          <p className="mt-1 text-grau">Bitte PIN eingeben</p>
          <div className="my-5 flex justify-center gap-3" aria-label={`${pin.length} von ${PIN_LAENGE} Ziffern eingegeben`}>
            {Array.from({ length: PIN_LAENGE }, (_, i) => (
              <span key={i} className={`size-4 rounded-full border-2 border-tinte ${i < pin.length ? "bg-tinte" : ""}`} />
            ))}
          </div>
          {anmelden.error && <p role="alert" className="mb-3 font-semibold text-kamm">{fehlerText(anmelden.error)}</p>}
          <div className="grid grid-cols-3 gap-3">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((z, i) =>
              z === "" ? (
                <span key={i} />
              ) : (
                <button
                  key={i}
                  type="button"
                  aria-label={z === "⌫" ? "Letzte Ziffer löschen" : z}
                  disabled={anmelden.isPending}
                  onClick={() => setPin((p) => (z === "⌫" ? p.slice(0, -1) : p.length < PIN_LAENGE ? p + z : p))}
                  className="nummer h-16 rounded-xl border border-linie-stark bg-weiss text-3xl hover:border-band active:bg-band-hell"
                >
                  {z}
                </button>
              ),
            )}
          </div>
          <button type="button" className="mt-6 inline-flex min-h-11 items-center px-3 text-grau underline hover:text-tinte" onClick={() => { setWer(null); setPin(""); }}>
            Anderer Name
          </button>
        </div>
      )}
      <a href="/hilfe/preisrichter#anmelden" target="_blank" rel="noreferrer" className="mt-10 inline-flex min-h-11 items-center px-3 text-grau underline hover:text-tinte">
        Hilfe für Preisrichter
      </a>
    </div>
  );
}

function Tablet({ slug, richter, abmeldung }: { slug: string; richter: Richter; abmeldung: number | null }) {
  const [daten, setDaten] = useState<Daten | null>(null);
  const [ausgang, setAusgang] = useState<Ausgang[]>([]);
  const [abgelehnt, setAbgelehnt] = useState<Abgelehnt[]>([]);
  const [online, setOnline] = useState(navigator.onLine);
  const [sendet, setSendet] = useState(false);
  const [abgelaufen, setAbgelaufen] = useState(false);
  const [auswahl, setAuswahl] = useState<number | null>(null);
  const [ansicht, setAnsicht] = useState<"bewerten" | "obmann">("bewerten");
  /** Letzter Fehler des Servers beim Übertragen (z. B. 500) – sichtbar, bis eine Übertragung gelingt. */
  const [serverFehler, setServerFehler] = useState<string | null>(null);
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  const schluessel = datenSchluessel(slug, richter.id);
  const ausgangSchluessel = ausgangSchluesselVon(slug);
  const abgelehntSchluessel = abgelehntSchluesselVon(slug);
  const meins = useCallback((a: Ausgang) => a.preisrichterId == null || a.preisrichterId === richter.id, [richter.id]);
  // Für Katalognummern in Meldungen; der Abgleich läuft aus dem Intervall heraus mit festem Closure.
  const datenRef = useRef<Daten | null>(null);
  datenRef.current = daten;
  // Nur ein Abgleich zur Zeit; wer währenddessen anstößt, bekommt danach einen weiteren Durchlauf.
  const laeuft = useRef(false);
  const nochmal = useRef(false);

  /** Ändert den Ausgang in einer IndexedDB-Transaktion (kein Wettlauf zwischen Speichern und Abgleich). */
  const aendereAusgang = useCallback(
    async (f: (alt: Ausgang[]) => Ausgang[]) => {
      let neu: Ausgang[] = [];
      await update<Ausgang[]>(ausgangSchluessel, (alt) => (neu = f(alt ?? [])));
      setAusgang(neu);
      return neu;
    },
    [ausgangSchluessel],
  );

  const aendereAbgelehnt = useCallback(
    async (f: (alt: Abgelehnt[]) => Abgelehnt[]) => {
      let neu: Abgelehnt[] = [];
      await update<Abgelehnt[]>(abgelehntSchluessel, (alt) => (neu = f(alt ?? [])));
      setAbgelehnt(neu);
      return neu;
    },
    [abgelehntSchluessel],
  );

  /** Lädt die Serverdaten; false heißt: es gilt weiter der Stand im Gerät. */
  const laden = useCallback(async (): Promise<boolean> => {
    try {
      const d = await direkt.richter.daten.query();
      setDaten(d);
      setOnline(true);
      setAbgelaufen(false);
      await set(schluessel, d).catch(() => {});
      return true;
    } catch (e) {
      if (fehlerCode(e) === "UNAUTHORIZED") setAbgelaufen(true);
      const d = await get<Daten>(schluessel).catch(() => undefined);
      if (d) setDaten(d);
      // Antwortet der Server mit einem Fehler, ist die Verbindung da.
      setOnline(fehlerCode(e) != null);
      return false;
    }
  }, [schluessel]);

  /**
   * Sendet Bewertungen. Scheitert der ganze Stapel an der Eingabeprüfung (z. B. ein zu langer Text),
   * wird einzeln gesendet, damit ein fehlerhafter Eintrag nicht alle anderen aufhält.
   */
  const senden = useCallback(async (liste: Ausgang[]): Promise<[Ausgang, Ergebnis][]> => {
    try {
      const r = await direkt.richter.abgleich.mutate({
        bewertungen: liste.map((a) => ({
          katalogeintragId: a.katalogeintragId,
          punkte: a.punkte,
          sondernote: a.sondernote,
          vorzuege: a.vorzuege,
          wuensche: a.wuensche,
          maengel: a.maengel,
          geraetZeit: new Date(a.geraetZeit),
          ...(a.basisVersion !== undefined ? { basisVersion: a.basisVersion } : {}),
          ...(a.erzwingen ? { erzwingen: true } : {}),
        })),
      });
      // Der Server antwortet je Eintrag in derselben Reihenfolge.
      if (r.ergebnisse.length === liste.length) return liste.map((a, i) => [a, r.ergebnisse[i]!]);
      return liste.flatMap((a) => {
        const x = r.ergebnisse.find((e) => e.katalogeintragId === a.katalogeintragId);
        return x ? [[a, x] as [Ausgang, Ergebnis]] : [];
      });
    } catch (e) {
      // Eingabefehler beim ganzen Stapel: einzeln senden, damit ein Eintrag die anderen nicht aufhält. Ein Serverfehler
      // (z. B. Datenbank kurz weg) zählt wie fehlendes Netz: alles bleibt im Ausgang und wird erneut gesendet.
      if (fehlerCode(e) !== "BAD_REQUEST") throw e;
      const [erster] = liste;
      if (liste.length === 1 && erster) return [[erster, { katalogeintragId: erster.katalogeintragId, status: "fehler", meldung: fehlerText(e) }]];
      const alle: [Ausgang, Ergebnis][] = [];
      for (const a of liste) alle.push(...(await senden([a])));
      return alle;
    }
  }, []);

  const abgleichEinmal = useCallback(async () => {
    const alle = (await get<Ausgang[]>(ausgangSchluessel).catch(() => undefined)) ?? [];
    setAusgang(alle);
    // Je Tier nur den zuletzt gespeicherten Stand senden (Reihenfolge im Ausgang, nicht die Geräteuhr – die kann
    // verstellt sein); ältere Zwischenstände desselben Tiers gelten damit als erledigt.
    const eigene = alle.filter(meins);
    const offen = eigene.filter((a, i) => !eigene.slice(i + 1).some((b) => b.katalogeintragId === a.katalogeintragId));
    const ueberholt = eigene.filter((a) => !offen.includes(a));
    if (offen.length === 0) return laden();
    setSendet(true);
    try {
      // Zu lange Texte (ältere Einträge) gar nicht erst senden: der Server lehnt sie ohnehin ab.
      const zuLang = offen.filter((a) => [a.vorzuege, a.wuensche, a.maengel].some((t) => t.length > MAX_TEXT));
      const ergebnisse: [Ausgang, Ergebnis][] = zuLang.map((a) => [a, { katalogeintragId: a.katalogeintragId, status: "fehler", meldung: TEXT_ZU_LANG }]);
      const rest = offen.filter((a) => !zuLang.includes(a));
      if (rest.length) ergebnisse.push(...(await senden(rest)));

      // Abgelehntes zuerst sichern, dann aus dem Ausgang nehmen: lieber doppelt als verloren.
      // Abgelehnt oder inzwischen anderswo geändert: nicht still verwerfen, sondern sichtbar zur Entscheidung.
      // Vorübergehend gestört: im Ausgang lassen, später erneut senden.
      const spaeter = ergebnisse.filter(([, x]) => x.status === "spaeter").map(([a]) => a);
      if (spaeter.length) setServerFehler("Der Server ist vorübergehend gestört.");
      const neuAbgelehnt: Abgelehnt[] = ergebnisse.flatMap(([a, x]) => {
        if (x.status === "gespeichert" || x.status === "spaeter") return [];
        const t = datenRef.current?.tiere.find((y) => y.id === a.katalogeintragId);
        return [
          {
            ...a,
            nr: a.nr ?? (t ? formatKatalognummer(t) : undefined),
            preisrichterId: a.preisrichterId ?? richter.id,
            preisrichterName: a.preisrichterName ?? richter.name,
            meldung: x.meldung,
            konflikt: x.status === "veraltet",
          },
        ];
      });
      if (neuAbgelehnt.length) await aendereAbgelehnt((alt) => [...alt.filter((x) => !neuAbgelehnt.some((n) => gleicherEintrag(n, x))), ...neuAbgelehnt]);
      // Alles Beantwortete aus dem Ausgang nehmen; was inzwischen neu dazukam, bleibt.
      // Erst die neuen Serverdaten holen, dann leeren – sonst zeigt die Karte kurz den alten Stand.
      const beantwortet = [...ergebnisse.filter(([, x]) => x.status !== "spaeter").map(([a]) => a), ...ueberholt];
      // Neuer Serverstand für Einträge, die inzwischen für dasselbe Tier dazukamen – sonst gälten sie als Konflikt.
      const versionen = new Map(ergebnisse.flatMap(([a, x]) => (x.status === "gespeichert" && x.version != null ? [[a.katalogeintragId, x.version] as const] : [])));
      setOnline(true);
      setAbgelaufen(false);
      if (!spaeter.length) setServerFehler(null);
      // Gelingt das Nachladen nicht, die gespeicherten Noten samt neuem Stand in die Gerätedaten übernehmen – sonst
      // zeigte das Tablet die alte Note und die nächste Eingabe ergäbe einen Scheinkonflikt.
      if (!(await laden())) {
        const gespeichert = new Map(ergebnisse.flatMap(([a, x]) => (x.status === "gespeichert" ? [[a.katalogeintragId, { a, version: x.version }] as const] : [])));
        const alt = datenRef.current;
        if (alt && gespeichert.size) {
          const neu = {
            ...alt,
            tiere: alt.tiere.map((t) => {
              const g = gespeichert.get(t.id);
              return g ? { ...t, punkte: g.a.punkte, sondernote: g.a.sondernote, vorzuege: g.a.vorzuege, wuensche: g.a.wuensche, maengel: g.a.maengel, version: g.version ?? t.version } : t;
            }),
          };
          setDaten(neu);
          await set(schluessel, neu).catch(() => {});
        }
      }
      await aendereAusgang((alt) =>
        alt
          .filter((a) => !beantwortet.some((o) => gleicherEintrag(o, a)))
          .map((a) => (meins(a) && versionen.has(a.katalogeintragId) && !a.erzwingen ? { ...a, basisVersion: versionen.get(a.katalogeintragId)! } : a)),
      );
    } catch (e) {
      if (fehlerCode(e) === "UNAUTHORIZED") setAbgelaufen(true);
      else if (fehlerCode(e) != null) setServerFehler(fehlerText(e));
      // Antwortet der Server mit einem Fehler, ist die Verbindung da.
      setOnline(fehlerCode(e) != null);
    } finally {
      setSendet(false);
    }
  }, [ausgangSchluessel, meins, laden, senden, aendereAbgelehnt, aendereAusgang, richter.id, richter.name]);

  const abgleichen = useCallback(async () => {
    if (laeuft.current) {
      nochmal.current = true;
      return;
    }
    laeuft.current = true;
    try {
      do {
        nochmal.current = false;
        await abgleichEinmal();
      } while (nochmal.current);
    } finally {
      laeuft.current = false;
    }
  }, [abgleichEinmal]);

  useEffect(() => {
    get<Abgelehnt[]>(abgelehntSchluessel).then((a) => setAbgelehnt(a ?? []), () => {});
    abgleichen();
    const an = () => abgleichen();
    const aus = () => setOnline(false);
    window.addEventListener("online", an);
    window.addEventListener("offline", aus);
    const t = setInterval(abgleichen, 20_000);
    return () => {
      window.removeEventListener("online", an);
      window.removeEventListener("offline", aus);
      clearInterval(t);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const eigeneWartend = ausgang.filter(meins);
  const fremdeWartend = ausgang.filter((a) => !meins(a));
  const eigeneAbgelehnt = abgelehnt.filter(meins);
  // Automatische Abmeldung nach Untätigkeit – nur mit Verbindung und ohne nicht übertragene Bewertungen (die bleiben im
  // Gerät; der Server beendet die Sitzung dann beim nächsten Abgleich, das Tablet bietet die Anmeldung an).
  const restAbmeldung = useAutoAbmeldung(
    abmeldung,
    () => direkt.auth.status.query(),
    () => {
      if (!navigator.onLine || eigeneWartend.length) return;
      void direkt.richter.abmelden.mutate().then(
        async () => {
          merkeZuletzt(slug, null);
          await del(schluessel).catch(() => {});
          location.reload();
        },
        () => {},
      );
    },
  );

  // Bewertungen aus dem Ausgang über die Serverdaten legen, damit die Anzeige offline stimmt.
  const tiere = useMemo(() => {
    if (!daten) return [];
    const eigene = ausgang.filter(meins);
    return daten.tiere.map((t) => {
      const a = [...eigene].reverse().find((x) => x.katalogeintragId === t.id);
      return a ? { ...t, punkte: a.punkte, sondernote: a.sondernote, vorzuege: a.vorzuege, wuensche: a.wuensche, maengel: a.maengel, wartet: true } : { ...t, wartet: false };
    });
  }, [daten, ausgang, meins]);

  useEffect(() => {
    if (auswahl == null && tiere.length) setAuswahl((tiere.find((t) => t.punkte == null && t.sondernote == null && !t.fehlt) ?? tiere[0]!).id);
  }, [tiere, auswahl]);

  // Ungespeicherte Eingaben auf der Karte: beim Wechsel des Tiers oder Schließen nachfragen statt still verwerfen.
  const ungespeichert = useRef(false);
  const waehle = async (id: number) => {
    if (id === auswahl) return;
    if (
      ungespeichert.current &&
      !(await bestaetige({
        titel: "Eingabe verwerfen?",
        text: "Die Bewertung auf der Karte ist noch nicht gespeichert.",
        knopf: "Verwerfen und wechseln",
        gefahr: true,
      }))
    )
      return;
    ungespeichert.current = false;
    setAuswahl(id);
  };
  useEffect(() => {
    const warnen = (e: BeforeUnloadEvent) => {
      if (ungespeichert.current || ausgang.some(meins)) e.preventDefault();
    };
    window.addEventListener("beforeunload", warnen);
    return () => window.removeEventListener("beforeunload", warnen);
  }, [ausgang, meins]);
  // Offline-Daten vor dem Aufräumen durch den Browser schützen (dauerhafter Speicher).
  const [dauerhaft, setDauerhaft] = useState<boolean | null>(null);
  useEffect(() => {
    navigator.storage?.persist?.().then(setDauerhaft, () => setDauerhaft(false));
  }, []);

  const speichern = async (a: Eingabe) => {
    const idx = tiere.findIndex((t) => t.id === a.katalogeintragId);
    const t = tiere[idx];
    const eintrag: Ausgang = {
      ...a,
      geraetZeit: new Date().toISOString(),
      basisVersion: t?.version ?? null,
      nr: t ? formatKatalognummer(t) : undefined,
      preisrichterId: richter.id,
      preisrichterName: richter.name,
    };
    try {
      await aendereAusgang((alt) => [...alt, eintrag]);
      // Eine neue Note für dasselbe Tier ersetzt eine früher abgelehnte.
      if (abgelehnt.some((x) => meins(x) && x.katalogeintragId === a.katalogeintragId))
        await aendereAbgelehnt((alt) => alt.filter((x) => !(meins(x) && x.katalogeintragId === a.katalogeintragId)));
    } catch (e) {
      return meldung(`Speichern im Gerät fehlgeschlagen: ${fehlerText(e)}`, "fehler");
    }
    const naechstes = tiere.slice(idx + 1).find((x) => x.punkte == null && x.sondernote == null && !x.fehlt) ?? tiere[idx + 1];
    ungespeichert.current = false;
    if (naechstes) setAuswahl(naechstes.id);
    abgleichen();
  };

  /** Nimmt die Note zurück: Wartendes fliegt aus dem Ausgang, Übertragenes wird am Server gelöscht. */
  const zuruecknehmen = async (id: number) => {
    // Sonst könnte ein gerade gesendeter Eintrag die Rücknahme gleich wieder überschreiben.
    if (laeuft.current) return meldung("Es wird gerade übertragen. Bitte gleich noch einmal versuchen.", "fehler");
    const aufServer = daten?.tiere.find((t) => t.id === id);
    const amServer = aufServer != null && (aufServer.punkte != null || aufServer.sondernote != null);
    if (amServer && !online) return meldung("Zurücknehmen geht nur mit Verbindung.", "fehler");
    // Während der Rücknahme keinen Abgleich starten: er könnte einen wartenden Eintrag desselben Tiers neu anlegen.
    laeuft.current = true;
    try {
      await aendereAusgang((alt) => alt.filter((a) => !(meins(a) && a.katalogeintragId === id)));
      // Mit dem bekannten Stand: hat die Ausstellungsleitung inzwischen korrigiert, kommt ein Konflikt statt stillem Löschen.
      if (amServer) await direkt.richter.zuruecksetzen.mutate({ katalogeintragId: id, basisVersion: aufServer!.version });
      if (amServer) await laden();
      meldung("Note zurückgenommen.");
    } catch (e) {
      // Inzwischen anderswo geändert: den neuen Stand zeigen, damit der Preisrichter ihn sieht.
      if (fehlerCode(e) === "CONFLICT") await laden();
      meldung(fehlerText(e), "fehler");
    } finally {
      laeuft.current = false;
      if (nochmal.current) abgleichen();
    }
  };

  /** Legt eine abgelehnte Bewertung zurück in den Ausgang (z. B. nachdem die Bewertung wieder geöffnet wurde). */
  const erneutSenden = async (a: Abgelehnt) => {
    const { meldung: _grund, konflikt, ...rest } = a;
    // Wartet für dasselbe Tier schon ein Eintrag, ist er neuer (abgelehnte Einträge verlassen den Ausgang).
    if (ausgang.some((x) => meins(x) && x.katalogeintragId === a.katalogeintragId)) {
      meldung(`Für Nr. ${a.nr ?? "?"} wartet schon eine neuere Bewertung – die abgelehnte wird verworfen.`, "fehler");
      await aendereAbgelehnt((alt) => alt.filter((x) => !gleicherEintrag(x, a)));
      return;
    }
    // Konflikt: der Preisrichter hat die andere Änderung gesehen und will seine Bewertung trotzdem.
    const eintrag: Ausgang = konflikt ? { ...rest, erzwingen: true } : rest;
    await aendereAusgang((alt) => (alt.some((x) => gleicherEintrag(x, eintrag)) ? alt : [...alt, eintrag]));
    await aendereAbgelehnt((alt) => alt.filter((x) => !gleicherEintrag(x, a)));
    abgleichen();
  };

  const verwerfen = async (a: Abgelehnt) => {
    if (
      !(await bestaetige({
        titel: `Bewertung von Nr. ${a.nr ?? "?"} löschen?`,
        text: "Die Bewertung wird endgültig gelöscht – vorher der Ausstellungsleitung zum Nachtragen geben.",
        knopf: "Endgültig löschen",
        gefahr: true,
      }))
    )
      return;
    await aendereAbgelehnt((alt) => alt.filter((x) => !gleicherEintrag(x, a)));
  };

  const abmelden = async () => {
    if (eigeneWartend.length) {
      return meldung(`Noch ${eigeneWartend.length} Bewertung${eigeneWartend.length === 1 ? "" : "en"} nicht übertragen. Bitte erst mit Verbindung übertragen, dann abmelden.`, "fehler");
    }
    if (
      eigeneAbgelehnt.length &&
      !(await bestaetige({
        titel: "Trotzdem abmelden?",
        text: "Nicht übernommene Bewertungen bleiben im Gerät und erscheinen bei der nächsten Anmeldung wieder.",
        knopf: "Abmelden",
      }))
    )
      return;
    try {
      await direkt.richter.abmelden.mutate();
    } catch {
      return meldung("Abmelden geht nur mit Verbindung.", "fehler");
    }
    merkeZuletzt(slug, null);
    await del(schluessel).catch(() => {});
    location.reload();
  };

  if (!daten) return <Laden />;
  document.title = `Bewertung – ${daten.schau.name}`;
  const tier = tiere.find((t) => t.id === auswahl);
  const fertig = tiere.filter((t) => t.punkte != null || t.sondernote != null).length;
  const fremdeNamen = [...new Set(fremdeWartend.map((a) => a.preisrichterName ?? "einem anderen Preisrichter"))];
  const n = eigeneWartend.length;

  return (
    <div className="flex h-dvh flex-col bg-papier">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-linie bg-weiss px-4 py-2.5 text-tinte">
        <span className="font-display text-lg font-semibold [font-stretch:112%]">{daten.schau.name}</span>
        <span className="text-grau">{richter.name}: {fertig} von {tiere.length} bewertet</span>
        <span className="ml-auto flex items-center gap-2 text-sm" role="status">
          <span className={`size-2.5 rounded-full ${!online ? "bg-kamm" : n ? "bg-stroh-dunkel" : "bg-stall"}`} />
          {!online ? `Ohne Verbindung${n ? `, ${n} warten` : ""}` : sendet ? "Überträgt …" : n ? `${n} warten` : eigeneAbgelehnt.length ? "" : "Alles übertragen"}
          {eigeneAbgelehnt.length > 0 && ` · ${eigeneAbgelehnt.length} nicht übernommen`}
        </span>
        {(daten.obmannListe.length > 0 || ansicht === "obmann") && (
          <button
            type="button"
            onClick={async () => {
              if (
                ungespeichert.current &&
                !(await bestaetige({
                  titel: "Eingabe verwerfen?",
                  text: "Die Bewertung auf der Karte ist noch nicht gespeichert.",
                  knopf: "Verwerfen und wechseln",
                  gefahr: true,
                }))
              )
                return;
              ungespeichert.current = false;
              setAnsicht(ansicht === "obmann" ? "bewerten" : "obmann");
            }}
            className={knopfKlasse("primaer", false, "min-h-11 text-sm")}
          >
            {ansicht === "obmann" ? "Zurück zum Bewerten" : `Obmann: ${daten.obmannListe.length} bestätigen`}
          </button>
        )}
        <a href="/hilfe/preisrichter" target="_blank" rel="noreferrer" className={knopfKlasse("zweit", false, "min-h-11 text-sm")}>Hilfe</a>
        <button type="button" onClick={abmelden} className={knopfKlasse("zweit", false, "min-h-11 text-sm")}>Abmelden</button>
      </header>
      <HttpsHinweis />
      <AbmeldeHinweis rest={restAbmeldung} />
      {serverFehler && (
        <div className="bg-kamm-hell px-4 py-2 text-kamm" role="alert">
          Übertragung gescheitert: {serverFehler} Bewertungen bleiben im Gerät, es wird weiter versucht.
        </div>
      )}
      {abgelaufen && (
        <div className="flex flex-wrap items-center gap-x-2 bg-kamm-hell px-4 py-1 text-kamm" role="alert">
          Die Anmeldung ist abgelaufen. Wartende Bewertungen bleiben im Gerät.
          <button type="button" className="inline-flex min-h-11 items-center px-2 font-semibold underline" onClick={() => location.reload()}>Neu anmelden</button>
        </div>
      )}
      {!daten.schau.offen && (
        <div className="flex flex-wrap items-center justify-center gap-x-2 bg-stroh px-4 py-1 text-center font-semibold text-tinte">
          {daten.schau.freigegeben
            ? "Die Ergebnisse sind freigegeben. Änderungen nur noch über die Ausstellungsleitung."
            : PHASEN.indexOf(daten.schau.phase) > PHASEN.indexOf("preise")
              ? `Die Bewertung ist abgeschlossen (Phase „${PHASEN_LABEL[daten.schau.phase]}“). Änderungen nur noch über die Ausstellungsleitung.`
              : `Die Bewertung ist noch nicht geöffnet (Phase „${PHASEN_LABEL[daten.schau.phase]}“).`}
          <button type="button" className="inline-flex min-h-11 items-center px-2 underline" onClick={() => laden()}>Neu laden</button>
        </div>
      )}
      {dauerhaft === false && (
        <div className="bg-stroh px-4 py-2 text-sm text-tinte">
          Der Browser sichert die Bewertungen auf diesem Gerät nicht dauerhaft. Seite zum Startbildschirm hinzufügen, nicht im privaten Modus arbeiten.
        </div>
      )}
      {fremdeWartend.length > 0 && (
        <div className="bg-stroh px-4 py-2 text-tinte">
          Noch {fremdeWartend.length} Bewertung{fremdeWartend.length === 1 ? "" : "en"} von {fremdeNamen.join(", ")} nicht übertragen. Zum Übertragen als {fremdeNamen.join(" bzw. ")} anmelden.
        </div>
      )}
      {eigeneAbgelehnt.length > 0 && (
        <details open className="max-h-[40vh] shrink-0 overflow-y-auto bg-kamm-hell px-4 py-2 text-kamm">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">
            {eigeneAbgelehnt.length} Bewertung{eigeneAbgelehnt.length === 1 ? "" : "en"} nicht übernommen.
            {eigeneAbgelehnt.some((a) => a.konflikt) ? " Anderswo geändert: prüfen, dann trotzdem senden oder verwerfen." : " Bitte der Ausstellungsleitung zum Nachtragen geben."}
          </summary>
          <ul className="flex flex-col gap-2 pb-2">
            {eigeneAbgelehnt.map((a) => (
              <li key={`${a.katalogeintragId}-${a.geraetZeit}`} className="flex flex-wrap items-center gap-3 rounded-md border border-kamm/30 bg-weiss p-3 text-tinte">
                <span className="nummer text-2xl">{a.nr ?? "?"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{bewertungsText(a, daten.skala)}</span>
                  {a.vorzuege && <span className="block text-sm">Vorzüge: {a.vorzuege}</span>}
                  {a.wuensche && <span className="block text-sm">Wünsche: {a.wuensche}</span>}
                  {a.maengel && <span className="block text-sm">Mängel: {a.maengel}</span>}
                  <span className="block text-sm font-semibold text-kamm">{a.meldung}</span>
                  {a.konflikt &&
                    (() => {
                      const jetzt = daten.tiere.find((x) => x.id === a.katalogeintragId);
                      if (!jetzt) return null;
                      return (
                        <span className="mt-1 block rounded bg-papier px-2 py-1 text-sm">
                          Jetzt gespeichert: <b>{jetzt.punkte != null || jetzt.sondernote != null ? bewertungsText(jetzt, daten.skala) : "keine Note"}</b>
                          {jetzt.vorzuege && ` · Vorzüge: ${jetzt.vorzuege}`}
                          {jetzt.wuensche && ` · Wünsche: ${jetzt.wuensche}`}
                          {jetzt.maengel && ` · Mängel: ${jetzt.maengel}`}
                          <span className="block text-grau">„Trotzdem senden“ ersetzt diesen Stand.</span>
                        </span>
                      );
                    })()}
                </span>
                <Knopf className="min-h-11" onClick={() => erneutSenden(a)}>{a.konflikt ? "Trotzdem senden" : "Erneut senden"}</Knopf>
                <Knopf className="min-h-11" onClick={() => verwerfen(a)}>Verwerfen</Knopf>
              </li>
            ))}
          </ul>
        </details>
      )}
      {ansicht === "obmann" ? (
        <ObmannAnsicht liste={daten.obmannListe} skala={daten.skala} online={online} fertig={() => laden()} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav aria-label="Meine Tiere" className="max-h-36 w-full shrink-0 overflow-y-auto border-b border-linie bg-weiss sm:max-h-none sm:w-60 sm:border-r sm:border-b-0">
            <ul>
              {tiere.map((t) => {
                const bewertet = t.punkte != null || t.sondernote != null;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => waehle(t.id)}
                      aria-current={t.id === auswahl}
                      className={`flex min-h-14 w-full items-center gap-3 border-b border-linie px-3 py-2 text-left ${t.id === auswahl ? "bg-band-hell shadow-[inset_3px_0_0_var(--color-band)]" : "hover:bg-papier"}`}
                    >
                      <span className="nummer w-14 shrink-0 text-right text-2xl">{formatKatalognummer(t)}</span>
                      <span className="min-w-0 flex-1 text-sm leading-tight">
                        <span className="block truncate">{t.bezeichnung}</span>
                        <span className="text-grau">{t.geschlecht} {t.alter}</span>
                      </span>
                      <span className="w-12 shrink-0 text-right text-sm font-semibold">
                        {t.fehlt ? <span className="text-grau">fehlt</span> : bewertet ? <span className={t.wartet ? "text-stroh-dunkel" : "text-stall"}>{bewertungsText(t, daten.skala).split(" ")[0]}</span> : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
            {tier ? (
              <Karte
                key={tier.id}
                tier={tier}
                daten={daten}
                online={online}
                speichern={speichern}
                zuruecknehmen={zuruecknehmen}
                neuLaden={laden}
                beiAenderung={(x) => (ungespeichert.current = x)}
              />
            ) : (
              <Leer titel="Ihnen sind noch keine Tiere zugeteilt." />
            )}
          </main>
        </div>
      )}
    </div>
  );
}

function Karte({
  tier,
  daten,
  online,
  speichern,
  zuruecknehmen,
  neuLaden,
  beiAenderung,
}: {
  tier: Tier & { wartet: boolean };
  daten: Daten;
  online: boolean;
  speichern: (a: Eingabe) => void;
  zuruecknehmen: (id: number) => void;
  neuLaden: () => void;
  beiAenderung: (ungespeichert: boolean) => void;
}) {
  const [wert, setWert] = useState<{ punkte: number | null; sondernote: Sondernote | null }>({ punkte: tier.punkte, sondernote: tier.sondernote });
  const [texte, setTexte] = useState({ vorzuege: tier.vorzuege, wuensche: tier.wuensche, maengel: tier.maengel });
  // Bausteine der Geflügelart dieses Tieres und – falls an eine Rasse gebunden – seiner Rasse, je Merkmal; die der Rasse
  // zuerst (ältere Offline-Daten ohne Merkmal: „Gesamteindruck“, alle Arten, ohne Rasse).
  const passende = useMemo(
    () =>
      daten.textbausteine
        .map((b) => ({ ...b, gruppe: b.gruppe ?? "Gesamteindruck", art: b.art ?? "alle", rasse: b.rasse ?? null }))
        .filter((b) => bausteinFuerTier(b, { sparte: tier.sparte, rasse: tier.rasse ?? null, bezeichnung: tier.bezeichnung }))
        .sort((x, y) => Number(!x.rasse) - Number(!y.rasse)),
    [daten.textbausteine, tier.sparte, tier.rasse, tier.bezeichnung],
  );
  const gruppen = useMemo(() => sortiereGruppen(passende.map((b) => b.gruppe)), [passende]);
  const [gruppeGewaehlt, setGruppe] = useState("");
  const gruppe = gruppen.includes(gruppeGewaehlt) ? gruppeGewaehlt : (gruppen[0] ?? "");
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  // Ein als fehlend gemeldetes Tier bewertet niemand – die Karte bleibt gesperrt (der Server lehnte die Note sonst ab).
  const offen = daten.schau.offen && !tier.fehlt;
  const gewaehlt = wert.punkte != null || wert.sondernote != null;

  // Ändert sich die Bewertung anderswo (z. B. Korrektur der Ausstellungsleitung am PC), die Karte nachziehen.
  // Hat der Preisrichter selbst schon geändert, nicht still überschreiben, sondern nachfragen.
  const ausgangsStand = useRef<Stand>(standVon(tier));
  const [geaendert, setGeaendert] = useState<Stand | null>(null);
  const serverStand = JSON.stringify(standVon(tier));
  const uebernehmen = (s: Stand) => {
    ausgangsStand.current = s;
    setWert({ punkte: s.punkte, sondernote: s.sondernote });
    setTexte({ vorzuege: s.vorzuege, wuensche: s.wuensche, maengel: s.maengel });
    setGeaendert(null);
  };
  useEffect(() => {
    const neu = JSON.parse(serverStand) as Stand;
    if (gleicherStand(neu, ausgangsStand.current)) return;
    const lokal = { ...wert, ...texte };
    if (gleicherStand(neu, lokal)) {
      ausgangsStand.current = neu;
      setGeaendert(null);
    } else if (gleicherStand(lokal, ausgangsStand.current)) uebernehmen(neu);
    else setGeaendert(neu);
  }, [serverStand]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dem Tablet melden, ob auf der Karte etwas Ungespeichertes steht.
  const lokalStand = JSON.stringify(standVon({ ...wert, ...texte }));
  useEffect(() => {
    beiAenderung(!gleicherStand(JSON.parse(lokalStand) as Stand, ausgangsStand.current));
  }, [lokalStand]); // eslint-disable-line react-hooks/exhaustive-deps

  const preis = async (preisartId: number, weg: boolean) => {
    try {
      if (weg) await direkt.richter.preisEntfernen.mutate({ katalogeintragId: tier.id, preisartId });
      else await direkt.richter.preisVergeben.mutate({ katalogeintragId: tier.id, preisartId });
      neuLaden();
    } catch (e) {
      meldung(fehlerText(e), "fehler");
    }
  };

  const baustein = (feld: keyof typeof texte, text: string) => {
    const teile = texte[feld] ? texte[feld].split(", ") : [];
    if (teile.includes(text)) {
      // Schon drin: ein zweites Tippen nimmt den Baustein wieder heraus (kein doppelter Text auf der Karte).
      setTexte({ ...texte, [feld]: teile.filter((x) => x !== text).join(", ") });
      return;
    }
    const neu = texte[feld] ? `${texte[feld]}, ${text}` : text;
    if (neu.length > MAX_TEXT) return meldung(TEXT_ZU_LANG, "fehler");
    setTexte({ ...texte, [feld]: neu });
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex items-center gap-5 rounded-xl border border-linie-stark bg-weiss p-5">
        <span className="nummer min-w-28 rounded-lg border-2 border-tinte px-3 py-1 text-center text-6xl leading-tight sm:text-7xl">{formatKatalognummer(tier)}</span>
        <div className="min-w-0">
          <p className="font-display text-2xl font-bold leading-tight [font-stretch:112%]">{tier.bezeichnung}</p>
          <p className="mt-1 text-xl text-grau">
            {tier.geschlecht} {tier.alter}
            {tier.art !== "einzeltier" && `, ${MELDEART_LABEL[tier.art]}`}
            {tier.istJugend && ", Jugend"}
          </p>
          {tier.kaefig && tier.kaefig !== String(tier.katalogNr) && <p className="text-grau">Käfig {tier.kaefig}</p>}
          {tier.fehlt && <p className="mt-1 font-semibold text-kamm">Als fehlend gemeldet – keine Bewertung möglich.</p>}
        </div>
      </div>

      {geaendert && (
        <Hinweis ton="warnung">
          <p className="font-semibold">Diese Bewertung wurde inzwischen anderswo geändert. Speichern überschreibt die Änderung.</p>
          <p className="mt-1 text-sm">
            Jetzt gespeichert: {geaendert.punkte != null || geaendert.sondernote != null ? bewertungsText(geaendert, daten.skala) : "keine Note"}
            {geaendert.vorzuege && `; Vorzüge: ${geaendert.vorzuege}`}
            {geaendert.wuensche && `; Wünsche: ${geaendert.wuensche}`}
            {geaendert.maengel && `; Mängel: ${geaendert.maengel}`}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Knopf variante="primaer" className="min-h-11" onClick={() => uebernehmen(geaendert)}>Änderung übernehmen</Knopf>
            <Knopf className="min-h-11" onClick={() => setGeaendert(null)}>Meine Eingaben behalten</Knopf>
          </div>
        </Hinweis>
      )}

      <fieldset disabled={!offen}>
        <legend className="mb-2 text-lg font-semibold">Note</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {erlaubtePunkte(daten.skala).map((p) => (
            <PunktKnopf key={p} aktiv={wert.punkte === p} onClick={() => setWert({ punkte: p, sondernote: null })} text={bewertungsText({ punkte: p, sondernote: null }, daten.skala)} />
          ))}
          {SONDERNOTEN.map((s) => (
            <PunktKnopf key={s} aktiv={wert.sondernote === s} onClick={() => setWert({ punkte: null, sondernote: s })} text={bewertungsText({ punkte: null, sondernote: s })} klein={SONDERNOTE_LABEL[s].name} />
          ))}
        </div>
      </fieldset>

      {offen && gruppen.length > 1 && (
        <div>
          <p className="mb-1 text-lg font-semibold">Textbausteine zu</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Merkmal für die Textbausteine">
            {gruppen.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={g === gruppe}
                onClick={() => setGruppe(g)}
                className={`min-h-11 rounded-md border px-3 py-2 text-base ${g === gruppe ? "border-band bg-band text-auf-band" : "border-linie-stark bg-weiss text-tinte hover:border-band"}`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      )}

      {(["vorzuege", "wuensche", "maengel"] as const).map((feld) => {
        const kat = feld === "vorzuege" ? "vorzug" : feld === "wuensche" ? "wunsch" : "mangel";
        const label = feld === "vorzuege" ? "Vorzüge" : feld === "wuensche" ? "Wünsche" : "Mängel";
        const bausteine = passende.filter((b) => b.kategorie === kat && b.gruppe === gruppe);
        return (
          <div key={feld}>
            <label htmlFor={`f-${feld}`} className="mb-1 block text-lg font-semibold">{label}</label>
            <textarea
              id={`f-${feld}`}
              rows={2}
              disabled={!offen}
              value={texte[feld]}
              maxLength={MAX_TEXT}
              onChange={(e) => setTexte({ ...texte, [feld]: e.target.value })}
              className="w-full rounded-md border border-feldrand bg-weiss px-3 py-2 text-lg text-tinte hover:border-grau focus:border-band focus:outline-none focus:ring-2 focus:ring-band/25 disabled:bg-papier disabled:text-grau"
            />
            {texte[feld].length > MAX_TEXT - 100 && (
              <p className={`text-right text-sm ${texte[feld].length >= MAX_TEXT ? "font-semibold text-kamm" : "text-grau"}`}>
                {texte[feld].length} von {MAX_TEXT} Zeichen
              </p>
            )}
            {bausteine.length > 0 && offen && (
              <div className="mt-1 flex flex-wrap gap-2">
                {bausteine.map((b) => (
                  <button key={b.text} type="button" onClick={() => baustein(feld, b.text)} className="min-h-11 rounded-full border border-linie-stark bg-weiss px-4 py-2 text-base text-tinte hover:border-band">
                    {b.text}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {offen && (
        <div className="flex flex-wrap gap-3">
          <Knopf
            variante="primaer"
            gross
            className="flex-1"
            disabled={!gewaehlt}
            onClick={() => speichern({ katalogeintragId: tier.id, ...wert, ...texte })}
          >
            Speichern und nächstes Tier
          </Knopf>
          {(tier.punkte != null || tier.sondernote != null) && (
            <Knopf gross onClick={async () =>
                (await bestaetige({ titel: `Note von Nr. ${formatKatalognummer(tier)} zurücknehmen?`, text: "Note und Texte werden gelöscht.", knopf: "Zurücknehmen", gefahr: true })) &&
                zuruecknehmen(tier.id)
              }>
              Note zurücknehmen
            </Knopf>
          )}
        </div>
      )}
      {brauchtObmann(wert, daten.skala as NotenStufe[]) && !tier.obmannBestaetigt && <Hinweis ton="warnung">Diese Note muss der Obmann bestätigen.</Hinweis>}
      {wert.sondernote && <p className="-mt-2 text-sm text-grau">{SONDERNOTE_LABEL[wert.sondernote].hinweis}</p>}

      {tier.punkte != null && !tier.wartet && (
        <section className="rounded-xl border border-linie bg-weiss p-4">
          <h2 className="mb-2 font-sans text-lg font-semibold">Preise</h2>
          {!online ? (
            <p className="text-grau">Preise vergeben nur mit Verbindung.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {daten.preisarten
                // Bindung der Preisart (Jugend/Senioren, Sparte); ältere Daten ohne Angabe: alle anbieten.
                .filter((p) => !("preisartenErlaubt" in tier) || !tier.preisartenErlaubt || tier.preisartenErlaubt.includes(p.id) || tier.preise.some((x) => x.id === p.id))
                .map((p) => {
                const hat = tier.preise.some((x) => x.id === p.id);
                const k = daten.kontingent.find((x) => x.preisartId === p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={!offen}
                    onClick={() => preis(p.id, hat)}
                    className={`min-h-12 rounded-md border-2 px-4 font-semibold ${hat ? "border-band bg-band text-auf-band" : "border-linie-stark bg-weiss text-tinte hover:border-band"}`}
                  >
                    {p.kuerzel} <span className="font-normal">{hat ? "vergeben" : `(${k ? k.verfuegbar - k.vergeben : 0} frei)`}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function PunktKnopf({ aktiv, onClick, text, klein }: { aktiv: boolean; onClick: () => void; text: string; klein?: string }) {
  return (
    <button
      type="button"
      aria-pressed={aktiv}
      onClick={onClick}
      className={`nummer flex min-h-16 flex-col items-center justify-center rounded-lg border text-2xl ${aktiv ? "border-band bg-band text-auf-band" : "border-linie-stark bg-weiss text-tinte hover:border-band"}`}
    >
      {text}
      {klein && <span className="px-1 text-center font-sans text-xs leading-tight font-normal">{klein}</span>}
    </button>
  );
}

function ObmannAnsicht({ liste, skala, online, fertig }: { liste: Daten["obmannListe"]; skala: Daten["skala"]; online: boolean; fertig: () => void }) {
  const meldung = useMeldung();
  const bestaetigen = async (id: number) => {
    try {
      // Mit dem gesehenen Stand: eine inzwischen geänderte Note bestätigt der Obmann nicht ungesehen.
      await direkt.richter.obmannBestaetigen.mutate({ katalogeintragId: id, version: liste.find((t) => t.id === id)?.version ?? undefined });
      meldung("Bestätigt.");
      fertig();
    } catch (e) {
      meldung(fehlerText(e), "fehler");
    }
  };
  return (
    <main className="mx-auto w-full max-w-3xl overflow-y-auto p-6">
      <h2 className="mb-4 text-2xl font-semibold">Bewertungen bestätigen („vorzüglich“, u.M.)</h2>
      {!online && <Hinweis ton="warnung" className="mb-4">Bestätigen geht nur mit Verbindung.</Hinweis>}
      {liste.length === 0 && <Leer titel="Alles bestätigt" />}
      <ul className="flex flex-col gap-3">
        {liste.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-linie bg-weiss p-4">
            <span className="nummer text-4xl">{formatKatalognummer(t)}</span>
            <span className="min-w-0 flex-1">
              {t.bezeichnung}, {t.geschlecht} {t.alter}
              <span className="block font-semibold">{bewertungsText(t, skala)}</span>
              {t.vorzuege && <span className="block text-sm text-grau">{t.vorzuege}</span>}
            </span>
            <Knopf variante="primaer" className="min-h-11" disabled={!online} onClick={() => bestaetigen(t.id)}>Bestätigen</Knopf>
          </li>
        ))}
      </ul>
    </main>
  );
}
