import { Prisma } from "../../generated/prisma/client.js";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { sendError } from "../../common/errors.js";
import { prisma } from "../../lib/db.js";
import { decodeChannelTarget, encodeChannelTarget, toChannelWire } from "../channels/map.js";
import { ChannelListSchema, ChannelSchema, CreateChannelBodySchema } from "../channels/schema.js";
import { loadStoredConfig } from "../integrations/config-store.js";
import { probeSmtp, probeTelegram, probeWaha, type ProbeOutcome } from "../integrations/probes.js";
import { TestConnectionResponseSchema, type SmtpStoredConfig, type WahaStoredConfig } from "../integrations/schema.js";
import { toClientWire } from "./map.js";
import {
  ChannelTestParamSchema,
  ClientIdParamSchema,
  CreateClientBodySchema,
  ClientSchema,
  ListClientsQuerySchema,
  ListClientsResponseSchema,
  UuidIdParamSchema,
  UpdateClientBodySchema,
} from "./schema.js";

/** Surface 6 — clients (#40–43), channel creation (#44) and the persisted
 * channel list (#44b). Read: ANY role (send-dialog context); mutations: MGR.
 * Deleting a client that still owns channels is a FK violation → 409 CONFLICT. */

function prismaErrorToReply(reply: Parameters<typeof sendError>[0], err: unknown) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") return sendError(reply, "NOT_FOUND", "Unknown resource id");
    if (err.code === "P2003") return sendError(reply, "CONFLICT", "Resource is still referenced");
  }
  throw err;
}

const testBody = z.object({}).strict();

// Autoload prefixes the module directory, so "/" here resolves to /clients.
export default async function clientRoutes(app: FastifyInstance): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();
  const mgr = [app.requireRole("ADMIN", "EDITOR")];

  f.get(
    "/",
    {
      schema: {
        querystring: ListClientsQuerySchema,
        response: { 200: ListClientsResponseSchema },
      },
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
    },
    async (request) => {
      const { q, page, pageSize } = request.query;
      const where: Prisma.ClientWhereInput = {};
      if (q !== undefined) {
        where.name = { contains: q, mode: "insensitive" };
      }
      const [rows, total] = await prisma.$transaction([
        prisma.client.findMany({
          where,
          orderBy: { createdAt: "asc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.client.count({ where }),
      ]);
      return { items: rows.map(toClientWire), total, page, pageSize };
    },
  );

  f.post(
    "/",
    { schema: { body: CreateClientBodySchema, response: { 201: ClientSchema } }, onRequest: mgr },
    async (request, reply) => {
      const client = await prisma.client.create({ data: { name: request.body.name } });
      return reply.code(201).send(toClientWire(client));
    },
  );

  f.patch(
    "/:id",
    {
      schema: {
        params: UuidIdParamSchema,
        body: UpdateClientBodySchema,
        response: { 200: ClientSchema },
      },
      onRequest: mgr,
    },
    async (request, reply) => {
      const { name, active } = request.body;
      const data = {
        ...(name === undefined ? {} : { name }),
        ...(active === undefined ? {} : { isActive: active }),
      };
      try {
        const client = await prisma.client.update({ where: { id: request.params.id }, data });
        return toClientWire(client);
      } catch (err) {
        return prismaErrorToReply(reply, err);
      }
    },
  );

  f.delete(
    "/:id",
    { schema: { params: UuidIdParamSchema }, onRequest: mgr },
    async (request, reply) => {
      try {
        await prisma.client.delete({ where: { id: request.params.id } });
        return reply.code(204).send();
      } catch (err) {
        return prismaErrorToReply(reply, err);
      }
    },
  );

  f.post(
    "/:clientId/channels",
    {
      schema: {
        params: ClientIdParamSchema,
        body: CreateChannelBodySchema,
        response: { 201: ChannelSchema },
      },
      onRequest: mgr,
    },
    async (request, reply) => {
      try {
        const channel = await prisma.channel.create({
          data: {
            clientId: request.params.clientId,
            type: request.body.type,
            target: encodeChannelTarget(request.body),
          },
        });
        return reply.code(201).send(toChannelWire(channel));
      } catch (err) {
        return prismaErrorToReply(reply, err);
      }
    },
  );

  f.get(
    "/:clientId/channels",
    {
      schema: {
        params: ClientIdParamSchema,
        response: { 200: ChannelListSchema },
      },
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
    },
    async (request) => {
      const rows = await prisma.channel.findMany({
        where: { clientId: request.params.clientId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toChannelWire);
    },
  );

  // POST /clients/:clientId/channels/:channelId/test (#46b) — probe without
  // sending: TELEGRAM validates the stored bot token via getMe, WHATSAPP
  // probes the stored WAHA gateway session, EMAIL verifies the stored SMTP
  // relay. Upstream failures are ok:false results, not HTTP errors.
  f.post(
    "/:clientId/channels/:channelId/test",
    {
      schema: {
        params: ChannelTestParamSchema,
        body: testBody,
        response: { 200: TestConnectionResponseSchema },
      },
      onRequest: mgr,
    },
    async (request, reply) => {
      const startedAt = Date.now();
      const channel = await prisma.channel.findFirst({
        where: { id: request.params.channelId, clientId: request.params.clientId },
      });
      if (channel === null) {
        return sendError(reply, "NOT_FOUND", "Unknown resource id");
      }
      const decoded = decodeChannelTarget(channel);
      let outcome: ProbeOutcome;
      switch (decoded.type) {
        case "TELEGRAM": {
          outcome = await probeTelegram(decoded.token);
          break;
        }
        case "WHATSAPP": {
          const waha = await loadStoredConfig<WahaStoredConfig>("WAHA");
          outcome = waha === null ? { ok: false, detail: "no WAHA configuration stored" } : await probeWaha(waha);
          break;
        }
        case "EMAIL": {
          const smtp = await loadStoredConfig<SmtpStoredConfig>("SMTP");
          outcome = smtp === null ? { ok: false, detail: "no SMTP configuration stored" } : await probeSmtp(smtp);
          break;
        }
      }
      return { ...outcome, latencyMs: Date.now() - startedAt };
    },
  );
}
