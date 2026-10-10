"use client";

import Link from "next/link";
import { ArrowUpRight, Ban, MoreHorizontal, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { OnboardingInvite } from "../apis/types";

/**
 * Resend is the one an admin actually reaches for, so it is a filled labelled button on every open
 * row; revoke and delete are destructive and sit behind the menu instead of one icon-width away.
 */
export function InviteRowActions({
  invite, open, busy, onResend, onRevoke, onDelete,
}: Readonly<{
  invite: OnboardingInvite;
  /** Pending or expired — anything else has no link left to resend or revoke. */
  open: boolean;
  busy: boolean;
  onResend: () => void;
  onRevoke: () => void;
  onDelete?: () => void;
}>) {
  // An accepted invite has nothing left to resend; the useful thing is the org it created.
  const orgId = invite.accepted_institution_id ?? invite.accepted_business_id;
  const orgHref = invite.status === "accepted" && orgId
    ? `/admin/platform/businesses/${orgId}?kind=${invite.accepted_institution_id ? "institution" : "business"}`
    : null;

  if (!open && !onDelete && !orgHref) return null;

  return (
    <div className="flex items-center justify-end gap-2">
      {orgHref && (
        <Link
          href={orgHref}
          className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-primary outline-none hover:bg-primary/10 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          View org
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
      {open && (
        <Button
          size="sm"
          className="h-9 cursor-pointer gap-1.5 rounded-lg px-3 text-[13px] font-semibold"
          disabled={busy}
          onClick={onResend}
          aria-label={`Resend invitation to ${invite.email}`}
        >
          <RotateCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} aria-hidden />
          Resend
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={busy}
          aria-label={`More actions for ${invite.email}`}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-transparent text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {open && (
            <DropdownMenuItem className="cursor-pointer text-destructive" onClick={onRevoke}>
              <Ban className="mr-2 h-4 w-4" /> Revoke invitation
            </DropdownMenuItem>
          )}
          {open && onDelete && <DropdownMenuSeparator />}
          {onDelete && (
            <DropdownMenuItem className="cursor-pointer text-destructive" onClick={onDelete}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete invitation
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
