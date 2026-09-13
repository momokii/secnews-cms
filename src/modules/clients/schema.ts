import { z } from "zod/v4";
import { paginated, pageQuery } from "../../common/pagination.js";

/** Clients = receiving organizations. Read: any authenticated role (needed to
 * render send-target context); mutations: ADMIN/EDITOR. Ids mirror the Prisma
 * uuid string PKs (B1 authoritative), same as tickets/feeds/auth modules. */

export const ClientSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  active: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Client = z.infer<typeof ClientSchema>;

// POST /clients
export const CreateClientBodySchema = z.object({
  name: z.string().min(1),
});

// PATCH /clients/:id
export const UpdateClientBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    active: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "At least one field required" });

// GET /clients
export const ListClientsQuerySchema = pageQuery.extend({
  q: z.string().min(1).optional(),
});
export const ListClientsResponseSchema = paginated(ClientSchema);

export const UuidIdParamSchema = z.object({ id: z.uuid() });
export const ClientIdParamSchema = z.object({ clientId: z.uuid() });
