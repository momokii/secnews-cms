import type { Channel, DeliveryAudit } from "../../generated/prisma/client.js";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { AppError } from "../../common/errors.js";
import { pageQuery } from "../../common/pagination.js";
import { DEFAULT_TEMPLATE, renderBulletin } from "../bulletin/render.js";
import { assertNoPendingSuggestions } from "../../lib/guards/pending.js";
import { prisma } from "../../lib/db.js";
import { getAuthUser } from "../../plugins/auth.js";
import { recordActivity } from "../tickets/activity.js";
import { toTicketDto } from "../tickets/mappers.js";
import { UuidIdParamSchema } from "../tickets/schema.js";
import { channelTargetSummary, deliverToChannel } from "./dispatch.js";
import {
  ListDeliveryAuditResponseSchema,
  SendBodySchema,
  SendResponseSchema,
  type DeliveryAudit as DeliveryAuditWire,
} from "./schema.js";

/**
 * Surface 7 — delivery (#47 POST /tickets/:id/send, #48 audit trail). Guards
 * in contract order: ticket exists (404) → READY (422 VALIDATION, SND-02) →
 * zero PENDING suggestions (409 PENDING_SUGGESTIONS, S2) → target resolution
 * (`all` = active-only, explicit inactive id → 409 INACTIVE_TARGET, SND-01).
 * Every attempted target gets one DeliveryAudit row with the exact rendered
 * payload, the actor and the timestamp (AUD-01); ≥1 target moves the ticket
 * to SENT. prefixOverride serves the contract path /tickets/:id/send.
 */
export const prefixOverride = "/tickets";

type TargetChannel = Channel & { client: { name: string } };

type AuditRow = DeliveryAudit & { channel: TargetChannel };

function toDeliveryAuditWire(row: AuditRow): DeliveryAuditWire {
  return {
    id: row.id,
    ticketId: row.ticketId,
    channelId: row.channelId,
    channelType: row.channel.type,
    clientId: row.channel.clientId,
    clientName: row.channel.client.name,
    target: channelTargetSummary(row.channel),
    payload: row.payload,
    status: row.status,
    errorDetail: row.error,
    sentById: row.sentById,
    sentAt: row.createdAt.toISOString(),
  };
}

async function loadTargets(
  channelIds: string[] | undefined,
  all: boolean | undefined,
): Promise<TargetChannel[]> {
  if (all === true) {
    return prisma.channel.findMany({
      where: { isActive: true },
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
  }
  const ids = [...new Set(channelIds)];
  const found = await prisma.channel.findMany({
    where: { id: { in: ids } },
    include: { client: { select: { name: true } } },
  });
  if (found.length < ids.length) {
    throw new AppError("NOT_FOUND", "Unknown channel id in channelIds", {
      channelIds: ids.filter((id) => !found.some((channel) => channel.id === id)),
    });
  }
  const inactive = found.filter((channel) => !channel.isActive);
  if (inactive.length > 0) {
    throw new AppError(
      "INACTIVE_TARGET",
      "Explicit send targets must be active channels",
      { channelIds: inactive.map((channel) => channel.id) },
    );
  }
  return found;
}

export default async function deliveryRoutes(app: FastifyInstance): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();

  f.post(
    "/:id/send",
    {
      schema: {
        params: UuidIdParamSchema,
        body: SendBodySchema,
        response: { 200: SendResponseSchema },
      },
      onRequest: [app.requireRole("ADMIN", "EDITOR")],
    },
    async (request) => {
      const { id } = request.params;
      const actor = getAuthUser(request);
      const ticket = await prisma.ticket.findUnique({
        where: { id },
        include: { iocs: true },
      });
      if (ticket === null) {
        throw new AppError("NOT_FOUND", `Ticket ${id} not found`);
      }
      if (ticket.status !== "READY" && ticket.status !== "SENT") {
        throw new AppError(
          "VALIDATION",
          `Ticket status is ${ticket.status} — only READY or SENT tickets can be sent`,
          { status: ticket.status },
          422,
        );
      }
      await assertNoPendingSuggestions(prisma, id);

      const targets = await loadTargets(request.body.channelIds, request.body.all);
      if (targets.length === 0) {
        throw new AppError(
          "VALIDATION",
          "No active target channel resolved — activate a channel first",
          undefined,
          422,
        );
      }

      const template = await prisma.bulletinTemplate.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
      });
      const payload = renderBulletin(template?.body ?? DEFAULT_TEMPLATE, {
        title: ticket.title,
        overview: ticket.overview,
        description: ticket.description,
        recommendations: ticket.recommendations,
        references: ticket.references,
        iocs: ticket.iocs,
      });

      const audit: DeliveryAuditWire[] = [];
      for (const channel of targets) {
        let status: "SENT" | "FAILED";
        let error: string | null = null;
        try {
          await deliverToChannel(channel, ticket.title, payload);
          status = "SENT";
        } catch (err) {
          status = "FAILED";
          error = (err as Error).message;
        }
        const row = await prisma.deliveryAudit.create({
          data: { ticketId: id, channelId: channel.id, status, error, payload, sentById: actor.id },
          include: { channel: { include: { client: { select: { name: true } } } } },
        });
        await recordActivity(prisma, {
          ticketId: id,
          actorId: actor.id,
          action: "SENT",
          detail: `${channel.type} → ${row.channel.client.name}: ${status}`,
        });
        audit.push(toDeliveryAuditWire(row));
      }

      const sent = await prisma.ticket.update({ where: { id }, data: { status: "SENT" } });
      await recordActivity(prisma, {
        ticketId: id,
        actorId: actor.id,
        action: "STATUS_CHANGED",
        detail: "status READY→SENT",
      });
      return { ticket: toTicketDto(sent), audit };
    },
  );

  f.get(
    "/:id/delivery-audit",
    {
      schema: {
        params: UuidIdParamSchema,
        querystring: pageQuery,
        response: { 200: ListDeliveryAuditResponseSchema },
      },
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
    },
    async (request) => {
      const { id } = request.params;
      const { page, pageSize } = request.query;
      const [rows, total] = await prisma.$transaction([
        prisma.deliveryAudit.findMany({
          where: { ticketId: id },
          include: { channel: { include: { client: { select: { name: true } } } } },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.deliveryAudit.count({ where: { ticketId: id } }),
      ]);
      return { items: rows.map(toDeliveryAuditWire), total, page, pageSize };
    },
  );
}
