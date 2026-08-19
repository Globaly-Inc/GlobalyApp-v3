"use client";

import { useEffect } from "react";
import { Loader2, Newspaper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchFeedPage, setPostTypeFilter } from "../store/feed-slice";
import { FEED_FILTERS } from "../const";
import { FeedPostCard } from "./feed-post-card";
import { SectionError } from "./section-error";

/**
 * V1's FeedTimeline: space-y-4 around the list, pill filters at px-3 py-1.5 text-sm, and py-16 centred
 * loading and empty states rather than skeleton cards.
 *
 * `businessId` names the portal this timeline belongs to — null in the personal portal, the active
 * business elsewhere. It goes to the server, which decides what the context may see; nothing here filters
 * posts the client was not supposed to receive in the first place.
 */
export function FeedTimeline({
  businessId = null,
  emptyHint = "Share an update above and it will show up here for your network.",
}: {
  businessId?: number | null;
  emptyHint?: string;
}) {
  const dispatch = useAppDispatch();
  const { posts, postType, feedStatus, feedError, nextCursor, feedLoadingMore } = useAppSelector(
    (state) => state.feed,
  );

  useEffect(() => {
    dispatch(fetchFeedPage({ postType, businessId }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postType, businessId]);

  return (
    <div className="space-y-4">
      {/* Pill-style filters */}
      <div className="flex gap-1.5 overflow-x-auto py-1">
        {FEED_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => dispatch(setPostTypeFilter(filter.value))}
            className={cn(
              "cursor-pointer px-3 py-1.5 rounded-full text-sm font-medium transition-all border whitespace-nowrap flex-shrink-0",
              postType === filter.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted hover:border-border",
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Failure is contained to this region — the hero and the rail keep rendering. */}
      {feedStatus === "failed" ? (
        <SectionError
          message={feedError ?? "Couldn't load the feed."}
          onRetry={() => dispatch(fetchFeedPage({ postType, businessId }))}
        />
      ) : feedStatus === "loading" ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Newspaper className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">No posts yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {emptyHint}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            // is_mine comes from the server — the client never guesses who wrote a post.
            <FeedPostCard key={post.id} post={post} currentUserIsAuthor={post.is_mine} />
          ))}

          {nextCursor && (
            <div className="flex justify-center pt-1">
              <Button
                variant="outline"
                size="sm"
                disabled={feedLoadingMore}
                onClick={() => dispatch(fetchFeedPage({ postType, businessId, cursor: nextCursor }))}
                className="gap-1.5"
              >
                {feedLoadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
