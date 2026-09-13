import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import { bearer, c3Cleanup, c3User, type C3User } from "./tickets.fixtures.js";

/** CHN-01 clients/channels CRUD, CHN-02 telegram token secrecy: the raw bot
 * token is encrypted at rest and responses carry tokenMasked/hasToken only. */

describe("clients + channels CRUD (CHN-01, CHN-02)", () => {
  let app: FastifyInstance;
  let admin: C3User;
  let analyst: C3User;
  const emails: string[] = [];
  const clientIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    admin = await c3User("ADMIN");
    analyst = await c3User("ANALYST");
    emails.push(admin.email, analyst.email);
  });

  afterAll(async () => {
    await prisma.channel.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
    await c3Cleanup({ emails });
    await prisma.$disconnect();
  });

  async function inject(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    url: string,
    user: C3User,
    payload?: Record<string, unknown>,
  ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const res = await app.inject({
      method,
      url,
      headers: { authorization: bearer(user, app) },
      ...(payload === undefined ? {} : { payload }),
    });
    return {
      statusCode: res.statusCode,
      body: res.body === "" ? {} : (res.json() as Record<string, unknown>),
    };
  }

  it("CHN-01: creates, lists, updates and deletes a client (MGR only)", async () => {
    // Given: an admin token and a client payload
    const created = await inject("POST", "/clients", admin, { name: "ACME Bank" });
    expect(created.statusCode).toBe(201);
    const client = created.body as { id: string; name: string; active: boolean };
    clientIds.push(client.id);
    expect(client.name).toBe("ACME Bank");
    expect(client.active).toBe(true);

    // When: the client is listed, patched and filtered by name
    const list = await inject("GET", "/clients?q=ACME", admin);
    const patched = await inject("PATCH", `/clients/${client.id}`, admin, { active: false });
    const deleted = await inject("DELETE", `/clients/${client.id}`, admin);
    const afterDelete = await inject("PATCH", `/clients/${client.id}`, admin, { name: "Zombie" });

    // Then: list contains it, patch toggles active, delete removes it (404 after)
    expect(list.statusCode).toBe(200);
    expect((list.body as { total: number }).total).toBe(1);
    expect(patched.statusCode).toBe(200);
    expect((patched.body as { active: boolean }).active).toBe(false);
    expect(deleted.statusCode).toBe(204);
    expect(afterDelete.statusCode).toBe(404);
  });

  it("CHN-01: creates WHATSAPP, TELEGRAM and EMAIL channels under a client", async () => {
    // Given: a client and one body per channel type
    const client = (
      await inject("POST", "/clients", admin, { name: `Chan Co ${randomUUID()}` })
    ).body as { id: string };
    clientIds.push(client.id);

    // When: each channel type is created
    const wa = await inject("POST", `/clients/${client.id}/channels`, admin, {
      type: "WHATSAPP",
      chatId: "12036302@g.us",
    });
    const tg = await inject("POST", `/clients/${client.id}/channels`, admin, {
      type: "TELEGRAM",
      chatId: "-100200",
      token: "123456:AAHk-token",
    });
    const mail = await inject("POST", `/clients/${client.id}/channels`, admin, {
      type: "EMAIL",
      bcc: ["soc@acme.test", "ciso@acme.test"],
    });

    // Then: all three land with their type-specific wire shapes
    expect(wa.statusCode).toBe(201);
    expect(wa.body).toMatchObject({ type: "WHATSAPP", chatId: "12036302@g.us", active: true });
    expect(mail.statusCode).toBe(201);
    expect(mail.body).toMatchObject({ type: "EMAIL", bcc: ["soc@acme.test", "ciso@acme.test"] });
    expect(tg.statusCode).toBe(201);
    expect(tg.body).toMatchObject({ type: "TELEGRAM", chatId: "-100200", hasToken: true });
  });

  it("CHN-01: patches and deletes channels; rejects unknown ids with 404", async () => {
    // Given: a client with a WHATSAPP channel
    const client = (
      await inject("POST", "/clients", admin, { name: `Patch Co ${randomUUID()}` })
    ).body as { id: string };
    clientIds.push(client.id);
    const channel = (
      await inject("POST", `/clients/${client.id}/channels`, admin, {
        type: "WHATSAPP",
        chatId: "old@g.us",
      })
    ).body as { id: string };

    // When: chatId is patched, then the channel is deleted; an unknown id is patched
    const patched = await inject("PATCH", `/channels/${channel.id}`, admin, { chatId: "new@g.us" });
    const deleted = await inject("DELETE", `/channels/${channel.id}`, admin);
    const missing = await inject("PATCH", `/channels/${randomUUID()}`, admin, { active: false });

    // Then: patch updates, delete removes, unknown id → 404
    expect(patched.statusCode).toBe(200);
    expect((patched.body as { chatId: string }).chatId).toBe("new@g.us");
    expect(deleted.statusCode).toBe(204);
    expect(missing.statusCode).toBe(404);
  });

  it("CHN-02: telegram responses carry only tokenMasked/hasToken, never the raw token", async () => {
    // Given: a telegram channel created with a known bot token
    const rawToken = "7654321:SECRET-do-not-leak";
    const client = (
      await inject("POST", "/clients", admin, { name: `Tg Sec Co ${randomUUID()}` })
    ).body as { id: string };
    clientIds.push(client.id);
    const created = (
      await inject("POST", `/clients/${client.id}/channels`, admin, {
        type: "TELEGRAM",
        chatId: "-1",
        token: rawToken,
      })
    ).body as { id: string; tokenMasked: string };

    // When: the channel is read back via its wire shape
    // Then: the raw token never appears and the mask hides most of it
    expect(created.tokenMasked).not.toContain(rawToken);
    expect(created.tokenMasked).toContain("…");

    const row = await prisma.channel.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.target).not.toContain(rawToken);

    // When: the token is rotated
    const rotated = await inject("PATCH", `/channels/${created.id}`, admin, {
      token: "9999999:ROTATED-token",
    });

    // Then: the new raw token is likewise absent from the response and storage
    expect(rotated.statusCode).toBe(200);
    expect(JSON.stringify(rotated.body)).not.toContain("ROTATED-token");
    const rotatedRow = await prisma.channel.findUniqueOrThrow({ where: { id: created.id } });
    expect(rotatedRow.target).not.toContain("ROTATED-token");
  });

  it("CHN-01: read is open to ANY role, mutations are MGR-gated", async () => {
    // Given: an analyst (non-MGR) token
    const list = await inject("GET", "/clients", analyst);

    // When: the analyst reads and then attempts a mutation
    // Then: read succeeds, mutation is 403 FORBIDDEN
    expect(list.statusCode).toBe(200);
    const denied = await inject("POST", "/clients", analyst, { name: "Nope" });
    expect(denied.statusCode).toBe(403);
    expect((denied.body as { error: { code: string } }).error.code).toBe("FORBIDDEN");
  });
});
