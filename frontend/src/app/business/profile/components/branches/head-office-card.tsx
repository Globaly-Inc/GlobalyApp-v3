"use client";

import { Building2, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAppSelector } from "@/lib/hooks";
import { useAuthState } from "@/app/auth/store/auth-slice";
import type { Country } from "@/app/geo/apis";

/** Pinned above the Branches list: the org being viewed is the head office of the branches below.
 * When it's itself a branch of another org, a small note says whose. */
export function HeadOfficeCard({ countries }: Readonly<{ countries: Country[] }>) {
  const profile = useAppSelector((s) => s.businessOnboarding.profile);
  const user = useAuthState().user;
  if (!profile) return null;

  const businesses = user?.businesses ?? [];
  const institutions = user?.institutions ?? [];
  // A branch's parent is always the same kind of org as the branch.
  const myBusiness = businesses.find((o) => o.org_id === user?.orgId);
  const myInstitution = myBusiness ? undefined : institutions.find((o) => o.org_id === user?.orgId);
  const parentId = myBusiness?.parent_business_id ?? myInstitution?.parent_institution_id ?? null;
  const parent = myBusiness
    ? businesses.find((o) => o.id === parentId)?.business_name
    : institutions.find((o) => o.id === parentId)?.institution_name;

  const country = countries.find((c) => c.id === profile.country_id)?.name;
  // The saved address is often the full one already ("Dhulikhel, Bagmati Province, Nepal") — only
  // append the parts it doesn't contain.
  const address = profile.address?.trim() ?? "";
  const rest = [profile.city, profile.state, country].filter((p): p is string => !!p && !address.toLowerCase().includes(p.toLowerCase()));
  const location = [address, ...rest].filter(Boolean).join(", ");

  return (
    <div className="relative flex items-center gap-3.5 overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/[0.03] to-card p-4">
      {/* One light sweep on mount — draws the eye to the root of the tree. */}
      <span aria-hidden className="animate-sheen pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-background/60 to-transparent" />
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary text-primary-foreground shadow-[0_6px_16px_-6px_var(--color-primary)]">
        {profile.logo_url
          // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not a static asset
          ? <img src={profile.logo_url} alt="" className="size-full bg-background object-contain p-0.5" />
          : <Building2 className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-[15px] font-bold">{profile.business_name}</span>
        {parentId != null && (
          <span className="ml-1.5 text-xs text-muted-foreground">· Branch of {parent ?? "another organisation"}</span>
        )}
        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" /> {location || "No address yet — add it in Business Profile"}
        </p>
      </div>
      {/* The org being viewed heads the branches listed under it — even when it's itself a branch. */}
      <Badge className="shrink-0 gap-1.5">
        <span className="animate-ai-pulse size-1.5 rounded-full bg-current" />
        Head office
      </Badge>
    </div>
  );
}
