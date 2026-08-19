"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StatTile } from "../types";

/**
 * V1's stats grid: cards on gap-3, each p-4 with a w-8 h-8 rounded-lg tinted icon, a text-lg font-bold
 * value and a text-xs label.
 *
 * Personal runs three centred tiles in one row; business runs four in a 2×2, left-aligned — both are V1's
 * own layouts, so the grid class and the alignment come from the caller.
 */
export function StatTiles({
  stats,
  columns = 3,
  align = "center",
}: {
  stats: StatTile[];
  columns?: 2 | 3;
  align?: "center" | "left";
}) {
  const centred = align === "center";

  return (
    <div className={cn("grid gap-3", columns === 2 ? "grid-cols-2" : "grid-cols-3")}>
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className={cn("p-4", centred && "text-center")}>
            <div
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center mb-2",
                centred && "mx-auto",
                stat.color,
              )}
            >
              <stat.icon className="h-4 w-4" />
            </div>
            <p className="text-lg font-bold">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
