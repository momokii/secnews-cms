import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { decryptSecret } from "../src/lib/crypto.js";
import { prisma } from "../src/lib/db.js";
import { bearerFor, cleanupUsers } from "./helpers.js";

const KEY = "sk-plain-secret-abcdef1234567890";
const KINDS = ["OPENAI", "ANTHROPIC", "GEMINI", "DEEPSEEK", "OTX", "SMTP", "WAHA"] as const;

describe("TASK-C4 integrations surface (encrypted at rest, masked out)", () => {
  let app: FastifyInstance;
  let admin = "";

  beforeAll(async () => {
    app = await buildApp();
    admin = await bearerFor(app, "ADMIN");
    await prisma.integrationConfig.deleteMany({ where: { kind: { in: [...KINDS] } } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await prisma.integrationConfig.deleteMany({ where: { kind: { in: [...KINDS] } } });
    await cleanupUsers();
    await prisma.$disconnect();
    await app.close();
  });

  it("INT-01: PUT stores a key, GET returns maskedKey only — plaintext never leaves the server", async () => {
    // Given: an ADMIN-configured OPENAI key
    const put = await app.inject({
      method: "PUT",
      url: "/integrations/OPENAI",
      headers: { authorization: admin },
      payload: { apiKey: KEY, model: "gpt-4o-mini" },
    });
    expect(put.statusCode).toBe(200);

    // When: the config is read back
    const get = await app.inject({
      method: "GET",
      url: "/integrations/OPENAI",
      headers: { authorization: admin },
    });

    // Then: masked key + model + hasKey, and the plaintext appears nowhere in the payload
    expect(get.statusCode).toBe(200);
    const body = get.json() as { kind: string; model: string | null; hasKey: boolean; maskedKey: string | null };
    expect(body.kind).toBe("OPENAI");
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.hasKey).toBe(true);
    expect(body.maskedKey).toBe("sk-p…7890");
    expect(get.body).not.toContain(KEY);
  });

  it("INT-02: the at-rest row is AES-256-GCM ciphertext that decrypts to the stored config", async () => {
    // Given: the OPENAI config stored by INT-01
    const row = await prisma.integrationConfig.findUnique({ where: { kind: "OPENAI" } });
    expect(row).not.toBeNull();

    // When: the stored blob is inspected
    const stored = row?.encryptedKey ?? "";

    // Then: it is not plaintext, and decrypting yields the apiKey+model payload
    expect(stored).not.toContain(KEY);
    const decoded = JSON.parse(decryptSecret(stored)) as { apiKey: string; model?: string };
    expect(decoded.apiKey).toBe(KEY);
    expect(decoded.model).toBe("gpt-4o-mini");
  });

  it("INT-02: OTX config forbids model and GET reports model=null", async () => {
    // Given: an OTX payload that carries a model field
    const put = await app.inject({
      method: "PUT",
      url: "/integrations/OTX",
      headers: { authorization: admin },
      payload: { apiKey: "5m3jkh-otx-key-9876", model: "gpt-4o-mini" },
    });

    // Then: it is rejected as semantically invalid
    expect(put.statusCode).toBe(422);
    expect((put.json() as { error: { code: string } }).error.code).toBe("VALIDATION");

    // When: OTX is configured without model, then read back
    const ok = await app.inject({
      method: "PUT",
      url: "/integrations/OTX",
      headers: { authorization: admin },
      payload: { apiKey: "5m3jkh-otx-key-9876" },
    });
    const get = await app.inject({
      method: "GET",
      url: "/integrations/OTX",
      headers: { authorization: admin },
    });

    // Then: stored fine, model null, masked only
    expect(ok.statusCode).toBe(200);
    const body = get.json() as { kind: string; model: string | null; hasKey: boolean; maskedKey: string };
    expect(body.model).toBeNull();
    expect(body.hasKey).toBe(true);
    expect(body.maskedKey).toBe("5m3j…9876");
    expect(get.body).not.toContain("5m3jkh-otx-key-9876");
  });

  it("INT-01: an unconfigured kind reports hasKey=false without any key material", async () => {
    // Given: GEMINI was never configured
    // When: it is read back
    const get = await app.inject({
      method: "GET",
      url: "/integrations/GEMINI",
      headers: { authorization: admin },
    });

    // Then: hasKey false, maskedKey null
    expect(get.statusCode).toBe(200);
    const body = get.json() as { hasKey: boolean; maskedKey: string | null };
    expect(body.hasKey).toBe(false);
    expect(body.maskedKey).toBeNull();
  });

  it("POST /integrations/:kind/test: upstream success reports ok=true; failure reports ok=false, never an HTTP error", async () => {
    // Given: OPENAI configured (INT-01) and a healthy upstream
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }));
    const ok = await app.inject({
      method: "POST",
      url: "/integrations/OPENAI/test",
      headers: { authorization: admin },
      payload: {},
    });

    // Then: 200 {ok:true, latencyMs} and the key stays off the wire
    expect(ok.statusCode).toBe(200);
    const okBody = ok.json() as { ok: boolean; latencyMs?: number };
    expect(okBody.ok).toBe(true);
    expect(typeof okBody.latencyMs).toBe("number");
    expect(ok.body).not.toContain(KEY);

    // Given: a failing upstream
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: {} }), { status: 401 }));
    const bad = await app.inject({
      method: "POST",
      url: "/integrations/OPENAI/test",
      headers: { authorization: admin },
      payload: {},
    });

    // Then: still 200 with ok:false detail, no key material
    expect(bad.statusCode).toBe(200);
    const badBody = bad.json() as { ok: boolean; detail?: string };
    expect(badBody.ok).toBe(false);
    expect(badBody.detail).toMatch(/401/);
    expect(bad.body).not.toContain(KEY);
  });

  it("POST /integrations/:kind/test on an unconfigured kind reports ok=false", async () => {
    // Given: ANTHROPIC has no stored key
    // When: its connection is tested
    const res = await app.inject({
      method: "POST",
      url: "/integrations/ANTHROPIC/test",
      headers: { authorization: admin },
      payload: {},
    });

    // Then: 200 {ok:false}
    expect(res.statusCode).toBe(200);
    expect((res.json() as { ok: boolean }).ok).toBe(false);
  });

  it("integrations are ADMIN-only: a WORK token gets 403 FORBIDDEN", async () => {
    // Given: an EDITOR token
    const editor = await bearerFor(app, "EDITOR");
    // When: it reads an integration config
    const res = await app.inject({
      method: "GET",
      url: "/integrations/OPENAI",
      headers: { authorization: editor },
    });
    // Then: forbidden
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: { code: string } }).error.code).toBe("FORBIDDEN");
  });

  it("TASK-AIB: GET /integrations/available lists every kind with model+hasKey, no key material, WORK-readable", async () => {
    // Given: only OPENAI configured (earlier tests in this suite stored an OTX key)
    await prisma.integrationConfig.deleteMany({ where: { kind: { in: [...KINDS] } } });
    await app.inject({
      method: "PUT",
      url: "/integrations/OPENAI",
      headers: { authorization: admin },
      payload: { apiKey: KEY, model: "gpt-4o-mini" },
    });

    // When: ADMIN, EDITOR and ANALYST read the available list
    const byAdmin = await app.inject({ method: "GET", url: "/integrations/available", headers: { authorization: admin } });
    const byEditor = await app.inject({
      method: "GET",
      url: "/integrations/available",
      headers: { authorization: await bearerFor(app, "EDITOR") },
    });
    const byAnalyst = await app.inject({
      method: "GET",
      url: "/integrations/available",
      headers: { authorization: await bearerFor(app, "ANALYST") },
    });

    // Then: every WORK role may read it and all seven kinds appear
    expect(byAdmin.statusCode).toBe(200);
    expect(byEditor.statusCode).toBe(200);
    expect(byAnalyst.statusCode).toBe(200);
    const body = byAdmin.json() as Array<{ kind: string; model: string | null; hasKey: boolean }>;
    expect(body).toHaveLength(7);
    const byKind = new Map(body.map((entry) => [entry.kind, entry]));
    expect(byKind.get("OPENAI")).toEqual({ kind: "OPENAI", model: "gpt-4o-mini", hasKey: true });
    expect(byKind.get("ANTHROPIC")).toEqual({ kind: "ANTHROPIC", model: null, hasKey: false });
    expect(byKind.get("GEMINI")).toEqual({ kind: "GEMINI", model: null, hasKey: false });
    expect(byKind.get("DEEPSEEK")).toEqual({ kind: "DEEPSEEK", model: null, hasKey: false });
    expect(byKind.get("OTX")).toEqual({ kind: "OTX", model: null, hasKey: false });
    expect(byKind.get("SMTP")).toEqual({ kind: "SMTP", model: null, hasKey: false });
    expect(byKind.get("WAHA")).toEqual({ kind: "WAHA", model: null, hasKey: false });

    // And: the wire carries neither plaintext keys, nor masks, nor config blobs
    expect(byAdmin.body).not.toContain(KEY);
    expect(byAdmin.body).not.toContain("maskedKey");
    expect(byAdmin.body).not.toContain("encryptedKey");
  });

  it("OTX test-connection probes the real subscribed-pulses endpoint, not a guessed path", async () => {
    // Given: an OTX key is configured
    await app.inject({
      method: "PUT",
      url: "/integrations/OTX",
      headers: { authorization: admin },
      payload: { apiKey: "5m3jkh-otx-key-9876" },
    });
    // When: the connection is tested against a healthy upstream
    let probedUrl = "";
    vi.stubGlobal("fetch", async (url: unknown) => {
      probedUrl = String(url);
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });
    const res = await app.inject({
      method: "POST",
      url: "/integrations/OTX/test",
      headers: { authorization: admin },
      payload: {},
    });
    // Then: the probe hits /api/v1/pulses/subscribed (OTX has no /subscriber/mine — it 404s) and reports ok
    expect(probedUrl).toBe("https://otx.alienvault.com/api/v1/pulses/subscribed?limit=1");
    expect(res.statusCode).toBe(200);
    expect((res.json() as { ok: boolean }).ok).toBe(true);
  });

  it("unknown integration kind is a 400 VALIDATION", async () => {
    // Given: an undefined kind
    // When: it is requested
    const res = await app.inject({
      method: "GET",
      url: "/integrations/NOT_A_KIND",
      headers: { authorization: admin },
    });
    // Then: schema validation rejects it
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: { code: string } }).error.code).toBe("VALIDATION");
  });
});
