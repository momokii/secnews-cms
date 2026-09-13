import { z } from "zod/v4";
import type { FastifyReply } from "fastify";

/**
 * The single error envelope for every non-2xx response.
 * Shape (machine truth): { error: { code, message, details? } }
 */

export const ERROR_CODES = [
  "VALIDATION",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "PENDING_SUGGESTIONS",
  "INACTIVE_TARGET",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Canonical HTTP status per code. VALIDATION also covers semantic-rule
 * rejections served with HTTP 422 (illegal ticket transition, send on a
 * non-READY ticket, preview with missing final fields) — the code stays
 * VALIDATION, only the status differs. See docs/API_CONTRACT.md §Errors. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PENDING_SUGGESTIONS: 409,
  INACTIVE_TARGET: 409,
  INTERNAL: 500,
};

/** Typed application error: thrown by routes/services, rendered as the
 * envelope by the app-wide error handler. `statusOverride` serves the
 * documented semantic rejections that keep code VALIDATION but answer 422
 * (illegal transition, send/preview on non-READY). */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown, statusOverride?: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusOverride ?? ERROR_STATUS[code];
    this.details = details;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    /** Machine-readable specifics: zod issues, offending ids, pending counts. */
    details: z.unknown().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

/** Reply with the canonical error envelope, status derived from the code. */
export function sendError(
  reply: FastifyReply,
  code: ErrorCode,
  message: string,
  details?: unknown,
): FastifyReply {
  return reply.code(ERROR_STATUS[code]).send({ error: { code, message, details } });
}
