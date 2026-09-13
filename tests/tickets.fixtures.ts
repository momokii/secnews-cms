import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Role } from "../src/generated/prisma/enums.js";
import { prisma } from "../src/lib/db.js";

/** C3 workflow-core fixtures. Tests self-sign JWTs (login is C1's surface)
 * and create real DB rows; every helper tags rows for targeted cleanup. */

export type C3Role = Role;

export type C3User = {
  id: string;
  email: string;
  role: C3Role;
};

const tag = `c3-${randomUUID().slice(0, 8)}`;

export function c3Tag(): string {
  return tag;
}

// Given: a role needing a real user row (sources/iocs carry createdById)
export async function c3User(role: C3Role): Promise<C3User> {
  const email = `${tag}-${randomUUID()}@secnews.test`;
  const user = await prisma.user.create({
    data: { email, name: `C3 ${role}`, passwordHash: "test-hash-not-a-real-password", role },
  });
  return { id: user.id, email, role };
}

// The token carries no role: the auth plugin resolves role from the DB row.
export function bearer(user: C3User, app: FastifyInstance): string {
  return `Bearer ${app.jwt.sign({ sub: user.id, email: user.email })}`;
}

export type C3TicketInput = {
  title?: string;
  status?: "OPEN" | "RESEARCH" | "READY" | "SENT" | "CLOSED";
  findingType?: "VULNERABILITY_CVE" | "THREAT_CAMPAIGN" | "OTHER";
  origin?: "MANUAL" | "AUTO_FEED";
};

// Given: a ticket seeded directly (transition/field tests pin status themselves)
export async function c3Ticket(input: C3TicketInput = {}): Promise<{ id: string; title: string }> {
  const title = input.title ?? `${tag} ticket ${randomUUID()}`;
  const row = await prisma.ticket.create({
    data: {
      title,
      summary: `${tag} summary`,
      origin: input.origin ?? "MANUAL",
      status: input.status ?? "OPEN",
      findingType: input.findingType ?? "OTHER",
    },
    select: { id: true, title: true },
  });
  return row;
}

export type C3FeedItem = {
  itemId: string;
  sourceId: string;
};

// Given: a feed source + item in a chosen triage state (take flow needs both)
export async function c3FeedItem(
  status: "UNREVIEWED" | "VIEWED" = "UNREVIEWED",
): Promise<C3FeedItem> {
  const source = await prisma.feedSource.create({
    data: { name: `${tag} source`, url: `https://example.com/${tag}-${randomUUID()}.rss` },
    select: { id: true },
  });
  const item = await prisma.feedItem.create({
    data: {
      feedId: source.id,
      guid: `${tag}-${randomUUID()}`,
      title: `${tag} item title`,
      raw: { summary: `${tag} raw summary` },
      status,
    },
    select: { id: true },
  });
  return { itemId: item.id, sourceId: source.id };
}

// Then: rows are removable ticket-first; sources/iocs/suggestions cascade.
export async function c3Cleanup(
  entries: Partial<{
    ticketIds: string[];
    feedItemIds: string[];
    feedSourceIds: string[];
    emails: string[];
  }>,
): Promise<void> {
  if (entries.feedItemIds?.length) {
    await prisma.feedItem.deleteMany({ where: { id: { in: entries.feedItemIds } } });
  }
  if (entries.feedSourceIds?.length) {
    await prisma.feedSource.deleteMany({ where: { id: { in: entries.feedSourceIds } } });
  }
  if (entries.ticketIds?.length) {
    const ids = entries.ticketIds;
    await prisma.aiSuggestion.deleteMany({ where: { ticketId: { in: ids } } });
    await prisma.ticket.deleteMany({ where: { id: { in: ids } } });
  }
  if (entries.emails?.length) {
    await prisma.user.deleteMany({ where: { email: { in: entries.emails } } });
  }
}
