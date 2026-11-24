/** Fehler fürs Protokoll ohne SQL-Parameter (darin stünden Namen, IBANs usw.) und auf eine Zeile gekürzt. */
export function kurzerFehler(e: unknown): string {
  const text = e instanceof Error ? (e.cause instanceof Error ? `${e.message.split("\nparams:")[0]} – ${e.cause.message}` : e.message) : String(e);
  return text.replace(/\nparams:[\s\S]*$/, "").slice(0, 500);
}

/** Verletzter eindeutiger Index (SQLSTATE 23505, auch in `cause` verpackt) – z. B. zwei gleichzeitige Anlagen derselben Adresse. */
export function istDoppelt(e: unknown): boolean {
  for (let x: unknown = e, i = 0; x && i < 5; x = (x as { cause?: unknown }).cause, i++) {
    if ((x as { code?: unknown }).code === "23505") return true;
  }
  return false;
}
