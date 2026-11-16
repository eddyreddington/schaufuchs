import type { OberflaecheTexte } from "..";

export const kontoauszug: OberflaecheTexte["serverKasse"]["kontoauszug"] = {
  zuGross: "Plik jest za duży (najwyżej 4 MB).",
  zuViele: (max: string) => `Za dużo uznań (najwyżej ${max}). Proszę wyeksportować krótszy okres.`,
  postenFehlt: "Jednej pozycji nie ma w tym pliku. Proszę ponownie sprawdzić plik.",
  nichtOffen: "Zgłoszenie ani oczekujące, ani potwierdzone",
  schonGebucht: "już zaksięgowano",
  andersBezahlt: "w międzyczasie opłacono inaczej – proszę sprawdzić ponownie",
};
