import {
  api,
  createChannel,
  createReadyTicket,
  expectError,
  loadState,
  ok,
  step,
  uniqueId,
} from "./lib.js";

/**
 * E2E-S3 inactive gating (SND-01): `all:true` resolves currently-ACTIVE
 * channels only (inactive silently excluded); an explicit channelIds naming
 * an inactive channel → 409 INACTIVE_TARGET with zero audit rows; with no
 * active channel anywhere, `all:true` → 422 VALIDATION.
 */

async function main(): Promise<void> {
  const admin = loadState();

  const client = await api<{ id: string }>("POST", "/clients", {
    token: admin.token,
    body: { name: `E2E S3 Client ${uniqueId()}` },
  });
  ok(client.status === 201, "POST /clients → 201", client.body);
  const waId = await createChannel(admin, client.body.id, { type: "WHATSAPP", chatId: "e2e-s3-wa@g.us" });
  const tgId = await createChannel(admin, client.body.id, {
    type: "TELEGRAM",
    chatId: "-100300-e2e",
    token: "e2e-s3-tg-token",
  });
  const deactivated = await api<{ active: boolean }>("PATCH", `/channels/${tgId}`, {
    token: admin.token,
    body: { active: false },
  });
  ok(deactivated.status === 200 && deactivated.body.active === false, "TELEGRAM channel deactivated", deactivated.body);

  // Explicit channelIds naming the inactive channel → 409 INACTIVE_TARGET.
  const ticketA = await createReadyTicket(admin, `E2E S3 explicit-inactive ${uniqueId()}`);
  const explicitInactive = await api<unknown>("POST", `/tickets/${ticketA}/send`, {
    token: admin.token,
    body: { channelIds: [tgId] },
  });
  expectError(explicitInactive, 409, "INACTIVE_TARGET", "explicit inactive channelIds");
  const trailA = await api<{ total: number }>("GET", `/tickets/${ticketA}/delivery-audit`, {
    token: admin.token,
  });
  ok(trailA.status === 200 && trailA.body.total === 0, "no audit rows for the rejected send", trailA.body);
  step("explicit inactive channel → 409 INACTIVE_TARGET");

  // {all:true} silently excludes the inactive channel and delivers to active only.
  const allActive = await api<{
    ticket: { status: string };
    audit: Array<{ channelId: string; status: string }>;
  }>("POST", `/tickets/${ticketA}/send`, { token: admin.token, body: { all: true } });
  ok(allActive.status === 200 && allActive.body.ticket.status === "SENT", "send {all:true} → 200 SENT", allActive.body);
  ok(
    allActive.body.audit.length === 1 &&
      allActive.body.audit[0]?.channelId === waId &&
      allActive.body.audit[0]?.status === "SENT",
    "audit covers only the active channel (inactive excluded)",
    allActive.body.audit,
  );
  step("{all:true} excludes inactive channels");

  // With zero active channels anywhere, {all:true} resolves no target → 422 VALIDATION.
  const ticketB = await createReadyTicket(admin, `E2E S3 zero-active ${uniqueId()}`);
  const deactivatedWa = await api<unknown>("PATCH", `/channels/${waId}`, {
    token: admin.token,
    body: { active: false },
  });
  ok(deactivatedWa.status === 200, "WHATSAPP channel deactivated", deactivatedWa);
  const noTargets = await api<unknown>("POST", `/tickets/${ticketB}/send`, {
    token: admin.token,
    body: { all: true },
  });
  expectError(noTargets, 422, "VALIDATION", "send {all:true} with zero active channels");
  const trailB = await api<{ total: number }>("GET", `/tickets/${ticketB}/delivery-audit`, {
    token: admin.token,
  });
  ok(trailB.status === 200 && trailB.body.total === 0, "no audit rows without targets", trailB.body);
  step("zero active channels → 422 VALIDATION");

  console.log("E2E-S3 PASS");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
