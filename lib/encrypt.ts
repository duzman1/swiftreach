// AES-256-CBC encryption for per-user Meta API tokens.
//
// Format: "<iv-hex>:<ciphertext-hex>"
//   - iv:         16 random bytes (128 bits, the AES block size)
//   - ciphertext: PKCS#7-padded by the cipher
//
// The key is read from process.env.ENCRYPTION_KEY at first use. It must be a
// 64-char hex string (32 bytes = 256 bits). Rotating the key permanently
// breaks every previously-encrypted token — see AUTH_SETUP.md.

import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const IV_BYTES = 16;
const KEY_BYTES = 32;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY is not set. See AUTH_SETUP.md to generate one."
    );
  }
  // Reject anything that isn't a 64-char hex string — fail loud, not silently
  // truncate-or-pad as some implementations do.
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      "ENCRYPTION_KEY must be a 64-char hex string (32 bytes / 256 bits). " +
        "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  cachedKey = Buffer.from(raw, "hex");
  if (cachedKey.length !== KEY_BYTES) {
    throw new Error(`ENCRYPTION_KEY decoded to ${cachedKey.length} bytes; expected ${KEY_BYTES}.`);
  }
  return cachedKey;
}

export function encrypt(plaintext: string | null | undefined): string | null {
  if (plaintext == null || plaintext === "") return null;
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const parts = payload.split(":");
  if (parts.length !== 2) {
    throw new Error("Encrypted payload is malformed (expected iv:ciphertext).");
  }
  const [ivHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  if (iv.length !== IV_BYTES) {
    throw new Error(`Encrypted payload IV is ${iv.length} bytes; expected ${IV_BYTES}.`);
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8"
  );
}

/** Show only the first 4 + last 4 chars of a token. Use for UI display. */
export function maskToken(token: string | null | undefined): string {
  if (!token) return "(not set)";
  if (token.length <= 8) return "•".repeat(token.length);
  return token.slice(0, 4) + "•".repeat(Math.max(token.length - 8, 4)) + token.slice(-4);
}
