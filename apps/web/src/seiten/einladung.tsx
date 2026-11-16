import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { fehlerText } from "../lib";
import { useOberflaeche } from "../sprache";
import { trpc } from "../trpc";
import { Eingabe, Feld, HilfeLink, Hinweis, Knopf, Laden, useSeitentitel } from "../ui";

/**
 * /einladung#<token> – die eingeladene Person legt ihr Passwort selbst fest. Der Schlüssel steht hinter "#": Er geht
 * nie als Adresse an den Server (nur im Inhalt einer POST-Anfrage) und wird gleich aus der Adresszeile entfernt.
 */
export function Einladung() {
  const t = useOberflaeche().rahmen.einladung;
  useSeitentitel(t.titel);
  const [token] = useState(() => window.location.hash.slice(1));
  const [passwort, setPasswort] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [hinweis, setHinweis] = useState("");
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const status = trpc.auth.status.useQuery();
  const pruefen = trpc.auth.einladungPruefen.useMutation();
  const annehmen = trpc.auth.einladungAnnehmen.useMutation({
    onSuccess: async () => {
      await utils.auth.status.invalidate();
      navigate("/", { replace: true });
    },
  });

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, "", "/einladung");
    if (token) pruefen.mutate({ token });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const senden = (e: FormEvent) => {
    e.preventDefault();
    if (passwort !== wiederholung) {
      setHinweis(t.ungleich);
      return;
    }
    setHinweis("");
    annehmen.mutate({ token, passwort });
  };

  const angemeldetAls = status.data?.benutzer;
  const daten = pruefen.data;

  return (
    <div className="flex min-h-screen items-center justify-center bg-papier px-4 py-10">
      <div className="flex w-full max-w-md flex-col gap-4">
        <div className="rounded-xl border border-linie bg-weiss p-6 shadow-[0_1px_2px_rgb(16_20_28/0.04)] sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <img src="/icon.svg" alt="" className="size-10" />
            <div>
              <h1 className="text-[1.45rem] font-bold leading-tight">{t.titel}</h1>
              <p className="text-sm text-grau">{daten?.verein || status.data?.appName || "SchauFUCHS"}</p>
            </div>
          </div>
          {!token ? (
            <Hinweis ton="fehler">{t.unvollstaendig}</Hinweis>
          ) : pruefen.error ? (
            <Hinweis ton="fehler">{fehlerText(pruefen.error)}</Hinweis>
          ) : !daten ? (
            <Laden />
          ) : (
            <form onSubmit={senden} className="flex flex-col gap-4">
              <div>
                <p>{t.gutenTag(daten.name)}</p>
                <p className="mt-1 text-sm text-grau">
                  {t.anmeldungMit} <span className="font-semibold text-tinte">{daten.email}</span>
                </p>
              </div>
              {angemeldetAls && angemeldetAls.email !== daten.email && (
                <Hinweis ton="warnung">
                  {t.wechsel(angemeldetAls.name, daten.name)}
                </Hinweis>
              )}
              <input type="email" value={daten.email} autoComplete="username" readOnly hidden />
              <Feld label={t.neuesPasswort} hinweis={t.mindestens10}>
                {(id) => <Eingabe id={id} type="password" value={passwort} onChange={(e) => setPasswort(e.target.value)} required minLength={10} autoFocus autoComplete="new-password" />}
              </Feld>
              <Feld label={t.wiederholen}>
                {(id) => <Eingabe id={id} type="password" value={wiederholung} onChange={(e) => setWiederholung(e.target.value)} required minLength={10} autoComplete="new-password" />}
              </Feld>
              {(hinweis || annehmen.error) && <Hinweis ton="fehler">{hinweis || fehlerText(annehmen.error!)}</Hinweis>}
              <Knopf type="submit" variante="primaer" gross className="mt-1" laedt={annehmen.isPending}>
                {t.festlegen}
              </Knopf>
            </form>
          )}
        </div>
        <p className="text-center">
          <HilfeLink teil="helfer" abschnitt="die-einladungsmail">
            {t.hilfe}
          </HilfeLink>
        </p>
      </div>
    </div>
  );
}
