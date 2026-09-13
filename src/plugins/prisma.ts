import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import type { PrismaClient } from "../generated/prisma/client.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

/** Server-level decoration: one shared PrismaClient on the instance, never
 * per-request (decorateRequest with reference types shares state). */
export default fp(async function prismaPlugin(app: FastifyInstance): Promise<void> {
  app.decorate("prisma", prisma);
});
