import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors.js";
import { prisma } from "../../lib/db.js";
import { getAuthUser } from "../../plugins/auth.js";
import { toIocDto, toTicketDto, toTicketSourceDto } from "./mappers.js";
import { recordActivity, registerActivityRoute } from "./activity.js";
import { registerFieldsRoute } from "./fields.js";
import {
  CreateTicketBodySchema,
  ListTicketsQuerySchema,
  ListTicketsResponseSchema,
  TicketDetailSchema,
  TicketSchema,
  TransitionBodySchema,
  UpdateTicketBodySchema,
  UuidIdParamSchema,
} from "./schema.js";
import { allowedRoles } from "./state-machine.js";

/** Surface 3 — tickets (routes 21–26). Sources/IOCs live in their sibling
 * routes files; the status machine is state-machine.ts (docs/STATES.md §1). */
export default async function ticketRoutes(app: FastifyInstance): Promise<void> {
  const routeApp = app.withTypeProvider<ZodTypeProvider>();
  await registerFieldsRoute(app);
  await registerActivityRoute(app);

  routeApp.get(
    "/",
    {
      schema: {
        querystring: ListTicketsQuerySchema,
        response: { 200: ListTicketsResponseSchema },
      },
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
    },
    async (request) => {
      const { q, status, origin, findingType, page, pageSize } = request.query;
      const where: Prisma.TicketWhereInput = {};
      if (q !== undefined) {
        where.title = { contains: q, mode: "insensitive" };
      }
      if (status !== undefined) {
        where.status = status;
      }
      if (origin !== undefined) {
        where.origin = origin;
      }
      if (findingType !== undefined) {
        where.findingType = findingType;
      }
      const [rows, total] = await prisma.$transaction([
        prisma.ticket.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.ticket.count({ where }),
      ]);
      return { items: rows.map(toTicketDto), total, page, pageSize };
    },
  );

  routeApp.get(
    "/:id",
    {
      schema: { params: UuidIdParamSchema, response: { 200: TicketDetailSchema } },
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
    },
    async (request) => {
      const { id } = request.params;
      const ticket = await prisma.ticket.findUnique({
        where: { id },
        include: {
          sources: { orderBy: { createdAt: "asc" } },
          iocs: { orderBy: { createdAt: "asc" } },
          _count: { select: { suggestions: { where: { status: "PENDING" } } } },
        },
      });
      if (ticket === null) {
        throw new AppError("NOT_FOUND", `Ticket ${id} not found`);
      }
      return {
        ...toTicketDto(ticket),
        sources: ticket.sources.map(toTicketSourceDto),
        iocs: ticket.iocs.map(toIocDto),
        pendingSuggestions: ticket._count.suggestions,
      };
    },
  );

  routeApp.post(
    "/",
    {
      schema: {
        body: CreateTicketBodySchema,
        response: { 201: TicketSchema },
      },
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
    },
    async (request, reply) => {
      const body = request.body;
      // NOT NULL with no default: manual tickets start with an empty working summary.
      const base = { title: body.title, origin: "MANUAL" as const, summary: "" };
      const data =
        body.findingType === "VULNERABILITY_CVE"
          ? {
              ...base,
              findingType: body.findingType,
              cveIds: body.cveIds,
              affectedProduct: body.affectedProduct,
              affectedVersions: body.affectedVersions,
              ...(body.mitigation !== undefined ? { mitigation: body.mitigation } : {}),
            }
          : body.findingType === "THREAT_CAMPAIGN"
            ? { ...base, findingType: body.findingType, threatName: body.threatName }
            : { ...base, findingType: body.findingType };
      const actorId = request.user.sub;
      const { created } = await prisma.$transaction(async (tx) => {
        const created = await tx.ticket.create({ data });
        await recordActivity(tx, {
          ticketId: created.id,
          actorId,
          action: "CREATED",
        });
        return { created };
      });
      return reply.code(201).send(toTicketDto(created));
    },
  );

  routeApp.patch(
    "/:id",
    {
      schema: {
        params: UuidIdParamSchema,
        body: UpdateTicketBodySchema,
        response: { 200: TicketSchema },
      },
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
    },
    async (request) => {
      const { id } = request.params;
      const ticket = await prisma.ticket.findUnique({ where: { id }, select: { id: true } });
      if (ticket === null) {
        throw new AppError("NOT_FOUND", `Ticket ${id} not found`);
      }
      const data: Prisma.TicketUpdateInput = {};
      if (request.body.title !== undefined) {
        data.title = request.body.title;
      }
      const actorId = request.user.sub;
      const updated = await prisma.$transaction(async (tx) => {
        const updated = await tx.ticket.update({ where: { id }, data });
        await recordActivity(tx, {
          ticketId: id,
          actorId,
          action: "FIELDS_UPDATED",
          detail: "title",
        });
        return updated;
      });
      return toTicketDto(updated);
    },
  );

  routeApp.post(
    "/:id/transition",
    {
      schema: {
        params: UuidIdParamSchema,
        body: TransitionBodySchema,
        response: { 200: TicketSchema },
      },
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
    },
    async (request) => {
      const { id } = request.params;
      const { to } = request.body;
      const ticket = await prisma.ticket.findUnique({
        where: { id },
        select: { status: true },
      });
      if (ticket === null) {
        throw new AppError("NOT_FOUND", `Ticket ${id} not found`);
      }

      const roles = allowedRoles(ticket.status, to);
      if (roles === null) {
        throw new AppError(
          "VALIDATION",
          `Illegal transition ${ticket.status} → ${to}`,
          { from: ticket.status, to },
          422,
        );
      }
      const role = getAuthUser(request).role;
      if (!roles.includes(role)) {
        throw new AppError(
          "FORBIDDEN",
          `Role ${role} cannot move ${ticket.status} → ${to}`,
        );
      }
      if (to === "SENT") {
        const pending = await prisma.aiSuggestion.count({
          where: { ticketId: id, status: "PENDING" },
        });
        if (pending > 0) {
          throw new AppError(
            "PENDING_SUGGESTIONS",
            `${pending} unresolved AI suggestion(s) block sending`,
            { pending },
          );
        }
      }

      const actorId = getAuthUser(request).id;
      const updated = await prisma.$transaction(async (tx) => {
        const updated = await tx.ticket.update({ where: { id }, data: { status: to } });
        await recordActivity(tx, {
          ticketId: id,
          actorId,
          action: "STATUS_CHANGED",
          detail: `status ${ticket.status}→${to}`,
        });
        return updated;
      });
      return toTicketDto(updated);
    },
  );
}
