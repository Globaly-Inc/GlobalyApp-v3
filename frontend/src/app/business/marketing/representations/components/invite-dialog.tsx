"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAppDispatch } from "@/lib/hooks";
import { representationsApi } from "../apis";
import type { RepresentationTarget } from "../apis/types";
import { inviteRepresentation } from "../store/representations-slice";

export function InviteDialog({
  open, onOpenChange, targetLabel,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; targetLabel: string }>) {
  const dispatch = useAppDispatch();
  const [targets, setTargets] = useState<RepresentationTarget[]>([]);
  const [targetId, setTargetId] = useState("");
  const [regions, setRegions] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const search = (query: string) => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      const results = await representationsApi.search(query || undefined);
      setTargets(results);
    }, 300);
  };

  const reset = () => { setTargetId(""); setRegions(""); setNotes(""); };

  const handleSend = async () => {
    if (!targetId) return;
    setSending(true);
    try {
      await dispatch(inviteRepresentation({
        target_business_id: Number(targetId),
        regions: regions.split(",").map((r) => r.trim()).filter(Boolean),
        notes: notes.trim() || null,
      })).unwrap();
      toast.success("Request sent!");
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error("Couldn't send request", { description: (e as Error).message });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite to Represent</DialogTitle>
          <DialogDescription>Search for verified {targetLabel} to send a representation request.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Combobox
            options={targets.map((t) => ({ value: String(t.id), label: t.business_name, description: t.city ?? undefined }))}
            value={targetId}
            onChange={setTargetId}
            onQueryChange={search}
            placeholder={`Search ${targetLabel}...`}
            searchPlaceholder={`Search ${targetLabel}...`}
            emptyText={`No matching ${targetLabel} found.`}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Regions (optional, comma-separated)</label>
            <Input placeholder="e.g. Sydney, Melbourne, Brisbane" value={regions} onChange={(e) => setRegions(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Notes (optional)</label>
            <Textarea placeholder="Add a message for the recipient..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>

          <Button className="w-full gap-1.5" disabled={!targetId || sending} onClick={handleSend}>
            <Send className="h-4 w-4" /> Send Request
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
