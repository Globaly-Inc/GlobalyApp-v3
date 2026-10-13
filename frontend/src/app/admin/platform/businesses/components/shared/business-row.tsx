"use client";

import { Building2, EyeOff, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "../../const";
import type { Business, BusinessStatus } from "../../apis/types";
import { BusinessRowActions, type BusinessRowActionHandlers } from "./business-row-actions";

const STATUS_VARIANT: Record<BusinessStatus, "secondary" | "warning" | "info" | "success" | "destructive"> = {
  unverified: "secondary",
  claim_pending: "warning",
  claimed: "info",
  verified: "success",
  suspended: "secondary",
  rejected: "destructive",
};

/** Column headers for the rows below — kept beside the row so the two can't drift apart. */
export const BUSINESS_COLUMNS = [
  { label: "Business" },
  { label: "Type", className: "hidden lg:table-cell" },
  { label: "Owner", className: "hidden md:table-cell" },
  { label: "Branches", className: "hidden 2xl:table-cell", numeric: true },
  { label: "Services", className: "hidden 2xl:table-cell", numeric: true },
  { label: "Public views", className: "hidden 2xl:table-cell", numeric: true },
  { label: "Created", className: "hidden md:table-cell" },
  { label: "Status" },
  { label: "Actions", className: "w-px", srOnly: true },
] as const;

function ownerName(b: Business): string | null {
  const name = `${b.owner_first_name ?? ""} ${b.owner_last_name ?? ""}`.trim();
  return name || b.owner_email || null;
}

function originLabel(b: Business): string | null {
  if (b.origin === "seeded") {
    if (b.source_job_type === "spreadsheet") return "Spreadsheet import";
    return b.source_job_type === "agentcis" ? "AgentCIS import" : "Seeded";
  }
  if (b.origin === "admin") return "Admin-added";
  if (b.origin === "signup") return "Sign-up";
  return null;
}

function BusinessLogo({ business: b }: Readonly<{ business: Business }>) {
  const institution = b.kind === "institution";
  return (
    <div
      className={cn(
        "hidden size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg sm:flex",
        b.logo_url ? "bg-muted" : institution ? "bg-info/10" : "bg-primary-light",
      )}
    >
      {b.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={b.logo_url} alt="" className="h-full w-full object-contain p-1" />
      ) : (
        <Building2 className={cn("size-4", institution ? "text-info" : "text-primary")} />
      )}
    </div>
  );
}

/** Institution or business, plus where the record came from. */
function TypeBadges({ business: b, origin }: Readonly<{ business: Business; origin: string | null }>) {
  return (
    <>
      <Badge variant={b.kind === "institution" ? "info" : "secondary"}>{b.kind === "institution" ? "Institution" : "Business"}</Badge>
      {origin && <Badge variant="outline">{origin}</Badge>}
    </>
  );
}

export function BusinessRow({
  business: b, selected, onToggleSelect, ...actions
}: Readonly<{
  business: Business;
  selected: boolean;
  onToggleSelect: () => void;
} & BusinessRowActionHandlers>) {
  const formattedDate = new Date(b.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const owner = ownerName(b);
  const location = [b.city, b.country_name].filter(Boolean).join(", ");
  const origin = originLabel(b);

  return (
    <TableRow data-state={selected ? "selected" : undefined}>
      <TableCell className="w-px">
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label={`Select ${b.business_name}`} />
      </TableCell>
      <TableCell primary>
        <div className="flex min-w-0 items-center gap-3">
          <BusinessLogo business={b} />
          <div className="min-w-0">
            <button
              type="button"
              className="block max-w-full cursor-pointer truncate text-left font-medium text-foreground hover:underline"
              onClick={actions.onView}
            >
              {b.business_name}
            </button>
            <p className="truncate text-xs capitalize text-muted-foreground">
              {b.category_name || b.business_type?.replaceAll("_", " ") || "Uncategorised"}
              {location && ` • ${location}`}
            </p>
            {/* Below lg the Type column is hidden; below md, Owner and Created; below 2xl, the counts. */}
            <div className="mt-1 flex flex-wrap items-center gap-1.5 lg:hidden">
              <TypeBadges business={b} origin={origin} />
            </div>
            <p className="truncate text-xs text-muted-foreground md:hidden">
              {owner ?? "Unclaimed"} · {formattedDate}
            </p>
            <p className="text-xs whitespace-normal text-muted-foreground 2xl:hidden">
              {b.branch_count} branches · {b.service_count} services · 
              {b.profile_views} public views
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <div className="flex flex-col items-start gap-1">
          <TypeBadges business={b} origin={origin} />
        </div>
      </TableCell>
      <TableCell className="hidden max-w-48 truncate md:table-cell">
        {owner ? <span className="text-foreground">{owner}</span> : <span className="italic text-muted-foreground">Unclaimed</span>}
      </TableCell>
      <TableCell numeric className="hidden 2xl:table-cell">{b.branch_count}</TableCell>
      <TableCell numeric className="hidden 2xl:table-cell">{b.service_count}</TableCell>
      <TableCell numeric className="hidden 2xl:table-cell">{b.profile_views}</TableCell>
      <TableCell className="hidden md:table-cell">
        <p className="text-foreground">{formattedDate}</p>
        <p className="max-w-40 truncate text-xs text-muted-foreground">by {owner ?? "—"}</p>
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-1">
          <Badge variant={STATUS_VARIANT[b.status]}>
            <span aria-hidden className="size-1.5 rounded-full bg-current" />
            {STATUS_LABELS[b.status]}
          </Badge>
          {b.is_published ? (
            <span className="inline-flex items-center gap-1 text-xs text-success"><Globe className="size-3" /> Published</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><EyeOff className="size-3" /> Unpublished</span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <BusinessRowActions business={b} {...actions} />
      </TableCell>
    </TableRow>
  );
}
