import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { trpc } from "../trpc";
import { Hinweis, Laden, LESEBREITE, useSeitentitel } from "../ui";

/**
 * /hilfe/:teil – die Handbücher in der Anwendung. Quelle: docs/handbuch/*.md, daraus erzeugt scripts/handbuch.sh die
 * Seiten unter public/hilfe (HTML, Bilder, PDF). Ohne Anmeldung lesbar (auch vor dem ersten Anmelden und am Tablet) und
 * mit der App zwischengespeichert, damit sie in der Halle auch ohne Netz geht.
 */
const TEILE = [
  { key: "ausstellungsleitung", titel: "Ausstellungsleitung" },
  { key: "helfer", titel: "Helfer" },
  { key: "preisrichter", titel: "Preisrichter" },
] as const;
type Teil = (typeof TEILE)[number]["key"];

/** Ruhige Knöpfe im dunklen Kopf: ohne Rahmen, hell beim Darüberfahren. */
const KOPF_KNOPF = "rounded-md px-2.5 py-1.5 text-auf-kopf/80 hover:bg-auf-kopf/8 hover:text-auf-kopf disabled:opacity-50";

export function Hilfe() {
  const { teil } = useParams();
  const navigate = useNavigate();
  const status = trpc.auth.status.useQuery(undefined, { retry: false });
  const aktiv = TEILE.find((t) => t.key === teil);
  useSeitentitel(aktiv ? `Hilfe – ${aktiv.titel}` : "Hilfe");
  const [html, setHtml] = useState<string | null>(null);
  const [fehler, setFehler] = useState(false);
  // In einem eigenen Tab geöffnet (Link mit target=_blank): Verlauf beginnt hier. Gemerkt je Tab, damit es auch nach
  // dem Wechsel der Reiter gilt.
  const [eigenerTab] = useState(() => {
    try {
      if (window.history.length <= 1) sessionStorage.setItem("hilfe-eigener-tab", "1");
      return sessionStorage.getItem("hilfe-eigener-tab") === "1";
    } catch {
      return window.history.length <= 1;
    }
  });

  useEffect(() => {
    if (!aktiv) return;
    let aus = false;
    setHtml(null);
    setFehler(false);
    // Eigener Pfad: unter /hilfe/<teil>.html würde der Service Worker die Seite /hilfe/<teil> mit der Rohdatei beantworten.
    fetch(`/hilfe-inhalt/${aktiv.key}.html`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      // Das Handbuch nennt eine Beispieladresse; in der Hilfe steht die Adresse dieser Installation.
      .then((t) => !aus && setHtml(t.replaceAll("https://schau.ihr-verein.de", window.location.origin)))
      .catch(() => !aus && setFehler(true));
    return () => {
      aus = true;
    };
  }, [aktiv]);

  // Link mit Abschnitt (z. B. /hilfe/ausstellungsleitung#hallenplan aus dem Hallenplan): nach dem Laden dorthin springen.
  useEffect(() => {
    if (!html || !window.location.hash) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    // Der Browser setzt die Scrollposition nach dem Laden selbst noch zurück (Sprung zum Anker vor dem Inhalt) –
    // deshalb nach dem Zeichnen und noch einmal kurz danach springen.
    const springen = () => document.getElementById(id)?.scrollIntoView({ block: "start" });
    const rahmen = requestAnimationFrame(springen);
    const spaeter = window.setTimeout(springen, 250);
    return () => {
      cancelAnimationFrame(rahmen);
      window.clearTimeout(spaeter);
    };
  }, [html]);

  // Inhaltsverzeichnis aus den Hauptabschnitten des Handbuchs.
  const inhalt = useMemo(() => {
    if (!html) return [];
    const doc = new DOMParser().parseFromString(html, "text/html");
    // Das Inhaltsverzeichnis im Text selbst (für das PDF) nicht doppelt aufführen.
    return [...doc.querySelectorAll("h2[id]")].map((h) => ({ id: h.id, text: h.textContent ?? "" })).filter((h) => h.text.trim() !== "Inhalt");
  }, [html]);

  if (!teil) {
    if (status.isLoading) return <Laden />;
    const d = status.data;
    const standard: Teil = d?.richter ? "preisrichter" : d?.benutzer?.rolle === "admin" || d?.zweiFaktorPflicht ? "ausstellungsleitung" : "helfer";
    return <Navigate to={`/hilfe/${standard}`} replace />;
  }
  if (!aktiv) return <Navigate to="/hilfe" replace />;

  const zurueck = status.data?.richter ? `/richter/${status.data.richter.slug}` : status.data?.benutzer ? "/" : "/anmelden";
  return (
    <div className="handbuch-seite min-h-screen bg-papier">
      <header className="nicht-drucken bg-kopf text-auf-kopf">
        <div className="flex w-full flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2 lg:px-6">
          <Link to={zurueck} className="flex items-center gap-2 font-semibold text-auf-kopf no-underline">
            <img src="/icon.svg" alt="" className="size-6" />
            Hilfe
          </Link>
          <nav aria-label="Handbücher" className="flex flex-wrap gap-0.5 text-sm sm:border-l sm:border-auf-kopf/15 sm:pl-4">
            {TEILE.map((t) => (
              <Link
                key={t.key}
                to={`/hilfe/${t.key}`}
                aria-current={t.key === aktiv.key ? "page" : undefined}
                className={`rounded-md px-2.5 py-1.5 no-underline ${t.key === aktiv.key ? "bg-auf-kopf/12 font-semibold text-auf-kopf" : "text-auf-kopf/70 hover:bg-auf-kopf/8 hover:text-auf-kopf"}`}
              >
                {t.titel}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-0.5 text-sm">
            <button type="button" disabled={html == null} className={KOPF_KNOPF} onClick={() => window.print()}>
              Drucken
            </button>
            <a href={`/hilfe/${aktiv.key}.pdf`} target="_blank" rel="noreferrer" className={`${KOPF_KNOPF} no-underline`}>
              Als PDF
            </a>
            {/* Die Hilfe öffnet in einem eigenen Tab: dann schließt „Schließen“ ihn, sonst geht es zurück. */}
            <button
              type="button"
              className={`${KOPF_KNOPF} ml-1 border border-auf-kopf/20`}
              onClick={() => {
                if (eigenerTab) {
                  window.close();
                  // Lässt der Browser das Schließen nicht zu, zur Anwendung.
                  window.setTimeout(() => navigate(zurueck), 150);
                } else navigate(-1);
              }}
            >
              {eigenerTab ? "Schließen" : "Zurück"}
            </button>
          </div>
        </div>
      </header>
      <div className="nicht-drucken border-b border-linie bg-weiss">
        <div className={`${LESEBREITE} flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm`}>
          <span className="text-grau">Handbücher zum Ausdrucken</span>
          {TEILE.map((t) => (
            <a key={t.key} href={`/hilfe/${t.key}.pdf`} download={`Handbuch ${t.titel}.pdf`} className="font-semibold text-band no-underline hover:underline">
              {t.titel} (PDF)
            </a>
          ))}
        </div>
      </div>
      <div className={`${LESEBREITE} flex gap-8 py-8`}>
        {inhalt.length > 2 && (
          <aside className="nicht-drucken sticky top-6 hidden max-h-[85vh] w-64 shrink-0 self-start overflow-y-auto lg:block">
            <p className="mb-2 text-sm font-semibold text-grau">Inhalt</p>
            <ul className="flex flex-col gap-1 text-sm">
              {inhalt.map((h) => (
                <li key={h.id}>
                  <a
                    href={`#${h.id}`}
                    className="text-grau no-underline hover:text-tinte hover:underline"
                    onClick={(e) => {
                      // Ohne neuen Verlaufseintrag springen: „Zurück“ führt dann zur Anwendung, nicht durch die Abschnitte.
                      e.preventDefault();
                      document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                      window.history.replaceState(window.history.state, "", `#${h.id}`);
                    }}
                  >
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </aside>
        )}
        <main id="inhalt" className="min-w-0 flex-1">
          {fehler ? (
            <Hinweis ton="fehler">Das Handbuch ließ sich nicht laden. Ohne Netz nur, wenn es vorher online geöffnet war.</Hinweis>
          ) : html == null ? (
            <Laden />
          ) : (
            // Inhalt stammt aus dem eigenen Build (docs/handbuch → scripts/handbuch.sh), nicht aus Eingaben.
            <article className="handbuch rounded-xl border border-linie bg-weiss px-5 py-8 shadow-[0_1px_2px_rgb(16_20_28/0.04)] sm:px-10" dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </main>
      </div>
    </div>
  );
}
