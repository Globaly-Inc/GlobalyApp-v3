"use client";

import { Building2, CheckCircle, Clock, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Representation } from "../apis/types";

const STATUS_CONFIG = {
  pending: { label: "Pending", icon: Clock, className: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" },
  active: { label: "Active", icon: CheckCircle, className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" },
  rejected: { label: "Rejected", icon: XCircle, className: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" },
  expired: { label: "Expired", icon: XCircle, className: "bg-muted text-muted-foreground" },
} as const;

export function RepresentationCard({
  representation, onRespond,
}: Readonly<{ representation: Representation; onRespond: (status: "active" | "rejected") => void }>) {
  const cfg = STATUS_CONFIG[representation.status];
  const Icon = cfg.icon;
  const { partner } = representation;

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          {partner.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={partner.logo_url} alt="" className="h-full w-full rounded-lg object-contain p-1" />
          ) : (
            <Building2 className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{partner.business_name}</p>
          {partner.city && <p className="text-xs text-muted-foreground">{partner.city}</p>}
          {representation.regions.length > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">Regions: {representation.regions.join(", ")}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge className={`gap-1 border-0 ${cfg.className}`}>
            <Icon className="h-3 w-3" />{cfg.label}
          </Badge>
          {representation.can_respond && (
            <div className="flex gap-1">
              <Button size="sm" onClick={() => onRespond("active")}>Accept</Button>
              <Button size="sm" variant="outline" onClick={() => onRespond("rejected")}>Decline</Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
