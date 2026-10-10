import { z } from "zod";
import { PaginationSchema } from "../../../shared/pagination.js";

export const ONBOARDING_INVITE_TYPES = ["institution", "business"] as const;
const InviteType = z.enum(ONBOARDING_INVITE_TYPES);

/** The business category decides whether the invite sets up an institution or a business. */
export const SendInvitationSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  name: z.string().trim().min(1).max(240),
  full_name: z.string().trim().min(1).max(200).optional(),
  business_category_id: z.number().int().positive(),
});

/** A query string, so the id arrives as text. The name is optional: while the admin is still
 *  typing it, the preview shows the subject the mail would carry without one. */
export const PreviewInvitationQuerySchema = z.object({
  business_category_id: z.coerce.number().int().positive(),
  name: z.string().trim().max(240).optional(),
});

export const InvitationListQuerySchema = PaginationSchema.extend({
  status: z.enum(["pending", "accepted", "revoked", "expired"]).optional(),
  search: z.string().trim().max(100).optional(),
});

export const InvitationIdParamSchema = z.object({ id: z.string().uuid() });

/** Identifies the invite alone: lookup, send-code and request-link all take just this. */
export const InvitationTokenSchema = z.object({
  token: z.string().min(1).max(200),
  type: InviteType,
});

/** Accepting also carries the code mailed to the invited address — nothing is created without it. */
export const AcceptInvitationSchema = InvitationTokenSchema.extend({
  otp: z.string().trim().length(6).regex(/^\d+$/, "Code must be numeric"),
});
