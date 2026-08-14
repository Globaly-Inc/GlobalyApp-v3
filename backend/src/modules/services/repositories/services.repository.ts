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
  /** The category's lucide icon name. Drives the per-category cover when a listing has no image. */
  category_icon: string | null;
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
  cancelled_at: Date | null;
  refunded_at: Date | null;
  // ponytail: `completed_at`, `buyer_confirmed` and `provider_confirmed` still exist on the table but are
  // deliberately absent here. Dual confirmation was removed, so nothing writes them and nothing should read
  // them; the columns stay so the historical orders that did complete keep their record. Drop them in a
  // migration once no such rows matter.
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
  message_count: number;
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
      "cat.icon as category_icon",
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

/**
 * What a person may offer.
 *
 * `scope: "personal"` is the whole of the "fixed categories" rule: a seller picks from this list and cannot
 * add to it, and the list is administered at /admin/platform/categories. The other scope in this table is
 * the business default-services taxonomy, which has nothing to do with Earn and must not appear in a
 * seller's form. Active only, so retiring one in admin hides it from new listings without touching old ones.
 */
const PERSONAL_SCOPE = { scope: "personal", is_active: true } as const;

export async function listCategories(): Promise<CategoryRow[]> {
  return masterKnex("service_categories")
    .select("id", "slug", "name", "description", "icon")
    .where(PERSONAL_SCOPE)
    .whereNull("deleted_at")
    .orderBy(["sort_order", "name"]);
}

/** Used to validate a submitted category_id, so the scope filter here is what refuses a business one. */
export async function findCategoryById(id: number): Promise<CategoryRow | null> {
  const row = await masterKnex("service_categories")
    .select("id", "slug", "name", "description", "icon")
    .where({ id, ...PERSONAL_SCOPE })
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
      "cat.icon as category_icon",
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
      "cat.icon as category_icon",
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
  /** The reviewer bought this service. The signal that survived removing the purchase gate. */
  is_verified_purchase: boolean;
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
      masterKnex.raw("(r.order_id IS NOT NULL) as is_verified_purchase"),
      masterKnex.raw(`${fullName("u")} as reviewer_name`),
    )
    // Verified purchases first, so the reviews that cost something to write lead.
    .orderBy("is_verified_purchase", "desc")
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
      // Subquery rather than a join + group by: the review leftJoin above would multiply the message rows.
      db.raw("(SELECT count(*)::int FROM service_order_messages m WHERE m.order_id = o.id) as message_count"),
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
  /** Null when the reviewer never bought — reviews are open to any signed-in user. */
  order_id: number | null;
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

/** The one-per-person-per-listing guard, backed by a unique index so a race loses cleanly. */
export async function findReviewByReviewer(
  listingId: number,
  reviewerId: number,
  db: Knex | Knex.Transaction = masterKnex,
): Promise<ReviewRow | null> {
  const row = await db<ReviewRow>("service_reviews").where({ listing_id: listingId, reviewer_id: reviewerId }).first();
  return row ?? null;
}

/**
 * The reviewer's most recent settled order for this listing, if any.
 *
 * Attached to the review so it reads as a verified purchase. Anything that reached `paid` counts — the money
 * changed hands, which is the claim being made. `refunded` counts too: they bought it and it went wrong,
 * which is exactly the review a reader wants to see.
 */
export async function findSettledOrderForReviewer(
  listingId: number,
  buyerId: number,
  db: Knex | Knex.Transaction = masterKnex,
): Promise<{ id: number } | null> {
  const row = await db("service_orders")
    .select("id")
    .where({ listing_id: listingId, buyer_id: buyerId })
    .whereNotIn("status", ["pending_payment", "cancelled"])
    .orderBy("id", "desc")
    .first();
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

// ─── Order messages ────────────────────────────────────────────────────────

export interface OrderMessageRow {
  id: number;
  order_id: number;
  sender_id: number;
  body: string;
  created_at: Date;
  sender_name: string;
}

const messageQuery = () =>
  masterKnex("service_order_messages as m")
    .join("platform_users as u", "u.id", "m.sender_id")
    .select("m.id", "m.order_id", "m.sender_id", "m.body", "m.created_at", masterKnex.raw(`${fullName("u")} as sender_name`));

/** Oldest first — a conversation reads top to bottom. */
export async function listOrderMessages(orderId: number): Promise<OrderMessageRow[]> {
  return messageQuery().where("m.order_id", orderId).orderBy("m.created_at", "asc") as unknown as Promise<
    OrderMessageRow[]
  >;
}

export async function insertOrderMessage(data: {
  order_id: number;
  sender_id: number;
  body: string;
}): Promise<OrderMessageRow> {
  const [inserted] = await masterKnex("service_order_messages").insert(data).returning("id");
  const row = await messageQuery().where("m.id", inserted.id).first();
  return row as OrderMessageRow;
}

// ─── Summary ───────────────────────────────────────────────────────────────

export interface CurrencyTotals {
  currency: Currency;
  held_minor: number;
  refunded_minor: number;
  orders_count: number;
}

/**
 * Seller-side order-value totals, grouped by currency and never converted between them.
 *
 * "held" is the value of paid orders. There is no "confirmed" bucket any more: dual confirmation was removed,
 * so no order reaches `completed` and a column reading 0 forever would be a lie about the flow rather than a
 * fact about the seller. `refunded` replaces it — the one thing that actually moves value back out.
 *
 * Neither figure is money in the seller's hands; there are no payouts in this phase.
 */
export async function summariseProviderOrders(providerId: number): Promise<CurrencyTotals[]> {
  const rows = await masterKnex("service_orders")
    .select("currency")
    .select(
      masterKnex.raw("coalesce(sum(amount_minor) FILTER (WHERE status = 'paid'), 0)::int as held_minor"),
      masterKnex.raw("coalesce(sum(amount_minor) FILTER (WHERE status = 'refunded'), 0)::int as refunded_minor"),
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
