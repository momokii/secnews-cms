import {
  api,
  createChannel,
  createReadyTicket,
  CTRL_URL,
  loadState,
  ok,
  step,
  uniqueId,
} from "./lib.js";

/**
 * E2E-S5 delivery + OTX over real HTTP with process-level mocks in the
 * server: WAHA/Telegram/OTX fetch stubs and a local SMTP sink. Proves the
 * exact sender wire shapes (SND-P-01..03), per-channel audit rows (AUD-01),
 * the OTX push persisting pulse id/link (S5) and the pulses list proxy.
 */

type FetchRecord = { url: string; method: string; headers: Record<string, string>; body: string | null };
type SmtpRecord = { from: string; to: string[]; data: string };

const WAHA_CHAT = "e2e-s5-waha@g.us";
const TG_CHAT = "-100555-e2e";
const TG_TOKEN = "e2e-tg-token-s5";
const EMAIL_BCC = "client-e2e@corp.test";
const IOC_VALUE = "evil-e2e.example";

async function outbound(): Promise<{ fetch: FetchRecord[]; smtp: SmtpRecord[] }> {
  const response = await fetch(`${CTRL_URL}/outbound`);
  return (await response.json()) as { fetch: FetchRecord[]; smtp: SmtpRecord[] };
}

async function main(): Promise<void> {
  const admin = loadState();
  // Isolate this script's outbound traffic from earlier scripts.
  await fetch(`${CTRL_URL}/reset`, { method: "POST" });

  const title = `E2E S5 delivery + otx ${uniqueId()}`;
  const ticketId = await createReadyTicket(admin, title);

  const ioc = await api<{ id: string; includeInBulletin: boolean }>("POST", `/tickets/${ticketId}/iocs`, {
    token: admin.token,
    body: { type: "DOMAIN", value: IOC_VALUE, includeInBulletin: true },
  });
  ok(ioc.status === 201 && ioc.body.includeInBulletin === true, "IOC added to the ticket", ioc.body);

  // OTX push (READY ticket, AMBER default → private pulse, marking AMBER).
  const otxKey = await api<unknown>("PUT", "/integrations/OTX", {
    token: admin.token,
    body: { apiKey: "e2e-otx-key" },
  });
  ok(otxKey.status === 200, "PUT integrations/OTX → 200", otxKey);
  const pushed = await api<{ pulseId: string; pulseUrl: string; isPublic: boolean; tlpMarking: string }>(
    "POST",
    `/tickets/${ticketId}/otx`,
    { token: admin.token, body: {} },
  );
  ok(pushed.status === 200, "POST /tickets/:id/otx → 200", pushed.body);
  ok(pushed.body.isPublic === false && pushed.body.tlpMarking === "AMBER", "AMBER forces private pulse", pushed.body);
  const detail = await api<{ otxPulseId: string | null; otxPulseUrl: string | null }>("GET", `/tickets/${ticketId}`, {
    token: admin.token,
  });
  ok(
    detail.body.otxPulseId === pushed.body.pulseId && detail.body.otxPulseUrl === pushed.body.pulseUrl,
    "pulse id/link persisted on the ticket (S5)",
    detail.body,
  );

  const pulses = await api<{
    items: Array<{ id: string; name: string; isPublic: boolean; tlp: string; tags: string[] }>;
    total: number;
  }>("GET", "/otx/pulses?page=1", { token: admin.token });
  ok(pulses.status === 200 && pulses.body.items.length === 1, "pulses list proxied from stub", pulses.body);
  const pulse = pulses.body.items[0];
  ok(
    pulse?.id === "e2e-pulse-sub-1" && pulse.tlp === "AMBER" && pulse.tags.includes("e2e") && pulse.tags.includes("stub"),
    "subscribed pulse mapped to the wire shape",
    pulse,
  );
  step("OTX push persists id/link + pulses list");

  // Client with all three channel types, then one send over explicit ids.
  const client = await api<{ id: string }>("POST", "/clients", {
    token: admin.token,
    body: { name: `E2E S5 Client ${uniqueId()}` },
  });
  ok(client.status === 201, "POST /clients → 201", client.body);
  const waId = await createChannel(admin, client.body.id, { type: "WHATSAPP", chatId: WAHA_CHAT });
  const tgId = await createChannel(admin, client.body.id, { type: "TELEGRAM", chatId: TG_CHAT, token: TG_TOKEN });
  const emailId = await createChannel(admin, client.body.id, { type: "EMAIL", bcc: [EMAIL_BCC] });

  const sent = await api<{
    ticket: { status: string };
    audit: Array<{ channelId: string; channelType: string; status: string; payload: string; target: string }>;
  }>("POST", `/tickets/${ticketId}/send`, {
    token: admin.token,
    body: { channelIds: [waId, tgId, emailId] },
  });
  ok(sent.status === 200 && sent.body.ticket.status === "SENT", "send to all three channel types → SENT", sent.body);
  ok(sent.body.audit.length === 3, "one audit row per target", sent.body.audit);
  ok(
    sent.body.audit.every((row) => row.status === "SENT" && row.payload.length > 0),
    "every channel SENT with the rendered payload",
    sent.body.audit,
  );
  step("send across WHATSAPP/TELEGRAM/EMAIL");

  // Sender wire shapes against the recorded mock traffic.
  const recorded = await outbound();
  const waha = recorded.fetch.find((call) => call.url.includes("/api/sendText"));
  ok(waha !== undefined, "WAHA call captured", recorded.fetch.map((call) => call.url));
  ok(waha !== undefined && waha.url.startsWith("http://e2e-waha.invalid/"), "WAHA used the env gateway", waha);
  const wahaBody = JSON.parse(waha?.body ?? "{}") as { session?: string; chatId?: string; text?: string };
  ok(
    wahaBody.session === "secnews" && wahaBody.chatId === WAHA_CHAT && wahaBody.text === sent.body.audit.find((row) => row.channelType === "WHATSAPP")?.payload,
    "WAHA body {session,chatId,text} with the exact payload (SND-P-01)",
    wahaBody,
  );
  ok(waha?.headers["x-api-key"] === "e2e-waha-key", "WAHA carried X-Api-Key", waha?.headers);

  const telegram = recorded.fetch.find((call) => call.url.includes("api.telegram.org"));
  ok(telegram !== undefined, "Telegram call captured", recorded.fetch.map((call) => call.url));
  ok(
    telegram?.url === `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,
    "Telegram URL is bot<token>/sendMessage (SND-P-02)",
    telegram,
  );
  const tgBody = JSON.parse(telegram?.body ?? "{}") as { chat_id?: string; text?: string };
  ok(
    tgBody.chat_id === TG_CHAT && tgBody.text === sent.body.audit.find((row) => row.channelType === "TELEGRAM")?.payload,
    "Telegram body {chat_id,text} with the exact payload",
    tgBody,
  );

  const mail = recorded.smtp.find((message) => message.to.includes(EMAIL_BCC));
  ok(mail !== undefined, "SMTP sink captured the email send", recorded.smtp);
  ok(mail !== undefined && mail.data.includes(`Subject: ${title}`), "email subject is the ticket title", mail?.data.split("\n").slice(0, 6));

  // Nodemailer picks quoted-printable for longer text bodies (RFC 2045); the
  // bulletin content on the wire is the QP-decoded body, so decode before
  // comparing to the stored payload.
  function decodedMailBody(data: string): string {
    const bodyStart = data.indexOf("\r\n\r\n");
    const body = bodyStart === -1 ? data : data.slice(bodyStart + 4);
    return body
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-F]{2})/g, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
  }

  const emailPayload = sent.body.audit.find((row) => row.channelType === "EMAIL")?.payload;
  ok(
    mail !== undefined && emailPayload !== undefined && decodedMailBody(mail.data).includes(emailPayload),
    "email body carries the exact rendered payload (SND-P-03)",
    { dataTail: mail?.data.split("\n").slice(-12), payload: emailPayload },
  );
  step("sender shapes verified against mock traffic (SND-P-01..03)");

  // And the OTX create call itself.
  const otxCall = recorded.fetch.find((call) => call.url.includes("/api/v1/pulses/create"));
  ok(otxCall !== undefined, "OTX create captured", recorded.fetch.map((call) => call.url));
  ok(otxCall?.headers["x-otx-api-key"] === "e2e-otx-key", "OTX key from central config on the wire", otxCall?.headers);
  const otxBody = JSON.parse(otxCall?.body ?? "{}") as {
    name?: string;
    public?: boolean;
    TLP?: string;
    indicators?: string[];
  };
  ok(
    otxBody.name === title && otxBody.public === false && otxBody.TLP === "AMBER",
    "OTX create body maps TLP and forces private (STATES.md §4)",
    otxBody,
  );
  ok(
    Array.isArray(otxBody.indicators) && otxBody.indicators.includes(IOC_VALUE),
    "OTX indicators carry the included IOC verbatim",
    otxBody,
  );

  console.log("E2E-S5 PASS");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
