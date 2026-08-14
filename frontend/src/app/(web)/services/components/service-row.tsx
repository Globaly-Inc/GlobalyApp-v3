"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PublicService } from "@/app/personal/earn/services/apis";
import { CategoryCover } from "@/app/personal/earn/services/components/category-cover";
import { formatDate, formatMoney } from "@/app/personal/earn/services/utils";

/**
 * A result row: details on the left, price and the call to action in a bordered right-hand panel.
 *
 * The panel is where the eye lands, so the price and the action live together rather than the price being
 * buried in the body text.
 */
export function ServiceRow({ service }: Readonly<{ service: PublicService }>) {
  const place = [service.city_name, service.country_name].filter(Boolean).join(", ");

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-sm sm:flex-row">
      <div className="flex flex-1 gap-3 p-4">
        {/* The cover if there is one, otherwise this category's wash — see CategoryCover. */}
        <CategoryCover
          coverUrl={service.cover_url}
          categorySlug={service.category_slug}
          categoryName={service.category_name}
          categoryIcon={service.category_icon}
          sizes="48px"
          className="size-12 shrink-0 rounded-md"
          iconClassName="size-5"
        />

        <div className="min-w-0 space-y-1">
          <Link href={`/service/${service.id}`} className="block">
            <h3 className="truncate text-lg font-semibold text-foreground hover:text-primary">{service.title}</h3>
          </Link>

          <p className="truncate text-sm text-muted-foreground">
            {service.provider_name}
            {place ? ` · ${place}` : ""}
          </p>

          {/* The reference's tag row. Only facts we actually hold — no invented badges. */}
          <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-primary">
            <span>{service.category_name}</span>
            {service.total_reviews > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                  {service.avg_rating.toFixed(1)} ({service.total_reviews})
                </span>
              </>
            )}
            {service.total_orders > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>{service.total_orders} completed</span>
              </>
            )}
          </p>

          <p className="text-xs text-muted-foreground">Listed {formatDate(service.created_at)}</p>
        </div>
      </div>

      <div className="flex shrink-0 flex-row items-center justify-between gap-3 border-t border-border bg-muted/20 p-4 sm:w-52 sm:flex-col sm:items-stretch sm:justify-center sm:border-l sm:border-t-0">
        <div className="sm:text-right">
          <p className="text-xs text-muted-foreground">Price</p>
          {/* Always the listing's own currency. */}
          <p className="text-lg font-bold tabular-nums text-foreground">
            {formatMoney(service.price_minor, service.currency)}
          </p>
        </div>
        <Button className="sm:w-full" render={<Link href={`/service/${service.id}`}>View service</Link>} />
      </div>
    </div>
  );
}
