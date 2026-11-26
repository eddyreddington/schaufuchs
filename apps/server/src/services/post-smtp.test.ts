/**
 * SMTP-Angaben bestehender Installationen (Entscheidung 036): wer TLS ab Verbindungsbeginn nutzt (Port 465 oder
 * ?secure=true), behält es – der Zwang zu STARTTLS gilt nur für unverschlüsselt beginnende Verbindungen.
 */
import { expect, test } from "bun:test";
import { smtpOptionen, smtpWarnungen } from "./post";

test("Port 465 oder ?secure=true: TLS ab Verbindungsbeginn statt STARTTLS", () => {
  for (const url of ["smtp://a:b@mail.example.de:465", "smtp://a:b@mail.example.de:465?secure=true", "smtp://a:b@mail.example.de:2465?secure=true"]) {
    expect(smtpOptionen(url, false)).toMatchObject({ secure: true, requireTLS: false, ignoreTLS: false });
    expect(smtpWarnungen(url, false)).toEqual([]);
  }
});

test("587 bleibt STARTTLS-Pflicht; secure=false schaltet nichts ab", () => {
  expect(smtpOptionen("smtp://a:b@mail.example.de:587", false)).toMatchObject({ secure: false, requireTLS: true });
  expect(smtpOptionen("smtp://a:b@mail.example.de:587?secure=false", false)).toMatchObject({ secure: false, requireTLS: true });
});
