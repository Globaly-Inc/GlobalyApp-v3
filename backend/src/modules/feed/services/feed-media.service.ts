// Feed media: real uploads to GCS, recorded in uploaded_files, rendered from signed view URLs.
//
// V2's composer previewed files as base64 and never uploaded them — posts always stored []. This is the
// actual upload path.

import * as storage from "../../../shared/storage/storageService.js";
import * as filesRepo from "../../../shared/storage/files.repository.js";
import { BadRequestError, NotFoundError } from "../../../shared/errors.js";
import * as userRepo from "../../platform-users/repositories/platform-users.repository.js";

// The shared ALLOWED_MIME_TYPES set has no video types, so feed media passes its own allow-list to
// validateFile() rather than widening what every other upload in the app accepts.
const FEED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const FEED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const FEED_MEDIA_TYPES = new Set([...FEED_IMAGE_TYPES, ...FEED_VIDEO_TYPES]);

export type MediaKind = "image" | "video";
export type PostMedia = { storage_path: string; type: MediaKind; mime_type: string };

export function kindFor(mimeType: string): MediaKind {
  if (FEED_IMAGE_TYPES.includes(mimeType)) return "image";
  if (FEED_VIDEO_TYPES.includes(mimeType)) return "video";
  throw new BadRequestError(`Unsupported media type "${mimeType}"`);
}

export function guessImageMimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png": return "image/png";
    case "webp": return "image/webp";
    case "gif": return "image/gif";
    default: return "image/jpeg";
  }
}

export async function uploadMedia(input: {
  userId: number;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<PostMedia & { url: string }> {
  const user = await userRepo.findById(input.userId);
  if (!user) throw new NotFoundError("User not found");

  storage.validateFile(input.mimeType, input.buffer.length, FEED_MEDIA_TYPES);
  const kind = kindFor(input.mimeType);

  const storagePath = storage.buildPath("public/platform-users", String(input.userId), "feed-media", input.filename);
  await storage.uploadFile(storagePath, input.buffer, input.mimeType);

  await filesRepo.insertFile({
    uploaded_by: input.userId,
    entity_type: "platform_user",
    entity_id: user.uuid,
    category: "feed-media",
    original_name: input.filename,
    storage_path: storagePath,
    mime_type: input.mimeType,
    size_bytes: input.buffer.length,
  });

  return {
    storage_path: storagePath,
    type: kind,
    mime_type: input.mimeType,
    // Returned so the composer can preview the real uploaded object rather than a local blob.
    url: await storage.getSignedViewUrl(storagePath),
  };
}

/**
 * Only paths the caller actually uploaded may be attached to a post — otherwise a client could reference
 * any storage path it could guess.
 */
export async function assertOwnedMedia(userId: number, media: PostMedia[]) {
  for (const item of media) {
    const record = await filesRepo.findFileByPath(item.storage_path);
    if (!record || record.uploaded_by !== userId || record.category !== "feed-media") {
      throw new BadRequestError("Unknown media reference");
    }
  }
}

/**
 * Turn stored paths into URLs the browser can load. Signed URLs expire, so they are minted per read rather
 * than stored on the post.
 */
export async function withViewUrls(media: PostMedia[] | null): Promise<(PostMedia & { url: string })[]> {
  if (!media?.length) return [];
  return Promise.all(
    media.map(async (item) => ({
      ...item,
      url: /^https?:\/\//i.test(item.storage_path)
        ? item.storage_path
        // A missing/unreachable object must not break the whole timeline — the item renders without a URL.
        : await storage.getSignedViewUrl(item.storage_path).catch(() => ""),
    })),
  );
}
