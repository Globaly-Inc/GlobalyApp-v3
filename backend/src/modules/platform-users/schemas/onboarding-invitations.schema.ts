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

export const InvitationListQuerySchema = PaginationSchema.extend({
  status: z.enum(["pending", "accepted", "revoked", "expired"]).optional(),
  search: z.string().trim().max(100).optional(),
});

export const InvitationIdParamSchema = z.object({ id: z.string().uuid() });

export const AcceptInvitationSchema = z.object({
  token: z.string().min(1).max(200),
  type: InviteType,
});
