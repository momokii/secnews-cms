import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { AppError } from "../../common/errors.js";
import { idParam } from "../../common/pagination.js";
import { getAuthUser } from "../../plugins/auth.js";
import { UserPublicSchema } from "../auth/schema.js";
import * as service from "./service.js";
import {
  CreateUserBodySchema,
  ListUsersQuerySchema,
  ListUsersResponseSchema,
  ResetPasswordBodySchema,
  UpdateUserBodySchema,
} from "./schema.js";

/** User CRUD (§4 RBAC): every route except POST gates through
 * requireRole("ADMIN"); POST also admits ANALYST under the forced-ANALYST
 * rule. Each gate runs per-route onRequest, no global hook. */
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
    onRequest: [app.requireRole("ADMIN", "ANALYST")],
    schema: {
      body: CreateUserBodySchema,
      response: { 201: UserPublicSchema },
    },
  }, async (request, reply) => {
    const caller = getAuthUser(request);
    if (caller.role !== "ADMIN" && request.body.role !== "ANALYST") {
      throw new AppError("FORBIDDEN", "ANALYST may only create ANALYST users");
    }
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
  }, async (request) => {
    const caller = getAuthUser(request);
    if (request.params.id === caller.id && request.body.role !== undefined) {
      const currentRole = await service.getUserRole(request.params.id);
      if (currentRole !== null && currentRole !== request.body.role) {
        throw new AppError("FORBIDDEN", "cannot change your own role");
      }
    }
    return service.updateUser(request.params.id, request.body);
  });

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
