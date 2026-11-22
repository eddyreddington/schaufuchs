import { DRUCK_FORMAT_WAHL, DRUCKSACHEN, type DruckFormatArt, type Drucksache } from "@schau/domain";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fehlerText } from "../lib";
import { useOberflaeche } from "../sprache";
import { trpc } from "../trpc";
import { Abschnitt, Auswahl, HilfeLink, Knopf, knopfKlasse, Laden, TabellenRahmen, useMeldung } from "../ui";

/**
 * Einstellungen der Schau, Abschnitt „Druck“: Übersicht aller Drucksachen mit ihrem Format (Entscheidung 029). Wählbar
 * sind hier die Formatvorgaben der Schau und die Druckvorlage der Bewertungskarten; das Katalogformat bleibt in
 * „Katalog gestalten“ (eine Quelle), Briefe stehen fest auf A4 nach DIN 5008 und verlinken die Briefvorlage.
 */
export function DruckAbschnitt({ schauId, darfAendern }: { schauId: number; darfAendern: boolean }) {
  const ta = useOberflaeche();
  const t = ta.schau.einstellungen;
  const tf = t.druck.formate;
  const q = trpc.druckvorlage.formate.useQuery({ schauId });
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const setzen = trpc.druckvorlage.formateSetzen.useMutation({
    onSuccess: async () => {
      await utils.druckvorlage.formate.invalidate({ schauId });
      meldung(tf.gespeichert);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const festText = (f: NonNullable<Drucksache["fest"]>) => [`${f.papier} ${tf[f.lage]}`, f.norm ? tf[f.norm] : ""].filter(Boolean).join(", ");

  return (
    <Abschnitt id="druck" titel={t.seite.abschnitte.druck} aktionen={<HilfeLink abschnitt="druckformate">{tf.hilfe}</HilfeLink>}>
      {!q.data ? (
        <Laden />
      ) : (
        <>
          {!darfAendern && <p className="mb-3 text-sm text-grau">{tf.nurAnsehen}</p>}
          <TabellenRahmen>
            <table className="tabelle">
              <thead>
                <tr>
                  <th>{tf.drucksache}</th>
                  <th>{tf.format}</th>
                  <th>{tf.einstellung}</th>
                </tr>
              </thead>
              <tbody>
                {DRUCKSACHEN.map((d) => {
                  const name = tf.sachen[d.id];
                  let format: ReactNode = d.fest ? festText(d.fest) : "";
                  let einstellung: ReactNode = <span className="text-grau">{tf.fest}</span>;
                  if (d.einstellung === "format") {
                    const art = d.id as DruckFormatArt;
                    const wert = q.data.formate[art];
                    const wahl = tf.wahl[art] as Record<string, string>;
                    format = darfAendern ? (
                      <Auswahl kompakt aria-label={`${tf.formatWahl}: ${name}`} value={wert} disabled={setzen.isPending} onChange={(e) => setzen.mutate({ schauId, formate: { [art]: e.target.value } })}>
                        {DRUCK_FORMAT_WAHL[art].map((v) => (
                          <option key={v} value={v}>
                            {wahl[v]}
                          </option>
                        ))}
                      </Auswahl>
                    ) : (
                      wahl[wert]
                    );
                    einstellung = null;
                  } else if (d.einstellung === "katalog") {
                    format = tf.katalog[q.data.katalog];
                    einstellung = (
                      <Link to={`/schau/${schauId}/katalog/gestalten`} className={knopfKlasse("leise")}>
                        {tf.katalogGestalten}
                      </Link>
                    );
                  } else if (d.einstellung === "druckvorlage") {
                    format = darfAendern ? <KartenWahl schauId={schauId} label={name} /> : ta.fach.KARTEN_FORMAT_LABEL[q.data.karten.format];
                    einstellung = darfAendern ? <KartenAktionen schauId={schauId} /> : (q.data.karten.name ?? t.druck.vorgabe);
                  } else if (d.einstellung === "briefvorlage" && darfAendern) {
                    einstellung = (
                      <Link to="/verein/briefvorlage" className={knopfKlasse("leise")}>
                        {t.druck.briefvorlage}
                      </Link>
                    );
                  }
                  return (
                    <tr key={d.id}>
                      <td className="font-medium">{name}</td>
                      <td>{format}</td>
                      <td>{einstellung}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TabellenRahmen>
        </>
      )}
    </Abschnitt>
  );
}

/** Druckvorlage der Bewertungskarten wählen: Vorgabe, Vorlage des Vereins oder die Fassung dieser Schau (011). */
function KartenWahl({ schauId, label }: { schauId: number; label: string }) {
  const td = useOberflaeche().schau.einstellungen.druck;
  const q = trpc.druckvorlage.fuerSchau.useQuery({ schauId });
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const waehlen = trpc.druckvorlage.waehlen.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.druckvorlage.fuerSchau.invalidate({ schauId }), utils.druckvorlage.formate.invalidate({ schauId })]);
      meldung(td.gewaehlt);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  if (!q.data) return <Laden />;
  return (
    <Auswahl kompakt aria-label={label} value={q.data.vorlageId ?? ""} disabled={waehlen.isPending} onChange={(e) => waehlen.mutate({ schauId, vorlageId: e.target.value ? Number(e.target.value) : null })}>
      <option value="">{td.vorgabe}</option>
      {q.data.wahl.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
          {w.schauId ? td.nurDieseSchau : ""}
        </option>
      ))}
    </Auswahl>
  );
}

/** Für diese Schau anpassen (Kopie, öffnet den Designer) und die Vorlagen des Vereins. */
function KartenAktionen({ schauId }: { schauId: number }) {
  const td = useOberflaeche().schau.einstellungen.druck;
  const meldung = useMeldung();
  const navigate = useNavigate();
  const anpassen = trpc.druckvorlage.fuerSchauAnpassen.useMutation({
    onSuccess: (r) => navigate(`/verein/druckvorlagen/${r.id}?schau=${schauId}`),
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Knopf variante="leise" laedt={anpassen.isPending} onClick={() => anpassen.mutate({ schauId })}>
        {td.anpassen}
      </Knopf>
      <Link to="/verein#druckvorlagen" className={knopfKlasse("leise")}>
        {td.vereinsVorlagen}
      </Link>
    </span>
  );
}
