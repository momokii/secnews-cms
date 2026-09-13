import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { encryptSecret } from "../src/lib/crypto.js";
import { prisma } from "../src/lib/db.js";
import { bearer, c3Cleanup, c3Ticket, c3User, type C3User } from "./tickets.fixtures.js";

/** SND-01 active-only resolution (S3), SND-02 non-READY 422, SND-03 pending
 * 409 (S2), AUD-01 per-channel DeliveryAudit rows with the exact payload.
 * globalThis.fetch is stubbed so no real WAHA/Telegram traffic occurs. */

type SendResult = { statusCode: number; body: Record<string, unknown> };

type SentAuditRow = {
  channelId: string;
  channelType: string;
  status: string;
  errorDetail: string | null;
  payload: string;
  sentById: string;
  sentAt: string;
};

describe("POST /tickets/:id/send (SND-01…03, AUD-01)", () => {
  let app: FastifyInstance;
  let admin: C3User;
  let editor: C3User;
  let analyst: C3User;
  const emails: string[] = [];
  const ticketIds: string[] = [];
  const channelIds: string[] = [];
  const testChannelIds: string[] = [];
  const clientIds: string[] = [];
  const templateNames: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    admin = await c3User("ADMIN");
    editor = await c3User("EDITOR");
    analyst = await c3User("ANALYST");
    emails.push(admin.email, editor.email, analyst.email);
  });

  afterAll(async () => {
    await prisma.deliveryAudit.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.channel.deleteMany({ where: { id: { in: channelIds } } });
    await prisma.bulletinTemplate.deleteMany({ where: { name: { in: templateNames } } });
    await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
    await c3Cleanup({ ticketIds, emails });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    // `all:true` resolves every active channel globally (S3 contract), so each
    // test deactivates the channels it created to keep the suite independent.
    if (testChannelIds.length > 0) {
      await prisma.channel.updateMany({
        where: { id: { in: testChannelIds } },
        data: { isActive: false },
      });
      testChannelIds.length = 0;
    }
  });

  function stubSendersOk(): { urls: string[] } {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      async (url: string | URL | Request): Promise<Response> => {
        urls.push(url.toString());
        return new Response("{}", { status: 200 });
      },
    );
    return { urls };
  }

  async function makeClient(): Promise<string> {
    const client = await prisma.client.create({
      data: { name: `send ${randomUUID()}` },
      select: { id: true },
    });
    clientIds.push(client.id);
    return client.id;
  }

  async function makeChannel(
    clientId: string,
    type: "WHATSAPP" | "TELEGRAM",
    active: boolean,
  ): Promise<string> {
    const target =
      type === "WHATSAPP"
        ? JSON.stringify({ chatId: `${randomUUID()}@g.us` })
        : JSON.stringify({ chatId: `-${randomUUID()}`, token: encryptSecret("test:token") });
    const channel = await prisma.channel.create({
      data: { clientId, type, target, isActive: active },
      select: { id: true },
    });
    channelIds.push(channel.id);
    testChannelIds.push(channel.id);
    return channel.id;
  }

  async function makeReadyTicket(iocValue?: string): Promise<string> {
    const ticket = await c3Ticket({ status: "READY" });
    ticketIds.push(ticket.id);
    if (iocValue !== undefined) {
      await prisma.ioc.create({
        data: { ticketId: ticket.id, type: "DOMAIN", value: iocValue },
      });
    }
    return ticket.id;
  }

  async function send(
    user: C3User,
    ticketId: string,
    payload: Record<string, unknown>,
  ): Promise<SendResult> {
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/send`,
      headers: { authorization: bearer(user, app) },
      payload,
    });
    return { statusCode: res.statusCode, body: res.json() as Record<string, unknown> };
  }

  it("SND-02: rejects an OPEN ticket with 422 VALIDATION and sends nothing", async () => {
    // Given: an OPEN ticket and an active channel
    const ticket = await c3Ticket({ status: "OPEN" });
    ticketIds.push(ticket.id);
    await makeChannel(await makeClient(), "WHATSAPP", true);
    stubSendersOk();

    // When: a send to all channels is requested
    const res = await send(admin, ticket.id, { all: true });

    // Then: 422 VALIDATION, no audit rows, status untouched
    expect(res.statusCode).toBe(422);
    expect((res.body as { error: { code: string } }).error.code).toBe("VALIDATION");
    expect(await prisma.deliveryAudit.count({ where: { ticketId: ticket.id } })).toBe(0);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).status).toBe("OPEN");
  });

  it("SND-03: hard-blocks a READY ticket holding PENDING suggestions with 409 (S2)", async () => {
    // Given: a READY ticket with one PENDING AI suggestion
    const ticketId = await makeReadyTicket();
    await prisma.aiSuggestion.create({
      data: { ticketId, status: "PENDING", model: "test", content: "{}" },
    });
    await makeChannel(await makeClient(), "WHATSAPP", true);
    stubSendersOk();

    // When: a send is requested
    const res = await send(admin, ticketId, { all: true });

    // Then: 409 PENDING_SUGGESTIONS, no audit rows, ticket stays READY
    expect(res.statusCode).toBe(409);
    expect((res.body as { error: { code: string } }).error.code).toBe("PENDING_SUGGESTIONS");
    expect(await prisma.deliveryAudit.count({ where: { ticketId } })).toBe(0);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).status).toBe("READY");
  });

  it("SND-01: {all:true} silently excludes inactive channels and sends to active ones (S3)", async () => {
    // Given: a READY ticket with one active and one inactive channel
    const ticketId = await makeReadyTicket();
    const clientId = await makeClient();
    const activeId = await makeChannel(clientId, "WHATSAPP", true);
    const inactiveId = await makeChannel(clientId, "TELEGRAM", false);
    const { urls } = stubSendersOk();

    // When: a send to all channels is requested
    const res = await send(admin, ticketId, { all: true });

    // Then: 200, audit covers only the active channel, ticket → SENT
    expect(res.statusCode).toBe(200);
    const audit = (res.body as { audit: Array<{ channelId: string }> }).audit;
    expect(audit.map((row) => row.channelId)).toEqual([activeId]);
    expect(urls.every((url) => url.includes("/api/sendText"))).toBe(true);
    expect(await prisma.deliveryAudit.count({ where: { ticketId } })).toBe(1);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).status).toBe("SENT");
    void inactiveId;
  });

  it("SND-01: explicit channelIds naming an inactive channel → 409 INACTIVE_TARGET", async () => {
    // Given: a READY ticket and an inactive channel
    const ticketId = await makeReadyTicket();
    const inactiveId = await makeChannel(await makeClient(), "TELEGRAM", false);
    stubSendersOk();

    // When: that channel is named explicitly
    const res = await send(admin, ticketId, { channelIds: [inactiveId] });

    // Then: 409 INACTIVE_TARGET and no delivery happened
    expect(res.statusCode).toBe(409);
    expect((res.body as { error: { code: string } }).error.code).toBe("INACTIVE_TARGET");
    expect(await prisma.deliveryAudit.count({ where: { ticketId } })).toBe(0);
  });

  it("AUD-01: writes one DeliveryAudit row per target carrying actor, timestamp and the exact payload", async () => {
    // Given: a READY ticket, a domain IOC, an active template and two active channels
    const ticketId = await makeReadyTicket("evil.com");
    const clientId = await makeClient();
    await makeChannel(clientId, "WHATSAPP", true);
    await makeChannel(clientId, "TELEGRAM", true);
    const templateName = `aud-tpl-${randomUUID()}`;
    templateNames.push(templateName);
    await prisma.bulletinTemplate.create({
      data: { name: templateName, body: "Title: {{title}}\nIOCs:\n{{ioc_block}}" },
    });
    stubSendersOk();

    // When: the ticket is sent to all channels
    const res = await send(admin, ticketId, { all: true });

    // Then: two audit rows exist with the exact rendered payload, actor and timestamp
    expect(res.statusCode).toBe(200);
    const audit = (res.body as { audit: SentAuditRow[] }).audit;
    expect(audit).toHaveLength(2);
    const expectedPayload = `Title: ${(await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).title}\nIOCs:\n- DOMAIN: evil[.]com`;
    for (const row of audit) {
      expect(row.status).toBe("SENT");
      expect(row.errorDetail).toBeNull();
      expect(row.payload).toBe(expectedPayload);
      expect(row.sentById).toBe(admin.id);
      expect(typeof row.sentAt).toBe("string");
      expect(Number.isNaN(Date.parse(row.sentAt as string))).toBe(false);
    }
    expect(new Set(audit.map((row) => row.channelType))).toEqual(new Set(["WHATSAPP", "TELEGRAM"]));
    const persisted = await prisma.deliveryAudit.findMany({ where: { ticketId } });
    expect(persisted).toHaveLength(2);
    expect(persisted.every((row) => row.status === "SENT" && row.error === null)).toBe(true);

    // And: the audit trail endpoint lists the same rows
    const trail = await app.inject({
      method: "GET",
      url: `/tickets/${ticketId}/delivery-audit`,
      headers: { authorization: bearer(analyst, app) },
    });
    expect(trail.statusCode).toBe(200);
    expect((trail.json() as { total: number }).total).toBe(2);
  });

  it("AUD-01: a failing channel send still lands a FAILED audit row while siblings succeed", async () => {
    // Given: two active channels and a fetch stub that fails the WAHA call only
    const ticketId = await makeReadyTicket();
    const clientId = await makeClient();
    await makeChannel(clientId, "WHATSAPP", true);
    await makeChannel(clientId, "TELEGRAM", true);
    vi.stubGlobal(
      "fetch",
      async (url: string | URL | Request): Promise<Response> => {
        if (url.toString().includes("/api/sendText")) {
          return new Response("gateway down", { status: 502 });
        }
        return new Response("{}", { status: 200 });
      },
    );

    // When: the ticket is sent to all channels
    const res = await send(editor, ticketId, { all: true });

    // Then: statuses split SENT/FAILED with the failure detail recorded
    expect(res.statusCode).toBe(200);
    const audit = (res.body as { audit: SentAuditRow[] }).audit;
    const waha = audit.find((row) => row.channelType === "WHATSAPP");
    const telegram = audit.find((row) => row.channelType === "TELEGRAM");
    expect(waha?.status).toBe("FAILED");
    expect(waha?.errorDetail).toMatch(/502/);
    expect(telegram?.status).toBe("SENT");
    expect(await prisma.deliveryAudit.count({ where: { ticketId } })).toBe(2);
  });

  it("gates send to MGR (ADMIN/EDITOR): analyst gets 403", async () => {
    // Given: a READY ticket and an analyst token
    const ticketId = await makeReadyTicket();
    await makeChannel(await makeClient(), "WHATSAPP", true);
    stubSendersOk();

    // When: the analyst attempts a send
    const res = await send(analyst, ticketId, { all: true });

    // Then: 403 FORBIDDEN
    expect(res.statusCode).toBe(403);
    expect((res.body as { error: { code: string } }).error.code).toBe("FORBIDDEN");
  });

  it("returns 404 for an unknown ticket id", async () => {
    // Given: a valid but nonexistent uuid
    // When: a send targets it
    const res = await send(admin, randomUUID(), { all: true });
    // Then: 404 NOT_FOUND
    expect(res.statusCode).toBe(404);
  });
});
