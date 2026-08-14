"use client";

import { useState } from "react";
import { Check, ClipboardCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import { aiKnowledgeApi } from "../apis";
import { QUEUE_STATUS_OPTIONS } from "../const";
import type { QueueItem } from "../apis/types";
import { EmptyState, ListSkeleton } from "./shared";

const STATUS_TONE: Record<QueueItem["status"], string> = {
  pending: "bg-amber-100 text-amber-800",
  verified: "bg-emerald-100 text-emerald-800",
  rejected: "bg-destructive/10 text-destructive",
};

export function QueueTab({
  items, loading, status, onStatusChange, onReload,
}: Readonly<{
  items: QueueItem[];
  loading: boolean;
  status: string;
  onStatusChange: (next: string) => void;
  onReload: () => void;
}>) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const run = async (id: string, action: () => Promise<unknown>, success: string) => {
    setBusyId(id);
    try {
      await action();
      toast.success(success);
      onReload();
    } catch (e) {
      toast.error("Action failed", { description: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        {/* flex-col gap, never space-y — the Combobox inserts fixed focus guards. */}
        <div className="flex flex-col gap-1.5">
          <Combobox
            options={QUEUE_STATUS_OPTIONS}
            value={status}
            onChange={onStatusChange}
            className="h-9 w-44 cursor-pointer text-xs"
          />
        </div>
      </div>

      {loading && <ListSkeleton />}

      {!loading && items.length === 0 && (
        <EmptyState icon={ClipboardCheck} title="No items in the verification queue" hint="Community submissions land here for review." />
      )}

      {items.map((item) => (
        <Card key={item.id}>
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium capitalize text-foreground">{item.data_type.replaceAll("_", " ")} submission</p>
                  <Badge className={`text-xs capitalize ${STATUS_TONE[item.status]}`}>{item.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  From: {item.submitter_type} · {new Date(item.created_at).toLocaleDateString()}
                </p>
                {item.rejection_reason && (
                  <p className="mt-1 text-xs text-destructive">Rejected: {item.rejection_reason}</p>
                )}
              </div>

              {item.status === "pending" && (
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline" className="gap-1.5 px-3 text-emerald-600 cursor-pointer"
                    disabled={busyId === item.id}
                    onClick={() => run(item.id, () => aiKnowledgeApi.approveQueueItem(item.id), "Submission approved")}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                  <Button
                    variant="outline" className="gap-1.5 border-destructive/30 px-3 text-destructive cursor-pointer"
                    disabled={busyId === item.id}
                    onClick={() => { setRejectingId(rejectingId === item.id ? null : item.id); setReason(""); }}
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </Button>
                </div>
              )}
            </div>

            {rejectingId === item.id && (
              <div className="flex items-center gap-2 border-t border-border pt-3">
                <Input
                  autoFocus
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why is this being rejected?"
                  className="h-9 flex-1"
                />
                <Button
                  variant="destructive" className="cursor-pointer"
                  disabled={!reason.trim() || busyId === item.id}
                  onClick={() =>
                    run(item.id, async () => {
                      await aiKnowledgeApi.rejectQueueItem(item.id, reason.trim());
                      setRejectingId(null);
                    }, "Submission rejected")
                  }
                >
                  Confirm rejection
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
