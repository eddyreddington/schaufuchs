/** Alle Einstellungen kommen aus Umgebungsvariablen. Siehe .env.example. */
export const config = {
  port: Number(process.env.PORT ?? 8787),
  /** Unter `bun test` immer die Test-Datenbank – Tests dürfen nie echte Daten anfassen. */
  databaseUrl:
    process.env.NODE_ENV === "test"
      ? (process.env.TEST_DATABASE_URL ?? "postgres://schau@localhost:5442/schau_test")
      : (process.env.DATABASE_URL ?? "postgres://schau@localhost:5442/schau"),
  /** Öffentliche Adresse, für Links in E-Mails. */
  publicUrl: process.env.PUBLIC_URL ?? "http://localhost:5173",
  /** Cookies nur über HTTPS senden, wenn die Anwendung auch über HTTPS erreichbar ist – sonst klappt keine Anmeldung. */
  cookieSecure: (process.env.PUBLIC_URL ?? "").startsWith("https://"),
  production: process.env.NODE_ENV === "production",
  smtp: process.env.SMTP_URL ?? "",
  mailFrom: process.env.MAIL_FROM ?? "SchauFUCHS <noreply@localhost>",
  appName: process.env.APP_NAME ?? "SchauFUCHS",
  sessionDays: 14,
  /**
   * Schützt die Ersteinrichtung einer öffentlich erreichbaren Installation: Wer den Verein anlegt, wird Administrator.
   * Ist der Code gesetzt, muss er bei der Einrichtung eingegeben werden.
   */
  einrichtungsCode: process.env.EINRICHTUNG_CODE ?? "",
  /**
   * Administratoren müssen die Zwei-Faktor-Anmeldung eingerichtet haben, bevor sie Verwaltungsfunktionen nutzen. Nur für
   * Notfälle abschaltbar: ZWEI_FAKTOR_PFLICHT=0.
   */
  zweiFaktorPflichtAdmin: process.env.ZWEI_FAKTOR_PFLICHT !== "0",
  /** Nur hinter einem eigenen Reverse-Proxy auf "1" setzen – dann gilt X-Forwarded-For. */
  trustProxy: process.env.TRUST_PROXY === "1",
  /** Lesemodus (Entscheidung 025): NUR_LESEN=1 – keine Änderungen, nur Lesen und Anmelden. */
  nurLesen: process.env.NUR_LESEN === "1",
  /** Hinweis des Betreibers dazu (z. B. „Wartung bis 18 Uhr“), nur für angemeldete Benutzer sichtbar, nicht übersetzt. */
  nurLesenHinweis: (process.env.NUR_LESEN_HINWEIS ?? "").trim().slice(0, 300),
};
