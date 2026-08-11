// Fetch a remote agent logo and rehost it to GCS.
// Ported from V2 logo-rehost.ts — V3 uses shared storageService instead of Supabase Storage.

import { config } from "../../../../config.js";
import { createChildLogger } from "../../../../shared/logger.js";
import {
  uploadFile,
  isConfigured as gcsConfigured,
} from "../../../../shared/storage/storageService.js";

const logger = createChildLogger("logo-rehost");

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
]);

const EXT_FROM_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/gif": "gif",
};

const MAX_BYTES = 1_500_000; // 1.5 MB

export interface RehostResult {
  publicUrl: string;
  storagePath: string;
  sourceUrl: string;
}

function safeKey(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80);
}

export async function rehostLogo(opts: {
  jobId: string;
  externalId: string;
  sourceUrl: string;
}): Promise<RehostResult | null> {
  const { jobId, externalId, sourceUrl } = opts;
  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return null;

  if (!gcsConfigured()) {
    // ponytail: no GCS → skip silently, caller handles null
    logger.warn("GCS not configured — skipping logo rehost", { sourceUrl });
    return null;
  }

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch(sourceUrl, {
      signal: ctrl.signal,
      headers: { "User-Agent": "GlobalyBot/1.0 (+https://globaly.app)" },
    }).finally(() => clearTimeout(t));

    if (!res.ok) {
      logger.warn("Logo fetch failed", { sourceUrl, status: res.status });
      return null;
    }

    const ct = (res.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!ALLOWED_MIME.has(ct)) {
      logger.warn("Logo skipped: bad MIME", { sourceUrl, mime: ct });
      return null;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) {
      logger.warn("Logo skipped: size out of range", {
        sourceUrl,
        size: buf.byteLength,
      });
      return null;
    }

    const ext = EXT_FROM_MIME[ct] || "png";
    const storagePath = `extraction-logos/${jobId}/${safeKey(externalId)}.${ext}`;

    await uploadFile(storagePath, buf, ct);

    // ponytail: public URL via GCS bucket — assumes bucket has uniform public access or caller uses signed URLs
    const publicUrl = `https://storage.googleapis.com/${config.GCS_BUCKET_NAME}/${storagePath}`;

    return { publicUrl, storagePath, sourceUrl };
  } catch (e) {
    logger.warn("Logo rehost error", {
      sourceUrl,
      error: (e as Error).message,
    });
    return null;
  }
}
