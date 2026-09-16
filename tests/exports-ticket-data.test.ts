import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  iterateTicketExportRows,
  TicketExportDataRowSchema,
  ticketStatusBreakdown,
} from "../src/modules/exports/ticketData.js";
import { prisma } from "../src/lib/db.js";
import { c3Cleanup, c3Ticket, c3User, type C3TicketInput, type C3User } from "./tickets.fixtures.js";
import { createTestSuggestion } from "./helpers.js";

/** TASK-EXPORT-DATA: iterateTicketExportRows walks every ticket in a createdAt
 * window (oldest first) yielding the full read-side detail — activities,
 * delivery audits, iocs, sources, taken-by — and ticketStatusBreakdown
 * group-counts the same window by status. Real Postgres, seeded rows only. */

let admin: C3User;
const ticketIds: string[] = [];
const emails: string[] = [];
const channelIds: string[] = [];
const clientIds: string[] = [];
let channelId: string;

/** June window used by the detail-shape, bounds and fallback scenarios. */
const JUNE = {
  from: new Date("2026-06-10T00:00:00.000Z"),
  to: new Date("2026-06-11T23:59:59.999Z"),
};
const IN_JUNE = new Date("2026-06-10T12:00:00.000Z");

/** c3Ticket with an explicit createdAt so windows are deterministic. */
async function seedTicket(
  createdAt: Date,
  input: C3TicketInput = {},
): Promise<{ id: string; title: string }> {
  const row = await c3Ticket(input);
  await prisma.ticket.update({ where: { id: row.id }, data: { createdAt } });
  ticketIds.push(row.id);
  return row;
}

async function collect(from: Date, to: Date): Promise<string[]> {
  const ids: string[] = [];
  for await (const row of iterateTicketExportRows(from, to)) {
    ids.push(row.id);
  }
  return ids;
}

beforeAll(async () => {
  admin = await c3User("ADMIN");
  emails.push(admin.email);
  const client = await prisma.client.create({
    data: { name: `export-data ${admin.id}` },
    select: { id: true },
  });
  clientIds.push(client.id);
  const channel = await prisma.channel.create({
    data: { clientId: client.id, type: "WHATSAPP", target: '{"chatId":"12025550001"}' },
    select: { id: true },
  });
  channelIds.push(channel.id);
  channelId = channel.id;
});

afterAll(async () => {
  // Deliveries restrict ticket deletion (no cascade in the schema) — remove
  // the suite's audit rows first; activities/sources/iocs cascade.
  await prisma.deliveryAudit.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await c3Cleanup({ ticketIds, emails });
  if (channelIds.length > 0) {
    await prisma.channel.deleteMany({ where: { id: { in: channelIds } } });
  }
  if (clientIds.length > 0) {
    await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
  }
  await prisma.$disconnect();
});

describe("iterateTicketExportRows", () => {
  it("yields the in-window ticket with activities, delivery audits, iocs, sources and taken-by", async () => {
    // Given: a SENT ticket taken by the admin carrying one of each nested row
    const ticket = await seedTicket(IN_JUNE, { status: "SENT", origin: "MANUAL" });
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { takenById: admin.id },
    });
    await prisma.ticketSource.create({
      data: {
        ticketId: ticket.id,
        title: "vendor advisory",
        url: "https://example.com/advisory",
        createdById: admin.id,
      },
    });
    await prisma.ioc.create({
      data: { ticketId: ticket.id, type: "IPV4", value: "203.0.113.10", createdById: admin.id },
    });
    await prisma.ticketActivity.create({
      data: { ticketId: ticket.id, actorId: admin.id, action: "TAKEN", detail: "take" },
    });
    await prisma.deliveryAudit.create({
      data: {
        ticketId: ticket.id,
        channelId,
        status: "SENT",
        payload: "bulletin body",
        sentById: admin.id,
      },
    });
    await createTestSuggestion(ticket.id, {
      field: "overview",
      currentValue: null,
      suggestedValue: "pending text",
    });

    // When: the June window is iterated
    let exported: Awaited<ReturnType<typeof TicketExportDataRowSchema.parse>> | undefined;
    for await (const row of iterateTicketExportRows(JUNE.from, JUNE.to)) {
      if (row.id === ticket.id) {
        exported = TicketExportDataRowSchema.parse(row);
      }
    }

    // Then: the row carries every read-side detail shape
    expect(exported).toBeDefined();
    expect(exported?.title).toBe(ticket.title);
    expect(exported?.status).toBe("SENT");
    expect(exported?.takenByName).toBe("C3 ADMIN");
    expect(exported?.pendingSuggestions).toBe(1);
    expect(exported?.sources).toHaveLength(1);
    expect(exported?.sources[0]?.title).toBe("vendor advisory");
    expect(exported?.iocs).toHaveLength(1);
    expect(exported?.iocs[0]?.type).toBe("IPV4");
    expect(exported?.iocs[0]?.value).toBe("203.0.113.10");
    expect(exported?.activities).toHaveLength(1);
    expect(exported?.activities[0]?.actorName).toBe("C3 ADMIN");
    expect(exported?.activities[0]?.action).toBe("TAKEN");
    expect(exported?.deliveryAudits).toHaveLength(1);
    expect(exported?.deliveryAudits[0]?.channelType).toBe("WHATSAPP");
    expect(exported?.deliveryAudits[0]?.clientName).toBe(`export-data ${admin.id}`);
    expect(exported?.deliveryAudits[0]?.target).toBe("12025550001");
    expect(exported?.deliveryAudits[0]?.payload).toBe("bulletin body");
    expect(exported?.deliveryAudits[0]?.sentById).toBe(admin.id);
  });

  it("walks only the window, oldest first", async () => {
    // Given: two in-window tickets and one on each side of the window
    const early = await seedTicket(new Date("2026-06-10T08:00:00.000Z"));
    const late = await seedTicket(new Date("2026-06-10T18:00:00.000Z"));
    const before = await seedTicket(new Date("2026-06-01T00:00:00.000Z"));
    const after = await seedTicket(new Date("2026-06-20T00:00:00.000Z"));

    // When: the June window is iterated
    const ids = await collect(JUNE.from, JUNE.to);

    // Then: only in-window rows come back, in createdAt order
    expect(ids).toContain(early.id);
    expect(ids).toContain(late.id);
    expect(ids.indexOf(early.id)).toBeLessThan(ids.indexOf(late.id));
    expect(ids).not.toContain(before.id);
    expect(ids).not.toContain(after.id);
  });

  it("resolves taken-by from the newest taken activity when the relation is empty", async () => {
    // Given: a legacy ticket with no takenById and a TAKEN activity by admin
    const ticket = await seedTicket(IN_JUNE, { origin: "MANUAL" });
    await prisma.ticketActivity.create({
      data: {
        ticketId: ticket.id,
        actorId: admin.id,
        action: "TAKEN",
        createdAt: new Date(1000),
      },
    });

    // When: the window is iterated
    let takenByName: string | null | undefined;
    for await (const row of iterateTicketExportRows(JUNE.from, JUNE.to)) {
      if (row.id === ticket.id) {
        takenByName = row.takenByName;
      }
    }

    // Then: the activity actor resolves as taken-by
    expect(takenByName).toBe("C3 ADMIN");
  });

  it("yields nothing for an empty window", async () => {
    // Given: a window before any seeded ticket exists

    // When: that window is iterated
    const ids = await collect(new Date("2000-01-01T00:00:00.000Z"), new Date("2000-01-02T00:00:00.000Z"));

    // Then: no rows come back
    expect(ids).toHaveLength(0);
  });
});

describe("ticketStatusBreakdown", () => {
  it("group-counts in-window tickets by status and omits empty statuses", async () => {
    // Given: two OPEN and one READY ticket in the July window, one CLOSED outside
    const july = {
      from: new Date("2026-07-01T00:00:00.000Z"),
      to: new Date("2026-07-02T23:59:59.999Z"),
    };
    const inJuly = new Date("2026-07-01T12:00:00.000Z");
    await seedTicket(inJuly, { status: "OPEN" });
    await seedTicket(inJuly, { status: "OPEN" });
    await seedTicket(inJuly, { status: "READY" });
    await seedTicket(new Date("2026-08-01T00:00:00.000Z"), { status: "CLOSED" });

    // When: the July window is summarized
    const breakdown = await ticketStatusBreakdown(july.from, july.to);

    // Then: counts match the window and CLOSED is absent, not zero
    expect(breakdown.OPEN).toBe(2);
    expect(breakdown.READY).toBe(1);
    expect(breakdown.CLOSED).toBeUndefined();
  });
});
