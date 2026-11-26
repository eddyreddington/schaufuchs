import { fehlerFuerAussteller, useSprache, useTexte } from "../sprache";
import { trpc } from "../trpc";
import { Hinweis, Knopf } from "../ui";

/**
 * Online-Meldung an einen vorhandenen Stammsatz bestätigen (Entscheidung 034): ein Knopf auf „Meine Meldung“, erreichbar
 * nur über den Link aus der Mail an die hinterlegte Adresse.
 */
export function MeldungBestaetigen({ slug, token }: { slug: string; token: string }) {
  const utils = trpc.useUtils();
  const m = trpc.oeffentlich.meldungBestaetigen.useMutation({ onSuccess: () => utils.oeffentlich.meineMeldung.invalidate() });
  const sprache = useSprache();
  const t = useTexte().meine;
  return (
    <Hinweis ton="warnung">
      <div className="flex flex-wrap items-center gap-4">
        <p className="max-w-[70ch] flex-1 basis-72">{t.bestaetigenHinweis}</p>
        <Knopf variante="primaer" laedt={m.isPending} onClick={() => m.mutate({ slug, token, sprache })}>
          {t.bestaetigen}
        </Knopf>
      </div>
      {m.error && <p className="mt-2">{fehlerFuerAussteller(m.error, sprache)}</p>}
    </Hinweis>
  );
}
