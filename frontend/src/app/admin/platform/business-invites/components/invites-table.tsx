"use client";

import { AlertCircle, Ban, BellRing, MailPlus, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { EMAIL_BADGE, STATUS_BADGE } from "../const";
import type { OnboardingInvite } from "../apis/types";

const DAY = 86_400_000;
const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** What happens next: time left, when it lapsed, or when they joined. Revoked has nothing to say. */
function nextStep(invite: OnboardingInvite) {
  if (invite.status === "accepted") return invite.accepted_at ? `Joined ${formatDate(invite.accepted_at)}` : null;
  if (invite.status === "revoked") return null;
  const days = Math.ceil((new Date(invite.expires_at).getTime() - Date.now()) / DAY);
  if (invite.status === "expired" || days <= 0) return `Expired ${formatDate(invite.expires_at)}`;
  return days === 1 ? "Expires tomorrow" : `Expires in ${days} days`;
}

function InviteTableRow({
  invite, busy, onResend, onRevoke, onDelete,
}: Readonly<{ invite: OnboardingInvite; busy: boolean; onResend: () => void; onRevoke: () => void; onDelete?: () => void }>) {
  const badge = STATUS_BADGE[invite.status];
  const open = invite.status === "pending" || invite.status === "expired";
  // "Delivered" is the normal case and just noise; only a send in flight or a failure earns a line.
  const delivery = open && invite.email_status !== "sent" ? EMAIL_BADGE[invite.email_status] : null;
  const DeliveryIcon = delivery?.icon;
  const next = nextStep(invite);

  return (
    <TableRow>
      <TableCell className="py-4 pl-5">
        <div className="flex items-center gap-3.5">
          <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold uppercase text-primary">
            {invite.org_name.trim().charAt(0) || "?"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{invite.org_name}</p>
            <p className="truncate text-xs text-muted-foreground">{invite.email}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden max-w-40 truncate text-sm text-muted-foreground md:table-cell">{invite.business_category_name ?? "—"}</TableCell>
      <TableCell>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", badge.pill)}>
          <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", badge.dot)} />
          {badge.label}
        </span>
        {next && <p className="mt-1 text-xs text-muted-foreground">{next}</p>}
        {delivery && DeliveryIcon && (
          <p className={cn("mt-1 flex items-center gap-1 truncate text-xs", delivery.className)} title={invite.email_error ?? undefined}>
            <DeliveryIcon className={cn("h-3.5 w-3.5 shrink-0", invite.email_status === "queued" && "animate-spin")} aria-hidden />
            {delivery.label}
          </p>
        )}
        {invite.link_requested_at && invite.status !== "accepted" && (
          <p className="mt-1 flex items-center gap-1 truncate text-xs font-medium text-amber-600" title={`Requested ${formatDate(invite.link_requested_at)}`}>
            <BellRing className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {invite.status === "revoked" ? "Asked to be re-invited" : "New link requested"}
          </p>
        )}
      </TableCell>
      <TableCell className="hidden max-w-40 truncate text-sm text-muted-foreground lg:table-cell">{invite.invited_by_name ?? "—"}</TableCell>
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(invite.created_at)}</TableCell>
      <TableCell className="pr-4">
        <div className="flex justify-end gap-1">
          {open && (
            <>
            <Button
              variant="ghost"
              size="icon-sm"
              className="cursor-pointer text-muted-foreground hover:text-foreground"
              disabled={busy}
              onClick={onResend}
              title="Resend invitation"
              aria-label={`Resend invitation to ${invite.email}`}
            >
              <RotateCw className={cn(busy && "animate-spin")} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="cursor-pointer text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={busy}
              onClick={onRevoke}
              title="Revoke invitation"
              aria-label={`Revoke invitation to ${invite.email}`}
            >
              <Ban />
            </Button>
            </>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="cursor-pointer text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              disabled={busy}
              onClick={onDelete}
              title="Delete invitation"
              aria-label={`Delete invitation to ${invite.email}`}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function SkeletonRows() {
  return Array.from({ length: 5 }, (_, i) => (
    <TableRow key={i} className="hover:bg-transparent">
      <TableCell className="py-4 pl-5">
        <div className="flex items-center gap-3.5">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-1.5 h-3 w-56" />
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell>
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="mt-1.5 h-3 w-24" />
      </TableCell>
      <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell className="pr-4"><Skeleton className="ml-auto h-8 w-16" /></TableCell>
    </TableRow>
  ));
}

function MessageRow({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={6} className="whitespace-normal py-16 text-center">{children}</TableCell>
    </TableRow>
  );
}

export function InvitesTable({
  invites, loading, error, filtered, busyId, onResend, onRevoke, onDelete, onRetry,
}: Readonly<{
  invites: OnboardingInvite[];
  loading: boolean;
  error: string | null;
  filtered: boolean;
  busyId: string | null;
  onResend: (invite: OnboardingInvite) => void;
  onRevoke: (invite: OnboardingInvite) => void;
  /** Absent unless the viewer is a super admin. */
  onDelete?: (invite: OnboardingInvite) => void;
  onRetry: () => void;
}>) {
  let body: React.ReactNode;
  if (error) {
    body = (
      <MessageRow>
        <AlertCircle className="mx-auto mb-2 h-8 w-8 text-destructive" />
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" className="mt-3 cursor-pointer" onClick={onRetry}>Try again</Button>
      </MessageRow>
    );
  } else if (loading && invites.length === 0) {
    body = <SkeletonRows />;
  } else if (invites.length === 0) {
    body = (
      <MessageRow>
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MailPlus className="h-6 w-6" />
        </span>
        <p className="text-sm font-medium text-foreground">{filtered ? "No invites match" : "No invites yet"}</p>
        <p className="mt-1 text-xs text-muted-foreground">{filtered ? "Try a different search or status." : "Use Invite Business to send the first one."}</p>
      </MessageRow>
    );
  } else {
    body = invites.map((invite) => (
      <InviteTableRow key={invite.id} invite={invite} busy={busyId === invite.id} onResend={() => onResend(invite)} onRevoke={() => onRevoke(invite)} onDelete={onDelete && (() => onDelete(invite))} />
    ));
  }

  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card transition-opacity", loading && invites.length > 0 && "opacity-60")} aria-busy={loading}>
      <Table>
        <TableHeader className="bg-muted">
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5 text-xs font-medium text-muted-foreground">Organisation</TableHead>
            <TableHead className="hidden w-40 text-xs font-medium text-muted-foreground md:table-cell">Category</TableHead>
            <TableHead className="w-36 text-xs font-medium text-muted-foreground sm:w-48">Status</TableHead>
            <TableHead className="hidden w-40 text-xs font-medium text-muted-foreground lg:table-cell">Invited by</TableHead>
            <TableHead className="w-28 text-xs font-medium text-muted-foreground">Invited At</TableHead>
            <TableHead className="w-24 pr-5 text-right text-xs font-medium text-muted-foreground">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{body}</TableBody>
      </Table>
    </div>
  );
}
