import { z } from "zod/v4";
import { RoleEnum, UserPublicSchema, emailField, passwordField } from "../auth/schema.js";
import { paginated, pageQuery } from "../../common/pagination.js";

/** ADMIN-only surface (confirmed RBAC: only ADMIN creates users; an ANALYST
 * token hitting any mutation here gets 403 — covers the S4 regression). */

// POST /users
export const CreateUserBodySchema = z.object({
  name: z.string().min(1),
  email: emailField,
  password: passwordField,
  role: RoleEnum,
});
export type CreateUserBody = z.infer<typeof CreateUserBodySchema>;

// PATCH /users/:id — role change, active toggle, profile fix-ups
export const UpdateUserBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    email: emailField.optional(),
    role: RoleEnum.optional(),
    active: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "At least one field required" });

// POST /users/:id/reset-password (admin-triggered, distinct from self-service)
export const ResetPasswordBodySchema = z.object({
  newPassword: passwordField,
});

// GET /users
export const ListUsersQuerySchema = pageQuery.extend({
  q: z.string().min(1).optional(),
  role: RoleEnum.optional(),
});
export const ListUsersResponseSchema = paginated(UserPublicSchema);
