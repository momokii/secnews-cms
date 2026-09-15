import type { IntegrationKind } from "../../generated/prisma/enums.js";
import { decryptSecret } from "../../lib/crypto.js";
import { prisma } from "../../lib/db.js";

/** The single decrypting reader of IntegrationConfig rows. Shared by the
 * integration routes (mask view, probes) and the delivery senders (DB-first
 * gateway settings with env fallback). Returns null when the kind was never
 * configured in the Integrations menu. */

export async function loadStoredConfig<T>(kind: IntegrationKind): Promise<T | null> {
  const row = await prisma.integrationConfig.findUnique({ where: { kind } });
  if (row === null) {
    return null;
  }
  return JSON.parse(decryptSecret(row.encryptedKey)) as T;
}
