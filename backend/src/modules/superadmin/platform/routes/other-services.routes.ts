// Superadmin oversight of Earn → My Services, exposed as "Other Services".
//
// Named other-services because "Services" is already taken in superadmin by the Service Categories screen
// (Platform → Categories → Service Categories); two things called Services in one admin is a trap.
//
// Read-only. What a seller may offer is constrained by the category list an admin controls
// (Platform → Categories → Service Categories), not by per-listing moderation: pausing someone's listing or
// forcing a refund are real powers that need their own audit trail and permission story.
//
// Lives in the platform module, so it inherits its super_admin / data_admin guard.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { PaginationSchema, paginationToOffset, buildPaginatedResponse } from "../../../../shared/pagination.js";
import { ORDER_STATUSES } from "../../../other-services/schemas/services.schema.js";

const ListingQuery = z.object({
  search: z.string().trim().max(200).optional(),
  category_id: z.coerce.number().int().positive().optional(),
  // "paused" is is_active=false; "deleted" is the soft-delete tombstone, which admins should still be able
  // to see — it is the only way to look into a listing that was pulled after an order.
  status: z.enum(["active", "paused", "deleted"]).optional(),
});

const OrderQuery = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
});

const fullName = (alias: string) => `trim(concat(${alias}.first_name, ' ', coalesce(${alias}.last_name, '')))`;

export async function adminOtherServicesRoutes(app: FastifyInstance) {
  app.get("/other-services", async (req, reply) => {
    const filters = ListingQuery.parse(req.query);
    const page = PaginationSchema.parse(req.query);
    const { limit, offset } = paginationToOffset(page);

    const base = () => {
      const q = masterKnex("other_service_listings as l")
        .join("other_service_categories as cat", "cat.id", "l.category_id")
        .join("platform_users as p", "p.id", "l.provider_id");
      if (filters.category_id) q.where("l.category_id", filters.category_id);
      if (filters.status === "active") q.where("l.is_active", true).whereNull("l.deleted_at");
      if (filters.status === "paused") q.where("l.is_active", false).whereNull("l.deleted_at");
      if (filters.status === "deleted") q.whereNotNull("l.deleted_at");
      if (filters.search) {
        const term = `%${filters.search}%`;
        q.where((w) => w.whereILike("l.title", term).orWhereILike("p.email", term));
      }
      return q;
    };

    const [rows, countRow] = await Promise.all([
      base()
        .select(
          "l.id",
          "l.title",
          "l.price_minor",
          "l.currency",
          "l.is_active",
          "l.avg_rating",
          "l.total_reviews",
          "l.total_orders",
          "l.created_at",
          "l.deleted_at",
          // An admin looking into a listing should be able to read what is actually being sold.
          "l.description",
          "cat.name as category_name",
          "p.id as provider_id",
          "p.email as provider_email",
          masterKnex.raw(`${fullName("p")} as provider_name`),
        )
        .orderBy("l.created_at", "desc")
        .limit(limit)
        .offset(offset),
      base().count<{ count: string }>("l.id as count").first(),
    ]);

    return reply.send(buildPaginatedResponse(rows, Number(countRow?.count ?? 0), page));
  });

  app.get("/other-services/orders", async (req, reply) => {
    const filters = OrderQuery.parse(req.query);
    const page = PaginationSchema.parse(req.query);
    const { limit, offset } = paginationToOffset(page);

    const base = () => {
      const q = masterKnex("other_service_orders as o")
        .join("other_service_listings as l", "l.id", "o.listing_id")
        .join("platform_users as b", "b.id", "o.buyer_id")
        .join("platform_users as pr", "pr.id", "o.provider_id");
      if (filters.status) q.where("o.status", filters.status);
      return q;
    };

    const [rows, countRow] = await Promise.all([
      base()
        .select(
          "o.id",
          "o.amount_minor",
          "o.currency",
          "o.status",
          "o.created_at",
          "o.paid_at",
          "o.completed_at",
          "o.payment_provider",
          "o.payment_refund_id",
          "l.title as listing_title",
          masterKnex.raw(`${fullName("b")} as buyer_name`),
          masterKnex.raw(`${fullName("pr")} as provider_name`),
        )
        .orderBy("o.created_at", "desc")
        .limit(limit)
        .offset(offset),
      base().count<{ count: string }>("o.id as count").first(),
    ]);

    return reply.send(buildPaginatedResponse(rows, Number(countRow?.count ?? 0), page));
  });

  /** Headline counts for the screen's top strip, per currency so nothing is summed across them. */
  app.get("/other-services/stats", async (_req, reply) => {
    const [listings, orders] = await Promise.all([
      masterKnex("other_service_listings")
        .select(
          masterKnex.raw("count(*) FILTER (WHERE deleted_at IS NULL)::int as total"),
          masterKnex.raw("count(*) FILTER (WHERE is_active AND deleted_at IS NULL)::int as active"),
          masterKnex.raw("count(*) FILTER (WHERE NOT is_active AND deleted_at IS NULL)::int as paused"),
        )
        .first(),
      masterKnex("other_service_orders")
        .select("currency")
        .select(
          masterKnex.raw("count(*)::int as orders_count"),
          masterKnex.raw("coalesce(sum(amount_minor) FILTER (WHERE status = 'paid'), 0)::int as held_minor"),
          masterKnex.raw("coalesce(sum(amount_minor) FILTER (WHERE status = 'completed'), 0)::int as completed_minor"),
        )
        .groupBy("currency")
        .orderBy("currency"),
    ]);

    return reply.send({ listings, orders });
  });
}
