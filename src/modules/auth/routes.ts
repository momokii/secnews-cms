import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { AppError } from "../../common/errors.js";
import { getAuthUser } from "../../plugins/auth.js";
import { hashPassword } from "../users/service.js";
import { toPublicUser } from "./user-public.js";
import {
  AuthStatusResponseSchema,
  ChangePasswordBodySchema,
  LoginBodySchema,
  LoginResponseSchema,
  UserPublicSchema,
} from "./schema.js";

/** Same-shape hash used when the email is unknown so that found and
 * not-found logins cost the same bcrypt work (timing-attack equalization). */
const DUMMY_HASH = bcrypt.hashSync("timing-equalizer-not-a-credential", 10);

/** Brute-force gate per docs/API_CONTRACT.md: 5 attempts / minute / IP. */
const LOGIN_RATE_LIMIT = { max: 5, timeWindow: "1 minute" } as const;

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();

  f.post("/login", {
    schema: {
      body: LoginBodySchema,
      response: { 200: LoginResponseSchema },
    },
    config: { rateLimit: LOGIN_RATE_LIMIT },
  }, async (request) => {
    const { email, password } = request.body;
    const user = await app.prisma.user.findUnique({ where: { email } });
    const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (user === null || !user.isActive || !passwordMatches) {
      throw new AppError("UNAUTHORIZED", "Invalid email or password");
    }
    const token = app.jwt.sign({ sub: user.id, email: user.email });
    return { token, user: toPublicUser(user) };
  });

  f.get("/me", {
    onRequest: [app.authenticate],
    schema: { response: { 200: UserPublicSchema } },
  }, async (request) => toPublicUser(getAuthUser(request)));

  f.post("/change-password", {
    onRequest: [app.authenticate],
    schema: { body: ChangePasswordBodySchema },
  }, async (request, reply) => {
    const { currentPassword, newPassword } = request.body;
    const userId = getAuthUser(request).id;
    const user = await app.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    const currentMatches = await bcrypt.compare(currentPassword, user?.passwordHash ?? DUMMY_HASH);
    if (!currentMatches) {
      throw new AppError("UNAUTHORIZED", "Current password is incorrect");
    }
    await app.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    return reply.code(204).send();
  });

  f.get("/status", {
    schema: { response: { 200: AuthStatusResponseSchema } },
  }, async () => {
    return { needsBootstrap: (await app.prisma.user.count()) === 0 };
  });
}
