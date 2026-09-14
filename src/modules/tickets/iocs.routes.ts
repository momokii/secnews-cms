import type { FastifyInstance } from "fastify";
import { Prisma } from "../../generated/prisma/client.js";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { AppError } from "../../common/errors.js";
import { prisma } from "../../lib/db.js";
import { recordActivity } from "./activity.js";
import { toIocDto } from "./mappers.js";
import {
  CreateIocBodySchema,
  IocIdParamSchema,
  IocSchema,
  UpdateIocBodySchema,
  UuidIdParamSchema,
} from "./schema.js";

/** Routes 29–31 — POST/PATCH/DELETE under /tickets/:id/iocs (WORK).
 * Uniqueness is (ticketId, type, value); duplicates answer 409 CONFLICT. */
export default async function ticketIocRoutes(app: FastifyInstance): Promise<void> {
  const routeApp = app.withTypeProvider<ZodTypeProvider>();

  routeApp.post(
    "/:id/iocs",
    {
      schema: {
        params: UuidIdParamSchema,
        body: CreateIocBodySchema,
        response: { 201: IocSchema },
      },
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
    },
    async (request, reply) => {
      const { id } = request.params;
      const ticket = await prisma.ticket.findUnique({ where: { id }, select: { id: true } });
      if (ticket === null) {
        throw new AppError("NOT_FOUND", `Ticket ${id} not found`);
      }
      const data: Prisma.IocUncheckedCreateInput = {
        ticketId: id,
        type: request.body.type,
        value: request.body.value,
        includeInBulletin: request.body.includeInBulletin,
        createdById: request.user.sub,
      };
      if (request.body.context !== undefined) {
        data.context = request.body.context;
      }
      if (request.body.origin !== undefined) {
        data.origin = request.body.origin;
      }
      const actorId = request.user.sub;
      const created = await prisma
        .$transaction(async (tx) => {
          const created = await tx.ioc.create({ data });
          await recordActivity(tx, {
            ticketId: id,
            actorId,
            action: "IOC_ADDED",
            detail: `${created.type} ${created.value}`,
          });
          return created;
        })
        .catch((err: unknown) => {
          throw duplicateAsConflict(err, id);
        });
      return reply.code(201).send(toIocDto(created));
    },
  );

  routeApp.patch(
    "/:id/iocs/:iocId",
    {
      schema: {
        params: IocIdParamSchema,
        body: UpdateIocBodySchema,
        response: { 200: IocSchema },
      },
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
    },
    async (request) => {
      const { id, iocId } = request.params;
      const existing = await prisma.ioc.findFirst({
        where: { id: iocId, ticketId: id },
        select: { id: true },
      });
      if (existing === null) {
        throw new AppError("NOT_FOUND", `IOC ${iocId} not found on ticket ${id}`);
      }
      const data: Prisma.IocUncheckedUpdateInput = {};
      if (request.body.value !== undefined) {
        data.value = request.body.value;
      }
      if (request.body.context !== undefined) {
        data.context = request.body.context;
      }
      if (request.body.origin !== undefined) {
        data.origin = request.body.origin;
      }
      if (request.body.includeInBulletin !== undefined) {
        data.includeInBulletin = request.body.includeInBulletin;
      }
      const actorId = request.user.sub;
      const updated = await prisma
        .$transaction(async (tx) => {
          const updated = await tx.ioc.update({ where: { id: iocId }, data });
          await recordActivity(tx, {
            ticketId: id,
            actorId,
            action: "IOC_UPDATED",
            detail: `${updated.type} ${updated.value}`,
          });
          return updated;
        })
        .catch((err: unknown) => {
          throw duplicateAsConflict(err, id);
        });
      return toIocDto(updated);
    },
  );

  routeApp.delete(
    "/:id/iocs/:iocId",
    {
      schema: { params: IocIdParamSchema },
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
    },
    async (request, reply) => {
      const { id, iocId } = request.params;
      const existing = await prisma.ioc.findFirst({
        where: { id: iocId, ticketId: id },
        select: { type: true, value: true },
      });
      if (existing === null) {
        throw new AppError("NOT_FOUND", `IOC ${iocId} not found on ticket ${id}`);
      }
      const removed = await prisma.$transaction(async (tx) => {
        const removed = await tx.ioc.deleteMany({ where: { id: iocId, ticketId: id } });
        await recordActivity(tx, {
          ticketId: id,
          actorId: request.user.sub,
          action: "IOC_REMOVED",
          detail: `${existing.type} ${existing.value}`,
        });
        return removed;
      });
      if (removed.count === 0) {
        throw new AppError("NOT_FOUND", `IOC ${iocId} not found on ticket ${id}`);
      }
      return reply.code(204).send();
    },
  );
}

function duplicateAsConflict(err: unknown, ticketId: string): unknown {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002"
  ) {
    return new AppError("CONFLICT", `IOC already exists on ticket ${ticketId}`);
  }
  return err;
}
