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
      const { q, status, origin, findingType, page, pageSize, from, to } = request.query;
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
      if (from !== undefined || to !== undefined) {
        where.createdAt = {
          ...(from === undefined ? {} : { gte: dateBound(from, false) }),
          ...(to === undefined ? {} : { lte: dateBound(to, true) }),
        };
      }
      const [rows, total] = await prisma.$transaction([
        prisma.ticket.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { takenBy: { select: { name: true } } },
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
          takenBy: { select: { name: true } },
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
      // Quick capture: origin MANUAL; summary defaults to an empty working
      // summary; type-specific fields default to their Prisma empties. The
      // creator is recorded as takenBy (route 19 take semantics), so lists
      // and the web UI show an owner for manually spawned tickets too.
      const actorId = request.user.sub;
      const base = {
        title: body.title,
        origin: "MANUAL" as const,
        summary: body.summary ?? "",
        takenById: actorId,
      };
      const data =
        body.findingType === "VULNERABILITY_CVE"
          ? {
              ...base,
              findingType: body.findingType,
              cveIds: body.cveIds ?? [],
              affectedProduct: body.affectedProduct ?? null,
              affectedVersions: body.affectedVersions ?? null,
              ...(body.mitigation !== undefined ? { mitigation: body.mitigation } : {}),
            }
          : body.findingType === "THREAT_CAMPAIGN"
            ? { ...base, findingType: body.findingType, threatName: body.threatName ?? null }
            : { ...base, findingType: body.findingType };
      const { created } = await prisma.$transaction(async (tx) => {
        const created = await tx.ticket.create({
          data,
          include: { takenBy: { select: { name: true } } },
        });
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

function dateBound(value: string, endOfDay: boolean): Date {
  return value.length === 10
    ? new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
    : new Date(value);
}
