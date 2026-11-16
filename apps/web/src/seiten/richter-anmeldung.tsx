/** Preisrichter-Tablet: Anmeldung mit Name und PIN, Hinweis auf noch nicht übertragene Bewertungen im Gerät. */
import { bewertungsText } from "@schau/domain";
import { del, get } from "idb-keyval";
import { useEffect, useState } from "react";
import { fehlerText } from "../lib";
import { trpc } from "../trpc";
import { Hinweis, Knopf, Laden, Leer, useFrage } from "../ui";
import { abgelehntSchluesselVon, ausgangSchluesselVon, fehlerCode, raeumeGeraetAuf, type Abgelehnt, type Ausgang } from "./richter-geraet";

/** Ohne HTTPS gibt es keinen Service Worker: das Tablet startet dann ohne Netz nicht neu. */
export function HttpsHinweis() {
  if (window.isSecureContext) return null;
  return (
    <div className="bg-stroh px-4 py-2 text-sm text-tinte">
      Ohne HTTPS lässt sich die Seite ohne Netz nicht neu öffnen. Bitte die Adresse mit https:// verwenden.
    </div>
  );
}

/** Länge der Tablet-PIN (die AL erzeugt sie unter „Preisrichter“). */
const PIN_LAENGE = 8;

export function RichterAnmeldung({ slug, andereSchau, fertig }: { slug: string; andereSchau: boolean; fertig: () => void }) {
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
