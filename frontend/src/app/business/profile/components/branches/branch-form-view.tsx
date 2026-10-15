"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchMe } from "@/app/auth/store/auth-slice";
import { createBranch, fetchBranch, updateBranch } from "../../store/business-profile-detail-slice";
import { useOrgContext } from "../use-org-context";
import { ServiceSharingPicker } from "../services/service-sharing-picker";
import type { BranchInput, BranchPatch, SharedServices } from "../../apis/types";
import { BranchForm, type BranchFormHost } from "./branch-form";

function PortalServicesPicker({ value, onChange }: Readonly<{ value: SharedServices; onChange: (v: SharedServices) => void }>) {
  return <ServiceSharingPicker value={value} onChange={onChange} emptyText="No services available to share." />;
}

/** The portal's branch add/edit page: BranchForm wired to the active org's own API and store. */
export function BranchFormView({ businessId, branchId }: Readonly<{ businessId: number; branchId?: string }>) {
  const dispatch = useAppDispatch();
  const parent = useAppSelector((s) => s.businessOnboarding.profile);
  const branchList = useAppSelector((s) => s.businessProfileDetail.branches);
  // The URL's org, not whichever one the session happens to be on, must receive these requests.
  const ready = useOrgContext(businessId, useSearchParams().get("org"));
  // Only trust the cached list when it belongs to THIS org — another org's list can still be in the
  // store, and a uuid match there would edit the wrong tenant's branch.
  const cachedBranch = branchList.ownerId === businessId ? branchList.items.find((b) => b.id === branchId) : undefined;

  const host = useMemo<BranchFormHost>(() => ({
    parent: parent ?? null,
    ready,
    backHref: `/business/profile/${businessId}?tab=branches`,
    cachedBranch,
    loadBranch: (id) => dispatch(fetchBranch({ id: businessId, branchId: id })).unwrap(),
    createBranch: (input) => dispatch(createBranch({ id: businessId, input: input as BranchInput })).unwrap(),
    updateBranch: (id, patch) => dispatch(updateBranch({ id: businessId, branchId: id, patch: patch as BranchPatch })).unwrap(),
    // The branch is a new org owned by this user — refetch /auth/me so the org switcher shows it.
    afterCreate: () => { dispatch(fetchMe()); },
    ServicesPicker: PortalServicesPicker,
  }), [parent, ready, businessId, cachedBranch, dispatch]);

  return <BranchForm host={host} branchId={branchId} />;
}
