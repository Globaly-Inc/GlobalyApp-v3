// GCS storage abstraction — upload, signed download/preview URLs.
// All paths are relative (no bucket prefix). DB stores the same relative path.

import { Storage, GetSignedUrlConfig } from "@google-cloud/storage";
import { randomBytes } from "crypto";
import { extname } from "path";
import { config } from "../../config.js";
import { createChildLogger } from "../logger.js";
import { BadRequestError } from "../errors.js";

const logger = createChildLogger("storage-service");

// ─── Config ────────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = new Set([
  // Images
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // Text
  "text/plain", "text/csv",
]);

const MAX_FILE_SIZE = config.GCS_MAX_FILE_SIZE_MB * 1024 * 1024;
const SIGNED_URL_EXPIRY = config.GCS_SIGNED_URL_EXPIRY; // seconds

// ─── GCS client ────────────────────────────────────────────────────────────

let storage: Storage | null = null;

function getStorage(): Storage {
  if (!storage) {
    if (!config.GCS_BUCKET_NAME) throw new Error("GCS_BUCKET_NAME not configured");
    storage = new Storage({
      projectId: config.GCS_PROJECT_ID,
      ...(config.GCS_KEY_FILE ? { keyFilename: config.GCS_KEY_FILE } : {}),
    });
  }
  return storage;
}

function bucket() {
  return getStorage().bucket(config.GCS_BUCKET_NAME!);
}

// ─── Path helpers ──────────────────────────────────────────────────────────

/**
 * Generate a unique storage filename: <timestamp>-<4char_random>.<ext>
 */
function generateFilename(originalName: string): string {
  const ext = extname(originalName).toLowerCase() || ".bin";
  const rand = randomBytes(2).toString("hex"); // 4 hex chars
  return `${Date.now()}-${rand}${ext}`;
}

/**
 * Build the relative storage path. Mirrors DB schema structure.
 *
 * Examples:
 *   buildPath("public/platform-users", "1", "profile", "photo.jpg")
 *   → "public/platform-users/1/profile/1722945600123-a3f2.jpg"
 *
 *   buildPath("public/businesses", orgId, "logo", "logo.png")
 *   → "public/businesses/biz_acme_abc123/logo/1722945600123-b1c4.png"
 */
export function buildPath(...segments: string[]): string {
  const originalName = segments.pop()!;
  return [...segments, generateFilename(originalName)].join("/");
}

// ─── Validation ────────────────────────────────────────────────────────────

export function validateFile(mimeType: string, sizeBytes: number, allowedTypes?: Set<string>) {
  const allowed = allowedTypes ?? ALLOWED_MIME_TYPES;
  if (!allowed.has(mimeType)) {
    throw new BadRequestError(`File type "${mimeType}" is not allowed`);
  }
  if (sizeBytes > MAX_FILE_SIZE) {
    throw new BadRequestError(`File exceeds maximum size of ${config.GCS_MAX_FILE_SIZE_MB}MB`);
  }
}

// ─── Upload ────────────────────────────────────────────────────────────────

export interface UploadResult {
  storagePath: string;
  sizeBytes: number;
  mimeType: string;
}

/**
 * Upload a file buffer to GCS. Returns the relative storage path.
 */
export async function uploadFile(
  storagePath: string,
  buffer: Buffer,
  mimeType: string,
): Promise<UploadResult> {
  const file = bucket().file(storagePath);
  await file.save(buffer, {
    contentType: mimeType,
    resumable: false, // small files, no need for resumable
    metadata: { cacheControl: "public, max-age=31536000" },
  });

  logger.info("File uploaded", { storagePath, sizeBytes: buffer.length, mimeType });
  return { storagePath, sizeBytes: buffer.length, mimeType };
}

/**
 * Generate a signed upload URL for direct client → GCS upload.
 * Client PUTs the file to this URL with the specified content type.
 */
export async function getSignedUploadUrl(
  storagePath: string,
  mimeType: string,
  expiresInSeconds = SIGNED_URL_EXPIRY,
): Promise<{ uploadUrl: string; storagePath: string }> {
  const file = bucket().file(storagePath);
  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + expiresInSeconds * 1000,
    contentType: mimeType,
  });
  logger.info("Signed upload URL generated", { storagePath });
  return { uploadUrl: url, storagePath };
}

// ─── Download / Preview ────────────────────────────────────────────────────

/**
 * Generate a signed download URL (Content-Disposition: attachment).
 */
export async function getSignedDownloadUrl(
  storagePath: string,
  originalName?: string,
  expiresInSeconds = SIGNED_URL_EXPIRY,
): Promise<string> {
  const file = bucket().file(storagePath);
  const opts: GetSignedUrlConfig = {
    version: "v4",
    action: "read",
    expires: Date.now() + expiresInSeconds * 1000,
    responseDisposition: `attachment; filename="${originalName ?? storagePath.split("/").pop()}"`,
  };
  const [url] = await file.getSignedUrl(opts);
  return url;
}

/**
 * Generate a signed preview/view URL (Content-Disposition: inline).
 */
export async function getSignedViewUrl(
  storagePath: string,
  expiresInSeconds = SIGNED_URL_EXPIRY,
): Promise<string> {
  const file = bucket().file(storagePath);
  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + expiresInSeconds * 1000,
    responseDisposition: "inline",
  });
  return url;
}

// ─── Delete ────────────────────────────────────────────────────────────────

/**
 * Delete a file from GCS. Silently succeeds if file doesn't exist.
 */
export async function deleteFile(storagePath: string): Promise<void> {
  try {
    await bucket().file(storagePath).delete();
    logger.info("File deleted", { storagePath });
  } catch (err: unknown) {
    const code = (err as { code?: number }).code;
    if (code === 404) return; // already gone
    throw err;
  }
}

// ─── Utility ───────────────────────────────────────────────────────────────

export function isConfigured(): boolean {
  return !!config.GCS_BUCKET_NAME;
}

/**
 * Legacy rows (pre signed-URL rollout) may hold a full public URL instead of a relative path —
 * strip the bucket prefix so those keep resolving instead of erroring.
 */
export function toStoragePath(raw: string): string {
  const withoutQuery = raw.split("?")[0];
  const marker = "storage.googleapis.com/";
  const idx = withoutQuery.indexOf(marker);
  if (idx === -1) return withoutQuery;
  return withoutQuery.slice(idx + marker.length).split("/").slice(1).join("/");
}

/** Resolve a stored path (or null) to a signed, viewable URL — the shared "preview this image" call. */
export function resolvePreviewUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return Promise.resolve(null);
  if (/^https?:\/\//i.test(path) && !path.includes("storage.googleapis.com/")) {
    return Promise.resolve(path);
  }
  return getSignedViewUrl(toStoragePath(path));
}
