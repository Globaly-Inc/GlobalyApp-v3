"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Briefcase, Building2, Calendar, CheckCircle, Copy, Eye, EyeOff, Globe, Link2, Mail, MapPin,
  Package, Trash2, User, XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "../../const";
import type { Business } from "../../apis/types";

function ownerName(b: Business): string | null {
  const name = `${b.owner_first_name ?? ""} ${b.owner_last_name ?? ""}`.trim();
  return name || b.owner_email || null;
}

export function BusinessCard({
  business: b,
  selected,
  onToggleSelect,
  onView,
  onVerify,
  onSuspend,
  onTogglePublish,
  onDelete,
  onSendClaimRequest,
  publishBusy,
  claimRequestBusy,
}: Readonly<{
  business: Business;
  selected: boolean;
  onToggleSelect: () => void;
  onView: () => void;
  onVerify: () => void;
  onSuspend: () => void;
  onTogglePublish: () => void;
  onDelete: () => void;
  onSendClaimRequest: () => void;
  publishBusy: boolean;
  claimRequestBusy: boolean;
}>) {
  const router = useRouter();
  const formattedDate = new Date(b.created_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const owner = ownerName(b);
  const location = [b.city, b.country_name].filter(Boolean).join(", ");

  const copySubdomain = async () => {
    await navigator.clipboard.writeText(b.subdomain);
    toast.success("Subdomain copied");
  };

  const detailPath = `/admin/platform/businesses/${b.id}`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}${detailPath}`);
    toast.success("Link copied");
  };

  const viewServices = () => router.push(`${detailPath}?tab=services`);

  return (
    <Card className={cn("transition-shadow hover:shadow-md", selected && "ring-2 ring-primary")}>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="pt-1.5">
            <Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label={`Select ${b.business_name}`} />
          </div>
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
            {b.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.logo_url} alt="" className="h-full w-full object-contain p-1" />
            ) : (
              <Building2 className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold">{b.business_name}</span>
              {b.kind === "institution" && (
                <Badge variant="outline" className="border-sky-200 px-1.5 py-0 text-[10px] text-sky-700">
                  Institution
                </Badge>
              )}
              {b.is_unclaimed && (
                <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-destructive">
                  Pre-seeded
                </Badge>
              )}
              {b.is_published ? (
                <Badge variant="outline" className="gap-1 border-emerald-200 px-1.5 py-0 text-[10px] text-emerald-700">
                  <Globe className="h-2.5 w-2.5" />
                  Published
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px] text-muted-foreground">
                  <EyeOff className="h-2.5 w-2.5" />
                  Unpublished
                </Badge>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs capitalize text-muted-foreground">
              {b.category_name || b.business_type?.replaceAll("_", " ") || "Uncategorised"}
              {location && ` • ${location}`}
            </p>
          </div>
          <span className="flex-shrink-0 text-xs text-muted-foreground">
            {STATUS_LABELS[b.status]}
          </span>
        </div>

        <div className="ml-9 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <div className="min-w-0 rounded-lg border bg-muted/30 p-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <User className="h-3 w-3" />
              Owner
            </div>
            {owner ? (
              <p className="truncate text-xs font-medium">{owner}</p>
            ) : (
              <p className="text-xs italic text-muted-foreground">Unclaimed</p>
            )}
          </div>

          <div className="min-w-0 rounded-lg border bg-muted/30 p-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <MapPin className="h-3 w-3" />
              Branches
            </div>
            <p className="truncate text-xs font-medium">
              {b.branch_count} <span className="font-normal text-muted-foreground">branches</span>
            </p>
          </div>

          <div className="min-w-0 rounded-lg border bg-muted/30 p-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Package className="h-3 w-3" />
              Services
            </div>
            <p className="truncate text-xs font-medium">
              {b.service_count} <span className="font-normal text-muted-foreground">services</span>
            </p>
          </div>

          <div className="min-w-0 rounded-lg border bg-muted/30 p-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Eye className="h-3 w-3" />
              Public views
            </div>
            <p className="truncate text-xs font-medium">
              {b.profile_views} <span className="font-normal text-muted-foreground">all-time</span>
            </p>
          </div>

          <div className="min-w-0 rounded-lg border bg-muted/30 p-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Calendar className="h-3 w-3" />
              Created
            </div>
            <p className="truncate text-xs font-medium">{formattedDate}</p>
            <p className="truncate text-[11px] text-muted-foreground">by {owner ?? "—"}</p>
          </div>
        </div>

        <div className="ml-9 mt-1 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8 cursor-pointer" title="Copy subdomain" onClick={copySubdomain}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 cursor-pointer" title="Copy link" onClick={copyLink}>
              <Link2 className="h-3.5 w-3.5" />
            </Button>
            {b.kind !== "institution" && (
              <Button size="icon" variant="ghost" className="h-8 w-8 cursor-pointer" title="View services" onClick={viewServices}>
                <Briefcase className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Offered for BOTH kinds, and gated on any contact address rather than owner_email:
                a promoted listing has no owner until it is claimed, and the link goes to its own
                contact email. The backend picks the endpoint from `kind`. */}
            {b.claim_status !== "claimed" && (b.owner_email ?? b.email) && (
              <Button size="sm" variant="outline" className="h-8 cursor-pointer" disabled={claimRequestBusy} onClick={onSendClaimRequest}>
                <Mail className="mr-1 h-3.5 w-3.5" />
                Send claim request
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-8 cursor-pointer" onClick={onView}>
              <Eye className="mr-1 h-3.5 w-3.5" />
              View
            </Button>
            <Button size="sm" variant="outline" className="h-8 cursor-pointer" onClick={onView}>
              Edit
            </Button>
            {b.status !== "verified" && b.status !== "suspended" && (
              <Button size="sm" variant="outline" className="h-8 cursor-pointer" onClick={onVerify}>
                <CheckCircle className="mr-1 h-3.5 w-3.5" />
                Mark verified
              </Button>
            )}
            {b.status === "suspended" && (
              <Button size="sm" variant="outline" className="h-8 cursor-pointer" onClick={onVerify}>
                <CheckCircle className="mr-1 h-3.5 w-3.5" />
                Reinstate
              </Button>
            )}
            {b.status === "verified" && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 cursor-pointer border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={onSuspend}
              >
                <XCircle className="mr-1 h-3.5 w-3.5" />
                Suspend
              </Button>
            )}
            {b.is_published ? (
              <Button size="sm" variant="outline" className="h-8 cursor-pointer" disabled={publishBusy} onClick={onTogglePublish}>
                <EyeOff className="mr-1 h-3.5 w-3.5" />
                Unpublish
              </Button>
            ) : (
              <Button size="sm" className="h-8 cursor-pointer" disabled={publishBusy} onClick={onTogglePublish}>
                <Globe className="mr-1 h-3.5 w-3.5" />
                Publish
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-8 cursor-pointer border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={onDelete}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
