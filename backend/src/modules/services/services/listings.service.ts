// Listing management for the seller: CRUD, pause/resume, cover upload, and the delete guard V2 lacked.

import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../../shared/errors.js";
import * as storage from "../../../shared/storage/storageService.js";
import * as filesRepo from "../../../shared/storage/files.repository.js";
import { createChildLogger } from "../../../shared/logger.js";
import * as userRepo from "../../platform-users/repositories/platform-users.repository.js";
import * as repo from "../repositories/services.repository.js";
import type { CreateListingInput, UpdateListingInput } from "../schemas/services.schema.js";

const logger = createChildLogger("services-listings");

// Cover images only — a narrower set than the shared ALLOWED_MIME_TYPES (which also permits PDFs and
// spreadsheets), passed per call so nothing else in the app is widened by this feature.
const COVER_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const COVER_CATEGORY = "service-cover";

export interface ListingDto {
  id: number;
  provider_id: number;
  title: string;
  description: string | null;
  category: string;
  price_minor: number;
  currency: string;
  country_id: number | null;
  country_name: string | null;
  city_id: number | null;
  city_name: string | null;
  cover_storage_path: string | null;
  cover_url: string | null;
  is_active: boolean;
  avg_rating: number;
  total_reviews: number;
  total_orders: number;
  open_orders_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Mint the signed cover URL per read — they expire, so one cannot be stored. A signing failure degrades that
 * single card to no image rather than failing the whole list.
 */
async function coverUrl(path: string | null): Promise<string | null> {
  if (!path || !storage.isConfigured()) return null;
  try {
    return await storage.getSignedViewUrl(path);
  } catch (err) {
    logger.warn("Could not sign service cover URL", { path, err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export async function toDto(row: repo.HydratedListingRow): Promise<ListingDto> {
  return {
    id: row.id,
    provider_id: row.provider_id,
    title: row.title,
    description: row.description,
    category: row.category,
    price_minor: row.price_minor,
    currency: row.currency,
    country_id: row.country_id,
    country_name: row.country_name,
    city_id: row.city_id,
    city_name: row.city_name,
    cover_storage_path: row.cover_storage_path,
    cover_url: await coverUrl(row.cover_storage_path),
    is_active: row.is_active,
    // numeric arrives from pg as a string; the client must never have to guess.
    avg_rating: Number(row.avg_rating),
    total_reviews: row.total_reviews,
    total_orders: row.total_orders,
    open_orders_count: Number(row.open_orders_count ?? 0),
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

export async function listMine(providerId: number): Promise<ListingDto[]> {
  const rows = await repo.listListingsByProvider(providerId);
  return Promise.all(rows.map(toDto));
}

/** Load a listing the caller owns, or fail. Every write path goes through this. */
async function ownedListing(id: number, userId: number): Promise<repo.HydratedListingRow> {
  const row = await repo.findListingById(id);
  if (!row) throw new NotFoundError("Service listing not found");
  if (row.provider_id !== userId) throw new ForbiddenError("This listing is not yours");
  return row;
}

export async function getMine(id: number, userId: number): Promise<ListingDto> {
  return toDto(await ownedListing(id, userId));
}

async function assertLocationValid(countryId?: number | null, cityId?: number | null) {
  if (!cityId) return;
  if (!countryId) throw new BadRequestError("Pick a country before a city");
  if (!(await repo.cityBelongsToCountry(cityId, countryId))) {
    throw new BadRequestError("That city is not in the selected country");
  }
}

/** A cover path may only be referenced by the user who uploaded it. */
async function assertOwnedCover(userId: number, path: string) {
  const record = await filesRepo.findFileByPath(path);
  if (!record || record.uploaded_by !== userId || record.category !== COVER_CATEGORY) {
    throw new BadRequestError("Unknown cover image reference");
  }
}

export async function create(providerId: number, input: CreateListingInput): Promise<ListingDto> {
  await assertLocationValid(input.country_id, input.city_id);
  if (input.cover_storage_path) await assertOwnedCover(providerId, input.cover_storage_path);

  const row = await repo.insertListing({
    provider_id: providerId,
    title: input.title,
    category: input.category,
    description: input.description ?? null,
    price_minor: input.price_minor,
    currency: input.currency,
    country_id: input.country_id ?? null,
    city_id: input.city_id ?? null,
    cover_storage_path: input.cover_storage_path ?? null,
    is_active: input.is_active,
  });

  return toDto((await repo.findListingById(row.id))!);
}

export async function update(id: number, userId: number, input: UpdateListingInput): Promise<ListingDto> {
  const existing = await ownedListing(id, userId);

  // Resolve the location the patch actually produces BEFORE validating it. Moving a listing to another
  // country clears a city the caller did not re-pick — so validating the raw combination first would reject
  // the very edit that fixes the mismatch.
  const countryChanged = input.country_id !== undefined && input.country_id !== existing.country_id;
  const countryId = input.country_id !== undefined ? input.country_id : existing.country_id;
  const cityId = input.city_id !== undefined ? input.city_id : countryChanged ? null : existing.city_id;

  await assertLocationValid(countryId, cityId);
  if (input.cover_storage_path) await assertOwnedCover(userId, input.cover_storage_path);

  await repo.updateListing(id, { ...input, city_id: cityId });
  return toDto((await repo.findListingById(id))!);
}

/**
 * Deleting a listing with money committed against it is what let a V2 seller strand a paid order, so this
 * refuses and names the orders. 409, not 400: the request is well-formed, the resource state forbids it.
 */
export async function remove(id: number, userId: number): Promise<void> {
  await ownedListing(id, userId);
  const open = await repo.findOpenOrdersForListing(id);
  if (open.length > 0) {
    throw new ConflictError(
      `This listing has ${open.length} open order${open.length === 1 ? "" : "s"} ` +
        `(#${open.map((o) => o.id).join(", #")}). Pause it instead — deleting it now would strand ` +
        `${open.length === 1 ? "a payment" : "payments"}.`,
    );
  }
  await repo.softDeleteListing(id);
}

export async function uploadCover(input: {
  userId: number;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<{ storage_path: string; url: string | null }> {
  // Storage is GCS-only on this branch and this environment has no bucket, so say so plainly instead of
  // letting getStorage() throw a bare "GCS_BUCKET_NAME not configured" as a 500. GET /meta reports the same
  // fact so the form hides the affordance rather than offering a button that can only fail.
  if (!storage.isConfigured()) {
    throw new BadRequestError("Image upload is unavailable — no storage bucket is configured for this environment");
  }

  const user = await userRepo.findById(input.userId);
  if (!user) throw new NotFoundError("User not found");

  storage.validateFile(input.mimeType, input.buffer.length, COVER_MIME_TYPES);

  const storagePath = storage.buildPath("platform-users", user.uuid, COVER_CATEGORY, input.filename);
  await storage.uploadFile(storagePath, input.buffer, input.mimeType);

  await filesRepo.insertFile({
    uploaded_by: input.userId,
    entity_type: "platform_user",
    entity_id: user.uuid,
    category: COVER_CATEGORY,
    original_name: input.filename,
    storage_path: storagePath,
    mime_type: input.mimeType,
    size_bytes: input.buffer.length,
  });

  // Returned so the form previews the real uploaded object, not a local blob URL.
  return { storage_path: storagePath, url: await coverUrl(storagePath) };
}
