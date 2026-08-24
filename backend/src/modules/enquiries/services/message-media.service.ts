// Attachments on enquiry chat messages: upload to GCS, record in uploaded_files, hand
// the caller back a storage path to send with the message.
//
// Shaped directly after feed/services/feed-media.service.ts — same upload-then-attach
// flow, same ownership assertion, same signed-URL-per-read rule. Split into its own file
// rather than added to messages.service.ts so the chat service stays about conversation
// rules and this stays about bytes.

import { BadRequestError, NotFoundError } from "../../../shared/errors.js";
import * as filesRepo from "../../../shared/storage/files.repository.js";
import * as storage from "../../../shared/storage/storageService.js";
import * as userRepo from "../../platform-users/repositories/platform-users.repository.js";

/** `category` on uploaded_files — also what assertOwned() checks, so it must be exact. */
const CATEGORY = "enquiry-chat";

// Mirrors V2's composer allow-list. The shared ALLOWED_MIME_TYPES set has no video or
// office types, so this passes its own set to validateFile() rather than widening what
// every other upload in the app accepts.
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const DOC_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "text/markdown",
];
const ALLOWED = new Set([...IMAGE_TYPES, ...VIDEO_TYPES, ...DOC_TYPES]);

/** More than this and the thread stops being a conversation. V2 caps its composer too. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

/** What gets stored on enquiry_messages.attachments. No ids, no urls — those are derived. */
export interface MessageAttachment {
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
}

/** The same, plus a freshly signed URL the browser can actually load. */
export interface MessageAttachmentDto extends MessageAttachment {
  url: string;
}

/**
 * Some browsers send an empty or generic MIME for `.md`/`.csv`, so the extension is the
 * fallback — same accommodation V2's composer makes.
 */
const EXTENSION_FALLBACK: Record<string, string> = {
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  txt: "text/plain",
};

function resolveMimeType(filename: string, mimeType: string): string {
  if (ALLOWED.has(mimeType)) return mimeType;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_FALLBACK[ext] ?? mimeType;
}

export async function upload(input: {
  userId: number;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<MessageAttachmentDto> {
  const user = await userRepo.findById(input.userId);
  if (!user) throw new NotFoundError("User not found");

  const mimeType = resolveMimeType(input.filename, input.mimeType);
  storage.validateFile(mimeType, input.buffer.length, ALLOWED);

  // `private/`, unlike feed media's `public/`: an enquiry conversation is between two
  // parties and its files must only ever be reachable through a signed URL.
  const storagePath = storage.buildPath(
    "private/platform-users",
    String(input.userId),
    "enquiry-chat",
    input.filename,
  );
  await storage.uploadFile(storagePath, input.buffer, mimeType);

  await filesRepo.insertFile({
    uploaded_by: input.userId,
    entity_type: "platform_user",
    entity_id: user.uuid,
    category: CATEGORY,
    original_name: input.filename,
    storage_path: storagePath,
    mime_type: mimeType,
    size_bytes: input.buffer.length,
  });

  return {
    storage_path: storagePath,
    original_name: input.filename,
    mime_type: mimeType,
    size_bytes: input.buffer.length,
    // Returned so the composer previews the real uploaded object, not a local blob.
    url: await storage.getSignedViewUrl(storagePath),
  };
}

/**
 * Only paths this user actually uploaded, for this purpose, may be attached — otherwise
 * a client could attach any storage path it could guess. Same guard as the feed's
 * assertOwnedMedia, and the reason the metadata is re-read from uploaded_files rather
 * than trusted from the request body.
 */
export async function resolveOwned(userId: number, paths: string[]): Promise<MessageAttachment[]> {
  if (paths.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new BadRequestError(`Attach at most ${MAX_ATTACHMENTS_PER_MESSAGE} files to one message`);
  }
  return Promise.all(
    paths.map(async (path) => {
      const record = await filesRepo.findFileByPath(path);
      if (!record || record.uploaded_by !== userId || record.category !== CATEGORY) {
        throw new BadRequestError("Unknown attachment reference");
      }
      return {
        storage_path: record.storage_path,
        original_name: record.original_name,
        mime_type: record.mime_type,
        size_bytes: Number(record.size_bytes),
      };
    }),
  );
}

/**
 * Mint view URLs for reading. Signed URLs expire, so they are generated per read rather
 * than stored on the message.
 */
export async function withViewUrls(
  attachments: MessageAttachment[] | null | undefined,
): Promise<MessageAttachmentDto[]> {
  if (!attachments?.length) return [];
  return Promise.all(
    attachments.map(async (item) => ({
      ...item,
      // One unreachable object must not break the whole thread — it renders without a URL.
      url: await storage.getSignedViewUrl(item.storage_path).catch(() => ""),
    })),
  );
}
