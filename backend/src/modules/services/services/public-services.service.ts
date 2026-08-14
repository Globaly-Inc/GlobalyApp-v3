// The buyer's side of the marketplace: what an unauthenticated visitor can see.
//
// Everything here reads only listings that are active and not deleted, and returns a deliberately narrower
// shape than the seller's own view — no open-order counts, no storage paths, nothing about who has ordered.

import { NotFoundError } from "../../../shared/errors.js";
import * as storage from "../../../shared/storage/storageService.js";
import { createChildLogger } from "../../../shared/logger.js";
import * as repo from "../repositories/services.repository.js";

const logger = createChildLogger("services-public");

const REVIEW_LIMIT = 20;

export interface PublicListingDto {
  id: number;
  title: string;
  description: string | null;
  category_id: number;
  category_slug: string;
  category_name: string;
  category_icon: string | null;
  price_minor: number;
  currency: string;
  country_name: string | null;
  city_name: string | null;
  cover_url: string | null;
  avg_rating: number;
  total_reviews: number;
  total_orders: number;
  provider_id: number;
  provider_name: string;
  provider_photo_url: string | null;
  created_at: string;
}

async function coverUrl(path: string | null): Promise<string | null> {
  if (!path || !storage.isConfigured()) return null;
  try {
    return await storage.getSignedViewUrl(path);
  } catch (err) {
    logger.warn("Could not sign public cover URL", { path, err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

async function toPublicDto(row: repo.PublicListingRow): Promise<PublicListingDto> {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category_id: row.category_id,
    category_slug: row.category_slug,
    category_name: row.category_name,
    category_icon: row.category_icon,
    price_minor: row.price_minor,
    currency: row.currency,
    country_name: row.country_name,
    city_name: row.city_name,
    cover_url: await coverUrl(row.cover_storage_path),
    avg_rating: Number(row.avg_rating),
    total_reviews: row.total_reviews,
    total_orders: row.total_orders,
    // The seller's id is public so the UI can tell a viewer "this is your listing" and hide Buy.
    provider_id: row.provider_id,
    provider_name: row.provider_name?.trim() || "A student",
    provider_photo_url: row.provider_photo_url,
    created_at: new Date(row.created_at).toISOString(),
  };
}

export async function browse(input: {
  search?: string;
  category_id?: number;
  country_id?: number;
  city_id?: number;
  currency?: repo.BrowseFilters["currency"];
  min_price?: number;
  max_price?: number;
  page: number;
  limit: number;
}) {
  const filters: repo.BrowseFilters = {
    search: input.search,
    category_id: input.category_id,
    country_id: input.country_id,
    city_id: input.city_id,
    currency: input.currency,
    min_price: input.min_price,
    max_price: input.max_price,
  };
  const offset = (input.page - 1) * input.limit;

  const [rows, total] = await Promise.all([
    repo.browseListings(filters, input.limit, offset),
    repo.countListings_public(filters),
  ]);

  return {
    services: await Promise.all(rows.map(toPublicDto)),
    meta: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.limit)),
    },
  };
}

export async function getOne(serviceId: number): Promise<PublicListingDto> {
  const row = await repo.findPublicListing(serviceId);
  // A paused or deleted listing is indistinguishable from one that never existed — a buyer has no business
  // learning that a seller took something down.
  if (!row) throw new NotFoundError("Service not found");
  return toPublicDto(row);
}

export async function reviews(serviceId: number) {
  const row = await repo.findPublicListing(serviceId);
  if (!row) throw new NotFoundError("Service not found");
  const rows = await repo.listReviewsForListing(serviceId, REVIEW_LIMIT);
  return rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    created_at: new Date(r.created_at).toISOString(),
    reviewer_name: r.reviewer_name?.trim() || "A student",
    reviewer_photo_url: r.reviewer_photo_url,
    // Reviews are open to anyone now, so a reader needs to see which ones came from an actual buyer.
    is_verified_purchase: !!r.is_verified_purchase,
  }));
}

export async function categories() {
  return repo.listCategories();
}
