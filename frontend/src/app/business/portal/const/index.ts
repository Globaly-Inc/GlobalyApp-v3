import { Handshake, Inbox, Package } from "lucide-react";
import type { QuickAction } from "@/app/portal/types";

/**
 * V1's business quick actions, pointed at the routes V3 actually has. Services and partners live as tabs
 * on the business profile, and that page is addressed by business id — hence a builder rather than a
 * constant, since `/business/profile` resolves through a redirect that drops the query string.
 */
export function businessQuickActions(businessId: number): QuickAction[] {
  return [
    { label: "Enquiry inbox", href: "/business/enquiries", icon: Inbox, color: "text-primary" },
    { label: "Manage services", href: `/business/profile/${businessId}?tab=services`, icon: Package, color: "text-emerald-600" },
    { label: "Representations", href: `/business/profile/${businessId}?tab=partners`, icon: Handshake, color: "text-violet-600" },
  ];
}

export const EMPTY_FEED_HINT = "Be the first to share something with the community.";
