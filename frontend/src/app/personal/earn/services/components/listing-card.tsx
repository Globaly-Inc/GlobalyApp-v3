"use client";

import Link from "next/link";
import Image from "next/image";
import { ExternalLink, Pause, Pencil, Play, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Listing } from "../apis";
import { formatMoney } from "../utils";

export function ListingCard({
  listing,
  busy,
  onTogglePause,
  onDelete,
}: Readonly<{
  listing: Listing;
  busy: boolean;
  onTogglePause: (listing: Listing) => void;
  onDelete: (listing: Listing) => void;
}>) {
  const openOrders = listing.open_orders_count;

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      {listing.cover_url && (
        // 16:9 so a row of cards lines up regardless of the uploaded aspect ratio.
        <div className="relative aspect-video w-full bg-muted">
          <Image
            src={listing.cover_url}
            alt={listing.title}
            fill
            className="object-cover"
            sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
            // A signed URL can expire between render and load; a broken frame is worse than none.
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
            }}
            unoptimized
          />
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 font-semibold text-foreground">{listing.title}</h3>
          <Badge
            variant="secondary"
            className={cn(
              "shrink-0",
              listing.is_active
                ? "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300"
                : "bg-muted text-muted-foreground",
            )}
          >
            {listing.is_active ? "Active" : "Paused"}
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground">
          {/* The label travels with the row, so an admin renaming a category shows up here immediately. */}
          {listing.category_name}
          {listing.city_name ? ` · ${listing.city_name}` : ""}
          {listing.country_name ? `, ${listing.country_name}` : ""}
        </p>

        {/* Always the listing's own currency — never converted to the viewer's. */}
        <p className="text-lg font-semibold tabular-nums text-foreground">
          {formatMoney(listing.price_minor, listing.currency)}
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            {listing.avg_rating.toFixed(1)}
          </span>
          <span>
            {listing.total_reviews} {listing.total_reviews === 1 ? "review" : "reviews"}
          </span>
          <span>
            {listing.total_orders} {listing.total_orders === 1 ? "order" : "orders"}
          </span>
        </div>

        {openOrders > 0 && (
          // The same number the delete guard reads, so a refusal is never a surprise.
          <Badge variant="secondary" className="w-fit bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300">
            {openOrders} {openOrders === 1 ? "order" : "orders"} in progress
          </Badge>
        )}

        <div className="mt-auto flex items-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            render={
              <Link href={`/personal/earn/services/${listing.id}/edit`}>
                <Pencil />
                Edit
              </Link>
            }
          />
          <Button
            variant="outline"
            size="icon-sm"
            disabled={busy}
            onClick={() => onTogglePause(listing)}
            aria-label={listing.is_active ? "Pause listing" : "Resume listing"}
          >
            {listing.is_active ? <Pause /> : <Play />}
          </Button>
          {/* Now a real destination — the public marketplace exists. Only meaningful while the listing is
              actually listed, so a paused one doesn't offer a link to a 404. */}
          {listing.is_active && (
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="View public page"
              title="View how buyers see it"
              render={<Link href={`/service/${listing.id}`} target="_blank" rel="noopener noreferrer" />}
            >
              <ExternalLink />
            </Button>
          )}
          <Button
            variant="outline"
            size="icon-sm"
            disabled={busy}
            onClick={() => onDelete(listing)}
            aria-label="Delete listing"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </div>
  );
}
