/**
 * Upstream HTTP failure carrying the truncated response body for diagnosis
 * (TASK-VALID). Both OTX and the AI providers previously answered failures
 * with the upstream status only; the body snippet in `details` is what makes
 * upstream rejections diagnosable. Keys travel in request headers, never in
 * response bodies, so the snippet cannot leak credentials.
 */

import { AppError } from "./errors.js";

const MAX_BODY_CHARS = 300;

export class UpstreamError extends Error {
  readonly status: number;
  readonly bodySnippet: string;

  constructor(label: string, status: number, bodySnippet: string) {
    super(`${label} request failed with upstream status ${status}`);
    this.name = "UpstreamError";
    this.status = status;
    this.bodySnippet = bodySnippet;
  }
}

/** Build the typed failure from a non-2xx response, body truncated to 300 chars. */
export async function upstreamFailure(label: string, response: Response): Promise<UpstreamError> {
  let body = "";
  try {
    body = (await response.text()).trim();
  } catch {
    body = "";
  }
  return new UpstreamError(
    label,
    response.status,
    body === "" ? "<empty body>" : body.slice(0, MAX_BODY_CHARS),
  );
}

/** The canonical 502 INTERNAL envelope for an upstream failure: status + body
 * snippet in details, key material never included (keys travel in headers). */
export function upstream502(error: UpstreamError): AppError {
  return new AppError(
    "INTERNAL",
    error.message,
    { upstreamStatus: error.status, upstreamBody: error.bodySnippet },
    502,
  );
}
