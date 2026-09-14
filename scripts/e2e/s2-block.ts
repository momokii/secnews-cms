import {
  api,
  createReadyTicket,
  expectError,
  loadState,
  ok,
  step,
  uniqueId,
} from "./lib.js";

/**
 * E2E-S2 hard block (S2 / BLK-01): a READY ticket holding PENDING AI
 * suggestions rejects send (#47) and OTX push (#52) with 409
 * PENDING_SUGGESTIONS, writes no audit rows, and leaves the ticket READY.
 */

async function main(): Promise<void> {
  const admin = loadState();

  const ticketId = await createReadyTicket(admin, `E2E S2 blocked ${uniqueId()}`);

  // Ensure the (stubbed) provider is configured, then fill — suggestions stay PENDING.
  const integration = await api<unknown>("PUT", "/integrations/OPENAI", {
    token: admin.token,
    body: { apiKey: "e2e-stub-key", model: "e2e-stub-model" },
  });
  ok(integration.status === 200, "PUT integrations/OPENAI → 200", integration.status);

  const filled = await api<{ suggestions: Array<{ id: string; status: string }> }>(
    "POST",
    `/tickets/${ticketId}/ai/fill`,
    { token: admin.token, body: {} },
  );
  ok(filled.status === 200 && filled.body.suggestions.length >= 1, "fill created PENDING suggestions", filled.body);

  // Send is hard-blocked with 409 PENDING_SUGGESTIONS (SND-03).
  const blockedSend = await api<unknown>("POST", `/tickets/${ticketId}/send`, {
    token: admin.token,
    body: { all: true },
  });
  expectError(blockedSend, 409, "PENDING_SUGGESTIONS", "send with pending suggestions");

  // OTX push is hard-blocked the same way (OTX-02).
  const blockedOtx = await api<unknown>("POST", `/tickets/${ticketId}/otx`, {
    token: admin.token,
    body: {},
  });
  expectError(blockedOtx, 409, "PENDING_SUGGESTIONS", "otx push with pending suggestions");

  // Nothing leaked: no audit rows, ticket still READY.
  const trail = await api<{ total: number }>("GET", `/tickets/${ticketId}/delivery-audit`, {
    token: admin.token,
  });
  ok(trail.status === 200 && trail.body.total === 0, "no audit rows written for blocked send", trail.body);
  const ticket = await api<{ status: string }>("GET", `/tickets/${ticketId}`, { token: admin.token });
  ok(ticket.status === 200 && ticket.body.status === "READY", "ticket stays READY", ticket.body);
  step("send + OTX both 409 PENDING_SUGGESTIONS, state untouched");

  console.log("E2E-S2 PASS");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
