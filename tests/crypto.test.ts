import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskKey } from "../src/lib/crypto.js";

describe("TASK-C4 crypto layer (AES-256-GCM)", () => {
  it("CRY-01: roundtrips a secret and never reuses ciphertext", () => {
    // Given: a plaintext API key
    const plaintext = "sk-proj-abc123def456ghi789";

    // When: it is encrypted twice, then decrypted
    const first = encryptSecret(plaintext);
    const second = encryptSecret(plaintext);
    const roundtripped = decryptSecret(first);

    // Then: the roundtrip restores the plaintext; fresh IVs make ciphertexts unique; nothing leaks
    expect(roundtripped).toBe(plaintext);
    expect(first).not.toContain(plaintext);
    expect(second).not.toContain(plaintext);
    expect(first).not.toBe(second);
  });

  it("CRY-02: maskKey keeps only first4…last4 and hides short keys", () => {
    // Given: long and short API keys
    // When: they are masked
    // Then: long keys keep exactly first4…last4; short keys leak nothing
    expect(maskKey("sk-proj-abcdef123456")).toBe("sk-p…3456");
    expect(maskKey("short")).toBe("…");
    expect(maskKey("12345678")).toBe("…");
    expect(maskKey("123456789")).toBe("1234…6789");
  });

  it("CRY-03: rejects tampered ciphertext and malformed payloads without leaking plaintext", () => {
    // Given: an encrypted secret and a tampered copy (one hex char flipped)
    const payload = encryptSecret("sk-tamper-target-value");
    const [iv, tag, data] = payload.split(":");
    if (iv === undefined || tag === undefined || data === undefined) {
      throw new Error("encryptSecret produced a malformed payload");
    }
    const flipped = data.startsWith("a") ? `b${data.slice(1)}` : `a${data.slice(1)}`;
    const tampered = `${iv}:${tag}:${flipped}`;

    // When: the tampered payload is decrypted
    // Then: authentication fails and the error carries no plaintext
    expect(() => decryptSecret(tampered)).toThrow(/decryption failed/i);
    expect(() => decryptSecret("not-an-encrypted-payload")).toThrow(/invalid encrypted payload/i);
    try {
      decryptSecret(tampered);
    } catch (error) {
      expect(String(error)).not.toContain("sk-tamper-target-value");
    }
  });
});
