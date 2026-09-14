import jwt from "@fastify/jwt";
import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Role } from "../generated/prisma/enums.js";
import { AppError } from "../common/errors.js";

export type JwtPayload = { sub: string; email: string };

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: typeof authenticate;
    requireRole: typeof requireRole;
  }
  interface FastifyRequest {
    /** DB-backed identity; null until the authenticate hook succeeds. */
    authUser: AuthenticatedUser | null;
  }
}

async function authenticate(request: FastifyRequest): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    throw new AppError("UNAUTHORIZED", "Missing or invalid token");
  }
  const { sub } = request.user;
  const user = await request.server.prisma.user.findUnique({
    where: { id: sub },
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true, updatedAt: true },
  });
  if (user === null || !user.isActive) {
    throw new AppError("UNAUTHORIZED", "Missing or invalid token");
  }
  request.authUser = user;
}

function requireRole(...roles: Role[]) {
  return async function roleGate(request: FastifyRequest): Promise<void> {
    await authenticate(request);
    if (request.authUser === null || !roles.includes(request.authUser.role)) {
      throw new AppError("FORBIDDEN", "Insufficient role for this operation");
    }
  };
}

export function getAuthUser(request: FastifyRequest): AuthenticatedUser {
  if (request.authUser === null) {
    throw new AppError("UNAUTHORIZED", "Missing or invalid token");
  }
  return request.authUser;
}

export default fp(async function authPlugin(app: FastifyInstance): Promise<void> {
  const secret = process.env["JWT_SECRET"];
  if (secret === undefined || secret === "") {
    throw new Error("Missing required environment variable: JWT_SECRET");
  }
  app.decorateRequest("authUser", null);
  app.decorate("authenticate", authenticate);
  app.decorate("requireRole", requireRole);
  await app.register(jwt, {
    secret,
    sign: { expiresIn: process.env["JWT_EXPIRES_IN"] || "15m" },
  });
});
