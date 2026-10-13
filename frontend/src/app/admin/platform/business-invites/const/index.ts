import { CheckCheck, Loader2, TriangleAlert, type LucideIcon } from "lucide-react";
import type { EmailStatus, InviteStatus } from "../apis/types";

/** Must match the backend's platform guard (superadmin/consts ALLOWED_ROLES) — other admins get a 403. */
export const INVITE_ROLES: readonly string[] = ["super_admin", "data_admin"];

/** Invites are for institutions only for now; the backend still derives the type from the category. */
export const INVITE_CATEGORY_SLUG = "institutions";

/** Badge tone + dot so a column of statuses scans by colour, not by reading each word. */
export const STATUS_BADGE: Record<InviteStatus, { label: string; variant: "warning" | "success" | "secondary" | "destructive"; dot: string }> = {
  pending: { label: "Pending", variant: "warning", dot: "bg-warning" },
  accepted: { label: "Accepted", variant: "success", dot: "bg-success" },
  expired: { label: "Expired", variant: "secondary", dot: "bg-muted-foreground/50" },
  revoked: { label: "Revoked", variant: "destructive", dot: "bg-destructive" },
};

/** Only shown while the invite is still open — once accepted or revoked, delivery no longer matters. */
export const EMAIL_BADGE: Record<EmailStatus, { label: string; icon: LucideIcon; className: string }> = {
  queued: { label: "Sending…", icon: Loader2, className: "text-muted-foreground" },
  sent: { label: "Email delivered", icon: CheckCheck, className: "text-muted-foreground" },
  failed: { label: "Email failed", icon: TriangleAlert, className: "font-semibold text-red-700 dark:text-red-400" },
};
