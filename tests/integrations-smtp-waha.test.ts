import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** SMTP verify is stubbed at the nodemailer boundary — no real SMTP hop. The
 * hoisted cell lets each test decide whether transport.verify() resolves. */
const smtpVerify = vi.hoisted(() => ({ impl: async (): Promise<true> => true }));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      verify: () => smtpVerify.impl(),
      sendMail: async () => ({}),
    })),
  },
}));

import nodemailer from "nodemailer";
import { buildApp } from "../src/app.js";
import { decryptSecret, maskKey } from "../src/lib/crypto.js";
import { prisma } from "../src/lib/db.js";
import { encodeChannelTarget } from "../src/modules/channels/map.js";
import { bearerFor, cleanupUsers } from "./helpers.js";

const SMTP = { host: "smtp.secnews.test", port: 587, user: "no-reply@secnews.test", password: "s3cr3t-PASSw0RD", from: "SecNews <no-reply@secnews.test>" };
const WAHA = { baseUrl: "http://waha.test", session: "secnews", apiKey: "waha-key-9876" };
const KINDS = ["SMTP", "WAHA"] as const;

type CapturedRequest = { url: string; init: RequestInit };

function fetchCapture(status = 200): { requests: CapturedRequest[]; fetchImpl: (url: string, init?: RequestInit) => Promise<Response> } {
  const requests: CapturedRequest[] = [];
  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    requests.push({ url, init: init ?? {} });
    return new Response("{}", { status });
  };
  return { requests, fetchImpl };
}

describe("SMTP + WAHA as central IntegrationKind entries (encrypted, masked, testable)", () => {
  let app: FastifyInstance;
  let admin = "";

  beforeAll(async () => {
    app = await buildApp();
    admin = await bearerFor(app, "ADMIN");
  });

  beforeEach(async () => {
    await prisma.integrationConfig.deleteMany({ where: { kind: { in: [...KINDS] } } });
    smtpVerify.impl = async () => true;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(nodemailer.createTransport).mockClear();
  });

  afterAll(async () => {
    await prisma.integrationConfig.deleteMany({ where: { kind: { in: [...KINDS] } } });
    await cleanupUsers();
    await prisma.$disconnect();
    await app.close();
  });

  describe("SMTP (INT-SMTP)", () => {
    it("unconfigured kind: GET hasKey=false and test reports ok=false", async () => {
      const get = await app.inject({ method: "GET", url: "/integrations/SMTP", headers: { authorization: admin } });
      expect(get.statusCode).toBe(200);
      expect((get.json() as { hasKey: boolean }).hasKey).toBe(false);

      const test = await app.inject({ method: "POST", url: "/integrations/SMTP/test", headers: { authorization: admin }, payload: {} });
      expect(test.statusCode).toBe(200);
      expect((test.json() as { ok: boolean }).ok).toBe(false);
    });

    it("PUT stores an encrypted blob; GET shows host/port/from/secure + masked password, never the plaintext", async () => {
      const put = await app.inject({
        method: "PUT",
        url: "/integrations/SMTP",
        headers: { authorization: admin },
        payload: { ...SMTP, secure: false },
      });
      expect(put.statusCode).toBe(200);

      const get = await app.inject({ method: "GET", url: "/integrations/SMTP", headers: { authorization: admin } });
      expect(get.statusCode).toBe(200);
      const body = get.json() as {
        kind: string; host: string | null; port: number | null; from: string | null; secure: boolean | null;
        hasKey: boolean; maskedKey: string | null; model: string | null;
      };
      expect(body.kind).toBe("SMTP");
      expect(body.host).toBe(SMTP.host);
      expect(body.port).toBe(587);
      expect(body.from).toBe(SMTP.from);
      expect(body.secure).toBe(false);
      expect(body.hasKey).toBe(true);
      expect(body.maskedKey).toBe(maskKey(SMTP.password));
      expect(body.model).toBeNull();
      expect(get.body).not.toContain(SMTP.password);

      const row = await prisma.integrationConfig.findUnique({ where: { kind: "SMTP" } });
      expect(row).not.toBeNull();
      const decoded = JSON.parse(decryptSecret(row?.encryptedKey ?? "")) as typeof SMTP & { secure?: boolean };
      expect(decoded.password).toBe(SMTP.password);
      expect(decoded.host).toBe(SMTP.host);
    });

    it("test-connection verifies the transport: ok:true with latency, transport failure reports ok:false with detail", async () => {
      await app.inject({ method: "PUT", url: "/integrations/SMTP", headers: { authorization: admin }, payload: SMTP });

      const ok = await app.inject({ method: "POST", url: "/integrations/SMTP/test", headers: { authorization: admin }, payload: {} });
      expect(ok.statusCode).toBe(200);
      const okBody = ok.json() as { ok: boolean; latencyMs?: number };
      expect(okBody.ok).toBe(true);
      expect(typeof okBody.latencyMs).toBe("number");
      expect(ok.body).not.toContain(SMTP.password);

      // Given: the upstream SMTP rejects authentication
      smtpVerify.impl = async () => {
        throw new Error("535 Authentication failed");
      };
      // When: the connection is tested
      const bad = await app.inject({ method: "POST", url: "/integrations/SMTP/test", headers: { authorization: admin }, payload: {} });
      // Then: still 200 with ok:false and the upstream reason
      expect(bad.statusCode).toBe(200);
      const badBody = bad.json() as { ok: boolean; detail?: string };
      expect(badBody.ok).toBe(false);
      expect(badBody.detail).toMatch(/535/);
      expect(bad.body).not.toContain(SMTP.password);
    });

    it("test-connection builds the transport from the stored config (host, port, secure, auth)", async () => {
      await app.inject({ method: "PUT", url: "/integrations/SMTP", headers: { authorization: admin }, payload: { ...SMTP, secure: true } });
      await app.inject({ method: "POST", url: "/integrations/SMTP/test", headers: { authorization: admin }, payload: {} });

      const options = vi.mocked(nodemailer.createTransport).mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(options).toMatchObject({
        host: SMTP.host,
        port: 587,
        secure: true,
        auth: { user: SMTP.user, pass: SMTP.password },
      });
    });
  });

  describe("WAHA (INT-WAHA)", () => {
    it("unconfigured kind: GET hasKey=false and test reports ok=false", async () => {
      const get = await app.inject({ method: "GET", url: "/integrations/WAHA", headers: { authorization: admin } });
      expect(get.statusCode).toBe(200);
      expect((get.json() as { hasKey: boolean }).hasKey).toBe(false);

      const test = await app.inject({ method: "POST", url: "/integrations/WAHA/test", headers: { authorization: admin }, payload: {} });
      expect(test.statusCode).toBe(200);
      expect((test.json() as { ok: boolean }).ok).toBe(false);
    });

    it("PUT stores gateway settings encrypted; GET shows baseUrl/session + masked apiKey", async () => {
      const put = await app.inject({ method: "PUT", url: "/integrations/WAHA", headers: { authorization: admin }, payload: WAHA });
      expect(put.statusCode).toBe(200);

      const get = await app.inject({ method: "GET", url: "/integrations/WAHA", headers: { authorization: admin } });
      expect(get.statusCode).toBe(200);
      const body = get.json() as {
        kind: string; baseUrl: string | null; session: string | null; hasKey: boolean; maskedKey: string | null;
      };
      expect(body.kind).toBe("WAHA");
      expect(body.baseUrl).toBe(WAHA.baseUrl);
      expect(body.session).toBe(WAHA.session);
      expect(body.hasKey).toBe(true);
      expect(body.maskedKey).toBe(maskKey(WAHA.apiKey));
      expect(get.body).not.toContain(WAHA.apiKey);

      const row = await prisma.integrationConfig.findUnique({ where: { kind: "WAHA" } });
      const decoded = JSON.parse(decryptSecret(row?.encryptedKey ?? "")) as typeof WAHA;
      expect(decoded.apiKey).toBe(WAHA.apiKey);
    });

    it("test probes the stored session endpoint with X-Api-Key; falls back to /api/health on 404", async () => {
      await app.inject({ method: "PUT", url: "/integrations/WAHA", headers: { authorization: admin }, payload: WAHA });

      const requests: CapturedRequest[] = [];
      let calls = 0;
      vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
        calls += 1;
        requests.push({ url, init: init ?? {} });
        return new Response("{}", { status: calls === 1 ? 404 : 200 });
      });

      const res = await app.inject({ method: "POST", url: "/integrations/WAHA/test", headers: { authorization: admin }, payload: {} });
      expect(res.statusCode).toBe(200);
      expect((res.json() as { ok: boolean }).ok).toBe(true);
      expect(requests[0]?.url).toBe(`${WAHA.baseUrl}/api/sessions/${WAHA.session}`);
      expect((requests[0]?.init.headers as Record<string, string>)["X-Api-Key"]).toBe(WAHA.apiKey);
      expect(requests[1]?.url).toBe(`${WAHA.baseUrl}/api/health`);
    });

    it("test probes the session endpoint successfully without a fallback when it answers 200", async () => {
      await app.inject({ method: "PUT", url: "/integrations/WAHA", headers: { authorization: admin }, payload: WAHA });
      const { requests, fetchImpl } = fetchCapture();
      vi.stubGlobal("fetch", fetchImpl);

      const res = await app.inject({ method: "POST", url: "/integrations/WAHA/test", headers: { authorization: admin }, payload: {} });
      expect((res.json() as { ok: boolean }).ok).toBe(true);
      expect(requests).toHaveLength(1);
      expect(requests[0]?.url).toBe(`${WAHA.baseUrl}/api/sessions/${WAHA.session}`);
    });

    it("test reports upstream failure as ok:false without leaking the api key", async () => {
      await app.inject({ method: "PUT", url: "/integrations/WAHA", headers: { authorization: admin }, payload: WAHA });
      vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ success: false }), { status: 500 }));

      const res = await app.inject({ method: "POST", url: "/integrations/WAHA/test", headers: { authorization: admin }, payload: {} });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { ok: boolean; detail?: string };
      expect(body.ok).toBe(false);
      expect(body.detail).toMatch(/500/);
      expect(res.body).not.toContain(WAHA.apiKey);
    });
  });

  describe("channel test endpoint (POST /clients/:clientId/channels/:channelId/test)", () => {
    let clientId = "";

    beforeEach(async () => {
      const client = await prisma.client.create({ data: { name: `C4 chan-${randomUUID()}` } });
      clientId = client.id;
    });

    afterEach(async () => {
      await prisma.channel.deleteMany({ where: { clientId } });
      await prisma.client.delete({ where: { id: clientId } });
    });

    function createChannel(type: "TELEGRAM" | "WHATSAPP" | "EMAIL"): Promise<{ id: string }> {
      let body: Parameters<typeof encodeChannelTarget>[0];
      if (type === "TELEGRAM") {
        body = { type, chatId: "-100200", token: "123456:ABC-DEF" };
      } else if (type === "WHATSAPP") {
        body = { type, chatId: "12036302@g.us" };
      } else {
        body = { type, bcc: ["a@corp.test"] };
      }
      return prisma.channel.create({
        data: { clientId, type, target: encodeChannelTarget(body) },
        select: { id: true },
      });
    }

    it("TELEGRAM: calls getMe with the stored token (no message sent) and reports ok:true", async () => {
      const channel = await createChannel("TELEGRAM");
      let probedUrl = "";
      vi.stubGlobal("fetch", async (url: string) => {
        probedUrl = url;
        return new Response(JSON.stringify({ ok: true, result: { id: 1, is_bot: true } }), { status: 200 });
      });

      const res = await app.inject({
        method: "POST",
        url: `/clients/${clientId}/channels/${channel.id}/test`,
        headers: { authorization: admin },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { ok: boolean; latencyMs?: number };
      expect(body.ok).toBe(true);
      expect(typeof body.latencyMs).toBe("number");
      expect(probedUrl).toBe("https://api.telegram.org/bot123456:ABC-DEF/getMe");
      expect(res.body).not.toContain("123456:ABC-DEF");
    });

    it("TELEGRAM: an invalid token reports ok:false, never an HTTP error", async () => {
      const channel = await createChannel("TELEGRAM");
      vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ ok: false, error_code: 401 }), { status: 401 }));

      const res = await app.inject({
        method: "POST",
        url: `/clients/${clientId}/channels/${channel.id}/test`,
        headers: { authorization: admin },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { ok: boolean; detail?: string };
      expect(body.ok).toBe(false);
      expect(body.detail).toMatch(/401/);
    });

    it("unknown channel/client pair is 404 NOT_FOUND", async () => {
      const channel = await createChannel("TELEGRAM");
      const other = await prisma.client.create({ data: { name: `C4 other-${randomUUID()}` } });
      try {
        const res = await app.inject({
          method: "POST",
          url: `/clients/${other.id}/channels/${channel.id}/test`,
          headers: { authorization: admin },
          payload: {},
        });
        expect(res.statusCode).toBe(404);
        expect((res.json() as { error: { code: string } }).error.code).toBe("NOT_FOUND");
      } finally {
        await prisma.client.delete({ where: { id: other.id } });
      }
    });

    it("EMAIL: without a stored SMTP integration reports ok:false", async () => {
      const channel = await createChannel("EMAIL");
      const res = await app.inject({
        method: "POST",
        url: `/clients/${clientId}/channels/${channel.id}/test`,
        headers: { authorization: admin },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { ok: boolean; detail?: string };
      expect(body.ok).toBe(false);
      expect(body.detail).toMatch(/SMTP configuration/);
    });

    it("WHATSAPP: without a stored WAHA integration reports ok:false", async () => {
      const channel = await createChannel("WHATSAPP");
      const res = await app.inject({
        method: "POST",
        url: `/clients/${clientId}/channels/${channel.id}/test`,
        headers: { authorization: admin },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { ok: boolean; detail?: string };
      expect(body.ok).toBe(false);
      expect(body.detail).toMatch(/WAHA configuration/);
    });
  });
});
