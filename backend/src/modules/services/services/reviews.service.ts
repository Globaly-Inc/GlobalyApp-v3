// Buyer reviews. Sellers never review; a buyer reviews once, and only after the order closed.

import { ConflictError, ForbiddenError, NotFoundError } from "../../../shared/errors.js";
import { masterKnex } from "../../../core/db/master-pool.js";
import { withTransaction } from "../../../core/db/transaction.js";
import * as repo from "../repositories/services.repository.js";
import type { CreateReviewInput } from "../schemas/services.schema.js";

export interface ReviewDto {
  id: number;
  order_id: number;
  listing_id: number;
  rating: number;
  comment: string | null;
  created_at: string;
}

const toDto = (row: repo.ReviewRow): ReviewDto => ({
  id: row.id,
  order_id: row.order_id,
  listing_id: row.listing_id,
  rating: row.rating,
  comment: row.comment,
  created_at: new Date(row.created_at).toISOString(),
});

export async function getForOrder(orderId: number, userId: number): Promise<ReviewDto | null> {
  const order = await repo.findOrderById(orderId);
  if (!order) throw new NotFoundError("Order not found");
  if (order.buyer_id !== userId && order.provider_id !== userId) throw new NotFoundError("Order not found");
  const row = await repo.findReviewByOrder(orderId);
  return row ? toDto(row) : null;
}

/**
 * Post the buyer's review and recompute the listing's aggregates in the same transaction.
 *
 * V2 inserted the review and stopped: no trigger, no function and no follow-up write ever touched
 * avg_rating or total_reviews, so every listing showed 0 stars however many reviews it had. Recomputing
 * here — from the rows, inside the same transaction — means the two can never disagree.
 */
export async function create(orderId: number, userId: number, input: CreateReviewInput): Promise<ReviewDto> {
  return withTransaction(masterKnex, async (trx) => {
    const order = await repo.lockOrder(orderId, trx);
    if (!order) throw new NotFoundError("Order not found");

    // Providers get no review form at any status, and a stranger is told nothing about the order.
    if (order.provider_id === userId) throw new ForbiddenError("Only the buyer can review an order");
    if (order.buyer_id !== userId) throw new NotFoundError("Order not found");

    if (order.status !== "completed") {
      throw new ConflictError("You can review once both parties have confirmed completion");
    }

    // The unique index on order_id is the real guarantee; this turns the race loser into a clear 409.
    if (await repo.findReviewByOrder(orderId, trx)) {
      throw new ConflictError("You have already reviewed this order");
    }

    const review = await repo.insertReview(
      {
        order_id: orderId,
        listing_id: order.listing_id,
        reviewer_id: userId,
        rating: input.rating,
        comment: input.comment ?? null,
      },
      trx,
    );

    await repo.recomputeListingRating(order.listing_id, trx);
    return toDto(review);
  });
}
