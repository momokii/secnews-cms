import AutoLoad from "@fastify/autoload";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import Fastify, { type FastifyInstance } from "fastify";
import { errorHandler } from "./common/error-handler.js";
import { join } from "node:path";
import authPlugin from "./plugins/auth.js";
import prismaPlugin from "./plugins/prisma.js";

/**
 * Build the fully-configured Fastify application without binding a port.
 * Tests use fastify.inject against the returned instance; src/server.ts owns listen().
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);

  await app.register(helmet);
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  await app.register(cors, { origin: parseCorsOrigins(process.env["CORS_ORIGIN"]) });
  await app.register(prismaPlugin);
  await app.register(authPlugin);

  await app.register(AutoLoad, {
    dir: join(import.meta.dirname, "modules"),
    matchFilter: (path: string) => path.endsWith("routes.ts"),
  });

  return app;
}

/** Empty/unset CORS_ORIGIN means "no cross-origin browser access" (secure default). */
function parseCorsOrigins(raw: string | undefined): string[] | boolean {
  if (raw === undefined || raw.trim() === "") {
    return false;
  }
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
