// Reviews. Open to any signed-in user — buying is not required.
//
// The purchase gate used to be the integrity mechanism: only a buyer whose order had closed could review, so
// every review came from someone who had paid. That gate is gone by product decision, which means the rating
// is now writable by anyone with an account. Three things replace it, and none of them is as strong:
//
//   1. One review per person per listing — a unique index, so a race loses cleanly rather than double-posting.
//   2. You cannot review your own listing.
//   3. A review written by someone who actually bought carries `is_verified_purchase`, and the UI says so.
//
// Point 3 is the one that matters to a reader: the signal moved from "all reviews are trustworthy" to "you
// can see which ones are".

import { ConflictError, ForbiddenError, NotFoundError } from "../../../shared/errors.js";
import { masterKnex } from "../../../core/db/master-pool.js";
import { withTransaction } from "../../../core/db/transaction.js";
import * as repo from "../repositories/services.repository.js";
import type { CreateReviewInput } from "../schemas/services.schema.js";

export interface ReviewDto {
  id: number;
  order_id: number | null;
  listing_id: number;
  rating: number;
  comment: string | null;
  is_verified_purchase: boolean;
  created_at: string;
}

const toDto = (row: repo.ReviewRow): ReviewDto => ({
  id: row.id,
  order_id: row.order_id,
  listing_id: row.listing_id,
  rating: row.rating,
  comment: row.comment,
  is_verified_purchase: row.order_id !== null,
  created_at: new Date(row.created_at).toISOString(),
});

/** What the signed-in viewer may do on this listing — so the page can render the right thing at once. */
export async function myReviewFor(listingId: number, userId: number) {
  const listing = await repo.findListingById(listingId);
  if (!listing || listing.deleted_at) throw new NotFoundError("Service not found");

  const mine = await repo.findReviewByReviewer(listingId, userId);
  return {
    can_review: listing.provider_id !== userId && mine === null,
    /** Why not, when they can't — so the UI never has to guess between "yours" and "already reviewed". */
    reason: listing.provider_id === userId ? ("own_listing" as const) : mine ? ("already_reviewed" as const) : null,
    review: mine ? toDto(mine) : null,
  };
}

/**
 * Post a review and recompute the listing's aggregates in the same transaction.
 *
 * V2 inserted the review and stopped: no trigger, no function and no follow-up write ever touched avg_rating
 * or total_reviews, so every listing showed 0 stars however many reviews it had. Recomputing here — from the
 * rows, inside the same transaction — means the two can never disagree.
 */
export async function create(listingId: number, userId: number, input: CreateReviewInput): Promise<ReviewDto> {
  return withTransaction(masterKnex, async (trx) => {
    const listing = await repo.findListingById(listingId, trx);
    if (!listing || listing.deleted_at) throw new NotFoundError("Service not found");

    // Rating your own listing is not a review, it is an advert.
    if (listing.provider_id === userId) {
      throw new ForbiddenError("You cannot review your own service");
    }

    // The unique index is the real guarantee; this turns the race loser into a sentence instead of a 500.
    if (await repo.findReviewByReviewer(listingId, userId, trx)) {
      throw new ConflictError("You have already reviewed this service");
    }

    // Attach an order if they bought — that is what makes it a verified purchase. Not required.
    const order = await repo.findSettledOrderForReviewer(listingId, userId, trx);

    const review = await repo.insertReview(
      {
        order_id: order?.id ?? null,
        listing_id: listingId,
        reviewer_id: userId,
        rating: input.rating,
        comment: input.comment ?? null,
      },
      trx,
    );

    await repo.recomputeListingRating(listingId, trx);
    return toDto(review);
  });
}
