import { Building2, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReferralActionType } from "../apis/types";

/** Labels and icons carried over from V2 so the two versions read as the same product. */
export const ACTION_META: Record<ReferralActionType, { label: string; icon: LucideIcon }> = {
  student_referral: { label: "Student", icon: UserPlus },
  business_referral: { label: "Business", icon: Building2 },
};
