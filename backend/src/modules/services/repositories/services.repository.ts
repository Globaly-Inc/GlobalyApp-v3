// My Services repository — service_listings / service_orders / service_reviews in the globalyapp DB.
// Queries only; every authorization decision lives in the service layer.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import { OPEN_ORDER_STATUSES } from "../schemas/services.schema.js";
import type { Currency, OrderStatus } from "../schemas/services.schema.js";

export interface ListingRow {
  id: number;
  provider_id: number;
  title: string;
  description: string | null;
  category_id: number;
  price_minor: number;
  currency: Currency;
  country_id: number | null;
  city_id: number | null;
  cover_storage_path: string | null;
  is_active: boolean;
  avg_rating: string | number;   // Postgres numeric arrives from pg as a string
  total_reviews: number;
  total_orders: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

/** A listing plus the joined names the UI shows and the open-order count the delete guard needs. */
export interface HydratedListingRow extends ListingRow {
  category_slug: string;
  category_name: string;
  country_name: string | null;
  city_name: string | null;
  open_orders_count: number;
}

/** The public shape: adds the seller's identity, drops anything only the owner should see. */
export interface PublicListingRow extends HydratedListingRow {
  provider_name: string;
  provider_photo_url: string | null;
}

export interface OrderRow {
  id: number;
  listing_id: number;
  buyer_id: number;
  provider_id: number;
  amount_minor: number;
  currency: Currency;
  status: OrderStatus;
  payment_provider: string | null;
  payment_session_id: string | null;
  payment_intent_id: string | null;
  payment_refund_id: string | null;
  paid_at: Date | null;
  completed_at: Date | null;
  cancelled_at: Date | null;
  refunded_at: Date | null;
  buyer_confirmed: boolean;
  provider_confirmed: boolean;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * An order plus the counterparty and listing names.
 *
 * The listing is joined WITHOUT a deleted_at filter on purpose: a completed order must stay readable after
 * its listing is removed, or a buyer's purchase history silently loses its title.
 */
export interface HydratedOrderRow extends OrderRow {
  listing_title: string;
  listing_deleted: boolean;
  buyer_name: string;
  provider_name: string;
  review_id: number | null;
}

const listings = () => masterKnex<ListingRow>("service_listings");
const orders = () => masterKnex<OrderRow>("service_orders");

const fullName = (alias: string) => `trim(concat(${alias}.first_name, ' ', coalesce(${alias}.last_name, '')))`;

// ─── Listings ──────────────────────────────────────────────────────────────

function hydratedListingQuery(db: Knex | Knex.Transaction = masterKnex) {
  return db("service_listings as l")
    .join("service_categories as cat", "cat.id", "l.category_id")
    .leftJoin("countries as co", "co.id", "l.country_id")
    .leftJoin("cities as ci", "ci.id", "l.city_id")
    .select(
      "l.*",
      "cat.slug as category_slug",
      "cat.name as category_name",
      "co.name as country_name",
      "ci.name as city_name",
      // Counted in the same pass rather than per-card: the hub renders this as an "N orders open" chip and
      // the delete guard reads the same number, so both come from one query.
      db.raw(
        `(SELECT count(*)::int FROM service_orders o
            WHERE o.listing_id = l.id AND o.status IN (${OPEN_ORDER_STATUSES.map((s) => `'${s}'`).join(", ")})
         ) as open_orders_count`,
      ),
    );
}

export async function listListingsByProvider(providerId: number): Promise<HydratedListingRow[]> {
  return hydratedListingQuery()
    .where("l.provider_id", providerId)
    .whereNull("l.deleted_at")
    .orderBy("l.created_at", "desc") as unknown as Promise<HydratedListingRow[]>;
}

export async function findListingById(
  id: number,
  db: Knex | Knex.Transaction = masterKnex,
): Promise<HydratedListingRow | null> {
  const row = await hydratedListingQuery(db).where("l.id", id).whereNull("l.deleted_at").first();
  return (row as HydratedListingRow) ?? null;
}

export async function insertListing(data: Partial<ListingRow>): Promise<ListingRow> {
  const [row] = await listings().insert(data).returning("*");
  return row;
}

export async function updateListing(id: number, data: Partial<ListingRow>): Promise<ListingRow | null> {
  const [row] = await listings()
    .where({ id })
    .whereNull("deleted_at")
    .update({ ...data, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row ?? null;
}

export async function softDeleteListing(id: number): Promise<void> {
  await listings().where({ id }).update({ deleted_at: masterKnex.fn.now() });
}

/** The open orders blocking a delete, named in the 409 so the seller knows what to chase. */
export async function findOpenOrdersForListing(listingId: number): Promise<Pick<OrderRow, "id" | "status">[]> {
  return orders()
    .select("id", "status")
    .where({ listing_id: listingId })
    .whereIn("status", [...OPEN_ORDER_STATUSES])
    .orderBy("id");
}

export async function cityBelongsToCountry(cityId: number, countryId: number): Promise<boolean> {
  const row = await masterKnex("cities").select("id").where({ id: cityId, country_id: countryId }).first();
  return !!row;
}

// ─── Categories ────────────────────────────────────────────────────────────

export interface CategoryRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
}

/** Active categories only — retiring one in admin hides it from new listings without touching old ones. */
export async function listCategories(): Promise<CategoryRow[]> {
  return masterKnex("service_categories")
    .select("id", "slug", "name", "description", "icon")
    .where({ is_active: true })
    .whereNull("deleted_at")
    .orderBy(["sort_order", "name"]);
}

export async function findCategoryById(id: number): Promise<CategoryRow | null> {
  const row = await masterKnex("service_categories")
    .select("id", "slug", "name", "description", "icon")
    .where({ id, is_active: true })
    .whereNull("deleted_at")
    .first();
  return row ?? null;
}

// ─── Public browse ─────────────────────────────────────────────────────────

export interface BrowseFilters {
  search?: string;
  category_id?: number;
  country_id?: number;
  city_id?: number;
  currency?: Currency;
  /** Minor units, inclusive both ends. */
  min_price?: number;
  max_price?: number;
}

/**
 * Only listings a buyer may actually act on: active, not soft-deleted.
 *
 * A paused listing is invisible here while staying fully visible to its owner — that is the whole point of
 * Pause, and the reason deleting is refused while orders are open.
 */
function publicListingQuery(filters: BrowseFilters) {
  const query = masterKnex("service_listings as l")
    .join("service_categories as cat", "cat.id", "l.category_id")
    .join("platform_users as p", "p.id", "l.provider_id")
    .leftJoin("countries as co", "co.id", "l.country_id")
    .leftJoin("cities as ci", "ci.id", "l.city_id")
    .where("l.is_active", true)
    .whereNull("l.deleted_at");

  if (filters.category_id) query.where("l.category_id", filters.category_id);
  if (filters.country_id) query.where("l.country_id", filters.country_id);
  if (filters.city_id) query.where("l.city_id", filters.city_id);
  if (filters.currency) query.where("l.currency", filters.currency);
  // Compared in minor units against the stored column, so no rounding happens anywhere in the filter.
  if (filters.min_price !== undefined) query.where("l.price_minor", ">=", filters.min_price);
  if (filters.max_price !== undefined) query.where("l.price_minor", "<=", filters.max_price);
  if (filters.search) {
    // ILIKE over title + description. Good enough at this size; a trigram index or tsvector is the upgrade
    // when the table is big enough for it to matter.
    const term = `%${filters.search}%`;
    query.where((q) => q.whereILike("l.title", term).orWhereILike("l.description", term));
  }
  return query;
}

export async function browseListings(
  filters: BrowseFilters,
  limit: number,
  offset: number,
): Promise<PublicListingRow[]> {
  return publicListingQuery(filters)
    .select(
      "l.*",
      "cat.slug as category_slug",
      "cat.name as category_name",
      "co.name as country_name",
      "ci.name as city_name",
      "p.photo_url as provider_photo_url",
      masterKnex.raw(`${fullName("p")} as provider_name`),
      masterKnex.raw("0 as open_orders_count"),
    )
    // Highest rated first, then newest: a buyer's default ordering is quality, not recency.
    .orderBy([
      { column: "l.avg_rating", order: "desc" },
      { column: "l.created_at", order: "desc" },
      { column: "l.id", order: "desc" },
    ])
    .limit(limit)
    .offset(offset) as unknown as Promise<PublicListingRow[]>;
}

export async function countListings_public(filters: BrowseFilters): Promise<number> {
  const row = await publicListingQuery(filters).count<{ count: string }>("l.id as count").first();
  return Number(row?.count ?? 0);
}

export async function findPublicListing(id: number): Promise<PublicListingRow | null> {
  const row = await publicListingQuery({})
    .andWhere("l.id", id)
    .select(
      "l.*",
      "cat.slug as category_slug",
      "cat.name as category_name",
      "co.name as country_name",
      "ci.name as city_name",
      "p.photo_url as provider_photo_url",
      masterKnex.raw(`${fullName("p")} as provider_name`),
      masterKnex.raw("0 as open_orders_count"),
    )
    .first();
  return (row as PublicListingRow) ?? null;
}

export interface PublicReviewRow {
  id: number;
  rating: number;
  comment: string | null;
  created_at: Date;
  reviewer_name: string;
  reviewer_photo_url: string | null;
}

export async function listReviewsForListing(listingId: number, limit: number): Promise<PublicReviewRow[]> {
  return masterKnex("service_reviews as r")
    .join("platform_users as u", "u.id", "r.reviewer_id")
    .where("r.listing_id", listingId)
    .select(
      "r.id",
      "r.rating",
      "r.comment",
      "r.created_at",
      "u.photo_url as reviewer_photo_url",
      masterKnex.raw(`${fullName("u")} as reviewer_name`),
    )
    .orderBy("r.created_at", "desc")
    .limit(limit) as unknown as Promise<PublicReviewRow[]>;
}

// ─── Orders ────────────────────────────────────────────────────────────────

function hydratedOrderQuery(db: Knex | Knex.Transaction = masterKnex) {
  return db("service_orders as o")
    .join("service_listings as l", "l.id", "o.listing_id")
    .join("platform_users as b", "b.id", "o.buyer_id")
    .join("platform_users as p", "p.id", "o.provider_id")
    .leftJoin("service_reviews as r", "r.order_id", "o.id")
    .select(
      "o.*",
      "l.title as listing_title",
      db.raw("(l.deleted_at IS NOT NULL) as listing_deleted"),
      db.raw(`${fullName("b")} as buyer_name`),
      db.raw(`${fullName("p")} as provider_name`),
      "r.id as review_id",
    );
}

export async function listOrdersAsBuyer(buyerId: number): Promise<HydratedOrderRow[]> {
  return hydratedOrderQuery()
    .where("o.buyer_id", buyerId)
    .orderBy("o.created_at", "desc") as unknown as Promise<HydratedOrderRow[]>;
}

export async function listOrdersAsProvider(providerId: number): Promise<HydratedOrderRow[]> {
  return hydratedOrderQuery()
    .where("o.provider_id", providerId)
    .orderBy("o.created_at", "desc") as unknown as Promise<HydratedOrderRow[]>;
}

export async function findOrderById(id: number): Promise<HydratedOrderRow | null> {
  const row = await hydratedOrderQuery().where("o.id", id).first();
  return (row as HydratedOrderRow) ?? null;
}

/**
 * Lock the order row for the caller's transaction. Every state transition goes through this, so two
 * concurrent confirmations — or a double-submitted refund — serialise instead of racing on read-then-write.
 * FOR UPDATE cannot be combined with the LEFT JOIN above, so this returns the bare row.
 */
export async function lockOrder(id: number, trx: Knex.Transaction): Promise<OrderRow | null> {
  const row = await trx<OrderRow>("service_orders").where({ id }).forUpdate().first();
  return row ?? null;
}

export async function insertOrder(data: Partial<OrderRow>): Promise<OrderRow> {
  const [row] = await orders().insert(data).returning("*");
  return row;
}

/**
 * An unpaid order this buyer already holds for this listing.
 *
 * Pressing Buy twice should resume the existing checkout rather than stack up abandoned rows against the
 * same listing — each of which would separately block the seller from deleting it.
 */
export async function findResumableOrder(listingId: number, buyerId: number): Promise<OrderRow | null> {
  const row = await orders()
    .where({ listing_id: listingId, buyer_id: buyerId, status: "pending_payment" })
    .orderBy("id", "desc")
    .first();
  return row ?? null;
}

export async function findOrderBySessionId(sessionId: string): Promise<OrderRow | null> {
  const row = await orders().where({ payment_session_id: sessionId }).first();
  return row ?? null;
}

export async function updateOrder(
  id: number,
  data: Partial<OrderRow>,
  db: Knex | Knex.Transaction = masterKnex,
): Promise<OrderRow> {
  const [row] = await db<OrderRow>("service_orders")
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning("*");
  return row;
}

export async function incrementListingOrders(listingId: number, trx: Knex.Transaction): Promise<void> {
  await trx("service_listings").where({ id: listingId }).increment("total_orders", 1);
}

// ─── Reviews ───────────────────────────────────────────────────────────────

export interface ReviewRow {
  id: number;
  order_id: number;
  listing_id: number;
  reviewer_id: number;
  rating: number;
  comment: string | null;
  created_at: Date;
}

export async function findReviewByOrder(
  orderId: number,
  db: Knex | Knex.Transaction = masterKnex,
): Promise<ReviewRow | null> {
  const row = await db<ReviewRow>("service_reviews").where({ order_id: orderId }).first();
  return row ?? null;
}

export async function insertReview(
  data: Omit<ReviewRow, "id" | "created_at">,
  trx: Knex.Transaction,
): Promise<ReviewRow> {
  const [row] = await trx<ReviewRow>("service_reviews").insert(data).returning("*");
  return row;
}

/**
 * Recompute the listing's rating aggregates from the reviews themselves.
 *
 * Derived from the rows, not incremented: an increment drifts the moment anything else touches the table.
 * V2 never recomputed at all, so its listings kept a 0 rating forever however many reviews they had.
 */
export async function recomputeListingRating(listingId: number, trx: Knex.Transaction): Promise<void> {
  await trx.raw(
    `UPDATE service_listings l
        SET avg_rating = coalesce(agg.avg_rating, 0),
            total_reviews = coalesce(agg.total_reviews, 0),
            updated_at = now()
       FROM (SELECT round(avg(rating)::numeric, 2) AS avg_rating, count(*)::int AS total_reviews
               FROM service_reviews WHERE listing_id = ?) agg
      WHERE l.id = ?`,
    [listingId, listingId],
  );
}

// ─── Summary ───────────────────────────────────────────────────────────────

export interface CurrencyTotals {
  currency: Currency;
  held_minor: number;
  confirmed_minor: number;
  orders_count: number;
}

/**
 * Seller-side order-value totals, grouped by currency and never converted between them.
 *
 * "held" is the value of paid-but-unconfirmed orders; "confirmed" is completed orders. Neither is money in
 * the seller's hands — there are no payouts in this phase.
 */
export async function summariseProviderOrders(providerId: number): Promise<CurrencyTotals[]> {
  const rows = await masterKnex("service_orders")
    .select("currency")
    .select(
      masterKnex.raw("coalesce(sum(amount_minor) FILTER (WHERE status = 'paid'), 0)::int as held_minor"),
      masterKnex.raw("coalesce(sum(amount_minor) FILTER (WHERE status = 'completed'), 0)::int as confirmed_minor"),
      masterKnex.raw("count(*)::int as orders_count"),
    )
    .where({ provider_id: providerId })
    .groupBy("currency")
    .orderBy("currency");
  return rows as unknown as CurrencyTotals[];
}

export async function countListings(providerId: number): Promise<number> {
  const row = await listings()
    .where({ provider_id: providerId })
    .whereNull("deleted_at")
    .count<{ count: string }>("id as count")
    .first();
  return Number(row?.count ?? 0);
}

export async function countPurchases(buyerId: number): Promise<number> {
  const row = await orders().where({ buyer_id: buyerId }).count<{ count: string }>("id as count").first();
  return Number(row?.count ?? 0);
}
