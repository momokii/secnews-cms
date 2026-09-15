import nodemailer from "nodemailer";
import { loadStoredConfig } from "../../integrations/config-store.js";
import type { SmtpStoredConfig } from "../../integrations/schema.js";

/**
 * Central-SMTP adapter (SND-P-03): BCC delivery through the org-wide relay,
 * never per-channel credentials. Settings resolve DB-first: the SMTP entry in
 * the Integrations menu wins; SMTP_* env vars remain the fallback until a row
 * exists. Tests inject a `transport` fake; production builds the nodemailer
 * transport — nodemailer connects lazily, so construction is side-effect free.
 */

export type MailMessage = {
  from?: string;
  bcc: string[];
  subject: string;
  text: string;
};

export type MailTransport = {
  sendMail: (mail: MailMessage) => Promise<unknown>;
};

export type EmailSendOptions = {
  bcc: string[];
  subject: string;
  text: string;
  from?: string;
  transport?: MailTransport;
};

/** Where the central transport + envelope-from come from. */
type CentralMailConfig = { transport: MailTransport; from?: string };

async function centralMailConfig(): Promise<CentralMailConfig> {
  const stored = await loadStoredConfig<SmtpStoredConfig>("SMTP");
  if (stored !== null) {
    return {
      transport: nodemailer.createTransport({
        host: stored.host,
        port: stored.port,
        secure: stored.secure ?? stored.port === 465,
        auth: { user: stored.user, pass: stored.password },
      }),
      from: stored.from,
    };
  }
  const host = process.env["SMTP_HOST"];
  if (host === undefined || host === "") {
    throw new Error("Missing required environment variable: SMTP_HOST");
  }
  const port = Number.parseInt(process.env["SMTP_PORT"] ?? "587", 10);
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASSWORD"];
  const secure = port === 465;
  return {
    transport: nodemailer.createTransport({
      host,
      port,
      secure,
      ...(user && pass ? { auth: { user, pass } } : {}),
    }),
  };
}

export async function sendEmail(options: EmailSendOptions): Promise<void> {
  let transport: MailTransport;
  let centralFrom: string | undefined;
  if (options.transport === undefined) {
    const central = await centralMailConfig();
    transport = central.transport;
    centralFrom = central.from;
  } else {
    transport = options.transport;
  }
  const from = options.from ?? centralFrom ?? process.env["SMTP_FROM"];
  await transport.sendMail({
    ...(from === undefined ? {} : { from }),
    bcc: options.bcc,
    subject: options.subject,
    text: options.text,
  });
}
