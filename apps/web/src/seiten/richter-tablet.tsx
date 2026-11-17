/** Preisrichter-Tablet nach der Anmeldung: Tierliste, Ausgang und Abgleich mit dem Server, abgelehnte Bewertungen. */
import { bewertungsText, PHASEN, serverText } from "@schau/domain";
import { del, get, set, update } from "idb-keyval";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AbmeldeHinweis, useAutoAbmeldung } from "../abmeldung";
import { fehlerText, formatKatalognummer } from "../lib";
import { useOberflaeche, useSprache } from "../sprache";
import { ot } from "../sprache-jetzt";
import { direkt } from "../trpc";
import { Knopf, knopfKlasse, Laden, Leer, useFrage, useMeldung } from "../ui";
import { LesemodusTablet } from "../komponenten/lesemodus";
import { HttpsHinweis } from "./richter-anmeldung";
import {
  abgelehntSchluesselVon,
  ausgangSchluesselVon,
  datenSchluessel,
  fehlerCode,
  gleicherEintrag,
  MAX_TEXT,
  merkeZuletzt,
  textZuLang,
  type Abgelehnt,
  type Ausgang,
  type Daten,
  type Eingabe,
  type Ergebnis,
  type Richter,
} from "./richter-geraet";
import { Karte } from "./richter-karte";
import { ObmannAnsicht } from "./richter-obmann";

export function Tablet({ slug, richter, abmeldung }: { slug: string; richter: Richter; abmeldung: number | null }) {
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
  const o = useOberflaeche();
  const tt = o.tablet.liste;
  const sprache = useSprache();
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
      const ergebnisse: [Ausgang, Ergebnis][] = zuLang.map((a) => [a, { katalogeintragId: a.katalogeintragId, status: "fehler", meldung: textZuLang() }]);
      const rest = offen.filter((a) => !zuLang.includes(a));
      if (rest.length) ergebnisse.push(...(await senden(rest)));

      // Abgelehntes zuerst sichern, dann aus dem Ausgang nehmen: lieber doppelt als verloren.
      // Abgelehnt oder inzwischen anderswo geändert: nicht still verwerfen, sondern sichtbar zur Entscheidung.
      // Vorübergehend gestört: im Ausgang lassen, später erneut senden.
      const spaeter = ergebnisse.filter(([, x]) => x.status === "spaeter").map(([a]) => a);
      if (spaeter.length) setServerFehler(ot().tablet.liste.serverGestoert);
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
  const eingabeVerwerfen = async () =>
    !ungespeichert.current || (await bestaetige({ titel: tt.verwerfenTitel, text: tt.verwerfenText, knopf: tt.verwerfenKnopf, gefahr: true }));
  const waehle = async (id: number) => {
    if (id === auswahl) return;
    if (!(await eingabeVerwerfen())) return;
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
      return meldung(tt.speichernFehlgeschlagen(fehlerText(e)), "fehler");
    }
    const naechstes = tiere.slice(idx + 1).find((x) => x.punkte == null && x.sondernote == null && !x.fehlt) ?? tiere[idx + 1];
    ungespeichert.current = false;
    if (naechstes) setAuswahl(naechstes.id);
    abgleichen();
  };

  /** Nimmt die Note zurück: Wartendes fliegt aus dem Ausgang, Übertragenes wird am Server gelöscht. */
  const zuruecknehmen = async (id: number) => {
    // Sonst könnte ein gerade gesendeter Eintrag die Rücknahme gleich wieder überschreiben.
    if (laeuft.current) return meldung(tt.uebertraegtGerade, "fehler");
    const aufServer = daten?.tiere.find((t) => t.id === id);
    const amServer = aufServer != null && (aufServer.punkte != null || aufServer.sondernote != null);
    if (amServer && !online) return meldung(tt.zuruecknehmenOffline, "fehler");
    // Während der Rücknahme keinen Abgleich starten: er könnte einen wartenden Eintrag desselben Tiers neu anlegen.
    laeuft.current = true;
    try {
      await aendereAusgang((alt) => alt.filter((a) => !(meins(a) && a.katalogeintragId === id)));
      // Mit dem bekannten Stand: hat die Ausstellungsleitung inzwischen korrigiert, kommt ein Konflikt statt stillem Löschen.
      if (amServer) await direkt.richter.zuruecksetzen.mutate({ katalogeintragId: id, basisVersion: aufServer!.version });
      if (amServer) await laden();
      meldung(tt.zurueckgenommen);
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
      meldung(tt.neuereWartet(a.nr ?? "?"), "fehler");
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
        titel: tt.loeschenTitel(a.nr ?? "?"),
        text: tt.loeschenText,
        knopf: o.tablet.endgueltigLoeschen,
        gefahr: true,
      }))
    )
      return;
    await aendereAbgelehnt((alt) => alt.filter((x) => !gleicherEintrag(x, a)));
  };

  const abmelden = async () => {
    if (eigeneWartend.length) {
      return meldung(tt.nochWartend(eigeneWartend.length), "fehler");
    }
    if (
      eigeneAbgelehnt.length &&
      !(await bestaetige({ titel: tt.trotzdemAbmelden, text: tt.abmeldenText, knopf: tt.abmelden }))
    )
      return;
    try {
      await direkt.richter.abmelden.mutate();
    } catch {
      return meldung(tt.abmeldenOffline, "fehler");
    }
    merkeZuletzt(slug, null);
    await del(schluessel).catch(() => {});
    location.reload();
  };

  if (!daten) return <Laden />;
  document.title = tt.seitentitel(daten.schau.name);
  const tier = tiere.find((t) => t.id === auswahl);
  const fertig = tiere.filter((t) => t.punkte != null || t.sondernote != null).length;
  const fremdeNamen = [...new Set(fremdeWartend.map((a) => a.preisrichterName ?? tt.andererRichter))];
  const n = eigeneWartend.length;

  return (
    <div className="flex h-dvh flex-col bg-papier">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-linie bg-weiss px-4 py-2.5 text-tinte">
        <span className="font-display text-lg font-semibold [font-stretch:112%]">{daten.schau.name}</span>
        <span className="text-grau">{tt.fortschritt(richter.name, fertig, tiere.length)}</span>
        <span className="ml-auto flex items-center gap-2 text-sm" role="status">
          <span className={`size-2.5 rounded-full ${!online ? "bg-kamm" : n ? "bg-stroh-dunkel" : "bg-stall"}`} />
          {!online ? tt.ohneVerbindung(n) : sendet ? tt.uebertraegt : n ? tt.warten(n) : eigeneAbgelehnt.length ? "" : tt.allesUebertragen}
          {eigeneAbgelehnt.length > 0 && ` · ${tt.nichtUebernommenZahl(eigeneAbgelehnt.length)}`}
        </span>
        {(daten.obmannListe.length > 0 || ansicht === "obmann") && (
          <button
            type="button"
            onClick={async () => {
              if (!(await eingabeVerwerfen())) return;
              ungespeichert.current = false;
              setAnsicht(ansicht === "obmann" ? "bewerten" : "obmann");
            }}
            className={knopfKlasse("primaer", false, "min-h-11 text-sm")}
          >
            {ansicht === "obmann" ? tt.zurueckZumBewerten : tt.obmann(daten.obmannListe.length)}
          </button>
        )}
        <a href="/hilfe/preisrichter" target="_blank" rel="noreferrer" className={knopfKlasse("zweit", false, "min-h-11 text-sm")}>{o.allgemein.hilfe}</a>
        <button type="button" onClick={abmelden} className={knopfKlasse("zweit", false, "min-h-11 text-sm")}>{tt.abmelden}</button>
      </header>
      <HttpsHinweis />
      <LesemodusTablet />
      <AbmeldeHinweis rest={restAbmeldung} />
      {serverFehler && (
        <div className="bg-kamm-hell px-4 py-2 text-kamm" role="alert">
          {tt.gescheitert(serverFehler)}
        </div>
      )}
      {abgelaufen && (
        <div className="flex flex-wrap items-center gap-x-2 bg-kamm-hell px-4 py-1 text-kamm" role="alert">
          {tt.abgelaufen}
          <button type="button" className="inline-flex min-h-11 items-center px-2 font-semibold underline" onClick={() => location.reload()}>{tt.neuAnmelden}</button>
        </div>
      )}
      {!daten.schau.offen && (
        <div className="flex flex-wrap items-center justify-center gap-x-2 bg-stroh px-4 py-1 text-center font-semibold text-tinte">
          {daten.schau.freigegeben
            ? tt.freigegeben
            : PHASEN.indexOf(daten.schau.phase) > PHASEN.indexOf("preise")
              ? tt.abgeschlossen(o.fach.PHASEN_LABEL[daten.schau.phase])
              : tt.nochNichtOffen(o.fach.PHASEN_LABEL[daten.schau.phase])}
          <button type="button" className="inline-flex min-h-11 items-center px-2 underline" onClick={() => laden()}>{tt.neuLaden}</button>
        </div>
      )}
      {dauerhaft === false && (
        <div className="bg-stroh px-4 py-2 text-sm text-tinte">
          {tt.nichtDauerhaft}
        </div>
      )}
      {fremdeWartend.length > 0 && (
        <div className="bg-stroh px-4 py-2 text-tinte">
          {tt.fremdeWartend(fremdeWartend.length, fremdeNamen.join(", "), fremdeNamen.join(tt.namenOder))}
        </div>
      )}
      {eigeneAbgelehnt.length > 0 && (
        <details open className="max-h-[40vh] shrink-0 overflow-y-auto bg-kamm-hell px-4 py-2 text-kamm">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">
            {tt.abgelehnt(eigeneAbgelehnt.length)} {eigeneAbgelehnt.some((a) => a.konflikt) ? tt.konflikt : o.tablet.nachtragen}
          </summary>
          <ul className="flex flex-col gap-2 pb-2">
            {eigeneAbgelehnt.map((a) => (
              <li key={`${a.katalogeintragId}-${a.geraetZeit}`} className="flex flex-wrap items-center gap-3 rounded-md border border-kamm/30 bg-weiss p-3 text-tinte">
                <span className="nummer text-2xl">{a.nr ?? "?"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{bewertungsText(a, daten.skala)}</span>
                  {a.vorzuege && <span className="block text-sm">{o.tablet.vorzuege(a.vorzuege)}</span>}
                  {a.wuensche && <span className="block text-sm">{o.tablet.wuensche(a.wuensche)}</span>}
                  {a.maengel && <span className="block text-sm">{o.tablet.maengel(a.maengel)}</span>}
                  <span className="block text-sm font-semibold text-kamm">{serverText(a.meldung, sprache)}</span>
                  {a.konflikt &&
                    (() => {
                      const jetzt = daten.tiere.find((x) => x.id === a.katalogeintragId);
                      if (!jetzt) return null;
                      return (
                        <span className="mt-1 block rounded bg-papier px-2 py-1 text-sm">
                          {tt.jetztGespeichert} <b>{jetzt.punkte != null || jetzt.sondernote != null ? bewertungsText(jetzt, daten.skala) : o.tablet.keineNote}</b>
                          {tt.jetztTexte(jetzt.vorzuege, jetzt.wuensche, jetzt.maengel)}
                          <span className="block text-grau">{tt.ersetzt}</span>
                        </span>
                      );
                    })()}
                </span>
                <Knopf className="min-h-11" onClick={() => erneutSenden(a)}>{a.konflikt ? tt.trotzdemSenden : tt.erneutSenden}</Knopf>
                <Knopf className="min-h-11" onClick={() => verwerfen(a)}>{tt.verwerfen}</Knopf>
              </li>
            ))}
          </ul>
        </details>
      )}
      {ansicht === "obmann" ? (
        <ObmannAnsicht liste={daten.obmannListe} skala={daten.skala} online={online} fertig={() => laden()} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav aria-label={tt.meineTiere} className="max-h-36 w-full shrink-0 overflow-y-auto border-b border-linie bg-weiss sm:max-h-none sm:w-60 sm:border-r sm:border-b-0">
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
                        <span className="text-grau">{t.geschlecht} {o.tablet.alter[t.alter]}</span>
                      </span>
                      <span className="w-12 shrink-0 text-right text-sm font-semibold">
                        {t.fehlt ? <span className="text-grau">{tt.fehlt}</span> : bewertet ? <span className={t.wartet ? "text-stroh-dunkel" : "text-stall"}>{bewertungsText(t, daten.skala).split(" ")[0]}</span> : ""}
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
              <Leer titel={tt.keineTiere} />
            )}
          </main>
        </div>
      )}
    </div>
  );
}
