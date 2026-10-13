"use client";

import { ChevronRight, ExternalLink, Images, Landmark, MoreHorizontal, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import type { CountrySummary } from "../apis/types";
import { CitiesDropdown } from "./cities-dropdown";

/** Column headers for the rows below — kept beside the row so the two can't drift apart. */
export const COUNTRY_COLUMNS = [
  { label: "Country" },
  { label: "Code", className: "hidden md:table-cell" },
  { label: "Cities", className: "hidden md:table-cell" },
  { label: "Media", className: "hidden lg:table-cell" },
  { label: "Active", className: "w-px" },
  { label: "Featured", className: "hidden w-px sm:table-cell" },
  { label: "Actions", className: "w-px", srOnly: true },
] as const;

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
    <TableRow>
      <TableCell primary>
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-xl">{country.flag_emoji ?? "🏳️"}</span>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{country.name}</p>
            <p className="truncate text-xs text-muted-foreground">/country/{country.slug}</p>
            {/* Fallbacks for the columns hidden on narrow screens. */}
            <p className="truncate text-xs text-muted-foreground md:hidden">
              <span className="font-mono">{country.iso2}</span>
              {country.capital && <> · Capital: {country.capital}</>}
            </p>
            <div className="md:hidden">
              <CitiesDropdown countryId={country.id} cityCount={country.city_count} />
            </div>
            <p className="truncate text-xs text-muted-foreground lg:hidden">
              {country.thumbnail_image_url ? "Thumbnail set" : "No thumbnail"} · {country.gallery_images.length} gallery image
              {country.gallery_images.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </TableCell>

      <TableCell className="hidden md:table-cell">
        <Badge variant="outline" className="font-mono">{country.iso2}</Badge>
      </TableCell>

      <TableCell className="hidden md:table-cell">
        {country.capital && (
          <p className="flex items-center gap-1 text-foreground">
            <Landmark className="h-3 w-3 text-muted-foreground" />
            {country.capital}
          </p>
        )}
        <CitiesDropdown countryId={country.id} cityCount={country.city_count} />
      </TableCell>

      <TableCell className="hidden lg:table-cell">
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
      </TableCell>

      <TableCell>
        <Switch checked={country.is_active} onCheckedChange={(v) => onToggle("is_active", v)} aria-label={`Active: ${country.name}`} />
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <Switch checked={country.is_featured} onCheckedChange={(v) => onToggle("is_featured", v)} aria-label={`Featured: ${country.name}`} />
      </TableCell>

      <TableCell>
        <div className="flex items-center justify-end gap-1.5">
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${country.name}`} onClick={onEdit}>
            <ChevronRight />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`More actions for ${country.name}`}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* The Featured column is hidden below sm — same toggle, reachable from the menu. */}
              <DropdownMenuItem className="sm:hidden" onClick={() => onToggle("is_featured", !country.is_featured)}>
                <Star className="mr-2 h-4 w-4" /> {country.is_featured ? "Remove from featured" : "Feature country"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open(`/country/${country.slug}`, "_blank", "noreferrer")}>
                <ExternalLink className="mr-2 h-4 w-4" /> View public page
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}
