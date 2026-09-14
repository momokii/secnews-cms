import bcrypt from "bcryptjs";
import type { Prisma } from "../../generated/prisma/client.js";
import type { Role } from "../../generated/prisma/enums.js";
import { AppError } from "../../common/errors.js";
import { prisma } from "../../lib/db.js";
import type { Paginated } from "../../common/pagination.js";
import type { UserPublic } from "../auth/schema.js";
import { toPublicUser } from "../auth/user-public.js";
import type { CreateUserBody, ListUsersQuery, UpdateUserBody } from "./schema.js";

export const BCRYPT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

function prismaErrorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) {
    return undefined;
  }
  const code: unknown = err["code"];
  return typeof code === "string" ? code : undefined;
}

function conflictOrNotFound(err: unknown, action: string): never {
  if (prismaErrorCode(err) === "P2002") {
    throw new AppError("CONFLICT", "Email already registered");
  }
  throw new AppError("NOT_FOUND", `Cannot ${action}: unknown user id`);
}

export async function createUser(input: CreateUserBody): Promise<UserPublic> {
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
      },
    });
    return toPublicUser(user);
  } catch (err) {
    conflictOrNotFound(err, "create user");
  }
}

export async function listUsers(query: ListUsersQuery): Promise<Paginated<UserPublic>> {
  const where: Prisma.UserWhereInput = {};
  if (query.q !== undefined) {
    where.OR = [
      { email: { contains: query.q, mode: "insensitive" } },
      { name: { contains: query.q, mode: "insensitive" } },
    ];
  }
  if (query.role !== undefined) {
    where.role = query.role;
  }
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.user.count({ where }),
  ]);
  return {
    items: rows.map(toPublicUser),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** Null when the id does not exist — the PATCH self-role lockout treats a
 * missing target as NOT_FOUND territory (updateUser), not FORBIDDEN. */
export async function getUserRole(id: string): Promise<Role | null> {
  const user = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  return user?.role ?? null;
}

export async function updateUser(id: string, input: UpdateUserBody): Promise<UserPublic> {
  const data: { name?: string; email?: string; role?: Role; isActive?: boolean } = {};
  if (input.name !== undefined) {
    data.name = input.name;
  }
  if (input.email !== undefined) {
    data.email = input.email;
  }
  if (input.role !== undefined) {
    data.role = input.role;
  }
  if (input.active !== undefined) {
    data.isActive = input.active;
  }
  try {
    const user = await prisma.user.update({ where: { id }, data });
    return toPublicUser(user);
  } catch (err) {
    conflictOrNotFound(err, "update user");
  }
}

export async function resetUserPassword(id: string, newPassword: string): Promise<void> {
  try {
    await prisma.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
  } catch (err) {
    conflictOrNotFound(err, "reset password for");
  }
}

export async function deleteUser(id: string): Promise<void> {
  try {
    await prisma.user.delete({ where: { id } });
  } catch (err) {
    conflictOrNotFound(err, "delete");
  }
}
