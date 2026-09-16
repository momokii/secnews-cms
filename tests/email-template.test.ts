import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import {
  DEFAULT_EMAIL_HTML,
  DEFAULT_EMAIL_SUBJECT,
} from "../src/modules/email-template/render.js";
import { bearer, c3Cleanup, c3Ticket, c3User, type C3User } from "./tickets.fixtures.js";

/**
 * Surface 8b — HTML email template (GET/PUT /email-template) + its use in
 * EMAIL deliveries. Rendering escapes ticket values before they enter the
 * HTML (XSS), unknown placeholders stay literal, and the seeded migration row
 * must equal the built-in default verbatim.
 */

const smtpMock = vi.hoisted(() => ({
  created: [] as Array<{ mails: unknown[]; sendMail: (mail: unknown) => Promise<unknown> }>,
}));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => {
      const transport = {
        mails: [] as unknown[],
        sendMail: async (mail: unknown) => {
          transport.mails.push(mail);
          return {};
        },
      };
      smtpMock.created.push(transport);
      return transport;
    }),
  },
}));

const HTML_TEMPLATE = `<p>Hello {{title}} &lt;tag&gt;</p><p>{{overview}}</p><p>{{description}}</p><p>{{recommendations}}</p><pre>{{iocs}}</pre><p>{{references}}</p><p>{{unknown}}</p>`;

describe("GET/PUT /email-template (Surface 8b)", () => {
  let app: FastifyInstance;
  let admin: C3User;
  let editor: C3User;
  let analyst: C3User;
  const emails: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    admin = await c3User("ADMIN");
    editor = await c3User("EDITOR");
    analyst = await c3User("ANALYST");
    emails.push(admin.email, editor.email, analyst.email);
  });

  afterAll(async () => {
    await prisma.emailTemplate.deleteMany({ where: { name: "default" } });
    await c3Cleanup({ ticketIds: [], emails });
    await prisma.$disconnect();
    await app.close();
  });

  it("GET serves the built-in default until an ADMIN stores a row", async () => {
    // Given: no email template row
    await prisma.emailTemplate.deleteMany({ where: { name: "default" } });

    // When: any authenticated role reads it
    const res = await app.inject({
      method: "GET",
      url: "/email-template",
      headers: { authorization: bearer(analyst, app) },
    });

    // Then: the built-in default subject+htmlBody come back
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      subject: DEFAULT_EMAIL_SUBJECT,
      htmlBody: DEFAULT_EMAIL_HTML,
      updatedAt: expect.any(String),
    });
  });

  it("the email_template migration seeds the built-in default verbatim", async () => {
    // Given: the migration SQL that seeds the single "default" row
    const migrations = await readdir(join(import.meta.dirname, "../prisma/migrations"));
    const dir = migrations.find((name) => name.endsWith("_email_template"));
    if (dir === undefined) {
      throw new Error("email_template migration directory not found");
    }
    const sql = await readFile(
      join(import.meta.dirname, "../prisma/migrations", dir, "migration.sql"),
      "utf8",
    );

    // Then: it embeds the exact TS built-ins (parity invariant — edit both or neither)
    expect(sql).toContain(DEFAULT_EMAIL_SUBJECT);
    expect(sql).toContain(DEFAULT_EMAIL_HTML);
  });

  it("PUT persists for an ADMIN and GET round-trips it", async () => {
    // When: an ADMIN stores a custom template and it is read back
    const put = await app.inject({
      method: "PUT",
      url: "/email-template",
      headers: { authorization: bearer(admin, app) },
      payload: { subject: "Custom bulletin: {{title}}", htmlBody: "<p>{{title}}</p>" },
    });
    const get = await app.inject({
      method: "GET",
      url: "/email-template",
      headers: { authorization: bearer(admin, app) },
    });

    // Then: the stored values round-trip
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({
      subject: "Custom bulletin: {{title}}",
      htmlBody: "<p>{{title}}</p>",
    });
    expect(get.statusCode).toBe(200);
    expect(get.json()).toMatchObject({ subject: "Custom bulletin: {{title}}" });
  });

  it("validation: short subject, oversized body and placeholder-less body are 400 VALIDATION", async () => {
    // Given: bodies violating subject length or carrying no known placeholder
    const shortSubject = app.inject({
      method: "PUT",
      url: "/email-template",
      headers: { authorization: bearer(admin, app) },
      payload: { subject: "tiny", htmlBody: "<p>{{title}}</p>" },
    });
    const noPlaceholder = app.inject({
      method: "PUT",
      url: "/email-template",
      headers: { authorization: bearer(admin, app) },
      payload: { subject: "Valid subject here", htmlBody: "<p>no tokens at all</p>" },
    });
    const oversize = app.inject({
      method: "PUT",
      url: "/email-template",
      headers: { authorization: bearer(admin, app) },
      payload: { subject: "Valid subject here", htmlBody: `<p>{{title}}</p>${"x".repeat(20000)}` },
    });

    // Then: each is rejected as 400 VALIDATION
    for (const res of await Promise.all([shortSubject, noPlaceholder, oversize])) {
      expect(res.statusCode).toBe(400);
      expect((res.json() as { error: { code: string } }).error.code).toBe("VALIDATION");
    }
  });

  it("RBAC: PUT is ADMIN-only and GET requires authentication", async () => {
    // Given: an EDITOR token and an anonymous caller
    const putByEditor = await app.inject({
      method: "PUT",
      url: "/email-template",
      headers: { authorization: bearer(editor, app) },
      payload: { subject: "Valid subject here", htmlBody: "<p>{{title}}</p>" },
    });
    const anonGet = await app.inject({ method: "GET", url: "/email-template" });

    // Then: mutation is 403, anonymous read is 401
    expect(putByEditor.statusCode).toBe(403);
    expect(anonGet.statusCode).toBe(401);
  });
});

describe("EMAIL delivery uses the rendered template (SND-P-03)", () => {
  let app: FastifyInstance;
  let admin: C3User;
  const emails: string[] = [];
  const ticketIds: string[] = [];
  const channelIds: string[] = [];
  const clientIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    admin = await c3User("ADMIN");
    emails.push(admin.email);
    await makeEmailChannel();
  });

  afterAll(async () => {
    await prisma.deliveryAudit.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.channel.deleteMany({ where: { id: { in: channelIds } } });
    await prisma.emailTemplate.deleteMany({ where: { name: "default" } });
    await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
    await c3Cleanup({ ticketIds, emails });
    await prisma.$disconnect();
    await app.close();
  });

  async function makeEmailChannel(): Promise<void> {
    const client = await prisma.client.create({
      data: { name: `email-tpl ${randomUUID()}` },
      select: { id: true },
    });
    clientIds.push(client.id);
    const channel = await prisma.channel.create({
      data: {
        clientId: client.id,
        type: "EMAIL",
        target: JSON.stringify({ bcc: ["soc@corp.test"] }),
        isActive: true,
      },
      select: { id: true },
    });
    channelIds.push(channel.id);
  }

  async function sendTicket(): Promise<{
    ticketId: string;
    statusCode: number;
    mail: Record<string, unknown>;
  }> {
    const ticket = await c3Ticket({ status: "READY", title: "Evil <script>" });
    ticketIds.push(ticket.id);
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { overview: "Adversaries target the sector.", description: "Details" },
    });
    await prisma.ioc.create({
      data: { ticketId: ticket.id, type: "DOMAIN", value: "evil.com" },
    });
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticket.id}/send`,
      headers: { authorization: bearer(admin, app) },
      payload: { all: true },
    });
    const transport = smtpMock.created.at(-1);
    if (transport === undefined) {
      throw new Error(`send did not reach SMTP (status ${res.statusCode})`);
    }
    return { ticketId: ticket.id, statusCode: res.statusCode, mail: transport.mails[0] as Record<string, unknown> };
  }

  it("with a stored template the mail carries the rendered subject + html and plain-text bulletin", async () => {
    // Given: a stored email template and an active EMAIL channel
    await prisma.emailTemplate.upsert({
      where: { name: "default" },
      update: { subject: "Alert: {{title}}", htmlBody: HTML_TEMPLATE },
      create: { name: "default", subject: "Alert: {{title}}", htmlBody: HTML_TEMPLATE },
    });

    // When: the READY ticket is sent to all channels
    const { ticketId, statusCode, mail } = await sendTicket();

    // Then: the mail is the rendered template — escaped HTML, defanged IOC,
    // plain-text alternative body — and the ticket is SENT
    expect(statusCode).toBe(200);
    expect(mail).toMatchObject({
      bcc: ["soc@corp.test"],
      subject: "Alert: Evil <script>",
    });
    expect(String(mail["html"])).toContain("Evil &lt;script&gt;");
    expect(String(mail["html"])).toContain("- DOMAIN evil[.]com");
    expect(String(mail["text"])).toContain("- DOMAIN evil[.]com");
    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).toMatchObject({
      status: "SENT",
    });
  });

  it("without a stored template the mail falls back to the plain bulletin", async () => {
    // Given: no email template row
    await prisma.emailTemplate.deleteMany({ where: { name: "default" } });

    // When: the READY ticket is sent
    const { statusCode, mail } = await sendTicket();

    // Then: subject is the ticket title and there is no html part
    expect(statusCode).toBe(200);
    expect(mail["subject"]).not.toContain("Alert:");
    expect(mail["html"]).toBeUndefined();
  });
});
