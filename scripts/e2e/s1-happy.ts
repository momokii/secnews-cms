import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  api,
  createChannel,
  ok,
  saveState,
  step,
  type AdminState,
} from "./lib.js";

/**
 * E2E-S1 happy path over real HTTP: bootstrap → login → feed source →
 * ingest push → take → transitions → AI fill (stubbed provider) → accept →
 * send {all:true} (stubbed senders) → audit row assertions. Leaves its two
 * channels deactivated so later scripts control the active-channel set.
 */

const INGEST_KEY = process.env["INGEST_API_KEY"] ?? "";
const FEED_NAME = "e2e-source";
const ITEM_LINK = "https://e2e.example.com/items/1";

async function main(): Promise<void> {
  ok(INGEST_KEY !== "", "INGEST_API_KEY must be set (dev .env)");

  // 1. Bootstrap the first ADMIN (fresh DB) and log in.
  const status = await api<{ needsBootstrap: boolean }>("GET", "/auth/status");
  ok(status.status === 200 && status.body.needsBootstrap === true, "auth/status needsBootstrap", status.body);

  const bootstrapped = await api<{ user: { id: string; email: string; role: string }; token: string }>(
    "POST",
    "/bootstrap",
    { body: { name: "E2E Admin", email: ADMIN_EMAIL, password: ADMIN_PASSWORD } },
  );
  ok(bootstrapped.status === 201, "bootstrap → 201", bootstrapped.body);
  ok(bootstrapped.body.user.role === "ADMIN", "bootstrap user is ADMIN", bootstrapped.body.user);

  const login = await api<{ user: { id: string; email: string; role: string }; token: string }>(
    "POST",
    "/auth/login",
    { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } },
  );
  ok(login.status === 200 && login.body.user.role === "ADMIN", "login → 200 ADMIN", login.body);
  const admin: AdminState = {
    token: login.body.token,
    userId: login.body.user.id,
    email: login.body.user.email,
  };
  saveState(admin);

  const me = await api<{ email: string }>("GET", "/auth/me", { token: admin.token });
  ok(me.status === 200 && me.body.email === ADMIN_EMAIL, "auth/me echoes the logged-in admin", me.body);
  step("bootstrap + login + me");

  // 2. Feed source, then external ingest push attached to it by sourceName.
  const feed = await api<{ id: string; active: boolean }>("POST", "/feeds", {
    token: admin.token,
    body: { name: FEED_NAME, url: "https://e2e.example.com/rss.xml", active: true },
  });
  ok(feed.status === 201 && feed.body.active === true, "POST /feeds → 201", feed.body);

  const pushed = await api<{ item: { id: string; status: string; feedSourceId: string; url: string | null } }>(
    "POST",
    "/ingest",
    {
      apiKey: INGEST_KEY,
      body: {
        sourceName: FEED_NAME,
        title: "E2E ingested adversary report",
        link: ITEM_LINK,
        publishedAt: "2026-09-14T00:00:00.000Z",
        summary: "E2E raw summary text",
      },
    },
  );
  ok(pushed.status === 201, "POST /ingest → 201", pushed.body);
  ok(pushed.body.item.status === "UNREVIEWED", "item starts UNREVIEWED", pushed.body.item);
  ok(pushed.body.item.feedSourceId === feed.body.id, "push attached to the named source", pushed.body.item);
  step("feed source + ingest push");

  // 3. Take the item: AUTO_FEED ticket, item back-link.
  const taken = await api<{ id: string; origin: string; status: string; feedItemId: string | null }>(
    "POST",
    `/feed-items/${pushed.body.item.id}/take`,
    { token: admin.token },
  );
  ok(taken.status === 201, "take → 201", taken.body);
  ok(taken.body.origin === "AUTO_FEED" && taken.body.status === "OPEN", "ticket AUTO_FEED/OPEN", taken.body);
  ok(taken.body.feedItemId === pushed.body.item.id, "ticket back-links the item", taken.body);
  const ticketId = taken.body.id;
  step("take → AUTO_FEED ticket");

  // 4. Walk the state machine OPEN → RESEARCH → READY.
  for (const to of ["RESEARCH", "READY"] as const) {
    const moved = await api<{ status: string }>("POST", `/tickets/${ticketId}/transition`, {
      token: admin.token,
      body: { to },
    });
    ok(moved.status === 200 && moved.body.status === to, `transition → ${to}`, moved.body);
  }
  step("transitions OPEN→RESEARCH→READY");

  // 5. Configure the (stubbed) AI provider, fill, and accept every suggestion.
  const integration = await api<{ hasKey: boolean; maskedKey: string | null }>("PUT", "/integrations/OPENAI", {
    token: admin.token,
    body: { apiKey: "e2e-stub-key", model: "e2e-stub-model" },
  });
  ok(integration.status === 200 && integration.body.hasKey === true, "PUT integrations/OPENAI → 200", integration.body);
  ok(
    integration.body.maskedKey !== null && !integration.body.maskedKey.includes("e2e-stub-key"),
    "maskedKey never leaks the plaintext key (INT-01)",
    integration.body,
  );

  const filled = await api<{ suggestions: Array<{ id: string; field: string; status: string }> }>(
    "POST",
    `/tickets/${ticketId}/ai/fill`,
    { token: admin.token, body: {} },
  );
  ok(filled.status === 200, "ai/fill → 200", filled.body);
  ok(filled.body.suggestions.length === 5, "fill suggested the 5 missing fields", filled.body.suggestions);
  ok(
    filled.body.suggestions.every((suggestion) => suggestion.status === "PENDING"),
    "all suggestions land PENDING",
    filled.body.suggestions,
  );

  const pendingList = await api<{ total: number }>("GET", `/tickets/${ticketId}/suggestions?status=PENDING`, {
    token: admin.token,
  });
  ok(pendingList.status === 200 && pendingList.body.total === 5, "pending suggestions listed", pendingList.body);

  for (const suggestion of filled.body.suggestions) {
    const accepted = await api<{ suggestion: { status: string } }>(
      "POST",
      `/tickets/${ticketId}/suggestions/${suggestion.id}/accept`,
      { token: admin.token },
    );
    ok(
      accepted.status === 200 && accepted.body.suggestion.status === "ACCEPTED",
      `accept ${suggestion.field}`,
      accepted.body,
    );
  }
  const detail = await api<{
    status: string;
    pendingSuggestions: number;
    overview: string | null;
    cveIds: string[];
    references: string[];
  }>("GET", `/tickets/${ticketId}`, { token: admin.token });
  ok(detail.status === 200 && detail.body.pendingSuggestions === 0, "zero pending after accepts", detail.body);
  ok(detail.body.overview !== null, "overview merged from suggestion", detail.body);
  ok(detail.body.cveIds.includes("CVE-2026-0001"), "cveIds merged", detail.body);
  ok(detail.body.references.includes("https://e2e.example.com/advisory/1"), "references merged", detail.body);
  step("AI fill (stubbed provider) + accept all");

  // 6. Client with WHATSAPP + TELEGRAM channels, then send {all:true}.
  const client = await api<{ id: string }>("POST", "/clients", {
    token: admin.token,
    body: { name: "E2E S1 Client" },
  });
  ok(client.status === 201, "POST /clients → 201", client.body);
  const waId = await createChannel(admin, client.body.id, { type: "WHATSAPP", chatId: "1203630-e2e@g.us" });
  const tgId = await createChannel(admin, client.body.id, {
    type: "TELEGRAM",
    chatId: "-100200-e2e",
    token: "e2e-telegram-token",
  });
  step("client + WHATSAPP/TELEGRAM channels");

  const sent = await api<{
    ticket: { status: string };
    audit: Array<{ channelId: string; channelType: string; status: string; payload: string; errorDetail: string | null }>;
  }>("POST", `/tickets/${ticketId}/send`, { token: admin.token, body: { all: true } });
  ok(sent.status === 200 && sent.body.ticket.status === "SENT", "send {all:true} → 200 SENT", sent.body);
  ok(sent.body.audit.length === 2, "audit covers both channels", sent.body.audit);
  ok(
    new Set(sent.body.audit.map((row) => row.channelId)).size === 2 &&
      sent.body.audit.some((row) => row.channelId === waId) &&
      sent.body.audit.some((row) => row.channelId === tgId),
    "audit channelIds match the created channels",
    sent.body.audit,
  );
  ok(
    sent.body.audit.every((row) => row.status === "SENT" && row.errorDetail === null && row.payload.length > 0),
    "every audit row SENT with the exact payload (AUD-01)",
    sent.body.audit,
  );

  const trail = await api<{ total: number; items: unknown[] }>("GET", `/tickets/${ticketId}/delivery-audit`, {
    token: admin.token,
  });
  ok(trail.status === 200 && trail.body.total === 2, "delivery-audit trail lists both rows", trail.body);
  step("send {all:true} + audit trail");

  // 7. Teardown: deactivate these channels so s3's zero-active case is reachable.
  for (const channelId of [waId, tgId]) {
    const deactivated = await api<{ active: boolean }>("PATCH", `/channels/${channelId}`, {
      token: admin.token,
      body: { active: false },
    });
    ok(deactivated.status === 200 && deactivated.body.active === false, `deactivate ${channelId}`, deactivated.body);
  }

  console.log("E2E-S1 PASS");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
