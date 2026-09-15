import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The SMTP transport is stubbed at the nodemailer boundary — production code
 * builds real transports only outside tests. Captured transports expose the
 * options they were built with and every mail handed to sendMail. */
const smtpMock = vi.hoisted(() => ({
  created: [] as Array<{ options: unknown; mails: unknown[]; sendMail: (mail: unknown) => Promise<unknown> }>,
}));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn((options: unknown) => {
      const transport = {
        options,
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

import { sendWhatsApp } from "../src/modules/delivery/senders/waha.js";
import { sendTelegram } from "../src/modules/delivery/senders/telegram.js";
import { sendEmail, type MailTransport } from "../src/modules/delivery/senders/email.js";
import { encryptSecret } from "../src/lib/crypto.js";
import { prisma } from "../src/lib/db.js";

/** SND-P-01…03: the three sender adapters against injected mocks —
 * no real WAHA / Telegram / SMTP traffic ever leaves the test. */

type CapturedRequest = { url: string; init: RequestInit };

function fetchCapture(status = 200): { requests: CapturedRequest[]; fetchImpl: (url: string, init?: RequestInit) => Promise<Response> } {
  const requests: CapturedRequest[] = [];
  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    requests.push({ url, init: init ?? {} });
    return new Response("{}", { status });
  };
  return { requests, fetchImpl };
}

describe("WAHA sender (SND-P-01)", () => {
  afterEach(() => {
    delete process.env["WAHA_BASE_URL"];
    delete process.env["WAHA_SESSION"];
    delete process.env["WAHA_API_KEY"];
  });

  it("SND-P-01: POSTs {session,chatId,text} to {baseUrl}/api/sendText with X-Api-Key", async () => {
    // Given: a mock fetch and explicit gateway options
    const { requests, fetchImpl } = fetchCapture();

    // When: the WhatsApp send is invoked
    await sendWhatsApp({
      chatId: "12036302@g.us",
      text: "bulletin body",
      baseUrl: "http://waha.test",
      session: "secnews",
      apiKey: "secret-key",
      fetchImpl,
    });

    // Then: exactly one request hits /api/sendText with the documented shape
    expect(requests).toHaveLength(1);
    const { url, init } = requests[0] as CapturedRequest;
    expect(url).toBe("http://waha.test/api/sendText");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe("secret-key");
    expect(JSON.parse(init.body as string)).toEqual({
      session: "secnews",
      chatId: "12036302@g.us",
      text: "bulletin body",
    });
  });

  it("SND-P-01: falls back to env-configured gateway settings", async () => {
    // Given: WAHA_* env vars and no explicit options
    process.env["WAHA_BASE_URL"] = "http://env-waha.test";
    process.env["WAHA_SESSION"] = "env-session";
    process.env["WAHA_API_KEY"] = "env-key";
    const { requests, fetchImpl } = fetchCapture();

    // When: the send is invoked with only chat/text
    await sendWhatsApp({ chatId: "chat-1", text: "hi", fetchImpl });

    // Then: env values populate session and the gateway URL
    const req = requests[0] as CapturedRequest;
    expect(req.url).toBe("http://env-waha.test/api/sendText");
    expect(JSON.parse(req.init.body as string).session).toBe("env-session");
  });

  it("SND-P-01: throws a descriptive error on non-2xx upstream status", async () => {
    // Given: a mock fetch answering 500
    const { fetchImpl } = fetchCapture(500);

    // When: the send is invoked
    // Then: it rejects with the upstream status in the message
    await expect(
      sendWhatsApp({ chatId: "c", text: "t", baseUrl: "http://waha.test", session: "s", fetchImpl }),
    ).rejects.toThrow(/500/);
  });

  it("TASK-RESEND: a non-2xx rejection names the upstream body so the audit is diagnosable", async () => {
    // Given: WAHA answers 403 with a session-expired description
    const fetchImpl = async (): Promise<Response> =>
      new Response(JSON.stringify({ success: false, message: "session not connected" }), { status: 403 });

    // When: the send is invoked
    // Then: the error message carries status AND the upstream reason
    await expect(
      sendWhatsApp({ chatId: "c", text: "t", baseUrl: "http://waha.test", session: "s", fetchImpl }),
    ).rejects.toThrow(/403.*session not connected/s);
  });
});

describe("Telegram sender (SND-P-02)", () => {
  it("SND-P-02: POSTs {chat_id,text} to bot<token>/sendMessage", async () => {
    // Given: a mock fetch and bot credentials
    const { requests, fetchImpl } = fetchCapture();

    // When: the Telegram send is invoked
    await sendTelegram({ token: "123456:ABC-DEF", chatId: "-100200", text: "bulletin body", fetchImpl });

    // Then: the documented bot API endpoint and payload are used
    expect(requests).toHaveLength(1);
    const { url, init } = requests[0] as CapturedRequest;
    expect(url).toBe("https://api.telegram.org/bot123456:ABC-DEF/sendMessage");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ chat_id: "-100200", text: "bulletin body" });
  });

  it("SND-P-02: throws on upstream failure", async () => {
    // Given: a mock fetch answering 401
    const { fetchImpl } = fetchCapture(401);

    // When: the send is invoked
    // Then: it rejects carrying the status
    await expect(
      sendTelegram({ token: "t", chatId: "c", text: "x", fetchImpl }),
    ).rejects.toThrow(/401/);
  });

  it("TASK-RESEND: a non-2xx rejection names the upstream body so the audit is diagnosable", async () => {
    // Given: Telegram answers 429 with its retry-after description
    const fetchImpl = async (): Promise<Response> =>
      new Response(JSON.stringify({ ok: false, error_code: 429, description: "Too Many Requests: retry after 5" }), {
        status: 429,
      });

    // When: the send is invoked
    // Then: the error message carries status AND the upstream reason
    await expect(
      sendTelegram({ token: "t", chatId: "c", text: "x", fetchImpl }),
    ).rejects.toThrow(/429.*Too Many Requests: retry after 5/s);
  });

  it("TASK-RESEND: second send attempt succeeds when the upstream recovers", async () => {
    // Given: a gateway that rejects the first call (duplicate/rate limit) and accepts the next
    let calls = 0;
    const fetchImpl = async (): Promise<Response> => {
      calls += 1;
      if (calls === 1) {
        return new Response("Too Many Requests", { status: 429 });
      }
      return new Response("{}", { status: 200 });
    };

    // When: the first attempt fails and the ticket is re-sent
    await expect(
      sendTelegram({ token: "t", chatId: "c", text: "x", fetchImpl }),
    ).rejects.toThrow(/429/);
    await expect(sendTelegram({ token: "t", chatId: "c", text: "x", fetchImpl })).resolves.toBeUndefined();

    // Then: both attempts hit the wire — the sender is stateless per call
    expect(calls).toBe(2);
  });

  it("TASK-TELEGRAM-NET: a rejected fetch names the underlying cause instead of a bare 'fetch failed'", async () => {
    // Given: the wire rejects exactly like undici does — TypeError wrapping the real cause
    const fetchImpl = async (): Promise<Response> => {
      throw new TypeError("fetch failed", { cause: new Error("connect ETIMEDOUT 149.154.166.110:443") });
    };

    // When: the send is invoked
    // Then: the rejection carries the cause so the DeliveryAudit is diagnosable
    await expect(
      sendTelegram({ token: "t", chatId: "c", text: "x", fetchImpl }),
    ).rejects.toThrow(/connect ETIMEDOUT 149\.154\.166\.110:443/);
  });

  it("TASK-TELEGRAM-NET: the send carries an abort timeout so a hung connection cannot stall dispatch", async () => {
    // Given: a mock fetch capturing the request init
    const { requests, fetchImpl } = fetchCapture();

    // When: the send is invoked
    await sendTelegram({ token: "t", chatId: "c", text: "x", fetchImpl });

    // Then: the request carries an AbortSignal (the connect/read timeout)
    const req = requests[0] as CapturedRequest;
    expect(req.init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("SMTP sender (SND-P-03)", () => {
  it("SND-P-03: hands {from,bcc,subject,text} to the injected transport", async () => {
    // Given: a fake transport capturing sendMail calls
    const sent: unknown[] = [];
    const transport: MailTransport = {
      sendMail: async (mail) => {
        sent.push(mail);
        return {};
      },
    };

    // When: the email send is invoked with an explicit from
    await sendEmail({
      bcc: ["a@corp.test", "b@corp.test"],
      subject: "SecNews bulletin",
      text: "bulletin body",
      from: "SecNews <no-reply@secnews.test>",
      transport,
    });

    // Then: the mail carries the BCC list and content, never a real SMTP hop
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      from: "SecNews <no-reply@secnews.test>",
      bcc: ["a@corp.test", "b@corp.test"],
      subject: "SecNews bulletin",
      text: "bulletin body",
    });
  });

  it("SND-P-03: refuses to send without central SMTP configuration", async () => {
    // Given: no SMTP_HOST in the environment and no injected transport
    const previous = process.env["SMTP_HOST"];
    delete process.env["SMTP_HOST"];
    await prisma.integrationConfig.deleteMany({ where: { kind: "SMTP" } });

    // When: the email send is invoked
    // Then: it rejects asking for SMTP_HOST instead of attempting a connection
    await expect(sendEmail({ bcc: ["a@corp.test"], subject: "s", text: "t" })).rejects.toThrow(
      /SMTP_HOST/,
    );
    if (previous !== undefined) {
      process.env["SMTP_HOST"] = previous;
    }
  });
});

describe("DB-first central gateway config (senders read IntegrationConfig before env)", () => {
  const envKeys = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM", "WAHA_BASE_URL", "WAHA_SESSION", "WAHA_API_KEY"] as const;

  beforeEach(async () => {
    await prisma.integrationConfig.deleteMany({ where: { kind: { in: ["SMTP", "WAHA"] } } });
    smtpMock.created.length = 0;
  });

  afterEach(() => {
    for (const key of envKeys) {
      delete process.env[key];
    }
  });

  afterAll(async () => {
    await prisma.integrationConfig.deleteMany({ where: { kind: { in: ["SMTP", "WAHA"] } } });
    await prisma.$disconnect();
  });

  function lastTransport(): { options: Record<string, unknown>; mails: unknown[] } {
    const transport = smtpMock.created.at(-1);
    if (transport === undefined) {
      throw new Error("no transport was created");
    }
    return { options: transport.options as Record<string, unknown>, mails: transport.mails };
  }

  it("SND-P-03: sendEmail builds the transport from the stored SMTP integration, not env", async () => {
    // Given: a stored SMTP integration row distinct from any env values
    await prisma.integrationConfig.create({
      data: {
        kind: "SMTP",
        encryptedKey: encryptSecret(JSON.stringify({
          host: "db-smtp.test",
          port: 465,
          user: "db-user",
          password: "db-pass",
          from: "DB SecNews <db@secnews.test>",
          secure: true,
        })),
      },
    });
    process.env["SMTP_HOST"] = "env-smtp.test";
    process.env["SMTP_FROM"] = "Env <env@secnews.test>";

    // When: the email send runs with no injected transport
    await sendEmail({ bcc: ["a@corp.test"], subject: "s", text: "t" });

    // Then: the transport was built from the DB row (host, auth, secure) and from came from it
    const { options, mails } = lastTransport();
    expect(options).toMatchObject({
      host: "db-smtp.test",
      port: 465,
      secure: true,
      auth: { user: "db-user", pass: "db-pass" },
    });
    expect(mails[0]).toMatchObject({ from: "DB SecNews <db@secnews.test>" });
  });

  it("SND-P-03: sendEmail falls back to env SMTP settings when no SMTP row exists", async () => {
    // Given: no DB row and env-configured central relay
    process.env["SMTP_HOST"] = "env-smtp.test";
    process.env["SMTP_PORT"] = "2525";
    process.env["SMTP_USER"] = "env-user";
    process.env["SMTP_PASSWORD"] = "env-pass";

    // When: the email send runs with no injected transport
    await sendEmail({ bcc: ["a@corp.test"], subject: "s", text: "t" });

    // Then: the transport was built from env
    const { options } = lastTransport();
    expect(options).toMatchObject({
      host: "env-smtp.test",
      port: 2525,
      auth: { user: "env-user", pass: "env-pass" },
    });
  });

  it("SND-P-01: sendWhatsApp uses the stored WAHA integration before env", async () => {
    // Given: a stored WAHA row and conflicting env vars
    await prisma.integrationConfig.create({
      data: {
        kind: "WAHA",
        encryptedKey: encryptSecret(JSON.stringify({
          baseUrl: "http://db-waha.test",
          session: "db-session",
          apiKey: "db-key",
        })),
      },
    });
    process.env["WAHA_BASE_URL"] = "http://env-waha.test";
    process.env["WAHA_SESSION"] = "env-session";
    process.env["WAHA_API_KEY"] = "env-key";
    const requests: CapturedRequest[] = [];
    const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
      requests.push({ url, init: init ?? {} });
      return new Response("{}", { status: 200 });
    };

    // When: the WhatsApp send runs with no explicit gateway options
    await sendWhatsApp({ chatId: "chat-1", text: "hi", fetchImpl });

    // Then: the DB row won
    expect(requests[0]?.url).toBe("http://db-waha.test/api/sendText");
    expect(JSON.parse(requests[0]?.init.body as string).session).toBe("db-session");
    expect((requests[0]?.init.headers as Record<string, string>)["X-Api-Key"]).toBe("db-key");
  });

  it("SND-P-01: explicit send options still override the stored WAHA integration", async () => {
    // Given: a stored row AND explicit gateway options
    await prisma.integrationConfig.create({
      data: {
        kind: "WAHA",
        encryptedKey: encryptSecret(JSON.stringify({
          baseUrl: "http://db-waha.test",
          session: "db-session",
          apiKey: "db-key",
        })),
      },
    });
    const requests: CapturedRequest[] = [];
    const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
      requests.push({ url, init: init ?? {} });
      return new Response("{}", { status: 200 });
    };

    // When: the caller passes explicit gateway settings
    await sendWhatsApp({ chatId: "c", text: "t", baseUrl: "http://override.test", session: "override", apiKey: "override-key", fetchImpl });

    // Then: the explicit options win
    expect(requests[0]?.url).toBe("http://override.test/api/sendText");
    expect((requests[0]?.init.headers as Record<string, string>)["X-Api-Key"]).toBe("override-key");
  });
});
