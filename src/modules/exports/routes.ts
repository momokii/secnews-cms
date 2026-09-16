import type { Prisma } from "../../generated/prisma/client.js";
import { ExportType as PrismaExportType } from "../../generated/prisma/enums.js";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { prisma } from "../../lib/db.js";
import { getAuthUser } from "../../plugins/auth.js";
import { dateBound } from "../tickets/schema.js";
import { toExportAuditDto } from "./audit.js";
import { runExport } from "./flow.js";
import {
  CreateExportBodySchema,
  ListExportAuditQuerySchema,
  ListExportAuditResponseSchema,
} from "./schema.js";

/**
 * Export surfaces (TASK-EXP). POST /exports/feeds and POST /exports/tickets
 * hand the validated body plus the signed-in actor to the shared runExport
 * flow, which owns the download headers, the byte stream and the SUCCESS/
 * FAILED audit row — no response schema here, the payload is a stream, not
 * JSON. GET /exports/audit paginates the trail with type/format/status and
 * run-window filters. All three are open to every signed-in role
 * (ADMIN/EDITOR/ANALYST): running an export already implies seeing the trail.
 */

const anyRole = (app: FastifyInstance) => [app.requireRole("ADMIN", "EDITOR", "ANALYST")];

export default async function exportRoutes(app: FastifyInstance): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();

  /** One export start route per ExportType; only the row kind differs. */
  const exportRoute = (path: string, type: PrismaExportType): void => {
    void f.post(
      path,
      {
        schema: { body: CreateExportBodySchema },
        onRequest: anyRole(app),
      },
      async (request, reply) => {
        const { format, from, to } = request.body;
        await runExport({ type, format, from, to, actor: { id: getAuthUser(request).id } }, reply);
        return reply;
      },
    );
  };

  // Autoload prefixes the module directory: /feeds → /exports/feeds, etc.
  exportRoute("/feeds", PrismaExportType.FEED);
  exportRoute("/tickets", PrismaExportType.TICKET);

  f.get(
    "/audit",
    {
      schema: {
        querystring: ListExportAuditQuerySchema,
        response: { 200: ListExportAuditResponseSchema },
      },
      onRequest: anyRole(app),
    },
    async (request) => {
      const { page, pageSize, type, format, status, from, to } = request.query;
      const where: Prisma.ExportAuditWhereInput = {
        ...(type === undefined ? {} : { type }),
        ...(format === undefined ? {} : { format }),
        ...(status === undefined ? {} : { status }),
        ...(from === undefined && to === undefined
          ? {}
          : {
              createdAt: {
                ...(from === undefined ? {} : { gte: dateBound(from, false) }),
                ...(to === undefined ? {} : { lte: dateBound(to, true) }),
              },
            }),
      };
      const [rows, total] = await prisma.$transaction([
        prisma.exportAudit.findMany({
          where,
          include: { actor: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.exportAudit.count({ where }),
      ]);
      return { items: rows.map(toExportAuditDto), total, page, pageSize };
    },
  );
}
