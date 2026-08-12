"use client";

import { useEffect } from "react";
import { Loader2, Newspaper } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchFeedPage, setPostTypeFilter } from "../store/home-slice";
import { FEED_FILTERS } from "../const";
import { FeedPostCard } from "./feed-post-card";
import { SectionError } from "./section-error";

export function FeedTimeline() {
  const dispatch = useAppDispatch();
  const { posts, postType, feedStatus, feedError, nextCursor, feedLoadingMore } = useAppSelector(
    (state) => state.home,
  );

  useEffect(() => {
    dispatch(fetchFeedPage({ postType }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postType]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {FEED_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => dispatch(setPostTypeFilter(filter.value))}
            className={cn(
              "cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors",
              postType === filter.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70",
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
          onRetry={() => dispatch(fetchFeedPage({ postType }))}
        />
      ) : feedStatus === "loading" ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Card key={i}>
              <CardContent className="space-y-3 pt-5">
                <div className="flex gap-3">
                  <Skeleton className="size-9 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Newspaper className="h-7 w-7 text-muted-foreground/30" />
            <p className="text-sm font-medium">No posts yet</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Share an update above and it will show up here for your network.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
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
                onClick={() => dispatch(fetchFeedPage({ postType, cursor: nextCursor }))}
                className="gap-1.5"
              >
                {feedLoadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
