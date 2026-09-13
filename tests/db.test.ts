import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/db.js";

describe("User roundtrip (DB-01)", () => {
  const email = `db01-${randomUUID()}@secnews.test`;

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("inserts a user and reads it back by email", async () => {
    // Given: a fresh user payload with a unique email
    const payload = {
      email,
      name: "DB-01 Analyst",
      passwordHash: "test-hash-not-a-real-password",
      role: "ANALYST",
    } as const;

    // When: the user is inserted, then fetched by its unique email
    const created = await prisma.user.create({ data: payload });
    const fetched = await prisma.user.findUnique({ where: { email } });

    // Then: the fetched row matches exactly what was inserted
    expect(fetched).not.toBeNull();
    expect(fetched?.email).toBe(payload.email);
    expect(fetched?.name).toBe(payload.name);
    expect(fetched?.passwordHash).toBe(payload.passwordHash);
    expect(fetched?.role).toBe("ANALYST");
    expect(created.id).toBe(fetched?.id);
    expect(fetched?.createdAt).toBeInstanceOf(Date);
  });
});
