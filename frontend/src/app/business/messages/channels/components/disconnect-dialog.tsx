"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppDispatch } from "@/lib/hooks";
import { INBOX_CHANNELS } from "../../const";
import type { ChannelConnection } from "../apis/types";
import { disconnectChannel } from "../store/channels-slice";

export function DisconnectDialog({ connection, onClose }: Readonly<{ connection: ChannelConnection | null; onClose: () => void }>) {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);
  const label = connection ? INBOX_CHANNELS[connection.channel].label : "";

  const confirm = async () => {
    if (!connection) return;
    setBusy(true);
    const result = await dispatch(disconnectChannel(connection.id));
    setBusy(false);
    if ("error" in result) {
      toast.error(`Couldn't disconnect ${label}`, { description: result.error.message ?? "Please try again." });
      return;
    }
    toast.success(`${label} disconnected`);
    onClose();
  };

  return (
    <Dialog open={!!connection} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Disconnect {label}?</DialogTitle>
          <DialogDescription>
            AI stops answering on {connection?.handle ?? connection?.display_name} and new messages won&apos;t reach your Inbox. Past conversations stay where they are.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={confirm} disabled={busy}>
            {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            Disconnect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
