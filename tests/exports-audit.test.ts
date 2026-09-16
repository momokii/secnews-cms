import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "../src/generated/prisma/client.js";
import { recordExportAudit, toExportAuditDto } from "../src/modules/exports/audit.js";
import { prisma } from "../src/lib/db.js";
import { c3Cleanup, c3User, type C3User } from "./tickets.fixtures.js";

/** Export audit trail: one ExportAudit row per export run — with a user actor
 * and with a null actor (system/scheduled exports), plus the DTO join. */

let admin: C3User;
const auditRowIds: string[] = [];
const emails: string[] = [];

beforeAll(async () => {
  admin = await c3User("ADMIN");
  emails.push(admin.email);
});

afterAll(async () => {
  if (auditRowIds.length > 0) {
    await prisma.exportAudit.deleteMany({ where: { id: { in: auditRowIds } } });
  }
  await c3Cleanup({ emails });
  await prisma.$disconnect();
});

describe("recordExportAudit", () => {
  async function findRow(id: string): Promise<Prisma.ExportAuditGetPayload<{
    include: { actor: { select: { name: true } } };
  }>> {
    const row = await prisma.exportAudit.findUnique({
      where: { id },
      include: { actor: { select: { name: true } } },
    });
    if (row === null) {
      throw new Error("expected an ExportAudit row");
    }
    return row;
  }

  it("a user export writes a SUCCESS row with the actor and window", async () => {
    // Given: an ADMIN user and an export window
    const from = new Date("2026-09-01T00:00:00.000Z");
    const to = new Date("2026-09-15T23:59:59.000Z");

    // When: a successful ticket/CSV export is recorded
    await recordExportAudit(prisma, {
      actorId: admin.id,
      type: "TICKET",
      format: "CSV",
      from,
      to,
      status: "SUCCESS",
      rowCount: 3,
    });
    const row = await prisma.exportAudit.findFirstOrThrow({
      where: { actorId: admin.id },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    auditRowIds.push(row.id);

    // Then: the row persists every export attribute plus the actor relation
    expect(row.actorId).toBe(admin.id);
    expect(row.actor?.name).toBe("C3 ADMIN");
    expect(row.type).toBe("TICKET");
    expect(row.format).toBe("CSV");
    expect(row.from?.toISOString()).toBe(from.toISOString());
    expect(row.to?.toISOString()).toBe(to.toISOString());
    expect(row.status).toBe("SUCCESS");
    expect(row.rowCount).toBe(3);
    expect(row.error).toBeNull();
  });

  it("a system export writes a row with a null actor", async () => {
    // Given: no user (scheduled/system export)

    // When: the export is recorded with a null actor
    await recordExportAudit(prisma, {
      actorId: null,
      type: "FEED",
      format: "JSON",
      status: "SUCCESS",
      rowCount: 12,
    });
    const row = await prisma.exportAudit.findFirstOrThrow({
      where: { type: "FEED", format: "JSON", rowCount: 12 },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    auditRowIds.push(row.id);

    // Then: the row exists with no actor at all
    expect(row.actorId).toBeNull();
    expect(row.actor).toBeNull();
  });

  it("a failure writes a FAILED row with the error and no rowCount", async () => {
    // Given: an ADMIN user and a failing export

    // When: the failure is recorded
    await recordExportAudit(prisma, {
      actorId: admin.id,
      type: "TICKET",
      format: "XLSX",
      status: "FAILED",
      error: "workbook write failed",
    });
    const row = await prisma.exportAudit.findFirstOrThrow({
      where: { status: "FAILED", format: "XLSX", actorId: admin.id },
      orderBy: { createdAt: "desc" },
    });
    auditRowIds.push(row.id);

    // Then: status, error and null rowCount are persisted
    expect(row.status).toBe("FAILED");
    expect(row.error).toBe("workbook write failed");
    expect(row.rowCount).toBeNull();
  });

  it("accepts a transaction client and commits atomically", async () => {
    // Given: an ADMIN user

    // When: the audit row is written inside a transaction
    const id = await prisma.$transaction(async (tx) => {
      await recordExportAudit(tx, {
        actorId: admin.id,
        type: "FEED",
        format: "CSV",
        status: "SUCCESS",
        rowCount: 1,
      });
      return tx.exportAudit.findFirstOrThrow({
        where: { actorId: admin.id, rowCount: 1 },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      }).then((row) => row.id);
    });
    auditRowIds.push(id);

    // Then: the row is visible after the commit
    const row = await findRow(id);
    expect(row.status).toBe("SUCCESS");
    expect(row.rowCount).toBe(1);
  });
});

describe("toExportAuditDto", () => {
  it("joins the actor name and serializes timestamps", async () => {
    // Given: a SUCCESS row recorded for the ADMIN
    const from = new Date("2026-09-02T00:00:00.000Z");
    await recordExportAudit(prisma, {
      actorId: admin.id,
      type: "TICKET",
      format: "JSON",
      from,
      status: "SUCCESS",
      rowCount: 7,
    });
    const row = await prisma.exportAudit.findFirstOrThrow({
      where: { actorId: admin.id, format: "JSON", rowCount: 7 },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    auditRowIds.push(row.id);

    // When: the row is mapped to its DTO
    const dto = toExportAuditDto(row);

    // Then: the actor name is joined and dates are ISO strings
    expect(dto).toEqual({
      id: row.id,
      actorId: admin.id,
      actorName: "C3 ADMIN",
      type: "TICKET",
      format: "JSON",
      from: from.toISOString(),
      to: null,
      status: "SUCCESS",
      rowCount: 7,
      error: null,
      createdAt: row.createdAt.toISOString(),
    });
  });

  it("maps a null-actor row to a null actorName", async () => {
    // Given: a system export row with no actor
    await recordExportAudit(prisma, {
      actorId: null,
      type: "FEED",
      format: "XLSX",
      status: "FAILED",
      error: "scheduled run crashed",
    });
    const row = await prisma.exportAudit.findFirstOrThrow({
      where: { actorId: null, format: "XLSX", status: "FAILED" },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    auditRowIds.push(row.id);

    // When: the row is mapped to its DTO
    const dto = toExportAuditDto(row);

    // Then: actor fields are null and the error is carried through
    expect(dto.actorId).toBeNull();
    expect(dto.actorName).toBeNull();
    expect(dto.status).toBe("FAILED");
    expect(dto.error).toBe("scheduled run crashed");
  });
});
