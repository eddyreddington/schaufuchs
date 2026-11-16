import type { OberflaecheTexte } from "..";

export const kontoauszug: OberflaecheTexte["serverKasse"]["kontoauszug"] = {
  zuGross: "The file is too large (at most 4 MB).",
  zuViele: (max: string) => `Too many credits (at most ${max}). Please export a shorter period.`,
  postenFehlt: "An item is not in this file. Please check the file again.",
  nichtOffen: "Entry neither pending nor confirmed",
  schonGebucht: "already booked",
  andersBezahlt: "paid otherwise in the meantime – please check again",
};
