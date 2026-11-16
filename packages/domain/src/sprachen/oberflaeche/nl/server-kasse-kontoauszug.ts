import type { OberflaecheTexte } from "..";

export const kontoauszug: OberflaecheTexte["serverKasse"]["kontoauszug"] = {
  zuGross: "Het bestand is te groot (hoogstens 4 MB).",
  zuViele: (max: string) => `Te veel bijschrijvingen (hoogstens ${max}). Exporteer een kortere periode.`,
  postenFehlt: "Een post staat niet in dit bestand. Controleer het bestand opnieuw.",
  nichtOffen: "Inschrijving niet open of bevestigd",
  schonGebucht: "al geboekt",
  andersBezahlt: "intussen anders betaald – controleer opnieuw",
};
