"use client";

import { useEffect, useMemo, useState } from "react";
import { BranchForm, type BranchFormHost } from "@/app/business/profile/components/branches/branch-form";
import type { Branch } from "@/app/business/profile/apis/types";
import { businessesApi } from "../../apis";
import type { BranchInput, BranchPatch } from "../../apis/types";
import { ServiceSharingPicker } from "../services/service-sharing-picker";

type Kind = "business" | "institution";

/** Superadmin's branch add/edit page: the portal's own branch form, pointed at this org's admin
 *  endpoints — including the Services step (an institution shares its courses). */
export function AdminBranchForm({ kind, orgId, branchId }: Readonly<{ kind: Kind; orgId: number; branchId?: string }>) {
  const [parent, setParent] = useState<BranchFormHost["parent"]>(null);

  useEffect(() => {
    const load = kind === "institution" ? businessesApi.getInstitutionDetail(orgId) : businessesApi.getBusinessDetail(orgId);
    load.then((d) => setParent({ ...d, logo_url: d.logo_url ?? null })).catch(() => setParent(null));
  }, [kind, orgId]);

  const host = useMemo<BranchFormHost>(() => {
    const inst = kind === "institution";
    return {
      parent,
      ready: true,
      backHref: `/admin/platform/businesses/${orgId}?${inst ? "kind=institution&" : ""}tab=branches`,
      loadBranch: (id) => (inst ? businessesApi.getInstitutionBranch(orgId, id) : businessesApi.getBranch(orgId, id)) as unknown as Promise<Branch>,
      createBranch: (input) => inst
        ? businessesApi.createInstitutionBranch(orgId, input as BranchInput)
        : businessesApi.createBranch(orgId, input as BranchInput),
      updateBranch: (id, patch) => inst
        ? businessesApi.updateInstitutionBranch(orgId, id, patch as BranchPatch)
        : businessesApi.updateBranch(orgId, id, patch as BranchPatch),
      ServicesPicker: function AdminServicesPicker({ value, onChange }) {
        return <ServiceSharingPicker businessId={orgId} kind={kind} value={value} onChange={onChange} emptyText="No services available to share." />;
      },
    };
  }, [kind, orgId, parent]);

  return <BranchForm host={host} branchId={branchId} />;
}
