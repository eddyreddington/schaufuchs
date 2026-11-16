import type { OberflaecheTexte } from "..";

export const kontoauszug: OberflaecheTexte["serverKasse"]["kontoauszug"] = {
  zuGross: "Soubor je příliš velký (nejvýše 4 MB).",
  zuViele: (max: string) => `Příliš mnoho připsaných plateb (nejvýše ${max}). Exportujte prosím kratší období.`,
  postenFehlt: "Jedna položka v tomto souboru není. Zkontrolujte prosím soubor znovu.",
  nichtOffen: "Přihláška není nevyřízená ani potvrzená",
  schonGebucht: "již zaúčtováno",
  andersBezahlt: "mezitím zaplaceno jinak – zkontrolujte prosím znovu",
};
