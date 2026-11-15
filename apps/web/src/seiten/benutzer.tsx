import QRCode from "qrcode";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { datum, datumZeit, fehlerText } from "../lib";
import { trpc, type Ausgabe } from "../trpc";
import { Abschnitt, Auswahl, Eingabe, FehlerAnzeige, Feld, FormAbschnitt, Formular, Haken, Hinweis, Knopf, KnopfLink, Laden, Marke, SCHMAL, SEITE, Seitenkopf, Speicherleiste, TabellenRahmen, useFrage, useMeldung, useSeitentitel } from "../ui";

type Eintrag = Ausgabe["auth"]["benutzerListe"][number];
const ROLLE = { admin: "Administrator", mitarbeiter: "Mitarbeiter" } as const;

/** /benutzer – Administratoren sehen alle Benutzer, alle anderen ihren eigenen Zugang. */
export function Benutzer() {
  const status = trpc.auth.status.useQuery();
  if (!status.data) return <Laden />;
  const b = status.data.benutzer;
  if (b?.rolle !== "admin" || status.data.zweiFaktorPflicht) return <EigenerZugang name={b?.name ?? ""} email={b?.email ?? ""} pflicht={status.data.zweiFaktorPflicht} />;
  return <BenutzerListe />;
}

function Seite({ children }: { children: ReactNode }) {
  return <div className={SEITE}>{children}</div>;
}

function Initialen({ name }: { name: string }) {
  const k = name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-band-hell text-sm font-semibold text-band-dunkel">{k || "?"}</span>;
}

function einladungAbgelaufen(b: Pick<Eintrag, "einladungOffen" | "einladungBis">) {
  return b.einladungOffen && (!b.einladungBis || new Date(b.einladungBis) < new Date());
}

function StatusMarken({ b }: { b: Pick<Eintrag, "aktiv" | "wartet" | "zweiFaktor" | "einladungOffen" | "einladungBis"> }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {!b.aktiv ? (
        <Marke ton="fehler">gesperrt</Marke>
      ) : b.einladungOffen ? (
        <Marke ton="warnung">{einladungAbgelaufen(b) ? "Einladung abgelaufen" : "eingeladen"}</Marke>
      ) : (
        <Marke ton="ok">aktiv</Marke>
      )}
      {b.zweiFaktor ? <Marke ton="ok">2FA</Marke> : <Marke ton="neutral">ohne 2FA</Marke>}
      {b.wartet && <Marke ton="warnung">Wartezeit</Marke>}
    </span>
  );
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

function Zurueck() {
  return (
    <Link to="/benutzer" className="self-start text-sm text-grau no-underline hover:text-tinte hover:underline">
      ‹ Alle Benutzer
    </Link>
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

type Einzel = Ausgabe["auth"]["benutzerGet"];

function useNeuLaden() {
  const utils = trpc.useUtils();
  return async () => {
    await Promise.all([utils.auth.benutzerGet.invalidate(), utils.auth.benutzerListe.invalidate(), utils.auth.status.invalidate()]);
  };
}

function Angaben({ b, selbst }: { b: Einzel; selbst: boolean }) {
  const [name, setName] = useState(b.name);
  const [email, setEmail] = useState(b.email);
  const [rolle, setRolle] = useState(b.rolle);
  // null = noch nicht angefasst: bei geänderter Adresse vorbelegt, sonst aus.
  const [mailWahl, setMailWahl] = useState<boolean | null>(null);
  const neu = useNeuLaden();
  const meldung = useMeldung();
  const speichern = trpc.auth.benutzerSpeichern.useMutation();
  const rolleSetzen = trpc.auth.benutzerRolle.useMutation();
  const geaendert = name !== b.name || email !== b.email || rolle !== b.rolle;
  const angabenGeaendert = name.trim() !== b.name || email.trim().toLowerCase() !== b.email;
  const mitMail = b.aktiv && angabenGeaendert && (mailWahl ?? email.trim().toLowerCase() !== b.email);
  const senden = async (e: FormEvent) => {
    e.preventDefault();
    try {
      let gesendet = false;
      if (name !== b.name || email !== b.email) gesendet = (await speichern.mutateAsync({ id: b.id, name, email, willkommensmail: mitMail })).willkommensmail;
      if (rolle !== b.rolle) await rolleSetzen.mutateAsync({ id: b.id, rolle });
      await neu();
      setMailWahl(null);
      meldung(gesendet ? `Gespeichert. ${b.einladungOffen ? "Die neue Einladung" : "Die Willkommensmail"} ist an ${email.trim().toLowerCase()} unterwegs.` : "Gespeichert.");
    } catch {
      /* Fehler steht im Formular */
    }
  };
  const fehler = speichern.error ?? rolleSetzen.error;
  const formular = useRef<HTMLFormElement>(null);
  return (
    <Abschnitt titel="Angaben">
      <form ref={formular} onSubmit={senden} className="flex flex-col gap-4">
        <Feld label="Name">{(id) => <Eingabe id={id} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />}</Feld>
        <Feld label="E-Mail-Adresse" hinweis="Zum Anmelden, gilt sofort">
          {(id) => <Eingabe id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}
        </Feld>
        <Feld label="Rolle" hinweis={selbst ? "Die eigene Rolle ändert ein anderer Administrator." : undefined}>
          {(id) => (
            <Auswahl id={id} value={rolle} disabled={selbst} onChange={(e) => setRolle(e.target.value as typeof rolle)}>
              <option value="mitarbeiter">{ROLLE.mitarbeiter}</option>
              <option value="admin">{ROLLE.admin}</option>
            </Auswahl>
          )}
        </Feld>
        {b.aktiv && angabenGeaendert && (
          <Haken
            label={b.einladungOffen ? "Neue Einladung schicken" : "Willkommensmail neu schicken"}
            checked={mitMail}
            onChange={setMailWahl}
            hinweis={b.einladungOffen ? "Der alte Link wird ungültig" : "Ohne Passwort"}
          />
        )}
        {fehler && <Hinweis ton="fehler">{fehlerText(fehler)}</Hinweis>}
        <div><Knopf type="submit" variante="primaer" disabled={!geaendert} laedt={speichern.isPending || rolleSetzen.isPending}>Speichern</Knopf></div>
        <Speicherleiste
          sichtbar={geaendert}
          onVerwerfen={() => {
            setName(b.name);
            setEmail(b.email);
            setRolle(b.rolle);
          }}
          onSpeichern={() => formular.current?.requestSubmit()}
          laedt={speichern.isPending || rolleSetzen.isPending}
        />
      </form>
    </Abschnitt>
  );
}

function Zugang({ b, selbst }: { b: Einzel; selbst: boolean }) {
  const { bestaetige } = useFrage();
  const neu = useNeuLaden();
  const meldung = useMeldung();
  const fertig = (text: string) => ({ onSuccess: async () => { await neu(); meldung(text); }, onError: (e: { message: string }) => meldung(fehlerText(e), "fehler") });
  const aktiv = trpc.auth.benutzerAktiv.useMutation(fertig(b.aktiv ? "Gesperrt und auf allen Geräten abgemeldet." : "Entsperrt."));
  const entsperren = trpc.auth.sperreAufheben.useMutation(fertig("Wartezeit und Sperre nach Fehlversuchen aufgehoben."));
  const navigate = useNavigate();
  const loeschen = trpc.auth.benutzerLoeschen.useMutation({
    onSuccess: async (r) => {
      await neu();
      meldung(r.ganz ? `${b.name} gelöscht.` : `${b.name} entfernt. Anmeldung, E-Mail, Passwort und 2FA sind gelöscht; der Name bleibt in Protokoll und Kasse sichtbar.`);
      navigate("/benutzer");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const willkommen = trpc.auth.benutzerWillkommen.useMutation({
    onSuccess: async (r) => {
      await neu();
      meldung(r.einladung ? `Neue Einladung an ${r.an} ist unterwegs. Der alte Link gilt nicht mehr.` : `Willkommensmail an ${r.an} ist unterwegs.`);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const abmelden = trpc.auth.benutzerAbmelden.useMutation({
    onSuccess: async (r) => { await neu(); meldung(`${r.abgemeldet} Gerät${r.abgemeldet === 1 ? "" : "e"} abgemeldet.`); },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  return (
    <Abschnitt titel="Zugang">
      <dl className="mb-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        <dt className="text-grau">Status</dt>
        <dd>
          {!b.aktiv
            ? "gesperrt – Anmeldung nicht möglich"
            : b.einladungOffen
              ? einladungAbgelaufen(b)
                ? "Einladung abgelaufen – bitte neu senden"
                : `eingeladen, Link gilt bis ${datumZeit(b.einladungBis)}`
              : "aktiv"}
        </dd>
        <dt className="text-grau">Zuletzt angemeldet</dt>
        <dd>{b.zuletzt ? datumZeit(b.zuletzt) : "noch nie"}</dd>
        <dt className="text-grau">Angemeldete Geräte</dt>
        <dd>{b.geraete}</dd>
        {b.wartet && (
          <>
            <dt className="text-grau">Fehlversuche</dt>
            <dd className="text-kamm">Wartezeit läuft</dd>
          </>
        )}
      </dl>
      <div className="flex flex-wrap gap-2">
        {b.geraete > (selbst ? 1 : 0) && (
          <Knopf onClick={async () => (await bestaetige({ titel: selbst ? "Alle anderen Geräte abmelden?" : `${b.name} auf allen Geräten abmelden?`, knopf: "Abmelden" })) && abmelden.mutate({ id: b.id })} laedt={abmelden.isPending}>
            {selbst ? "Andere Geräte abmelden" : "Auf allen Geräten abmelden"}
          </Knopf>
        )}
        {!selbst && (
          <>
            {b.aktiv && (
              <Knopf
                variante={b.einladungOffen ? "primaer" : undefined}
                onClick={() => willkommen.mutate({ id: b.id })}
                laedt={willkommen.isPending}
              >
                {b.einladungOffen ? "Neue Einladung senden" : "Willkommensmail erneut senden"}
              </Knopf>
            )}
            <Knopf onClick={() => entsperren.mutate({ id: b.id })} laedt={entsperren.isPending}>
              Sperre nach Fehlversuchen aufheben
            </Knopf>
            <Knopf
              variante={b.aktiv ? "leise" : "primaer"}
              onClick={async () =>
                (!b.aktiv || (await bestaetige({ titel: `${b.name} sperren?`, text: "Alle Geräte werden abgemeldet, eine Anmeldung ist bis zum Entsperren nicht möglich.", knopf: "Sperren", gefahr: true }))) &&
                aktiv.mutate({ id: b.id, aktiv: !b.aktiv })
              }
              laedt={aktiv.isPending}
            >
              {b.aktiv ? "Benutzer sperren" : "Benutzer entsperren"}
            </Knopf>
            <Knopf
              variante="gefahr"
              onClick={async () =>
                (await bestaetige({
                  titel: `${b.name} löschen?`,
                  text: "Der Zugang wird endgültig gelöscht, ein schon erfasster Name bleibt in Protokoll und Kasse.",
                  knopf: "Löschen",
                  gefahr: true,
                })) && loeschen.mutate({ id: b.id })
              }
              laedt={loeschen.isPending}
            >
              Benutzer löschen
            </Knopf>
          </>
        )}
      </div>
    </Abschnitt>
  );
}

function PasswortNeu({ b }: { b: Einzel }) {
  const [passwort, setPasswort] = useState("");
  const neu = useNeuLaden();
  const meldung = useMeldung();
  const setzen = trpc.auth.benutzerPasswortSetzen.useMutation({
    onSuccess: async () => {
      setPasswort("");
      await neu();
      meldung(`Neues Passwort gesetzt. ${b.name} ist auf allen Geräten abgemeldet und bekommt eine Hinweismail ohne Passwort.`);
    },
  });
  return (
    <Abschnitt titel="Passwort">
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); setzen.mutate({ id: b.id, passwort }); }}>
        <Feld label="Neues Passwort" hinweis="Mindestens 10 Zeichen">
          {(id) => <Eingabe id={id} type="text" value={passwort} onChange={(e) => setPasswort(e.target.value)} required minLength={10} autoComplete="off" />}
        </Feld>
        {setzen.error && <Hinweis ton="fehler">{fehlerText(setzen.error)}</Hinweis>}
        <div><Knopf type="submit" laedt={setzen.isPending}>Neues Passwort setzen</Knopf></div>
      </form>
    </Abschnitt>
  );
}

function ZweiFaktorFremd({ b }: { b: Einzel }) {
  const { bestaetige } = useFrage();
  const neu = useNeuLaden();
  const meldung = useMeldung();
  const zurueck = trpc.auth.zweiFaktorZuruecksetzen.useMutation({ onSuccess: async () => { await neu(); meldung("Zwei-Faktor-Anmeldung zurückgesetzt."); }, onError: (e) => meldung(fehlerText(e), "fehler") });
  return (
    <Abschnitt titel="Zwei-Faktor-Anmeldung">
      {b.zweiFaktor ? (
        <div className="flex flex-col gap-4">
          <p>
            <Marke ton="ok">eingerichtet</Marke>
            <span className="ml-2 text-grau">seit {b.zweiFaktorSeit ? datum(b.zweiFaktorSeit) : "–"}, noch {b.notfallUebrig} Notfallcode{b.notfallUebrig === 1 ? "" : "s"}</span>
          </p>
          <div>
            <Knopf onClick={async () => (await bestaetige({ titel: `Zwei-Faktor-Anmeldung für ${b.name} zurücksetzen?`, knopf: "Zurücksetzen", gefahr: true })) && zurueck.mutate({ id: b.id })} laedt={zurueck.isPending}>
              Zwei-Faktor-Anmeldung zurücksetzen
            </Knopf>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p><Marke ton="neutral">nicht eingerichtet</Marke></p>
          <p className="text-sm text-grau">Einrichten kann nur die Person selbst.</p>
        </div>
      )}
    </Abschnitt>
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

function PasswortAendern() {
  const [alt, setAlt] = useState("");
  const [neu, setNeu] = useState("");
  const meldung = useMeldung();
  const aendern = trpc.auth.passwortAendern.useMutation({
    onSuccess: () => {
      meldung("Passwort geändert.");
      setAlt("");
      setNeu("");
    },
  });
  return (
    <Abschnitt titel="Eigenes Passwort ändern">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          aendern.mutate({ alt, neu });
        }}
        className="flex flex-col gap-3"
      >
        <Feld label="Bisheriges Passwort">{(id) => <Eingabe id={id} type="password" value={alt} onChange={(e) => setAlt(e.target.value)} required autoComplete="current-password" />}</Feld>
        <Feld label="Neues Passwort" hinweis="Mindestens 10 Zeichen">{(id) => <Eingabe id={id} type="password" value={neu} onChange={(e) => setNeu(e.target.value)} required minLength={10} autoComplete="new-password" />}</Feld>
        {aendern.error && <Hinweis ton="fehler">{fehlerText(aendern.error)}</Hinweis>}
        <div>
          <Knopf type="submit" laedt={aendern.isPending}>Passwort ändern</Knopf>
        </div>
      </form>
    </Abschnitt>
  );
}

/** Zwei-Faktor-Anmeldung einrichten (QR-Code für die Authenticator-App), Notfallcodes anzeigen, abschalten. */
function ZweiFaktor() {
  const status = trpc.auth.zweiFaktorStatus.useQuery();
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const [passwort, setPasswort] = useState("");
  const [code, setCode] = useState("");
  const [einrichtung, setEinrichtung] = useState<{ geheim: string; adresse: string; qr: string } | null>(null);
  const [notfall, setNotfall] = useState<string[] | null>(null);
  const [abschalten, setAbschalten] = useState(false);
  const starten = trpc.auth.zweiFaktorEinrichten.useMutation({
    onSuccess: async (r) => {
      const qr = await QRCode.toDataURL(r.adresse, { margin: 1, width: 220 });
      setEinrichtung({ ...r, qr });
      setPasswort("");
    },
  });
  const bestaetigen = trpc.auth.zweiFaktorBestaetigen.useMutation({
    onSuccess: async (r) => {
      setNotfall(r.notfallcodes);
      setEinrichtung(null);
      setCode("");
      await utils.auth.zweiFaktorStatus.invalidate();
    },
  });
  const aus = trpc.auth.zweiFaktorAbschalten.useMutation({
    onSuccess: async () => {
      setAbschalten(false);
      setPasswort("");
      setCode("");
      await Promise.all([utils.auth.zweiFaktorStatus.invalidate(), utils.auth.status.invalidate()]);
      meldung("Zwei-Faktor-Anmeldung abgeschaltet.");
    },
  });
  const fehlerAnzeige = starten.error ?? bestaetigen.error ?? aus.error;
  return (
    <Abschnitt titel="Zwei-Faktor-Anmeldung">
      {notfall ? (
        <div className="flex flex-col gap-3">
          <Hinweis ton="ok">Eingerichtet.</Hinweis>
          <p>
            <span className="font-semibold">Notfallcodes</span> – jetzt sichern, sie werden nicht noch einmal angezeigt:
          </p>
          <ul className="nummer grid grid-cols-2 gap-1 rounded-md bg-papier p-3 text-lg">
            {notfall.map((c) => <li key={c}>{c}</li>)}
          </ul>
          <Knopf
            className="self-start"
            onClick={async () => {
              setNotfall(null);
              // Erst jetzt: bei der 2FA-Pflicht wechselt die Seite danach zur Verwaltung.
              await utils.auth.status.invalidate();
            }}
          >
            Habe ich gesichert
          </Knopf>
        </div>
      ) : status.data?.aktiv ? (
        <div className="flex flex-col gap-3">
          <p>
            <Marke ton="ok">aktiv</Marke> <span className="ml-1 text-grau">Noch {status.data.notfallUebrig} Notfallcode{status.data.notfallUebrig === 1 ? "" : "s"} übrig.</span>
          </p>
          {!abschalten ? (
            <Knopf variante="leise" className="self-start" onClick={() => setAbschalten(true)}>Abschalten …</Knopf>
          ) : (
            <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); aus.mutate({ passwort, code }); }}>
              <Feld label="Passwort">{(id) => <Eingabe id={id} type="password" value={passwort} onChange={(e) => setPasswort(e.target.value)} required autoComplete="current-password" />}</Feld>
              <Feld label="Code aus der App oder Notfallcode">{(id) => <Eingabe id={id} value={code} onChange={(e) => setCode(e.target.value)} required autoComplete="one-time-code" />}</Feld>
              <Knopf type="submit" variante="gefahr" className="self-start" laedt={aus.isPending}>Zwei-Faktor-Anmeldung abschalten</Knopf>
            </form>
          )}
        </div>
      ) : einrichtung ? (
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); bestaetigen.mutate({ code }); }}>
          <p>1. QR-Code mit der Authenticator-App scannen</p>
          <img src={einrichtung.qr} alt="QR-Code für die Authenticator-App" className="size-52 self-start rounded-md border border-linie bg-weiss p-1" />
          <p className="text-sm text-grau">
            Schlüssel zum Abtippen:
            <span className="nummer mt-1 block select-all text-base text-tinte">{einrichtung.geheim}</span>
          </p>
          <Feld label="2. Den angezeigten 6-stelligen Code eingeben">
            {(id) => <Eingabe id={id} value={code} onChange={(e) => setCode(e.target.value)} required autoComplete="one-time-code" inputMode="numeric" maxLength={7} className="nummer max-w-40 text-xl tracking-widest" />}
          </Feld>
          <div className="flex gap-2">
            <Knopf type="submit" variante="primaer" laedt={bestaetigen.isPending}>Bestätigen</Knopf>
            <Knopf variante="leise" onClick={() => { setEinrichtung(null); setCode(""); }}>Abbrechen</Knopf>
          </div>
        </form>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); starten.mutate({ passwort }); }}>
          <p>
            <Marke>nicht eingerichtet</Marke>
          </p>
          <Feld label="Passwort zur Bestätigung">{(id) => <Eingabe id={id} type="password" value={passwort} onChange={(e) => setPasswort(e.target.value)} required autoComplete="current-password" />}</Feld>
          <Knopf type="submit" className="self-start" laedt={starten.isPending}>Einrichten</Knopf>
        </form>
      )}
      {fehlerAnzeige && <Hinweis ton="fehler" className="mt-3">{fehlerText(fehlerAnzeige)}</Hinweis>}
    </Abschnitt>
  );
}
