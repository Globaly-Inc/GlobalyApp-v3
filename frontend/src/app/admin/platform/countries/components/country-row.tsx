"use client";

import { ExternalLink, ChevronRight, Images, Landmark, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { CountrySummary } from "../apis/types";
import { CitiesDropdown } from "./cities-dropdown";

export function CountryRow({
  country,
  onToggle,
  onEdit,
  onDelete,
}: Readonly<{
  country: CountrySummary;
  onToggle: (field: "is_active" | "is_featured", value: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}>) {
  return (
    <div className="grid grid-cols-[2fr_0.8fr_1.3fr_1.2fr_0.7fr_0.7fr_0.9fr] items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xl shrink-0">{country.flag_emoji ?? "🏳️"}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{country.name}</p>
          <p className="truncate text-xs text-muted-foreground">/country/{country.slug}</p>
        </div>
      </div>

      <div>
        <Badge variant="outline" className="font-mono">{country.iso2}</Badge>
      </div>

      <div className="text-sm">
        {country.capital && (
          <p className="flex items-center gap-1 text-foreground">
            <Landmark className="h-3 w-3 text-muted-foreground" />
            {country.capital}
          </p>
        )}
        <CitiesDropdown countryId={country.id} cityCount={country.city_count} />
      </div>

      <div className="flex items-center gap-2">
        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-muted">
          {country.thumbnail_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={country.thumbnail_image_url} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        {country.gallery_images.length > 0 && (
          <Badge variant="outline" className="gap-1 text-xs"><Images className="h-3 w-3" />{country.gallery_images.length}</Badge>
        )}
      </div>

      <Switch checked={country.is_active} onCheckedChange={(v) => onToggle("is_active", v)} />
      <Switch checked={country.is_featured} onCheckedChange={(v) => onToggle("is_featured", v)} />

      <div className="flex items-center justify-end gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" nativeButton={false} render={<a href={`/country/${country.slug}`} target="_blank" rel="noreferrer" />}>
          <ExternalLink className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
