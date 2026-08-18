"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Heart, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { ALL_TAB, FAVOURITE_TYPE_CONFIG, type FavouriteTabKey } from "../const";
import { fetchFavourites, removeFavourite, setTab } from "../store/favorites-slice";
import { FavoriteCard } from "./favorite-card";
import { FavoriteTabs } from "./favorite-tabs";

export function FavoritesView() {
  const dispatch = useAppDispatch();
  const { items, counts, tab, status, removing, error } = useAppSelector(
    (state) => state.favorites,
  );

  // Strict Mode double-invokes effects in dev; keying the ref on the tab stops the
  // first mount firing two identical requests while still refetching on tab change.
  const fetchedRef = useRef<FavouriteTabKey | null>(null);
  useEffect(() => {
    if (fetchedRef.current === tab) return;
    fetchedRef.current = tab;
    dispatch(fetchFavourites(tab === ALL_TAB ? {} : { item_type: tab }));
  }, [dispatch, tab]);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Saved items</h1>
        <p className="mt-1 text-muted-foreground">
          Courses, institutions, agents, scholarships and more that you have saved.
        </p>
      </div>

      <FavoriteTabs
        active={tab}
        counts={counts}
        onSelect={(next) => dispatch(setTab(next))}
      />

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}

      {status === "loading" ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : items.length > 0 ? (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((favourite) => (
            <FavoriteCard
              key={favourite.id}
              favourite={favourite}
              removing={removing.includes(favourite.id)}
              onRemove={() => dispatch(removeFavourite(favourite.id))}
            />
          ))}
        </div>
      ) : (
        <EmptyState tab={tab} />
      )}
    </div>
  );
}

function EmptyState({ tab }: Readonly<{ tab: FavouriteTabKey }>) {
  const plural = tab === ALL_TAB ? "items" : FAVOURITE_TYPE_CONFIG[tab].plural;
  return (
    <div className="py-16 text-center">
      <Heart className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
      <p className="mb-4 text-muted-foreground">No saved {plural} yet</p>
      <Link href="/search">
        <Button type="button" variant="outline">
          Browse {plural}
        </Button>
      </Link>
    </div>
  );
}
