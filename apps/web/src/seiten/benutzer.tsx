import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { datum, datumZeit, fehlerText } from "../lib";
import { trpc } from "../trpc";
import { Auswahl, Eingabe, FehlerAnzeige, Feld, FormAbschnitt, Formular, Haken, Hinweis, Knopf, KnopfLink, Laden, Marke, SCHMAL, Seitenkopf, TabellenRahmen, useMeldung, useSeitentitel } from "../ui";
import { Angaben, PasswortNeu, Zugang, ZweiFaktorFremd } from "./benutzer-bearbeiten";
import { PasswortAendern, ZweiFaktor } from "./benutzer-eigener-zugang";
import { Initialen, ROLLE, Seite, StatusMarken, Zurueck } from "./benutzer-teile";

/** /benutzer – Administratoren sehen alle Benutzer, alle anderen ihren eigenen Zugang. */
export function Benutzer() {
  const status = trpc.auth.status.useQuery();
  if (!status.data) return <Laden />;
  const b = status.data.benutzer;
  if (b?.rolle !== "admin" || status.data.zweiFaktorPflicht) return <EigenerZugang name={b?.name ?? ""} email={b?.email ?? ""} pflicht={status.data.zweiFaktorPflicht} />;
  return <BenutzerListe />;
}

function BenutzerListe() {
  const liste = trpc.auth.benutzerListe.useQuery();
  const navigate = useNavigate();
  const aktive = liste.data?.filter((b) => b.aktiv).length ?? 0;
  const ohne2fa = liste.data?.filter((b) => b.aktiv && !b.zweiFaktor).length ?? 0;
  const admins = liste.data?.filter((b) => b.rolle === "admin").length ?? 0;
  return (
    <Seite>
      <Seitenkopf
        titel="Benutzer"
        unter={liste.data ? `${liste.data.length} Benutzer, ${aktive} aktiv` : undefined}
        hilfe="benutzer-verwalten"
        aktionen={<KnopfLink variante="primaer" href="/benutzer/neu" onClick={(e) => { e.preventDefault(); navigate("/benutzer/neu"); }}>Neuer Benutzer</KnopfLink>}
      />
      {liste.data && ohne2fa > 0 && (
        <Hinweis ton="warnung">
          {ohne2fa} von {aktive} aktiven Benutzern ohne Zwei-Faktor-Anmeldung.
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
              <span>{liste.data.length} Benutzer</span>
              <span>
                {admins} {admins === 1 ? "Administrator" : "Administratoren"}, {liste.data.length - admins} Mitarbeiter
              </span>
            </>
          }
        >
          <table className="tabelle">
            <thead>
              <tr>
                <th>Benutzer</th>
                <th className="hidden md:table-cell">Rolle</th>
                <th className="hidden lg:table-cell">Status</th>
                <th className="hidden xl:table-cell">Zuletzt angemeldet</th>
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
                        <Marke ton={b.rolle === "admin" ? "info" : "neutral"}>{ROLLE[b.rolle]}</Marke>
                      </span>
                      <StatusMarken b={b} />
                    </span>
                  </td>
                  <td className="hidden align-middle md:table-cell">
                    <Marke ton={b.rolle === "admin" ? "info" : "neutral"}>{ROLLE[b.rolle]}</Marke>
                  </td>
                  <td className="hidden align-middle lg:table-cell">
                    <StatusMarken b={b} />
                  </td>
                  <td className="hidden align-middle text-sm text-grau xl:table-cell">
                    <span className="tabular-nums">{b.zuletzt ? datumZeit(b.zuletzt) : "noch nie"}</span>
                    {b.geraete > 0 && ` · ${b.geraete} Gerät${b.geraete === 1 ? "" : "e"}`}
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
  const status = trpc.auth.status.useQuery();
  if (status.data && status.data.benutzer?.rolle !== "admin") return <Navigate to="/benutzer" replace />;
  return (
    <Seite>
      <div className="flex flex-col gap-2">
        <Zurueck />
        <Seitenkopf titel="Neuer Benutzer" hilfe="neuen-benutzer-anlegen" />
      </div>
      <div className={SCHMAL}><NeuerBenutzer /></div>
    </Seite>
  );
}

/** /benutzer/:id – eigene Seite je Benutzer. */
export function BenutzerSeite() {
  const id = Number(useParams().benutzerId);
  const status = trpc.auth.status.useQuery();
  const ich = status.data?.benutzer;
  const istAdmin = ich?.rolle === "admin";
  const b = trpc.auth.benutzerGet.useQuery({ id }, { enabled: istAdmin && id > 0 });
  useSeitentitel(b.data?.name ?? "Benutzer");
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
              {selbst && <Marke>Sie</Marke>}
              <StatusMarken b={b.data} />
            </>
          }
          unter={`${b.data.email} · ${ROLLE[b.data.rolle]} · angelegt am ${datum(b.data.angelegt)}`}
          hilfe="die-seite-eines-benutzers"
          hilfeText="Hilfe zur Benutzerseite"
        />
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Angaben b={b.data} selbst={selbst} />
        <Zugang b={b.data} selbst={selbst} />
        {selbst ? <PasswortAendern /> : <PasswortNeu b={b.data} />}
        {selbst ? <ZweiFaktor /> : <ZweiFaktorFremd b={b.data} />}
      </div>
    </Seite>
  );
}

function EigenerZugang({ name, email, pflicht }: { name: string; email: string; pflicht?: boolean }) {
  useSeitentitel("Mein Zugang");
  return (
    <Seite>
      <Seitenkopf
        titel="Mein Zugang"
        unter={`${name} · ${email}`}
        hilfe={pflicht ? "zwei-faktor-anmeldung-pflicht-für-administratoren" : "mein-zugang"}
        hilfeTeil={pflicht ? undefined : "helfer"}
      />
      {pflicht && <Hinweis ton="warnung">Für Administratoren ist die Zwei-Faktor-Anmeldung Pflicht – erst danach stehen alle Verwaltungsfunktionen zur Verfügung.</Hinweis>}
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <PasswortAendern />
        <ZweiFaktor />
      </div>
    </Seite>
  );
}

function NeuerBenutzer() {
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
          ? `${name} angelegt. Die Einladung mit dem Link zum Festlegen des Passworts ist unterwegs.`
          : `${name} angelegt. Eine Willkommensmail ohne Passwort ist unterwegs – das Passwort bitte persönlich weitergeben.`,
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
        <FormAbschnitt titel="Person" spalten={1}>
          <Feld label="Name">{(id) => <Eingabe id={id} value={name} onChange={(e) => setName(e.target.value)} required autoFocus />}</Feld>
          <Feld label="E-Mail-Adresse" hinweis="Zum Anmelden">{(id) => <Eingabe id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}</Feld>
        </FormAbschnitt>
        <FormAbschnitt titel="Zugang" spalten={1}>
          <Feld label="Rolle">
            {(id) => (
              <Auswahl id={id} value={rolle} onChange={(e) => setRolle(e.target.value as typeof rolle)}>
                <option value="mitarbeiter">{ROLLE.mitarbeiter} – Meldestelle, Kasse, Halle</option>
                <option value="admin">{ROLLE.admin} – alles, auch Einstellungen und Benutzer</option>
              </Auswahl>
            )}
          </Feld>
          <Haken label="Passwort selbst vergeben statt Einladungslink" checked={selbstVergeben} onChange={setSelbstVergeben} hinweis="Nur ohne E-Mail-Empfang" />
          {selbstVergeben && (
            <Feld label="Erstes Passwort" hinweis="Mindestens 10 Zeichen">
              {(id) => <Eingabe id={id} type="text" value={passwort} onChange={(e) => setPasswort(e.target.value)} required minLength={10} autoComplete="off" />}
            </Feld>
          )}
        </FormAbschnitt>
        <div className="flex flex-wrap items-center justify-end gap-3 bg-papier/60 px-5 py-3">
          {anlegen.error && <p role="alert" className="mr-auto text-sm font-semibold text-kamm">{fehlerText(anlegen.error)}</p>}
          <Knopf type="submit" variante="primaer" laedt={anlegen.isPending}>{selbstVergeben ? "Benutzer anlegen" : "Benutzer anlegen und einladen"}</Knopf>
        </div>
      </Formular>
    </form>
  );
}
