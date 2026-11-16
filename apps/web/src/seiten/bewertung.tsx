import { bewertungsText, erlaubtePunkte, serverText, SONDERNOTEN, type Sondernote } from "@schau/domain";
import { useEffect, useState } from "react";
import { fehlerText, formatKatalognummer, alterLabel } from "../lib";
import { Link } from "react-router-dom";
import { useSchauId } from "../rahmen";
import { useOberflaeche, useSprache } from "../sprache";
import { trpc, type Ausgabe } from "../trpc";
import { Abschnitt, Auswahl, Eingabe, FehlerAnzeige, Hinweis, Knopf, KnopfLink, Laden, Marke, SEITE, Seitenkopf, Segmente, TabellenRahmen, useFrage, useMeldung, useUngespeichertWarnung } from "../ui";

/** Ruhige Knöpfe in Tabellenzeilen. */
const ZEILE = "min-h-8 px-2.5 text-sm";

type Daten = Ausgabe["bewertung"]["liste"];
type Eintrag = Daten["eintraege"][number];

/** Bewertungen am PC: Papierkarten nachtragen oder nach Reklamation korrigieren. */
export function Bewertung() {
  const schauId = useSchauId();
  const [pr, setPr] = useState<number | null>(null);
  // Ohne Auswahl: nur Unbewertete, solange es welche gibt – sonst alle, damit man korrigieren kann.
  const [nurOffenWahl, setNurOffen] = useState<boolean | null>(null);
  const daten = trpc.bewertung.liste.useQuery({ schauId, preisrichterId: pr });
  const status = trpc.auth.status.useQuery();
  const t = useOberflaeche();
  const tb = t.schautage.bewertung;
  const g = t.schautage.gemeinsam;
  if (daten.error) return <FehlerAnzeige fehler={daten.error} nochmal={() => daten.refetch()} />;
  if (!daten.data) return <Laden />;
  const d = daten.data;
  const obmannOffen = d.eintraege.filter((e) => e.obmannOffen);
  const offen = d.eintraege.filter((e) => !e.bewertet && e.status !== "fehlt").length;
  const nurOffen = nurOffenWahl ?? offen > 0;
  const liste = d.eintraege.filter((e) => !nurOffen || (!e.bewertet && e.status !== "fehlt"));
  // Noten vergeben nur Preisrichter (Tablet) und die Ausstellungsleitung (hier am PC); Helfer sehen die Liste nur.
  const istAdmin = status.data?.benutzer?.rolle === "admin";

  const bewertet = d.eintraege.filter((e) => e.bewertet).length;

  return (
    <div className={SEITE}>
      <Seitenkopf
        titel={tb.titel}
        unter={tb.unter(d.eintraege.length, bewertet, offen)}
        marke={
          <>
            {d.freigegeben ? <Marke ton="ok">{g.freigegeben}</Marke> : !d.tabletOffen && <Marke ton="warnung">{tb.tabletGeschlossen}</Marke>}
            {!istAdmin && <Marke>{g.nurLesen}</Marke>}
          </>
        }
        hilfe="bewertung-am-pc-papierkarten"
        aktionen={<KnopfLink href={`/datei/${schauId}/bewertungskarten.pdf`} target="_blank" rel="noreferrer">{tb.kartenDrucken}</KnopfLink>}
      />
      {d.freigegeben ? (
        <Hinweis ton="warnung">
          {tb.freigegebenHinweis} <Link to={`/schau/${schauId}/preise`}>{tb.zurFreigabe}</Link>
        </Hinweis>
      ) : (
        !d.tabletOffen && (
          <Hinweis>
            {tb.geschlossenHinweis(t.fach.PHASEN_LABEL[d.phase])} <Link to={`/schau/${schauId}`}>{tb.phaseAendern}</Link>
          </Hinweis>
        )
      )}
      {obmannOffen.length > 0 && (
        <fieldset disabled={!istAdmin} className="min-w-0">
          <ObmannListe schauId={schauId} eintraege={obmannOffen} obleute={d.richter.filter((r) => r.istObmann)} richter={d.richter} skala={d.skala} />
        </fieldset>
      )}
      {/* Filter bleiben für Helfer bedienbar (Stand nur lesen); gesperrt sind nur die Eingaben. */}
      <TabellenRahmen
        kopf={
          <>
            <Auswahl aria-label={t.allgemein.preisrichter} value={pr ?? ""} onChange={(e) => setPr(e.target.value ? Number(e.target.value) : null)} className="max-w-64">
              <option value="">{g.allePreisrichter}</option>
              {d.richter.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Auswahl>
            <Segmente
              label={tb.auswahl}
              wert={nurOffen ? "offen" : "alle"}
              onChange={(w) => setNurOffen(w === "offen")}
              optionen={[
                { wert: "offen", label: tb.nurUnbewertete, anzahl: offen },
                { wert: "alle", label: t.allgemein.alle, anzahl: d.eintraege.length },
              ]}
            />
          </>
        }
        fuss={
          liste.length > 0 ? (
            <>
              <span>{g.tiere(liste.length)}</span>
              <span>{tb.unbewertet(offen)}</span>
            </>
          ) : undefined
        }
      >
        <fieldset disabled={!istAdmin} className="min-w-0">
          {liste.length === 0 ? (
            <p className="px-4 py-10 text-center text-grau">{nurOffen ? tb.alleBewertet : tb.keineTiere}</p>
          ) : (
            <table className="tabelle">
              <thead>
                <tr>
                  <th className="text-right">{g.nr}</th>
                  <th>{t.allgemein.tier}</th>
                  <th className="w-56">{tb.punkte}</th>
                  <th>{tb.vorzuegeWuenscheMaengel}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {liste.map((e, i) => (
                  <Zeile key={e.id} e={e} skala={d.skala} schauId={schauId} freigegeben={d.freigegeben} naechste={liste[i + 1]?.id} />
                ))}
              </tbody>
            </table>
          )}
        </fieldset>
      </TabellenRahmen>
    </div>
  );
}

function Zeile({ e, skala, schauId, freigegeben, naechste }: { e: Eintrag; skala: Daten["skala"]; schauId: number; freigegeben: boolean; naechste?: number }) {
  const vomServer = () => ({ punkte: e.sondernote ?? (e.punkte != null ? String(e.punkte) : ""), vorzuege: e.vorzuege ?? "", wuensche: e.wuensche ?? "", maengel: e.maengel ?? "" });
  const [punkte, setPunkte] = useState(vomServer().punkte);
  const [texte, setTexte] = useState({ vorzuege: e.vorzuege ?? "", wuensche: e.wuensche ?? "", maengel: e.maengel ?? "" });
  // Stand, auf dem die Eingaben beruhen (Versionszähler und Werte). Ändert sich die Note anderswo (Tablet), übernimmt
  // die Zeile sie, solange hier nichts eingegeben ist; sonst merkt das Speichern den Konflikt und fragt nach.
  const [basis, setBasis] = useState({ version: e.bewertungVersion ?? 0, ...vomServer() });
  const gleich = (a: string, b: string) => a.trim() === b.trim();
  const geaendert = () =>
    punkte !== basis.punkte || !gleich(texte.vorzuege, basis.vorzuege) || !gleich(texte.wuensche, basis.wuensche) || !gleich(texte.maengel, basis.maengel);
  useUngespeichertWarnung(geaendert);
  useEffect(() => {
    if ((e.bewertungVersion ?? 0) === basis.version || geaendert()) return;
    const neu = vomServer();
    setPunkte(neu.punkte);
    setTexte({ vorzuege: neu.vorzuege, wuensche: neu.wuensche, maengel: neu.maengel });
    setBasis({ version: e.bewertungVersion ?? 0, ...neu });
  }, [e.bewertungVersion, e.punkte, e.sondernote, e.vorzuege, e.wuensche, e.maengel]); // eslint-disable-line react-hooks/exhaustive-deps
  const [offen, setOffen] = useState(false);
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { eingabe, bestaetige } = useFrage();
  const t = useOberflaeche();
  const tb = t.schautage.bewertung;
  const sprache = useSprache();
  const setzen = trpc.bewertung.setzen.useMutation({
    onSuccess: (r, v) => {
      // Gespeichert (auch nach „trotzdem“ oder unverändert): dieser Stand gilt als geladen, mit der Version vom Server.
      setBasis({ version: r.status === "gespeichert" && r.version != null ? r.version : -1, punkte: v.sondernote ?? (v.punkte != null ? String(v.punkte) : ""), vorzuege: v.vorzuege.trim(), wuensche: v.wuensche.trim(), maengel: v.maengel.trim() });
      utils.bewertung.liste.invalidate();
      document.getElementById(`punkte-${naechste}`)?.focus();
    },
    onError: (err, v) => {
      // Inzwischen anderswo (z. B. am Tablet) geändert: nur nach Rückfrage überschreiben.
      if (err.data?.code === "CONFLICT" && !v.erzwingen) {
        void bestaetige({ titel: tb.trotzdemSpeichernTitel, text: tb.trotzdemSpeichernText(serverText(err.message, sprache)), knopf: tb.noteSpeichern }).then((ja) => {
          if (ja) setzen.mutate({ ...v, erzwingen: true });
          else {
            // Verworfen: Eingaben zurück auf den geladenen Stand, dann übernimmt die Zeile die Note von anderswo.
            setPunkte(basis.punkte);
            setTexte({ vorzuege: basis.vorzuege, wuensche: basis.wuensche, maengel: basis.maengel });
            utils.bewertung.liste.invalidate();
          }
        });
        return;
      }
      meldung(fehlerText(err), "fehler");
    },
  });
  const zuruecksetzen = trpc.bewertung.zuruecksetzen.useMutation({
    onSuccess: () => {
      utils.bewertung.liste.invalidate();
      meldung(tb.zurueckgesetzt(formatKatalognummer(e)));
    },
    onError: (err) => meldung(fehlerText(err), "fehler"),
  });
  /** Nach der Freigabe und bei verkauften Tieren braucht jede Änderung einen Grund; null heißt abgebrochen. */
  const begruendung = async (): Promise<string | null> => {
    if (!freigegeben && e.verkaufBelegNr == null) return "";
    return eingabe({
      titel: e.verkaufBelegNr != null ? tb.verkauftTitel(formatKatalognummer(e)) : tb.nachFreigabeTitel,
      text: e.verkaufBelegNr != null ? tb.verkauftText(e.verkaufBelegNr) : tb.nachFreigabeText,
      feld: e.verkaufBelegNr != null ? tb.grundVerkauft : tb.grundFreigabe,
      mindestens: 3,
    });
  };
  const zuruecknehmen = async () => {
    if (
      !freigegeben &&
      !(await bestaetige({ titel: tb.zuruecksetzenFrage(formatKatalognummer(e)), text: tb.zuruecksetzenText, knopf: tb.zuruecksetzen, gefahr: true }))
    )
      return;
    const grund = await begruendung();
    if (grund != null) zuruecksetzen.mutate({ schauId, katalogeintragId: e.id, grund });
  };
  const speichern = async () => {
    if (!punkte) return;
    const sonder = (SONDERNOTEN as readonly string[]).includes(punkte) ? (punkte as Sondernote) : null;
    const grund = await begruendung();
    if (grund == null) return;
    // Mit dem angezeigten Stand: eine inzwischen am Tablet gespeicherte Note wird nicht still überschrieben.
    setzen.mutate({ schauId, katalogeintragId: e.id, punkte: sonder ? null : Number(punkte), sondernote: sonder, ...texte, geraetZeit: new Date(), grund, basisVersion: basis.version });
  };
  return (
    <tr>
      <td className="nummer text-right text-lg">{formatKatalognummer(e)}</td>
      <td>
        <span className="font-semibold text-tinte">{e.bezeichnung}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-grau">
          {e.geschlecht} {alterLabel(e.alter)}
          {e.status === "fehlt" && <Marke ton="fehler">{t.schautage.gemeinsam.fehlt}</Marke>}
        </span>
      </td>
      <td>
        <div className="flex items-center gap-2">
          <Auswahl
            id={`punkte-${e.id}`}
            aria-label={tb.punkteFuer(formatKatalognummer(e))}
            value={punkte}
            onChange={(x) => setPunkte(x.target.value)}
            onKeyDown={(x) => x.key === "Enter" && speichern()}
          >
            <option value="">–</option>
            {erlaubtePunkte(skala).map((p) => (
              <option key={p} value={p}>
                {bewertungsText({ punkte: p, sondernote: null }, skala)}
              </option>
            ))}
            {SONDERNOTEN.map((s) => (
              <option key={s} value={s}>
                {t.fach.SONDERNOTE_LABEL[s].kuerzel} ({t.fach.SONDERNOTE_LABEL[s].name})
              </option>
            ))}
          </Auswahl>
          {e.bewertet && <Marke ton="ok">{bewertungsText({ punkte: e.punkte, sondernote: e.sondernote }, skala)}</Marke>}
        </div>
      </td>
      <td>
        {offen ? (
          <div className="flex flex-col gap-1">
            <Eingabe aria-label={tb.vorzuege} placeholder={tb.vorzuege} maxLength={500} value={texte.vorzuege} onChange={(x) => setTexte({ ...texte, vorzuege: x.target.value })} />
            <Eingabe aria-label={tb.wuensche} placeholder={tb.wuensche} maxLength={500} value={texte.wuensche} onChange={(x) => setTexte({ ...texte, wuensche: x.target.value })} />
            <Eingabe aria-label={tb.maengel} placeholder={tb.maengel} maxLength={500} value={texte.maengel} onChange={(x) => setTexte({ ...texte, maengel: x.target.value })} />
          </div>
        ) : (
          <button type="button" className="text-left text-sm text-grau hover:text-tinte" onClick={() => setOffen(true)}>
            {[texte.vorzuege, texte.wuensche, texte.maengel].filter(Boolean).join(" / ") || tb.texteEintragen}
          </button>
        )}
      </td>
      <td className="text-right">
        <div className="flex flex-wrap justify-end gap-1">
          {e.bewertet && (
            <Knopf variante="leise" className={ZEILE} onClick={zuruecknehmen} laedt={zuruecksetzen.isPending}>
              {tb.zuruecksetzen}
            </Knopf>
          )}
          <Knopf className={ZEILE} onClick={speichern} laedt={setzen.isPending} disabled={!punkte}>
            {t.allgemein.speichern}
          </Knopf>
        </div>
      </td>
    </tr>
  );
}

function ObmannListe({
  schauId,
  eintraege,
  obleute,
  richter,
  skala,
}: {
  skala: Daten["skala"];
  schauId: number;
  eintraege: Eintrag[];
  obleute: { id: number; name: string }[];
  richter: { id: number; name: string; istObmann: boolean }[];
}) {
  // Gibt es nur einen Obmann, bestätigt ein anderer Preisrichter dessen eigene Bewertungen.
  const auswahl = obleute.length === 1 ? [...obleute, ...richter.filter((r) => !r.istObmann)] : obleute;
  const [obmann, setObmann] = useState(obleute[0]?.id);
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const t = useOberflaeche();
  const tb = t.schautage.bewertung;
  const best = trpc.bewertung.obmannBestaetigen.useMutation({
    onSuccess: () => utils.bewertung.liste.invalidate(),
    // Note inzwischen geändert: neu laden, damit der Obmann den aktuellen Stand sieht.
    onError: (e) => {
      utils.bewertung.liste.invalidate();
      meldung(fehlerText(e), "fehler");
    },
  });
  return (
    <Abschnitt
      titel={tb.wartetAufObmann(eintraege.length)}
      aktionen={
        obleute.length > 0 && (
          <Auswahl aria-label={tb.obmann} value={obmann} onChange={(e) => setObmann(Number(e.target.value))} className="max-w-xs">
            {auswahl.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
                {obleute.length === 1 && !obleute.some((x) => x.id === o.id) ? ` ${tb.nurEigene}` : ""}
              </option>
            ))}
          </Auswahl>
        )
      }
    >
      {obleute.length === 0 ? (
        <Hinweis ton="warnung">{tb.keinObmann}</Hinweis>
      ) : (
        <>
          <ul className="flex flex-wrap gap-2">
            {eintraege.map((e) => (
              <li key={e.id}>
                <Knopf className={ZEILE} onClick={() => obmann && best.mutate({ schauId, katalogeintragId: e.id, obmannId: obmann, version: e.bewertungVersion ?? undefined })}>
                  {tb.bestaetigen(formatKatalognummer(e), bewertungsText({ punkte: e.punkte, sondernote: e.sondernote }, skala))}
                </Knopf>
              </li>
            ))}
          </ul>
        </>
      )}
    </Abschnitt>
  );
}
