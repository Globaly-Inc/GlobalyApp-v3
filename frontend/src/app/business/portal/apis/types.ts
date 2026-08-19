// Wire types for GET /businesses/dashboard.
//
// Mirrors backend/src/modules/businesses/services/dashboard.service.ts. The
// `business` block is the backend's allowlist verbatim — if a field is not here
// it is because the server deliberately does not send it (claim token, Stripe
// customer id, owner id, meta), and adding it here would not conjure it.
//
// `recent` reuses the enquiry inbox's own `InboxItem` union rather than
// redeclaring it: both come out of the same `toInboxItem` on the server, so a
// second copy could only ever drift from it. Keeping the union is what makes
// "render a locked lead's email" a compile error on this screen too.

import type { InboxItem } from "@/app/business/enquiries/apis/types";

export type { InboxItem };

export type DashboardBusiness = {
  id: number;
  business_name: string;
  subdomain: string;
  business_type: string | null;
  /** Drives the pending-verification banner. */
  status: string;
  logo_url: string | null;
  verified_at: string | null;
  is_published: boolean;
  onboarding_completed: boolean;
};

/** The acting team member — V3's equivalent of V1's `profiles` read. */
export type DashboardMember = {
  first_name: string | null;
  last_name: string | null;
  role: string;
  is_owner: boolean;
};

export type BusinessDashboard = {
  business: DashboardBusiness;
  member: DashboardMember;
  credits: { balance: number };
  enquiries: {
    total: number;
    /** Distributed but not yet paid for. */
    locked: number;
    recent: InboxItem[];
  };
  services: { total: number; published: number };
};
