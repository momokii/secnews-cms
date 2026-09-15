import nodemailer from "nodemailer";

/**
 * Central-SMTP adapter (SND-P-03): BCC delivery through the org-wide relay
 * (SMTP_HOST/SMTP_PORT/SMTP_FROM), never per-channel credentials. Tests
 * inject a `transport` fake; production builds the nodemailer transport once
 * per call — nodemailer connects lazily, so construction is side-effect free.
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

function centralTransport(): MailTransport {
  const host = process.env["SMTP_HOST"];
  if (host === undefined || host === "") {
    throw new Error("Missing required environment variable: SMTP_HOST");
  }
  const port = Number.parseInt(process.env["SMTP_PORT"] ?? "587", 10);
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASSWORD"];
  const secure = port === 465;
  return nodemailer.createTransport({
    host,
    port,
    secure,
    ...(user && pass ? { auth: { user, pass } } : {}),
  });
}

export async function sendEmail(options: EmailSendOptions): Promise<void> {
  const transport = options.transport ?? centralTransport();
  const from = options.from ?? process.env["SMTP_FROM"];
  await transport.sendMail({
    ...(from === undefined ? {} : { from }),
    bcc: options.bcc,
    subject: options.subject,
    text: options.text,
  });
}
