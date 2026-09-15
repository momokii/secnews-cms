import { afterEach, describe, expect, it } from "vitest";
import { sendWhatsApp } from "../src/modules/delivery/senders/waha.js";
import { sendTelegram } from "../src/modules/delivery/senders/telegram.js";
import { sendEmail, type MailTransport } from "../src/modules/delivery/senders/email.js";

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
