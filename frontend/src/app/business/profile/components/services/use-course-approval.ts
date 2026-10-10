"use client";

import { toast } from "sonner";
import { useAuthState } from "@/app/auth/store/auth-slice";
import { businessProfileDetailApi } from "../../apis";
import type { BusinessService } from "../../apis/types";

/** Institution courses need approval before they can be published; services without an
 *  approval_status (a plain business's own) never do. */
export const needsApproval = (s: BusinessService) => s.approval_status != null && s.approval_status !== "approved";

/**
 * Approving a course is for the org's OWNER or a platform admin only (the backend enforces the
 * same rule) — other members can edit courses but not approve them.
 */
export function useCourseApproval(onApproved: () => void) {
  const user = useAuthState().user;
  const org = user?.businesses?.find((o) => o.org_id === user.orgId) ?? user?.institutions?.find((o) => o.org_id === user?.orgId);
  const canApprove = !!user?.is_admin || !!org?.is_owner;

  const approve = async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      const { approved } = await businessProfileDetailApi.approveServices(ids);
      if (approved === 0) {
        toast.info("Nothing to approve", { description: "Every course is already approved." });
        return;
      }
      toast.success(approved === 1 ? "Course approved" : `${approved} courses approved`, { description: "You can publish them now." });
      onApproved();
    } catch (e) {
      toast.error("Couldn't approve", { description: (e as Error).message });
    }
  };

  return { canApprove, approve };
}
