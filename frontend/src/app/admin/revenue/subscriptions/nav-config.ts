// Nested sidebar config for the Subscriptions/Revenue section — ported from V2's
// SubscriptionsLayout.tsx. Rendered inside subscriptions/layout.tsx alongside the
// shared top-bar group nav + sub-nav (three nav levels stacked, same as V2).

import { LayoutDashboard, Layers, Users, Receipt, Tag } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface SubscriptionsNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

export const SUBSCRIPTIONS_NAV_ITEMS: SubscriptionsNavItem[] = [
  { href: "/admin/subscriptions", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/subscriptions/plans", label: "Plans & pricing", icon: Layers },
  { href: "/admin/subscriptions/subscribers", label: "Subscribers", icon: Users },
  { href: "/admin/subscriptions/application-charges", label: "Application charges", icon: Receipt },
  { href: "/admin/subscriptions/credits", label: "Credit ledger", icon: Layers },
  { href: "/admin/subscriptions/referrals", label: "Referrals", icon: Tag },
  { href: "/admin/subscriptions/coupons", label: "Coupons", icon: Tag },
];
