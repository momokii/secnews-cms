import type { User } from "../../generated/prisma/client.js";
import type { UserPublic } from "./schema.js";

export type UserRowProjection = Pick<
  User,
  "id" | "name" | "email" | "role" | "isActive" | "createdAt" | "updatedAt"
>;

/** DB row (or authenticated projection) → API public shape. Password material
 * never crosses; the public shape carries `active` (not the DB's `isActive`)
 * and ISO timestamps. */
export function toPublicUser(user: UserRowProjection): UserPublic {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastLoginAt: null,
  };
}
