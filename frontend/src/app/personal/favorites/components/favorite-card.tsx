"use client";

import Link from "next/link";
import { Heart, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Favourite } from "../apis";
import { FAVOURITE_TYPE_CONFIG } from "../const";
import { favouriteHref, favouriteTitle, isUnavailable, savedOn } from "../utils";

export function FavoriteCard({
  favourite,
  removing,
  onRemove,
}: Readonly<{ favourite: Favourite; removing: boolean; onRemove: () => void }>) {
  const config = FAVOURITE_TYPE_CONFIG[favourite.item_type];
  const Icon = config?.icon ?? Heart;
  const href = favouriteHref(favourite);
  const title = favouriteTitle(favourite);
  const gone = isUnavailable(favourite);
  const date = savedOn(favourite.created_at);

  return (
    <Card className={cn("transition-shadow hover:shadow-sm", gone && "border-dashed")}>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            gone ? "bg-muted" : "bg-primary/10",
          )}
        >
          <Icon className={cn("h-5 w-5", gone ? "text-muted-foreground" : "text-primary")} />
        </div>

        <div className="min-w-0 flex-1">
          {href ? (
            <Link href={href} className="block truncate text-sm font-medium hover:text-primary">
              {title}
            </Link>
          ) : (
            // No link: either the target is gone, or its type has no public detail
            // route yet. Never the raw item_id — that was V1's bug.
            <p className={cn("truncate text-sm font-medium", gone && "text-muted-foreground")}>
              {title}
            </p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {gone ? "This item has been removed" : config?.label}
            {date && ` · saved ${date}`}
          </p>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove ${title} from favourites`}
          disabled={removing}
          onClick={onRemove}
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
        >
          {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      </CardContent>
    </Card>
  );
}
