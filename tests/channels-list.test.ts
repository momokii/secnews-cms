import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import { bearer, c3Cleanup, c3User, type C3User } from "./tickets.fixtures.js";

/** CHN-LIST — GET /clients/:clientId/channels: the persisted channel list so
 * the web panel survives a popup close/reopen. Read matches GET /clients:
 * ANY role. Telegram rows stay masked (CHN-02); clients never see each
 * other's rows. */

describe("GET /clients/:clientId/channels (CHN-LIST)", () => {
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
    method: "GET" | "POST",
    url: string,
    user: C3User,
    payload?: Record<string, unknown>,
  ): Promise<{ statusCode: number; body: unknown }> {
    const res = await app.inject({
      method,
      url,
      headers: { authorization: bearer(user, app) },
      ...(payload === undefined ? {} : { payload }),
    });
    return {
      statusCode: res.statusCode,
      body: res.body === "" ? null : (res.json() as unknown),
    };
  }

  async function createClient(name: string): Promise<string> {
    const res = await inject("POST", "/clients", admin, { name });
    expect(res.statusCode).toBe(201);
    const id = (res.body as { id: string }).id;
    clientIds.push(id);
    return id;
  }

  it("lists channels created earlier — the list survives a panel reopen", async () => {
    // Given: a client with a WHATSAPP and a TELEGRAM channel
    const clientId = await createClient(`List Co ${randomUUID()}`);
    const wa = await inject("POST", `/clients/${clientId}/channels`, admin, {
      type: "WHATSAPP",
      chatId: "12036302@g.us",
    });
    const tg = await inject("POST", `/clients/${clientId}/channels`, admin, {
      type: "TELEGRAM",
      chatId: "-100200",
      token: "123456:AAHk-token",
    });
    expect(wa.statusCode).toBe(201);
    expect(tg.statusCode).toBe(201);

    // When: the list is fetched, then fetched again (panel reopened)
    const first = await inject("GET", `/clients/${clientId}/channels`, admin);
    const reopened = await inject("GET", `/clients/${clientId}/channels`, admin);

    // Then: both reads return the same two persisted channels
    expect(first.statusCode).toBe(200);
    const channels = first.body as Array<{ id: string; type: string; chatId: string }>;
    expect(channels).toHaveLength(2);
    expect(channels.map((c) => c.type).sort()).toEqual(["TELEGRAM", "WHATSAPP"]);
    expect(reopened.body).toEqual(first.body);
  });

  it("never leaks the raw Telegram token — list carries tokenMasked/hasToken only", async () => {
    // Given: a TELEGRAM channel created with a known bot token
    const rawToken = "7654321:LIST-do-not-leak";
    const clientId = await createClient(`Tg List Co ${randomUUID()}`);
    await inject("POST", `/clients/${clientId}/channels`, admin, {
      type: "TELEGRAM",
      chatId: "-1",
      token: rawToken,
    });

    // When: the channel list is read back
    const list = await inject("GET", `/clients/${clientId}/channels`, admin);
    expect(list.statusCode).toBe(200);

    // Then: the raw token never appears; the row carries only mask + flag
    const serialized = JSON.stringify(list.body);
    expect(serialized).not.toContain(rawToken);
    expect(serialized).not.toContain("LIST-do-not-leak");
    const channel = (list.body as Array<{ type: string; tokenMasked?: string; hasToken?: boolean }>).find(
      (c) => c.type === "TELEGRAM",
    );
    expect(channel?.tokenMasked).toContain("…");
    expect(channel?.hasToken).toBe(true);
    expect(Object.hasOwn(channel as object, "token")).toBe(false);
  });

  it("isolates clients — each client lists only its own channels", async () => {
    // Given: two clients, one channel each
    const clientA = await createClient(`Iso A ${randomUUID()}`);
    const clientB = await createClient(`Iso B ${randomUUID()}`);
    const channelA = await inject("POST", `/clients/${clientA}/channels`, admin, {
      type: "WHATSAPP",
      chatId: "a-isolation@g.us",
    });
    await inject("POST", `/clients/${clientB}/channels`, admin, {
      type: "EMAIL",
      bcc: ["b@iso.test"],
    });
    const idA = (channelA.body as { id: string }).id;

    // When: each client's list is read
    const listA = await inject("GET", `/clients/${clientA}/channels`, admin);
    const listB = await inject("GET", `/clients/${clientB}/channels`, admin);

    // Then: neither list contains the other client's channel
    expect(listA.statusCode).toBe(200);
    expect(listB.statusCode).toBe(200);
    const idsA = (listA.body as Array<{ id: string }>).map((c) => c.id);
    const idsB = (listB.body as Array<{ id: string }>).map((c) => c.id);
    expect(idsA).toContain(idA);
    expect(idsB).not.toContain(idA);
    expect(listA.body).toHaveLength(1);
    expect(listB.body).toHaveLength(1);
  });

  it("read is open to ANY role, matching GET /clients", async () => {
    // Given: a client with a channel and an analyst (non-MGR) token
    const clientId = await createClient(`Any Role ${randomUUID()}`);
    await inject("POST", `/clients/${clientId}/channels`, admin, {
      type: "WHATSAPP",
      chatId: "any-role@g.us",
    });

    // When: the analyst reads the channel list
    const list = await inject("GET", `/clients/${clientId}/channels`, analyst);

    // Then: read succeeds (mutations stay MGR-gated, covered by CHN-01)
    expect(list.statusCode).toBe(200);
    expect(list.body).toHaveLength(1);
  });

  it("returns an empty array for a client with no channels", async () => {
    // Given: a client without channels
    const clientId = await createClient(`Empty ${randomUUID()}`);

    // When: its list is read
    const list = await inject("GET", `/clients/${clientId}/channels`, admin);

    // Then: 200 with an empty array
    expect(list.statusCode).toBe(200);
    expect(list.body).toEqual([]);
  });
});
