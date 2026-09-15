import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { decryptSecret } from "../src/lib/crypto.js";
import { prisma } from "../src/lib/db.js";
import { bearerFor, cleanupUsers } from "./helpers.js";

/**
 * TASK-BE — DeepSeek as a fourth AI provider (IntegrationKind DEEPSEEK):
 * config stores/reads like the other AI kinds (encrypted, masked), the
 * test-connection probe hits the documented chat-completions endpoint and
 * reports upstream 401 as ok:false (never an HTTP error), and the provider
 * appears in GET /integrations/available. Wire always stubbed.
 */

const KEY = "sk-deepseek-secret-1234567890";

describe("DeepSeek integration kind (TASK-BE)", () => {
  let app: FastifyInstance;
  let admin = "";
  let analyst = "";

  beforeAll(async () => {
    app = await buildApp();
    admin = await bearerFor(app, "ADMIN");
    analyst = await bearerFor(app, "ANALYST");
    await prisma.integrationConfig.deleteMany({ where: { kind: "DEEPSEEK" } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await prisma.integrationConfig.deleteMany({ where: { kind: "DEEPSEEK" } });
    await cleanupUsers();
    await prisma.$disconnect();
    await app.close();
  });

  it("DS-01: PUT stores an encrypted key + model; GET reports maskedKey, never plaintext", async () => {
    // Given: an ADMIN-configured DeepSeek key with the documented default model
    const put = await app.inject({
      method: "PUT",
      url: "/integrations/DEEPSEEK",
      headers: { authorization: admin },
      payload: { apiKey: KEY, model: "deepseek-flash" },
    });
    expect(put.statusCode).toBe(200);

    // When: the config is read back over the wire and at rest
    const get = await app.inject({
      method: "GET",
      url: "/integrations/DEEPSEEK",
      headers: { authorization: admin },
    });
    const row = await prisma.integrationConfig.findUnique({ where: { kind: "DEEPSEEK" } });

    // Then: masked + hasKey on the wire, ciphertext at rest decrypting to the payload
    expect(get.statusCode).toBe(200);
    const body = get.json() as { kind: string; model: string | null; hasKey: boolean; maskedKey: string | null };
    expect(body.kind).toBe("DEEPSEEK");
    expect(body.model).toBe("deepseek-flash");
    expect(body.hasKey).toBe(true);
    expect(get.body).not.toContain(KEY);
    const stored = JSON.parse(decryptSecret(row?.encryptedKey ?? "")) as { apiKey: string; model?: string };
    expect(stored.apiKey).toBe(KEY);
    expect(stored.model).toBe("deepseek-flash");
  });

  it("DS-02: test-connection probes https://api.deepseek.com/chat/completions with Bearer auth; healthy upstream → ok:true", async () => {
    // Given: a healthy DeepSeek upstream capturing the probe
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "pong" }, finish_reason: "stop", index: 0 }] }),
          { status: 200 },
        );
      }),
    );

    // When: the connection is tested
    const res = await app.inject({
      method: "POST",
      url: "/integrations/DEEPSEEK/test",
      headers: { authorization: admin },
      payload: {},
    });

    // Then: 200 ok:true, and the probe is the documented endpoint with Bearer auth
    expect(res.statusCode).toBe(200);
    expect((res.json() as { ok: boolean }).ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.deepseek.com/chat/completions");
    expect(new Headers(calls[0]?.init.headers).get("authorization")).toBe(`Bearer ${KEY}`);
    const sent = JSON.parse(String(calls[0]?.init.body)) as { model: string; messages: unknown[] };
    expect(sent.model).toBe("deepseek-flash");
    expect(sent.messages.length).toBeGreaterThanOrEqual(1);
    expect(res.body).not.toContain(KEY);
  });

  it("DS-03: upstream 401 → still HTTP 200 with ok:false detail, key never on the wire", async () => {
    // Given: a DeepSeek upstream rejecting the key
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { message: "auth" } }), { status: 401 })),
    );

    // When: the connection is tested
    const res = await app.inject({
      method: "POST",
      url: "/integrations/DEEPSEEK/test",
      headers: { authorization: admin },
      payload: {},
    });

    // Then: 200 {ok:false, detail names 401}; no key material anywhere
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; detail?: string };
    expect(body.ok).toBe(false);
    expect(body.detail).toMatch(/401/);
    expect(res.body).not.toContain(KEY);
  });

  it("DS-04: GET /integrations/available lists DEEPSEEK among the kinds, WORK-readable", async () => {
    // Given: only DEEPSEEK configured (DS-01)
    await prisma.integrationConfig.deleteMany({
      where: { kind: { in: ["OPENAI", "ANTHROPIC", "GEMINI", "OTX"] } },
    });

    // When: an ANALYST reads the available list
    const res = await app.inject({
      method: "GET",
      url: "/integrations/available",
      headers: { authorization: analyst },
    });

    // Then: all five kinds appear, DEEPSEEK carrying its model + hasKey
    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ kind: string; model: string | null; hasKey: boolean }>;
    expect(body.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining(["OPENAI", "ANTHROPIC", "GEMINI", "DEEPSEEK", "OTX"]),
    );
    expect(body.find((entry) => entry.kind === "DEEPSEEK")).toEqual({
      kind: "DEEPSEEK",
      model: "deepseek-flash",
      hasKey: true,
    });
    expect(res.body).not.toContain(KEY);
  });

  it("DS-05: an explicit DEEPSEEK provider without a configured key is 422, never a silent fallback", async () => {
    // Given: the DEEPSEEK config row removed
    await prisma.integrationConfig.deleteMany({ where: { kind: "DEEPSEEK" } });
    const ticket = await prisma.ticket.create({
      data: {
        title: "DS fixture",
        summary: "s",
        origin: "MANUAL",
        status: "OPEN",
        findingType: "OTHER",
      },
      select: { id: true },
    });
    try {
      // When: ai/fill explicitly asks for DEEPSEEK
      const res = await app.inject({
        method: "POST",
        url: `/tickets/${ticket.id}/ai/fill`,
        headers: { authorization: analyst },
        payload: { provider: "DEEPSEEK" },
      });

      // Then: semantic rejection
      expect(res.statusCode).toBe(422);
      expect((res.json() as { error: { code: string } }).error.code).toBe("VALIDATION");
      expect((res.json() as { error: { message: string } }).error.message).toContain("DEEPSEEK");
    } finally {
      await prisma.ticket.delete({ where: { id: ticket.id } });
    }
  });
});
