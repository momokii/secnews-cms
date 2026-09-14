import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import { bearerFor, cleanupTicket, cleanupUsers, createTestTicket } from "./helpers.js";

/**
 * Surface 8a — bulletin template + preview (routes 49–51).
 * PREV-01: preview renders the exact defanged body from final fields.
 * PREV-02: missing required final fields → 422 VALIDATION (details.missing).
 */

const TEMPLATE = `== {{title}} ==
Overview: {{overview}}
Desc: {{description}}
IOCs:
{{ioc_block}}
Fix: {{recommendations}}
Refs:
{{references}}
TLP section {{ioc_block}} may repeat`;

async function setIocs(
  ticketId: string,
  rows: Array<{ type: string; value: string; includeInBulletin?: boolean }>,
): Promise<void> {
  await prisma.ioc.createMany({
    data: rows.map((row) => ({
      ticketId,
      type: row.type as never,
      value: row.value,
      includeInBulletin: row.includeInBulletin ?? true,
    })),
  });
}

describe("TASK-D2 bulletin template + preview", () => {
  let app: FastifyInstance;
  let admin = "";
  let editor = "";
  let analyst = "";

  beforeAll(async () => {
    app = await buildApp();
    admin = await bearerFor(app, "ADMIN");
    editor = await bearerFor(app, "EDITOR");
    analyst = await bearerFor(app, "ANALYST");
    await prisma.bulletinTemplate.deleteMany({ where: { name: "default" } });
  });

  afterAll(async () => {
    await prisma.bulletinTemplate.deleteMany({ where: { name: "default" } });
    await cleanupUsers();
    await prisma.$disconnect();
    await app.close();
  });

  it("PREV-01: preview renders the exact defanged body from final fields (excluded IOCs dropped)", async () => {
    // Given: an ADMIN-updated template and a ticket with final fields + IOCs
    const put = await app.inject({
      method: "PUT",
      url: "/bulletin/template",
      headers: { authorization: admin },
      payload: { template: TEMPLATE },
    });
    expect(put.statusCode).toBe(200);

    const ticketId = await createTestTicket({
      overview: "Adversaries target the sector.",
      description: "Detailed narrative of the campaign.",
      recommendations: "Patch now.",
      references: ["https://example.com/a", "https://example.com/b"],
    });
    const title = "Evil campaign X";
    await prisma.ticket.update({ where: { id: ticketId }, data: { title } });
    await setIocs(ticketId, [
      { type: "DOMAIN", value: "evil.com" },
      { type: "IPV4", value: "1.2.3.4" },
      { type: "URL", value: "https://evil.com/payload" },
      { type: "EMAIL", value: "user@evil.com" },
      { type: "MD5", value: "deadbeefdeadbeefdeadbeefdeadbeef", includeInBulletin: false },
    ]);

    try {
      // When: an EDITOR (WORK) previews the bulletin
      const res = await app.inject({
        method: "POST",
        url: `/tickets/${ticketId}/bulletin/preview`,
        headers: { authorization: editor },
        payload: {},
      });

      // Then: the rendered body matches the defanged expectation exactly
      expect(res.statusCode).toBe(200);
      const iocBlock = [
        "- DOMAIN evil[.]com",
        "- IPV4 1[.]2[.]3[.]4",
        "- URL hxxps://evil[.]com/payload",
        "- EMAIL user(at)evil[.]com",
      ].join("\n");
      const expected = [
        "== Evil campaign X ==",
        "Overview: Adversaries target the sector.",
        "Desc: Detailed narrative of the campaign.",
        "IOCs:",
        iocBlock,
        "Fix: Patch now.",
        "Refs:",
        "https://example.com/a",
        "https://example.com/b",
        // A repeated placeholder is substituted at every occurrence.
        `TLP section ${iocBlock} may repeat`,
      ].join("\n");
      const body = res.json() as { rendered: string };
      expect(body.rendered).toBe(expected);
    } finally {
      await cleanupTicket(ticketId);
    }
  });

  it("PREV-02: preview is 422 VALIDATION naming only the required fields (§10: recommendations/references optional)", async () => {
    // Given: a ticket with none of the required final fields
    const ticketId = await createTestTicket();
    try {
      // When: it is previewed
      const res = await app.inject({
        method: "POST",
        url: `/tickets/${ticketId}/bulletin/preview`,
        headers: { authorization: editor },
        payload: {},
      });

      // Then: 422 VALIDATION naming overview and description — never recs/refs
      expect(res.statusCode).toBe(422);
      const body = res.json() as { error: { code: string; details: { missing: string[] } } };
      expect(body.error.code).toBe("VALIDATION");
      expect(body.error.details.missing).toEqual(["overview", "description"]);
    } finally {
      await cleanupTicket(ticketId);
    }
  });

  it("preview is 200 without recommendations/references — optional per §10", async () => {
    // Given: a ticket with only the two required final fields filled
    const ticketId = await createTestTicket({
      overview: "Adversaries target the sector.",
      description: "Detailed narrative of the campaign.",
      recommendations: null,
      references: [],
    });
    try {
      // When: it is previewed
      const res = await app.inject({
        method: "POST",
        url: `/tickets/${ticketId}/bulletin/preview`,
        headers: { authorization: editor },
        payload: {},
      });

      // Then: 200 — empty optional sections drop out of the render, no 422
      expect(res.statusCode).toBe(200);
      const body = res.json() as { rendered: string };
      expect(body.rendered).not.toContain("{{");
      expect(body.rendered).not.toContain("Recommendations:");
    } finally {
      await cleanupTicket(ticketId);
    }
  });

  it("preview drops an unfilled optional section instead of fabricating content", async () => {
    // Given: a ticket with required fields but zero bulletins IOCs
    const ticketId = await createTestTicket({
      overview: "o",
      description: "d",
      recommendations: "r",
      references: ["https://example.com/x"],
    });
    try {
      // When: the template only carries the ioc_block section
      const res = await app.inject({
        method: "POST",
        url: `/tickets/${ticketId}/bulletin/preview`,
        headers: { authorization: analyst },
        payload: {},
      });

      // Then: 200 for the ANALYST (WORK) and no residue of the empty section
      expect(res.statusCode).toBe(200);
      const body = res.json() as { rendered: string };
      expect(body.rendered).not.toContain("{{");
      expect(body.rendered).not.toContain("undefined");
    } finally {
      await cleanupTicket(ticketId);
    }
  });

  it("GET /bulletin/template serves the built-in default until an ADMIN PUTs one", async () => {
    // Given: no template row exists
    await prisma.bulletinTemplate.deleteMany({ where: { name: "default" } });
    // When: any authenticated role reads the template
    const res = await app.inject({
      method: "GET",
      url: "/bulletin/template",
      headers: { authorization: analyst },
    });

    // Then: a non-empty template is returned (built-in default)
    expect(res.statusCode).toBe(200);
    const body = res.json() as { template: string };
    expect(body.template.length).toBeGreaterThan(0);
    expect(body.template).toContain("{{title}}");
  });

  it("PUT /bulletin/template persists and GET returns the stored body verbatim", async () => {
    // When: an ADMIN stores a custom template and it is read back
    const put = await app.inject({
      method: "PUT",
      url: "/bulletin/template",
      headers: { authorization: admin },
      payload: { template: "Custom {{overview}}" },
    });
    const get = await app.inject({
      method: "GET",
      url: "/bulletin/template",
      headers: { authorization: admin },
    });

    // Then: the stored body round-trips
    expect(put.statusCode).toBe(200);
    expect(get.statusCode).toBe(200);
    expect((get.json() as { template: string }).template).toBe("Custom {{overview}}");
  });

  it("RBAC: PUT template is ADMIN-only; GET template and preview require authentication", async () => {
    // Given: an EDITOR token and an anonymous caller
    // When: both hit the mutating/read surfaces
    const putByEditor = await app.inject({
      method: "PUT",
      url: "/bulletin/template",
      headers: { authorization: editor },
      payload: { template: "nope" },
    });
    const anonGet = await app.inject({ method: "GET", url: "/bulletin/template" });
    const anonPreview = await app.inject({
      method: "POST",
      url: "/tickets/00000000-0000-4000-8000-000000000000/bulletin/preview",
      payload: {},
    });

    // Then: mutating is 403, anonymous is 401
    expect(putByEditor.statusCode).toBe(403);
    expect(anonGet.statusCode).toBe(401);
    expect(anonPreview.statusCode).toBe(401);
  });
});
