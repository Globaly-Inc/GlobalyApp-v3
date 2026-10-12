"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EmbedChatActions } from "./use-embed-chat-actions";

const COPY = {
  takeOver: {
    title: "Take over conversation?",
    body: "AI will stop responding and you will handle this conversation manually. If you don't reply for 15 minutes, AI takes it back.",
    action: "Take Over",
  },
  handBack: {
    title: "Resume AI?",
    body: "AI will continue responding automatically, starting with anything the customer has asked since you took over.",
    action: "Resume AI",
  },
} as const;

/** The one confirmation before changing who answers the customer. */
export function ConfirmModeDialog({ actions }: Readonly<{ actions: EmbedChatActions }>) {
  const copy = actions.confirming ? COPY[actions.confirming] : null;
  const busy = actions.pending !== null;
  return (
    <Dialog open={!!copy} onOpenChange={(open) => { if (!open && !busy) actions.cancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy?.title}</DialogTitle>
          <DialogDescription>{copy?.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={actions.cancel} disabled={busy}>Cancel</Button>
          <Button onClick={actions.confirm} disabled={busy}>
            {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            {copy?.action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
