/** Follows the business category picked when sending: "Institutions" sets up an institution. */
export type InviteType = "institution" | "business";

export type InviteStatus = "pending" | "accepted" | "revoked" | "expired";

export type EmailStatus = "queued" | "sent" | "failed";

export type OnboardingInvite = {
  id: string;
  email: string;
  /** Becomes the institution / business name on accept. */
  org_name: string;
  type: InviteType;
  status: InviteStatus;
  expires_at: string;
  business_category_id: number | null;
  business_category_name: string | null;
  invited_by_name: string | null;
  accepted_institution_id: number | null;
  accepted_business_id: number | null;
  accepted_at: string | null;
  email_status: EmailStatus;
  email_sent_at: string | null;
  email_error: string | null;
  link_requested_at: string | null;
  created_at: string;
};

export type InviteListParams = {
  page?: number;
  limit?: number;
  status?: InviteStatus;
  search?: string;
};

export type InviteCounts = Record<InviteStatus, number>;

export type PaginatedInvites = {
  data: OnboardingInvite[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  counts: InviteCounts;
};

export type SendInviteParams = { email: string; name: string; full_name: string; business_category_id: number };

/** Where an address is already in use — a send to it is refused with a 409 carrying these. */
export type EmailMatch = { kind: "user" | "institution" | "business" | "extraction" | "invite"; id: string | number; name: string | null };

/** Refusals come back as a 409 whose details are `{ matches: EmailMatch[] }`. */
export type SendInviteResult = { email: string; type: InviteType; email_status: Exclude<EmailStatus, "queued"> };

export type ResendInviteResult = { expires_at: string; email_status: Exclude<EmailStatus, "queued"> };
