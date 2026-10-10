import { CheckCheck, Loader2, TriangleAlert, type LucideIcon } from "lucide-react";
import type { EmailStatus, InviteStatus } from "../apis/types";

/** Must match the backend's platform guard (superadmin/consts ALLOWED_ROLES) — other admins get a 403. */
export const INVITE_ROLES: readonly string[] = ["super_admin", "data_admin"];

/** Invites are for institutions only for now; the backend still derives the type from the category. */
export const INVITE_CATEGORY_SLUG = "institutions";

/** Soft tinted pills (tone + dot) so a column of statuses scans by colour, not by reading each word. */
export const STATUS_BADGE: Record<InviteStatus, { label: string; pill: string; dot: string }> = {
  pending: { label: "Pending", pill: "bg-amber-500/10 text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
  accepted: { label: "Accepted", pill: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
  expired: { label: "Expired", pill: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/50" },
  // text-destructive (#EF4444) on destructive/10 is ~3.3:1 — under AA at this size.
  revoked: { label: "Revoked", pill: "bg-destructive/10 text-red-700 dark:text-red-300", dot: "bg-destructive" },
};

/** Only shown while the invite is still open — once accepted or revoked, delivery no longer matters. */
export const EMAIL_BADGE: Record<EmailStatus, { label: string; icon: LucideIcon; className: string }> = {
  queued: { label: "Sending…", icon: Loader2, className: "text-muted-foreground" },
  sent: { label: "Email delivered", icon: CheckCheck, className: "text-muted-foreground" },
  // Same reason as the revoked pill: text-destructive is too light to carry small bold text on white.
  failed: { label: "Email failed", icon: TriangleAlert, className: "font-semibold text-red-700 dark:text-red-400" },
};
