import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/db.js";

/**
 * Shared fixtures for TASK-C4 scenario tests (crypto, AI providers,
 * integrations, fill/enrich, suggestions, pending-guard).
 * Auth goes through the real requireRole guard (DB-backed), so each suite
 * mints real user rows and signs C1-shaped tokens {sub, email} for them.
 */

export type TestRole = "ADMIN" | "EDITOR" | "ANALYST";

const createdUserIds: string[] = [];

/** Create a real user row (unique email) and a bearer token for it. */
export async function bearerFor(app: FastifyInstance, role: TestRole): Promise<string> {
  const email = `c4-${role.toLowerCase()}-${randomUUID()}@secnews.test`;
  const user = await prisma.user.create({
    data: { email, name: `C4 ${role}`, passwordHash: "not-a-real-hash", role },
    select: { id: true, email: true },
  });
  createdUserIds.push(user.id);
  return `Bearer ${app.jwt.sign({ sub: user.id, email: user.email })}`;
}

/** Delete every user row minted by bearerFor (call in afterAll). */
export async function cleanupUsers(): Promise<void> {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: [...createdUserIds] } } });
    createdUserIds.length = 0;
  }
}

/** Create a minimal MANUAL/OTHER ticket, optionally pre-filling final fields. */
export async function createTestTicket(
  finalFields: Partial<{
    overview: string | null;
    description: string | null;
    recommendations: string | null;
    mitigation: string | null;
    affectedVersions: string | null;
    references: string[];
    cveIds: string[];
  }> = {},
): Promise<string> {
  const ticket = await prisma.ticket.create({
    data: {
      title: `C4 fixture ${randomUUID()}`,
      summary: "Adversaries brute-forcing public SSH endpoints.",
      origin: "MANUAL",
      status: "OPEN",
      findingType: "OTHER",
      ...finalFields,
    },
    select: { id: true },
  });
  return ticket.id;
}

/** Persist an AiSuggestion row whose content carries the structured payload. */
export async function createTestSuggestion(
  ticketId: string,
  payload: { field: string; currentValue: string | null; suggestedValue: string },
  status: "PENDING" | "ACCEPTED" | "REJECTED" = "PENDING",
): Promise<string> {
  const row = await prisma.aiSuggestion.create({
    data: {
      ticketId,
      status,
      model: "test-model",
      content: JSON.stringify(payload),
    },
    select: { id: true },
  });
  return row.id;
}

/** Remove every row created for a ticket (suggestions first). */
export async function cleanupTicket(ticketId: string): Promise<void> {
  await prisma.aiSuggestion.deleteMany({ where: { ticketId } });
  await prisma.ticket.delete({ where: { id: ticketId } });
}
