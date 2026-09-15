"use client";

import { useEffect, useRef, useState } from "react";
import { ProfileLocationsCard } from "@/app/(web)/components/profile/profile-locations-card";
import type { ProfileLocation } from "@/app/(web)/components/profile/profile-data";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import type { BusinessProfile } from "@/app/business/apis/types";
import type { Country } from "@/app/geo/apis";
import { fetchBranches } from "../store/business-profile-detail-slice";
import { LocationEditDialog, type LocationTarget } from "./location-edit-dialog";
import { PrivacyBadge } from "@/components/privacy-badge";
import { useSectionVisibility } from "./use-section-visibility";

/** One page is plenty for a card meant to be skimmed — V1 showed every branch it had loaded. */
const BRANCH_LIMIT = 50;

/** Prefixed so it can't collide with a branch's uuid in the same list. */
const businessLocationId = (id: number) => `business-${id}`;

/**
 * The portal's Locations card. V1 listed the business's own address first and every branch after
 * it, so the owner sees the same set a visitor does — hence the shared `<ProfileLocationsCard>`
 * rather than a portal-only list.
 */
export function ProfileLocationsSection({
  profile,
  countries,
  readOnly,
  hasBranches,
}: Readonly<{
  profile: BusinessProfile;
  countries: Country[];
  readOnly: boolean;
  /** Institutions own campuses, not branches, and `/businesses/branches` 403s without a business
   *  context — so for them the card shows the one address and skips the request entirely. */
  hasBranches: boolean;
}>) {
  const dispatch = useAppDispatch();
  const { isPublic, toggle, canToggle } = useSectionVisibility(profile);
  const canEditVisibility = !readOnly && canToggle;
  const { items: branchRows } = useAppSelector((state) => state.businessProfileDetail.branches);
  const branches = hasBranches ? branchRows : [];

  // Strict Mode double-invokes effects; without the guard this fires the list request twice.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!hasBranches || fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchBranches({ id: profile.id, params: { limit: BRANCH_LIMIT } }));
  }, [dispatch, hasBranches, profile.id]);

  const [editing, setEditing] = useState<LocationTarget | null>(null);

  const countryName = countries.find((c) => c.id === profile.country_id)?.name ?? null;

  const locations: ProfileLocation[] = [
    {
      id: businessLocationId(profile.id),
      name: profile.business_name,
      address: profile.address,
      city: profile.city,
      state: profile.state,
      country: countryName,
      email: profile.email,
      phone: profile.phone,
      latitude: profile.latitude,
      longitude: profile.longitude,
    },
    ...branches.map((b) => ({
      id: b.id,
      name: b.name,
      address: b.address,
      city: b.city,
      state: b.state,
      country: b.country,
      email: b.email,
      phone: b.phone,
      // Branch rows carry no coordinates — the map falls back to geocoding the address string.
      latitude: null,
      longitude: null,
    })),
  ];

  const startEditing = (id: string) => {
    if (id === businessLocationId(profile.id)) {
      setEditing({ kind: "business", profile });
      return;
    }
    const branch = branches.find((b) => b.id === id);
    if (branch) setEditing({ kind: "branch", branch });
  };

  return (
    <>
      <ProfileLocationsCard
        locations={locations}
        badge={<PrivacyBadge isPublic={isPublic("locations")} onToggle={canEditVisibility ? () => toggle("locations") : undefined} />}
        onEditLocation={readOnly ? undefined : startEditing}
      />

      <LocationEditDialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        target={editing}
        businessId={profile.id}
        countries={countries}
      />
    </>
  );
}
