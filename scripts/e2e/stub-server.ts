import "dotenv/config";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createNetServer, type Socket } from "node:net";

/**
 * E2E server wrapper (spawned by run.ts): installs process-level transport
 * stubs BEFORE importing the real app, so no packet ever leaves the machine.
 * - globalThis.fetch: OpenAI / WAHA / Telegram / OTX get canned 200s; every
 *   call is recorded and served to scripts via the control endpoint.
 * - A minimal SMTP sink listens locally for the nodemailer email sender.
 * - FEED_POLL_CRON is disabled; WAHA points at an invalid .invalid host.
 * Any fetch outside the allow-list throws — unexpected external traffic
 * fails the run loudly instead of leaking.
 */

function mustEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`stub-server requires env ${name}`);
  }
  return value;
}

const PORT = mustEnv("PORT");
const HOST = process.env["HOST"] ?? "127.0.0.1";
const CTRL_PORT = mustEnv("E2E_CTRL_PORT");
const SMTP_PORT = mustEnv("E2E_SMTP_PORT");

process.env["FEED_POLL_CRON"] = "";
process.env["WAHA_BASE_URL"] = "http://e2e-waha.invalid";
process.env["WAHA_SESSION"] = "secnews";
process.env["WAHA_API_KEY"] = "e2e-waha-key";
process.env["SMTP_HOST"] = "127.0.0.1";
process.env["SMTP_PORT"] = SMTP_PORT;

// ---- Outbound traffic recording ----

export type FetchRecord = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
};

export type SmtpRecord = { from: string; to: string[]; data: string };

const fetchRecords: FetchRecord[] = [];
const smtpRecords: SmtpRecord[] = [];

const FILL_FIELDS = JSON.stringify({
  fields: {
    overview: "E2E stub overview of the reported adversary activity.",
    description: "E2E stub description: brute-force campaign mapped to the ingested report.",
    recommendations: "E2E stub recommendations: restrict SSH exposure and enforce MFA.",
    references: "https://e2e.example.com/advisory/1",
    cveIds: "CVE-2026-0001",
  },
});

let pulseCounter = 0;

function stubbedResponse(url: string, init: RequestInit | undefined): Response {
  const record: FetchRecord = {
    url,
    method: init?.method ?? "GET",
    headers: Object.fromEntries(new Headers(init?.headers).entries()),
    body: typeof init?.body === "string" ? init.body : null,
  };
  fetchRecords.push(record);

  if (url.includes("api.openai.com/v1/chat/completions")) {
    return Response.json({ choices: [{ message: { content: FILL_FIELDS } }] });
  }
  if (url.includes("/api/sendText")) {
    return Response.json({});
  }
  if (url.includes("api.telegram.org")) {
    return Response.json({ ok: true });
  }
  if (url.includes("otx.alienvault.com/api/v1/pulses/create")) {
    pulseCounter += 1;
    return Response.json({ id: `e2e-pulse-${pulseCounter}` });
  }
  if (url.includes("otx.alienvault.com/api/v1/pulses/subscribed")) {
    return Response.json({
      count: 1,
      results: [
        {
          id: "e2e-pulse-sub-1",
          name: "E2E subscribed pulse",
          public: false,
          TLP: "AMBER",
          tags: ["e2e", { name: "stub" }],
          indicator_count: 1,
          created: "2026-09-14T00:00:00.000Z",
          modified: "2026-09-14T00:00:00.000Z",
        },
      ],
    });
  }
  throw new Error(`E2E stub: unexpected external fetch blocked → ${url}`);
}

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  return stubbedResponse(input.toString(), init);
}) as typeof fetch;

// ---- Local SMTP sink (nodemailer target for EMAIL channels) ----

function startSmtpSink(): void {
  createNetServer((socket: Socket) => {
    let buffer = "";
    let inData = false;
    let data = "";
    let from = "";
    let to: string[] = [];
    const reply = (line: string): void => {
      socket.write(`${line}\r\n`);
    };
    reply("220 e2e-sink ESMTP");
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let index = buffer.indexOf("\r\n");
      while (index !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        index = buffer.indexOf("\r\n");
        if (inData) {
          if (line === ".") {
            smtpRecords.push({ from, to, data: data.replace(/^\.\./gm, ".") });
            reply("250 OK");
            inData = false;
            data = "";
            from = "";
            to = [];
          } else {
            data += `${line}\n`;
          }
          continue;
        }
        const verb = line.slice(0, 4).toUpperCase();
        if (verb === "EHLO" || verb === "HELO") {
          reply("250 e2e-sink");
        } else if (verb === "MAIL") {
          from = line.match(/<([^>]*)>/)?.[1] ?? "";
          reply("250 OK");
        } else if (verb === "RCPT") {
          const rcpt = line.match(/<([^>]*)>/)?.[1];
          if (rcpt !== undefined) {
            to.push(rcpt);
          }
          reply("250 OK");
        } else if (verb === "DATA") {
          inData = true;
          reply("354 End data with <CR><LF>.<CR><LF>");
        } else if (verb === "RSET" || verb === "NOOP") {
          reply("250 OK");
        } else if (verb === "QUIT") {
          reply("221 Bye");
          socket.end();
        } else {
          reply("250 OK");
        }
      }
    });
    socket.on("error", () => socket.destroy());
  }).listen(Number(SMTP_PORT), "127.0.0.1");
}

// ---- Control endpoint: scripts read recorded outbound traffic ----

function controlHandler(request: IncomingMessage, response: ServerResponse): void {
  if (request.method === "GET" && request.url === "/outbound") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ fetch: fetchRecords, smtp: smtpRecords }));
    return;
  }
  if (request.method === "POST" && request.url === "/reset") {
    fetchRecords.length = 0;
    smtpRecords.length = 0;
    response.writeHead(204);
    response.end();
    return;
  }
  response.writeHead(404);
  response.end();
}

startSmtpSink();
createHttpServer(controlHandler).listen(Number(CTRL_PORT), HOST);

process.on("SIGTERM", () => process.exit(0));

// Imports the real Fastify app (autoload, plugins, routes) with stubs active.
await import("../../src/server.js");
console.log(`[e2e-stub-server] listening on ${HOST}:${PORT}, ctrl :${CTRL_PORT}, smtp :${SMTP_PORT}`);
