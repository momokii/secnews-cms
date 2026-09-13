import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { Role } from "../../generated/prisma/enums.js";
import { AppError } from "../../common/errors.js";
import { createUser } from "../users/service.js";
import { BootstrapBodySchema, BootstrapResponseSchema } from "./schema.js";

/** First-run setup: mints the very first ADMIN. Illegal once any user exists
 * (S4 double-bootstrap regression → 409 CONFLICT, BST-01). */
export default async function bootstrapRoutes(app: FastifyInstance): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();

  f.post("/", {
    schema: {
      body: BootstrapBodySchema,
      response: { 201: BootstrapResponseSchema },
    },
  }, async (request, reply) => {
    const userCount = await app.prisma.user.count();
    if (userCount > 0) {
      throw new AppError("CONFLICT", "Bootstrap already completed");
    }
    const user = await createUser({ ...request.body, role: Role.ADMIN });
    const token = app.jwt.sign({ sub: user.id, email: user.email });
    void reply.code(201);
    return { user, token };
  });
}
