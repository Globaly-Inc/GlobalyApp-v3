import { Building2, Coins, Inbox, Package } from "lucide-react";

/**
 * V1's sidebar showed a "Low" badge below 20 credits, and a lead costs 30 by
 * default — so this is "you cannot afford the next lead", not a round number.
 */
export const LOW_CREDIT_THRESHOLD = 20;

export const QUICK_ACTIONS = [
  { label: "Enquiry inbox", href: "/business/enquiries", icon: Inbox },
  { label: "Manage services", href: "/business/profile", icon: Package },
  { label: "Business profile", href: "/business/profile", icon: Building2 },
  { label: "Buy credits", href: "/business/enquiries", icon: Coins },
] as const;
