import { z } from "zod/v4";
import { Role as PrismaRole } from "../../generated/prisma/enums.js";

/**
 * Prisma-backed enums: zod enums are derived from the generated client so the
 * contract can never drift from B1's schema. Requires `npx prisma generate`
 * on a fresh clone; canonical string values are mirrored in docs/STATES.md.
 */
export const RoleEnum = z.enum(PrismaRole);
export type Role = z.infer<typeof RoleEnum>;

export const emailField = z.email();
export const passwordField = z.string().min(8).max(72); // 72 = bcrypt input limit

/** User as returned by the API — never includes password material. */
export const UserPublicSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  email: emailField,
  role: RoleEnum,
  active: z.boolean(),
  createdAt: z.iso.datetime(),
  lastLoginAt: z.iso.datetime().nullable(),
});
export type UserPublic = z.infer<typeof UserPublicSchema>;

// POST /auth/login
export const LoginBodySchema = z.object({
  email: emailField,
  password: z.string().min(1),
});
export const LoginResponseSchema = z.object({
  token: z.string(),
  user: UserPublicSchema,
});

// GET /auth/status — first-run bootstrap gate for the frontend
export const AuthStatusResponseSchema = z.object({
  needsBootstrap: z.boolean(),
});

// POST /auth/change-password (self-service)
export const ChangePasswordBodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordField,
});
