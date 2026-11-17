import type { OberflaecheTexte } from "..";

export const kontoauszug: OberflaecheTexte["serverKasse"]["kontoauszug"] = {
  zuGross: "Plik jest za duży (najwyżej 4 MB).",
  zuViele: (max: string) => `Za dużo uznań (najwyżej ${max}). Proszę wyeksportować krótszy okres.`,
  postenFehlt: "Jednej pozycji nie ma w tym pliku. Proszę ponownie sprawdzić plik.",
  nichtOffen: "Zgłoszenie ani oczekujące, ani potwierdzone",
  schonGebucht: "już zaksięgowano",
  andersBezahlt: "w międzyczasie opłacono inaczej – proszę sprawdzić ponownie",
  keinCamt: "To nie jest wyciąg bankowy w formacie camt.053.",
  unbekanntesFormat: "Nieznany format: w pliku brakuje kolumn „Buchungstag” (data księgowania) i „Betrag” (kwota). Proszę przesłać eksport operacji jako CSV lub camt.053 (XML).",
  nichtLesbar: "Nie udało się odczytać pliku.",
};
