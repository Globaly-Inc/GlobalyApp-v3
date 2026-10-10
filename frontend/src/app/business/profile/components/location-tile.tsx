"use client";

import { MapPin, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { joinParts, type ProfileLocation } from "@/app/(web)/components/profile/profile-data";

/**
 * One location in the portal's Locations grid. The wrapper owns the rise-in animation and the
 * pencil (nested buttons are invalid); the inner button owns the hover lift, so the animation's
 * transform never fights it.
 */
export function LocationTile({
  location: loc, index, primary, selected, onSelect, onEdit,
}: Readonly<{
  location: ProfileLocation;
  index: number;
  /** The business's own address — tinted, solid pin, "Head office" chip. */
  primary: boolean;
  selected: boolean;
  onSelect: () => void;
  onEdit?: () => void;
}>) {
  const contact = joinParts(loc.phone, loc.email);
  return (
    <div className="group/loc relative animate-row-rise" style={{ animationDelay: `${index * 40}ms` }}>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex size-full items-start gap-2.5 rounded-xl border p-3 text-left transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md",
          primary ? "border-primary/35 bg-linear-120 from-primary/10 to-card to-70%" : "bg-card",
          selected && "border-primary ring-2 ring-primary ring-inset",
        )}
      >
        <span className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-[10px]",
          primary ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
        )}>
          <MapPin className="size-4" />
        </span>
        <span className={cn("flex min-w-0 flex-1 flex-col gap-0.5", onEdit && "pr-7")}>
          <span className="truncate text-[13.5px] font-semibold text-foreground" title={loc.name}>{loc.name}</span>
          {loc.address && (
            <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">{joinParts(loc.address, loc.state, loc.country)}</span>
          )}
          {contact && <span className="truncate text-xs text-muted-foreground" title={contact}>{contact}</span>}
          {primary && (
            <span className="mt-1.5 w-fit rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Head office</span>
          )}
        </span>
      </button>

      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${loc.name}`}
          className="absolute right-2 top-2 flex size-7 cursor-pointer items-center justify-center rounded-md border border-border bg-background text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/loc:opacity-100"
        >
          <Pencil className="size-3.5" />
        </button>
      )}
    </div>
  );
}
