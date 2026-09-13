import { z } from "zod/v4";

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
};

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    /** Machine-readable specifics: zod issues, offending ids, pending counts. */
    details: z.unknown().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
