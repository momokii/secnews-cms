import { isIPv4, isIPv6 } from "node:net";
import type { IocType } from "../../generated/prisma/enums.js";
import { AppError } from "../../common/errors.js";

/**
 * Write-path value validators (TASK-VALID). The response schemas already pin
 * the wire shapes (TicketSchema cveIds regex, IocSchema); these helpers guard
 * every WRITE path so garbage can never be stored via the API again:
 *   - CVE ids must match ^CVE-\d{4}-\d{4,}$ on create, PATCH fields and
 *     suggestion accept (an accepted "N/A" 500'd every tickets read);
 *   - IOC values must parse as their declared type (an IPv4 literal stored as
 *     IPV6 made every OTX push answer 400 upstream).
 * Node's net.isIP and URL do the parsing; no new dependencies.
 */

export const CVE_ID_PATTERN = /^CVE-\d{4}-\d{4,}$/;

/** Offending entries only — an empty array means every entry is a valid CVE id. */
export function findInvalidCveIds(values: string[]): string[] {
  return values.filter((value) => !CVE_ID_PATTERN.test(value));
}

/** Guard for ticket write routes: 422 VALIDATION naming every bad entry. */
export function assertValidCveIds(values: string[]): void {
  const invalid = findInvalidCveIds(values);
  if (invalid.length > 0) {
    throw new AppError(
      "VALIDATION",
      `Invalid CVE id(s): ${invalid.join(", ")} — expected CVE-YYYY-NNNNN`,
      { invalid },
      422,
    );
  }
}

const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const HASH_LENGTHS = { MD5: 32, SHA1: 40, SHA256: 64 } as const;
type HashType = keyof typeof HASH_LENGTHS;

function hashProblem(type: HashType, value: string): string | null {
  const length = HASH_LENGTHS[type];
  const digest = new RegExp(`^[0-9a-f]{${length}}$`, "i");
  return (
    digest.test(value) ? null : `${type} value must be a ${length}-char hex digest (got "${value}")`
  );
}

function cidrProblem(value: string): string | null {
  const slash = value.indexOf("/");
  if (slash === -1) {
    return `CIDR value must be address/prefix (got "${value}")`;
  }
  const address = value.slice(0, slash);
  const prefixText = value.slice(slash + 1);
  if (!/^\d+$/.test(prefixText)) {
    return `CIDR value must carry a numeric prefix length (got "${value}")`;
  }
  const prefix = Number(prefixText);
  if (isIPv4(address) && prefix <= 32) {
    return null;
  }
  if (isIPv6(address) && prefix <= 128) {
    return null;
  }
  return `CIDR value must be a valid IPv4/IPv6 address with a matching prefix length (got "${value}")`;
}

function urlProblem(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return `URL value must be a parseable http(s) URL (got "${value}")`;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:"
    ? null
    : `URL value must be an http(s) URL (got "${value}")`;
}

/** Human-readable problem for an IOC (type, value) pair, or null when valid.
 * Exhaustive over IocType; FILEPATH/MUTEX/OTHER are free-form. */
export function iocValueProblem(type: IocType, value: string): string | null {
  switch (type) {
    case "IPV4":
      return isIPv4(value) ? null : `IPV4 value must be a valid IPv4 address (got "${value}")`;
    case "IPV6":
      return isIPv6(value) ? null : `IPV6 value must be a valid IPv6 address (got "${value}")`;
    case "DOMAIN":
      return DOMAIN_PATTERN.test(value) ? null : `DOMAIN value must be a valid hostname (got "${value}")`;
    case "URL":
      return urlProblem(value);
    case "EMAIL":
      return EMAIL_PATTERN.test(value) ? null : `EMAIL value must be a valid email address (got "${value}")`;
    case "MD5":
    case "SHA1":
    case "SHA256":
      return hashProblem(type, value);
    case "CIDR":
      return cidrProblem(value);
    case "FILEPATH":
    case "MUTEX":
    case "OTHER":
      return null;
  }
}
