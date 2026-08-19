"use client";

import { AlertTriangle, BadgeCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DashboardBusiness, DashboardMember } from "../apis/types";
import { greeting, memberFirstName, needsVerification } from "../utils";

interface DashboardHeroProps {
  business: DashboardBusiness;
  member: DashboardMember;
}

export function DashboardHero({ business, member }: DashboardHeroProps) {
  const firstName = memberFirstName(member);
  // V1's hero also carried a weather widget, a world clock and a timezone
  // picker. Those already exist in V3 under personal/portal and are a feature of
  // their own — not part of this screen's four data sources.
  const hello = firstName ? `${greeting(new Date().getHours())}, ${firstName}` : greeting(new Date().getHours());

  return (
    <section className="rounded-xl border border-border bg-background p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold md:text-2xl">{hello}</h1>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{business.business_name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="capitalize">
            {member.role}
          </Badge>
          {business.verified_at ? (
            <Badge variant="secondary">
              <BadgeCheck /> Verified
            </Badge>
          ) : null}
        </div>
      </div>

      {needsVerification(business.status) ? (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Your business is <strong className="font-medium text-foreground">pending verification</strong>. An admin
            will review your details shortly — enquiries and services keep working in the meantime.
          </span>
        </p>
      ) : null}

      {!business.is_published ? (
        <p className="mt-2 text-xs text-muted-foreground">
          This profile is not published yet, so it does not appear in public search.
        </p>
      ) : null}
    </section>
  );
}
