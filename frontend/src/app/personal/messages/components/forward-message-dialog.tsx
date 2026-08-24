"use client";

import { useState } from "react";
import { Forward, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { sendThreadMessage } from "../store/messages-slice";
import { initials, previewText } from "../utils";

/**
 * Forward a message into another conversation — GlobalyOS V2's `ForwardMessageDialog`:
 * pick a destination, the body is re-sent there.
 *
 * V2 lets you forward into DMs, groups and spaces. A student only has enquiry threads, so
 * the list is their other conversations — the current one is excluded, since forwarding a
 * message back into the thread it came from is never what was meant.
 *
 * Only the TEXT is forwarded, not the attachments: the files are scoped to the uploader
 * and the thread they were sent in, and re-attaching them would mean re-uploading under
 * the forwarder's name. V2 has the same limitation.
 */
export function ForwardMessageDialog({
  body,
  fromDistributionId,
  open,
  onOpenChange,
}: Readonly<{
  body: string;
  fromDistributionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const dispatch = useAppDispatch();
  const threads = useAppSelector((s) => s.messages.threads);
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  const destinations = threads.filter((t) => t.distribution_id !== fromDistributionId && !t.is_closed);

  const forward = async (distributionId: string, businessName: string) => {
    setSendingTo(distributionId);
    const result = await dispatch(sendThreadMessage({ distributionId, body }));
    setSendingTo(null);
    if (sendThreadMessage.rejected.match(result)) {
      toast.error("Couldn't forward", { description: result.error.message ?? "Please try again." });
      return;
    }
    toast.success(`Forwarded to ${businessName}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Forward message</DialogTitle>
        <DialogDescription>Pick a conversation to send this to.</DialogDescription>

        <p className="rounded-md border border-border bg-muted/40 p-2 text-sm text-muted-foreground line-clamp-3">
          {previewText(body)}
        </p>

        {destinations.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            You have no other open conversations to forward this to.
          </p>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {destinations.map((thread) => (
              <button
                key={thread.distribution_id}
                type="button"
                disabled={sendingTo !== null}
                onClick={() => forward(thread.distribution_id, thread.business_name)}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted disabled:opacity-60"
              >
                <Avatar className="size-8 shrink-0">
                  {thread.logo_url && <AvatarImage src={thread.logo_url} alt={thread.business_name} />}
                  <AvatarFallback className="bg-muted text-xs text-muted-foreground">
                    {initials(thread.business_name)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{thread.business_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{thread.course_name}</span>
                </span>
                {sendingTo === thread.distribution_id ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
                ) : (
                  <Forward className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
