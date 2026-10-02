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
    <div className="mb-3 flex items-center justify-between rounded-lg border border-primary/40 bg-primary/5 p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-primary">
          {profile.logo_url
            // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not a static asset
            ? <img src={profile.logo_url} alt="" className="size-full object-contain p-0.5" />
            : <Building2 className="h-4 w-4" />}
        </div>
        <div>
          <span className="text-sm font-medium">{profile.business_name}</span>
          {parentId != null && (
            <span className="ml-1.5 text-xs text-muted-foreground">· Branch of {parent ?? "another organisation"}</span>
          )}
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" /> {location || "No address yet — add it in Business Profile"}
          </p>
        </div>
      </div>
      {/* The org being viewed heads the branches listed under it — even when it's itself a branch. */}
      <Badge>Head office</Badge>
    </div>
  );
}
