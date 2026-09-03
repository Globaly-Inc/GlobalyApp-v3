// AES-256-GCM sealing for at-rest secrets (integration_settings values).
//
// Key is derived from JWT_SECRET rather than a dedicated env var — zero new
// config, but it means rotating JWT_SECRET invalidates stored integration
// keys (admins re-enter them in Settings → Integrations; consumers fall back
// to env vars in the meantime). Format: v1:<iv b64>:<tag b64>:<ciphertext b64>.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config } from "../../config.js";

function key(): Buffer {
  return createHash("sha256").update(`${config.JWT_SECRET}:integration-settings`).digest();
}

export function seal(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${enc.toString("base64")}`;
}

/** Throws on tampered/garbled input — callers treat that as "setting unusable", not a crash. */
export function open(sealed: string): string {
  const [v, ivB64, tagB64, dataB64] = sealed.split(":");
  if (v !== "v1" || !ivB64 || !tagB64 || !dataB64) throw new Error("secret-box: bad format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
