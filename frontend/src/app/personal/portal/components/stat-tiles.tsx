"use client";

import { Heart, MessageSquare, GraduationCap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatNumber } from "../utils";
import type { StatTilesProps } from "../types";

export function StatTiles({ favorites, enquiries, completionPct }: StatTilesProps) {
  // The enquiries tile shows the TRUE total. V2 sliced the list to 5 before counting it, so the tile
  // silently capped at 5.
  const tiles = [
    { icon: Heart, label: "Favorites", value: formatNumber(favorites), tint: "bg-rose-500/10 text-rose-600" },
    { icon: MessageSquare, label: "Enquiries", value: formatNumber(enquiries), tint: "bg-blue-500/10 text-blue-600" },
    {
      icon: GraduationCap,
      label: "Profile",
      value: `${completionPct}%`,
      tint: "bg-violet-500/10 text-violet-600",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardContent className="flex flex-col items-start gap-1.5 px-3 py-3">
            <span className={`inline-flex rounded-md p-1.5 ${tile.tint}`}>
              <tile.icon className="h-3.5 w-3.5" />
            </span>
            <span className="text-lg font-bold leading-none">{tile.value}</span>
            <span className="text-[11px] text-muted-foreground">{tile.label}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
