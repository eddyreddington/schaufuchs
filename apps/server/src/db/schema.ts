/**
 * Datenbankschema (Drizzle) – Einstieg für drizzle.config.ts und alle Importe im Server. Die Tabellen stehen nach
 * Fachgebieten in schema-*.ts; hier werden sie nur weitergereicht.
 */
export * from "./schema-aufzaehlungen";
export * from "./schema-mandant";
export * from "./schema-schau";
export * from "./schema-meldung";
export * from "./schema-bewertung";
export * from "./schema-verkauf";
export * from "./schema-protokoll";
export * from "./schema-katalog";
export * from "./schema-termine";
export * from "./schema-kasse";

// Spenden: eigene Datei (Spender, Spenden, Zuwendungsbestätigungen).
export * from "./schema-spenden";
// Import aus Altprogrammen: Importläufe.
export * from "./schema-import";
export * from "./schema-hallenentwurf";
export * from "./schema-lastschrift";
// Betrieb: Zeitpunkt der letzten Sicherung für die Gesundheitsprüfung.
export * from "./schema-betrieb";
