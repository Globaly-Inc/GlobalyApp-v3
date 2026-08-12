// Filesystem storage driver — the automatic fallback when GCS_BUCKET_NAME is unset.
//
// Without this, every upload in a development environment fails with "GCS_BUCKET_NAME not configured", so
// features that store files simply cannot be used or reviewed locally. Same call shape as the GCS driver,
// including expiring signed URLs, so nothing above storageService needs to know which one is active.

import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { config } from "../../config.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../errors.js";

const ROOT = resolve(process.cwd(), config.LOCAL_STORAGE_DIR);

/** Resolve inside ROOT only — a storage path must never escape it via "../". */
function safeJoin(storagePath: string): string {
  const target = resolve(join(ROOT, normalize(storagePath)));
  if (target !== ROOT && !target.startsWith(ROOT + sep)) {
    throw new BadRequestError("Invalid storage path");
  }
  return target;
}

export async function save(storagePath: string, buffer: Buffer): Promise<void> {
  const target = safeJoin(storagePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, buffer);
}

export async function read(storagePath: string): Promise<Buffer> {
  try {
    return await readFile(safeJoin(storagePath));
  } catch {
    throw new NotFoundError("File not found");
  }
}

export async function remove(storagePath: string): Promise<void> {
  await unlink(safeJoin(storagePath)).catch(() => undefined);
}

// ── Signed URLs ──
// The signature is what authorizes the read: a browser cannot attach a bearer token to an <img> src, so
// authority has to live in the URL, exactly as it does with a GCS signed URL.

function signature(storagePath: string, expiresAt: number): string {
  return createHmac("sha256", config.JWT_SECRET).update(`${storagePath}:${expiresAt}`).digest("hex");
}

function apiOrigin(): string {
  return (config.API_PUBLIC_URL ?? `http://localhost:${config.PORT}`).replace(/\/+$/, "");
}

export function signUrl(storagePath: string, expirySeconds = config.GCS_SIGNED_URL_EXPIRY, download = false): string {
  const expiresAt = Math.floor(Date.now() / 1000) + expirySeconds;
  const query = new URLSearchParams({
    path: storagePath,
    exp: String(expiresAt),
    sig: signature(storagePath, expiresAt),
  });
  if (download) query.set("download", "1");
  return `${apiOrigin()}/api/v3/files/local?${query.toString()}`;
}

export function verifySignature(storagePath: string, exp: string, sig: string): void {
  const expiresAt = Number(exp);
  if (!Number.isFinite(expiresAt)) throw new ForbiddenError("Invalid signature");
  if (expiresAt < Math.floor(Date.now() / 1000)) throw new ForbiddenError("Link has expired");

  const expected = Buffer.from(signature(storagePath, expiresAt));
  const provided = Buffer.from(sig);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    throw new ForbiddenError("Invalid signature");
  }
}
