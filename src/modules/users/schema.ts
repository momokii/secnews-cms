import { z } from "zod/v4";
import { RoleEnum, UserPublicSchema, emailField, passwordField } from "../auth/schema.js";
import { paginated, pageQuery } from "../../common/pagination.js";

/** User CRUD surface (§4 RBAC): GET/PATCH/reset-password/DELETE stay ADMIN-only;
 * POST also admits ANALYST, but only for role ANALYST (omitted role → ANALYST,
 * any other explicit role → 403). See docs/API_CONTRACT.md §2. */

// POST /users
export const CreateUserBodySchema = z.object({
  name: z.string().min(1),
  email: emailField,
  password: passwordField,
  role: RoleEnum.default("ANALYST"),
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
export type UpdateUserBody = z.infer<typeof UpdateUserBodySchema>;

// POST /users/:id/reset-password (admin-triggered, distinct from self-service)
export const ResetPasswordBodySchema = z.object({
  newPassword: passwordField,
});

// GET /users
export const ListUsersQuerySchema = pageQuery.extend({
  q: z.string().min(1).optional(),
  role: RoleEnum.optional(),
});
export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;
export const ListUsersResponseSchema = paginated(UserPublicSchema);
