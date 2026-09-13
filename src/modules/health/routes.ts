import type { FastifyInstance } from "fastify";

// Autoload prefixes the module directory, so "/" here resolves to GET /health.
export default async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async () => ({ status: "ok" }));
}
