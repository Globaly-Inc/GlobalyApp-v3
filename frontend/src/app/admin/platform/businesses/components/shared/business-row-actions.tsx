"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Briefcase, CheckCircle, Copy, Eye, EyeOff, Globe, Link2, Mail, MoreHorizontal, Pencil, Trash2, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Business } from "../../apis/types";

export type BusinessRowActionHandlers = {
  onView: () => void;
  onVerify: () => void;
  onSuspend: () => void;
  onTogglePublish: () => void;
  onDelete: () => void;
  onSendClaimRequest: () => void;
  publishBusy: boolean;
  claimRequestBusy: boolean;
};

/** View is the everyday action, so it stays a button; everything else lives behind the "…" menu. */
export function BusinessRowActions({
  business: b, onView, onVerify, onSuspend, onTogglePublish, onDelete, onSendClaimRequest, publishBusy, claimRequestBusy,
}: Readonly<{ business: Business } & BusinessRowActionHandlers>) {
  const router = useRouter();
  const detailPath = `/admin/platform/businesses/${b.id}`;
  // Offered for BOTH kinds, and gated on any contact address rather than owner_email: a promoted
  // listing has no owner until it is claimed, and the link goes to its own contact email. Shown
  // (disabled, with the reason) when there's no email so it's obvious the action exists.
  const hasEmail = Boolean(b.owner_email ?? b.email);

  const copySubdomain = async () => {
    await navigator.clipboard.writeText(b.subdomain);
    toast.success("Subdomain copied");
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}${detailPath}`);
    toast.success("Link copied");
  };

  return (
    <div className="flex items-center justify-end gap-1.5">
      {/* Below sm the business name (also a button to the detail page) does this job, keeping the row on screen. */}
      <Button variant="ghost" size="sm" className="hidden cursor-pointer sm:inline-flex" onClick={onView}>
        <Eye className="mr-1 h-3.5 w-3.5" />
        View
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`More actions for ${b.business_name}`}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          {b.is_unclaimed && (
            <DropdownMenuItem onClick={onView}>
              <Pencil /> Edit
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={copySubdomain}>
            <Copy /> Copy subdomain
          </DropdownMenuItem>
          <DropdownMenuItem onClick={copyLink}>
            <Link2 /> Copy link
          </DropdownMenuItem>
          {b.kind !== "institution" && (
            <DropdownMenuItem onClick={() => router.push(`${detailPath}?tab=services`)}>
              <Briefcase /> View services
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {b.claim_status !== "claimed" && (
            <DropdownMenuItem disabled={claimRequestBusy || !hasEmail} onClick={onSendClaimRequest}>
              <Mail />
              <span className="flex flex-col">
                Send claim request
                {!hasEmail && <span className="text-xs text-muted-foreground">Add an email before sending a claim request</span>}
              </span>
            </DropdownMenuItem>
          )}
          {b.status !== "verified" && b.status !== "suspended" && (
            <DropdownMenuItem onClick={onVerify}>
              <CheckCircle /> Mark verified
            </DropdownMenuItem>
          )}
          {b.status === "suspended" && (
            <DropdownMenuItem onClick={onVerify}>
              <CheckCircle /> Reinstate
            </DropdownMenuItem>
          )}
          {b.status === "verified" && (
            <DropdownMenuItem variant="destructive" onClick={onSuspend}>
              <XCircle /> Suspend
            </DropdownMenuItem>
          )}
          <DropdownMenuItem disabled={publishBusy} onClick={onTogglePublish}>
            {b.is_published ? <><EyeOff /> Unpublish</> : <><Globe /> Publish</>}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
