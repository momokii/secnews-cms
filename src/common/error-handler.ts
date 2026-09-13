import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { isAppError } from "./errors.js";

/** App-wide error funnel: renders every non-2xx through the documented
 * envelope ({ error: { code, message, details } }). AppError carries its own
 * code/status; schema-validation errors become 400 VALIDATION; other 4xx from
 * framework plugins (e.g. rate-limit 429) pass through with Fastify's default
 * body; anything unexpected is logged and masked as a generic 500. */
export function errorHandler(
  err: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (isAppError(err)) {
    void reply.code(err.statusCode).send({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err.validation !== undefined) {
    void reply.code(400).send({
      error: { code: "VALIDATION", message: err.message, details: err.validation },
    });
    return;
  }

  const status = err.statusCode ?? 500;
  if (status < 500) {
    void reply.code(status).send({
      statusCode: status,
      error: err.name,
      message: err.message,
    });
    return;
  }

  request.log.error(err, "Unhandled error");
  void reply.code(500).send({
    error: { code: "INTERNAL", message: "Internal server error" },
  });
}
