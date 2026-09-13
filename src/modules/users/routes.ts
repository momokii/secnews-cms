import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { idParam } from "../../common/pagination.js";
import { UserPublicSchema } from "../auth/schema.js";
import * as service from "./service.js";
import {
  CreateUserBodySchema,
  ListUsersQuerySchema,
  ListUsersResponseSchema,
  ResetPasswordBodySchema,
  UpdateUserBodySchema,
} from "./schema.js";

/** ADMIN-only user CRUD. Every route gates through requireRole("ADMIN"),
 * which first authenticates (per-route onRequest, no global hook). */
export default async function userRoutes(app: FastifyInstance): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();

  f.get("/", {
    onRequest: [app.requireRole("ADMIN")],
    schema: {
      querystring: ListUsersQuerySchema,
      response: { 200: ListUsersResponseSchema },
    },
  }, async (request) => service.listUsers(request.query));

  f.post("/", {
    onRequest: [app.requireRole("ADMIN")],
    schema: {
      body: CreateUserBodySchema,
      response: { 201: UserPublicSchema },
    },
  }, async (request, reply) => {
    const user = await service.createUser(request.body);
    void reply.code(201);
    return user;
  });

  f.patch("/:id", {
    onRequest: [app.requireRole("ADMIN")],
    schema: {
      params: idParam,
      body: UpdateUserBodySchema,
      response: { 200: UserPublicSchema },
    },
  }, async (request) => service.updateUser(request.params.id, request.body));

  f.post("/:id/reset-password", {
    onRequest: [app.requireRole("ADMIN")],
    schema: {
      params: idParam,
      body: ResetPasswordBodySchema,
    },
  }, async (request, reply) => {
    await service.resetUserPassword(request.params.id, request.body.newPassword);
    return reply.code(204).send();
  });

  f.delete("/:id", {
    onRequest: [app.requireRole("ADMIN")],
    schema: { params: idParam },
  }, async (request, reply) => {
    await service.deleteUser(request.params.id);
    return reply.code(204).send();
  });
}
