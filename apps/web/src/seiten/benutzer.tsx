import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { datum, datumZeit, fehlerText } from "../lib";
import { useOberflaeche } from "../sprache";
import { trpc } from "../trpc";
import { Auswahl, Eingabe, FehlerAnzeige, Feld, FormAbschnitt, Formular, Haken, Hinweis, Knopf, KnopfLink, Laden, Marke, ReiterLeiste, ReiterTafel, SCHMAL, Seitenkopf, TabellenRahmen, useMeldung, useReiter, useSeitentitel } from "../ui";
import { Angaben, PasswortNeu, Zugang, ZweiFaktorFremd } from "./benutzer-bearbeiten";
import { PasswortAendern, ZweiFaktor } from "./benutzer-eigener-zugang";
import { Initialen, Seite, StatusMarken, Zurueck } from "./benutzer-teile";

/** /benutzer – Administratoren sehen alle Benutzer, alle anderen ihren eigenen Zugang. */
export function Benutzer() {
  const status = trpc.auth.status.useQuery();
  if (!status.data) return <Laden />;
  const b = status.data.benutzer;
  if (b?.rolle !== "admin" || status.data.zweiFaktorPflicht) return <EigenerZugang name={b?.name ?? ""} email={b?.email ?? ""} pflicht={status.data.zweiFaktorPflicht} />;
  return <BenutzerListe />;
}

function BenutzerListe() {
  const o = useOberflaeche();
  const b0 = o.verein.benutzer;
  const t = b0.liste;
  const liste = trpc.auth.benutzerListe.useQuery();
  const navigate = useNavigate();
  const aktive = liste.data?.filter((b) => b.aktiv).length ?? 0;
  const ohne2fa = liste.data?.filter((b) => b.aktiv && !b.zweiFaktor).length ?? 0;
  const admins = liste.data?.filter((b) => b.rolle === "admin").length ?? 0;
  return (
    <Seite>
      <Seitenkopf
        titel={t.titel}
        unter={liste.data ? t.unter(liste.data.length, aktive) : undefined}
        hilfe="benutzer-verwalten"
        aktionen={<KnopfLink variante="primaer" href="/benutzer/neu" onClick={(e) => { e.preventDefault(); navigate("/benutzer/neu"); }}>{t.neu}</KnopfLink>}
      />
      {liste.data && ohne2fa > 0 && (
        <Hinweis ton="warnung">
          {t.ohne2fa(ohne2fa, aktive)}
        </Hinweis>
      )}
      {liste.error ? (
        <FehlerAnzeige fehler={liste.error} nochmal={() => liste.refetch()} />
      ) : !liste.data ? (
        <Laden />
      ) : (
        <TabellenRahmen
          fuss={
            <>
              <span>{t.anzahl(liste.data.length)}</span>
              <span>{t.rollen(admins, liste.data.length - admins)}</span>
            </>
          }
        >
          <table className="tabelle">
            <thead>
              <tr>
                <th>{t.spalteBenutzer}</th>
                <th className="hidden md:table-cell">{b0.rolleSpalte}</th>
                <th className="hidden lg:table-cell">{o.allgemein.status}</th>
                <th className="hidden xl:table-cell">{b0.zuletzt}</th>
              </tr>
            </thead>
            <tbody>
              {liste.data.map((b) => (
                <tr key={b.id} onClick={() => navigate(`/benutzer/${b.id}`)} className={`group cursor-pointer ${b.aktiv ? "" : "opacity-60"}`}>
                  <td className="align-middle">
                    <Link to={`/benutzer/${b.id}`} className="flex items-center gap-3 no-underline" onClick={(e) => e.stopPropagation()}>
                      <Initialen name={b.name} />
                      <span className="min-w-0">
                        <span className="block font-semibold text-tinte group-hover:text-band">{b.name}</span>
                        <span className="block break-words text-sm text-grau">{b.email}</span>
                      </span>
                    </Link>
                    <span className="mt-1.5 flex flex-wrap gap-1.5 pl-11 lg:hidden">
                      <span className="md:hidden">
                        <Marke ton={b.rolle === "admin" ? "info" : "neutral"}>{b0.rolle[b.rolle]}</Marke>
                      </span>
                      <StatusMarken b={b} />
                    </span>
                  </td>
                  <td className="hidden align-middle md:table-cell">
                    <Marke ton={b.rolle === "admin" ? "info" : "neutral"}>{b0.rolle[b.rolle]}</Marke>
                  </td>
                  <td className="hidden align-middle lg:table-cell">
                    <StatusMarken b={b} />
                  </td>
                  <td className="hidden align-middle text-sm text-grau xl:table-cell">
                    <span className="tabular-nums">{b.zuletzt ? datumZeit(b.zuletzt) : b0.nochNie}</span>
                    {b.geraete > 0 && t.geraete(b.geraete)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabellenRahmen>
      )}
    </Seite>
  );
}

/** /benutzer/neu */
export function BenutzerNeu() {
  const t = useOberflaeche().verein.benutzer.liste;
  const status = trpc.auth.status.useQuery();
  if (status.data && status.data.benutzer?.rolle !== "admin") return <Navigate to="/benutzer" replace />;
  return (
    <Seite>
      <div className="flex flex-col gap-2">
        <Zurueck />
        <Seitenkopf titel={t.neu} hilfe="neuen-benutzer-anlegen" />
      </div>
      <div className={SCHMAL}><NeuerBenutzer /></div>
    </Seite>
  );
}

/** Reiter der Seite eines Benutzers (im Anker der Adresse, z. B. …/benutzer/3#zwei-faktor). */
const BENUTZER_REITER = ["angaben", "zugang", "passwort", "zwei-faktor"] as const;

/** /benutzer/:id – eigene Seite je Benutzer. */
export function BenutzerSeite() {
  const t = useOberflaeche().verein.benutzer;
  const id = Number(useParams().benutzerId);
  const status = trpc.auth.status.useQuery();
  const ich = status.data?.benutzer;
  const istAdmin = ich?.rolle === "admin";
  const b = trpc.auth.benutzerGet.useQuery({ id }, { enabled: istAdmin && id > 0 });
  useSeitentitel(b.data?.name ?? t.liste.titel);
  const allgemein = useOberflaeche().allgemein;
  const [aktiv, waehlen] = useReiter(BENUTZER_REITER);
  if (!status.data) return <Laden />;
  if (!istAdmin) return <Navigate to="/benutzer" replace />;
  if (b.error) return <Seite><Zurueck /><FehlerAnzeige fehler={b.error} nochmal={() => b.refetch()} /></Seite>;
  if (!b.data) return <Laden />;
  const selbst = b.data.id === ich?.id;
  return (
    <Seite>
      <div className="flex flex-col gap-2">
        <Zurueck />
        <Seitenkopf
          titel={b.data.name}
          marke={
            <>
              {selbst && <Marke>{t.seite.sie}</Marke>}
              <StatusMarken b={b.data} />
            </>
          }
          unter={t.seite.unter(b.data.email, t.rolle[b.data.rolle], datum(b.data.angelegt))}
          hilfe="die-seite-eines-benutzers"
          hilfeText={t.seite.hilfe}
        />
      </div>
      <ReiterLeiste
        reiter={[
          { id: "angaben", label: t.angaben.titel },
          { id: "zugang", label: t.zugang },
          { id: "passwort", label: t.passwort },
          { id: "zwei-faktor", label: t.zweiFaktor },
        ]}
        aktiv={aktiv}
        waehlen={waehlen}
        label={allgemein.bereiche}
      />
      {/* Alle bleiben geladen (Ungespeichertes geht beim Wechsel nicht verloren), nur einer ist sichtbar. */}
      {(
        [
          ["angaben", <Angaben b={b.data} selbst={selbst} />],
          ["zugang", <Zugang b={b.data} selbst={selbst} />],
          ["passwort", selbst ? <PasswortAendern /> : <PasswortNeu b={b.data} />],
          ["zwei-faktor", selbst ? <ZweiFaktor /> : <ZweiFaktorFremd b={b.data} />],
        ] as const
      ).map(([r, inhalt]) => (
        <ReiterTafel key={r} id={r} aktiv={aktiv === r} waehlen={waehlen}>
          {inhalt}
        </ReiterTafel>
      ))}
    </Seite>
  );
}

function EigenerZugang({ name, email, pflicht }: { name: string; email: string; pflicht?: boolean }) {
  const t = useOberflaeche().verein.benutzer.eigener;
  useSeitentitel(t.titel);
  return (
    <Seite>
      <Seitenkopf
        titel={t.titel}
        unter={`${name} · ${email}`}
        // bleibt deutsch: Anker im Handbuch
        hilfe={pflicht ? "zwei-faktor-anmeldung-pflicht-für-administratoren" : "mein-zugang"}
        hilfeTeil={pflicht ? undefined : "helfer"}
      />
      {pflicht && <Hinweis ton="warnung">{t.pflicht}</Hinweis>}
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <PasswortAendern />
        <ZweiFaktor />
      </div>
    </Seite>
  );
}

function NeuerBenutzer() {
  const o = useOberflaeche();
  const b0 = o.verein.benutzer;
  const t = b0.neu;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [selbstVergeben, setSelbstVergeben] = useState(false);
  const [rolle, setRolle] = useState<"admin" | "mitarbeiter">("mitarbeiter");
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const navigate = useNavigate();
  const anlegen = trpc.auth.benutzerAnlegen.useMutation({
    onSuccess: async (r) => {
      await utils.auth.benutzerListe.invalidate();
      meldung(
        r.einladung
          ? t.angelegtEinladung(name)
          : t.angelegtWillkommen(name),
      );
      navigate(`/benutzer/${r.id}`);
    },
  });
  const senden = (e: FormEvent) => {
    e.preventDefault();
    anlegen.mutate({ name, email, rolle, ...(selbstVergeben ? { passwort } : {}) });
  };
  return (
    <form onSubmit={senden}>
      <Formular>
        <FormAbschnitt titel={t.person} spalten={1}>
          <Feld label={o.allgemein.name}>{(id) => <Eingabe id={id} value={name} onChange={(e) => setName(e.target.value)} required autoFocus />}</Feld>
          <Feld label={b0.email} hinweis={t.emailHinweis}>{(id) => <Eingabe id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}</Feld>
        </FormAbschnitt>
        <FormAbschnitt titel={b0.zugang} spalten={1}>
          <Feld label={b0.rolleSpalte}>
            {(id) => (
              <Auswahl id={id} value={rolle} onChange={(e) => setRolle(e.target.value as typeof rolle)}>
                <option value="mitarbeiter">{t.rolleMitarbeiter(b0.rolle.mitarbeiter)}</option>
                <option value="admin">{t.rolleAdmin(b0.rolle.admin)}</option>
              </Auswahl>
            )}
          </Feld>
          <Haken label={t.selbstVergeben} checked={selbstVergeben} onChange={setSelbstVergeben} hinweis={t.selbstVergebenHinweis} />
          {selbstVergeben && (
            <Feld label={t.erstesPasswort} hinweis={b0.mindestens10}>
              {(id) => <Eingabe id={id} type="text" value={passwort} onChange={(e) => setPasswort(e.target.value)} required minLength={10} autoComplete="off" />}
            </Feld>
          )}
        </FormAbschnitt>
        <div className="flex flex-wrap items-center justify-end gap-3 bg-papier/60 px-5 py-3">
          {anlegen.error && <p role="alert" className="mr-auto text-sm font-semibold text-kamm">{fehlerText(anlegen.error)}</p>}
          <Knopf type="submit" variante="primaer" laedt={anlegen.isPending}>{selbstVergeben ? t.anlegen : t.anlegenEinladen}</Knopf>
        </div>
      </Formular>
    </form>
  );
}
