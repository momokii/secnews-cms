import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM secret encryption for integration credentials (INT-02).
 * Wire format: "<iv hex>:<auth-tag hex>:<ciphertext hex>" — a fresh random IV
 * per call, so encrypting the same key twice never yields the same blob.
 * The 32-byte key comes from ENCRYPTION_KEY (64 hex chars) and is cached after
 * first use; maskKey renders keys as first4…last4 (INT-01) for API responses.
 */

const KEY_BYTES = 32;
const IV_BYTES = 12;

let cachedKey: Buffer | undefined;

function encryptionKey(): Buffer {
  cachedKey ??= parseEncryptionKey(process.env["ENCRYPTION_KEY"]);
  return cachedKey;
}

function parseEncryptionKey(raw: string | undefined): Buffer {
  if (raw === undefined || raw.length !== KEY_BYTES * 2 || /^[0-9a-fA-F]+$/.test(raw) === false) {
    throw new Error(`ENCRYPTION_KEY must be ${KEY_BYTES * 2} hex characters (${KEY_BYTES} bytes)`);
  }
  return Buffer.from(raw, "hex");
}

/** Encrypt a secret at rest. Throws when ENCRYPTION_KEY is missing/malformed. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv.toString("hex"), cipher.getAuthTag().toString("hex"), ciphertext.toString("hex")].join(":");
}

/** Decrypt a stored secret. GCM authentication makes any tamper throw. */
export function decryptSecret(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (ivHex === undefined || tagHex === undefined || dataHex === undefined) {
    throw new Error("invalid encrypted payload");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("secret decryption failed: payload tampered or wrong key");
  }
}

/** Public representation of a stored key: first4…last4 (short keys fully hidden). */
export function maskKey(key: string): string {
  if (key.length <= 8) {
    return "…";
  }
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}
