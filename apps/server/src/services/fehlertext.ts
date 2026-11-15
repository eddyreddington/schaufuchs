/** Fehler fürs Protokoll ohne SQL-Parameter (darin stünden Namen, IBANs usw.) und auf eine Zeile gekürzt. */
export function kurzerFehler(e: unknown): string {
  const text = e instanceof Error ? (e.cause instanceof Error ? `${e.message.split("\nparams:")[0]} – ${e.cause.message}` : e.message) : String(e);
  return text.replace(/\nparams:[\s\S]*$/, "").slice(0, 500);
}
