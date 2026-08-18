"use client";

import { Heart } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FavouritesPage } from "../apis";
import { ALL_TAB, FAVOURITE_TABS, type FavouriteTabKey } from "../const";
import { tabCounts, totalCount } from "../utils";

/**
 * Type tabs with per-type counts, V1's shape. There is no shared Tabs primitive in
 * src/components/ui — the app's existing tab rows (see (web)/search/search-tabs)
 * are Button rows, so this matches them rather than adding a component.
 */
export function FavoriteTabs({
  active,
  counts,
  onSelect,
}: Readonly<{
  active: FavouriteTabKey;
  counts: FavouritesPage["counts"];
  onSelect: (tab: FavouriteTabKey) => void;
}>) {
  const dense = tabCounts(counts);

  return (
    <div
      role="tablist"
      aria-label="Saved item types"
      className="flex items-center gap-1.5 overflow-x-auto py-1"
    >
      <TabButton
        active={active === ALL_TAB}
        count={totalCount(counts)}
        icon={Heart}
        label="All"
        onSelect={() => onSelect(ALL_TAB)}
      />
      {FAVOURITE_TABS.map(({ type, label, icon }) => (
        <TabButton
          key={type}
          active={active === type}
          count={dense[type]}
          icon={icon}
          label={label}
          onSelect={() => onSelect(type)}
        />
      ))}
    </div>
  );
}

function TabButton({
  active,
  count,
  icon: Icon,
  label,
  onSelect,
}: Readonly<{
  active: boolean;
  count: number;
  icon: typeof Heart;
  label: string;
  onSelect: () => void;
}>) {
  return (
    <Button
      type="button"
      role="tab"
      aria-selected={active}
      size="sm"
      variant={active ? "default" : "ghost"}
      onClick={onSelect}
      className="h-9 gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-medium"
    >
      <Icon className="h-4 w-4" />
      {label}
      <Badge variant="secondary" className="ml-0.5">
        {count}
      </Badge>
    </Button>
  );
}
