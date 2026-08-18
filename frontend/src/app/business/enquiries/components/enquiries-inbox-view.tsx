"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  clearActionError,
  closeDistribution,
  fetchCredits,
  fetchDistributions,
  unlockDistribution,
} from "../store/business-enquiries-slice";
import { ENQUIRY_STAT_STATUSES, ENQUIRY_STATUS_LABEL } from "../const";
import { CloseEnquiryDialog } from "./close-enquiry-dialog";
import { ConfirmUnlockDialog } from "./confirm-unlock-dialog";
import { EnquiryInboxCard, EnquiryInboxCardSkeleton } from "./enquiry-inbox-card";

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-4 py-3 text-center">
      <p className="text-2xl font-semibold leading-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function EnquiriesInboxView() {
  const dispatch = useAppDispatch();
  const { items, status, error, credits, unlockCost, actingId, actionError } = useAppSelector(
    (s) => s.businessEnquiries,
  );

  // Ref guard per AGENTS.md — Strict Mode double-invokes effects on mount.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchDistributions());
    dispatch(fetchCredits());
  }, [dispatch]);

  // `dialogSeq` remounts the dialog so it never shows the previous row's reason:
  // setting `open` from here does not fire the dialog's own onOpenChange.
  const [closeTarget, setCloseTarget] = useState<string | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<string | null>(null);
  const [dialogSeq, setDialogSeq] = useState(0);

  const targetItem = items.find((i) => i.distribution_id === closeTarget) ?? null;
  const unlockItem = items.find((i) => i.distribution_id === unlockTarget) ?? null;

  const openCloseDialog = (id: string) => {
    dispatch(clearActionError());
    setCloseTarget(id);
    setDialogSeq((n) => n + 1);
  };

  const handleConfirmUnlock = async () => {
    if (!unlockTarget) return;
    const result = await dispatch(unlockDistribution(unlockTarget));
    // Close on success only — on 402/409 the banner explains why, and dismissing
    // the dialog first would hide what the user just tried to do.
    if (unlockDistribution.fulfilled.match(result)) setUnlockTarget(null);
  };

  const handleConfirmClose = async (reason: string) => {
    if (!closeTarget) return;
    const result = await dispatch(closeDistribution({ id: closeTarget, closeReason: reason }));
    // Keep it open on failure so the typed reason isn't lost.
    if (closeDistribution.fulfilled.match(result)) setCloseTarget(null);
  };

  const counts = useMemo(() => {
    const byStatus = new Map<string, number>();
    for (const item of items) byStatus.set(item.status, (byStatus.get(item.status) ?? 0) + 1);
    return [
      { label: "Total", value: items.length },
      ...ENQUIRY_STAT_STATUSES.map((s) => ({
        label: ENQUIRY_STATUS_LABEL[s] ?? s,
        value: byStatus.get(s) ?? 0,
      })),
    ];
  }, [items]);

  const loadingFirstPage = status === "loading" && items.length === 0;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Enquiry Management</h1>
          <p className="text-sm text-muted-foreground">Student enquiries matched to your business.</p>
        </div>
        {credits != null && (
          <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <Coins className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">{credits}</span>
            <span className="text-muted-foreground">credits · {unlockCost} per unlock</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {counts.map((c) => (
          <StatCard key={c.label} value={c.value} label={c.label} />
        ))}
      </div>

      {/* 402 / 409 land here with the server's own wording. */}
      {actionError && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="text-destructive">{actionError}</p>
          <Button variant="link" size="sm" className="h-auto px-0" onClick={() => dispatch(clearActionError())}>
            Dismiss
          </Button>
        </div>
      )}

      {status === "failed" && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="text-destructive">{error ?? "Failed to load enquiries"}</p>
          <Button variant="link" size="sm" className="px-0" onClick={() => dispatch(fetchDistributions())}>
            Try again
          </Button>
        </div>
      )}

      {loadingFirstPage && (
        <div className="space-y-3">
          <EnquiryInboxCardSkeleton />
          <EnquiryInboxCardSkeleton />
          <EnquiryInboxCardSkeleton />
        </div>
      )}

      {!loadingFirstPage && status !== "failed" && items.length === 0 && (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">No enquiries matched to your business yet.</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-3">
          {items.map((item) => (
            <EnquiryInboxCard
              key={item.distribution_id}
              item={item}
              unlockCost={unlockCost}
              credits={credits}
              busy={actingId === item.distribution_id}
              onUnlock={() => {
                dispatch(clearActionError());
                setUnlockTarget(item.distribution_id);
              }}
              onClose={() => openCloseDialog(item.distribution_id)}
            />
          ))}
        </div>
      )}

      <ConfirmUnlockDialog
        open={unlockTarget != null}
        onOpenChange={(open) => !open && setUnlockTarget(null)}
        onConfirm={handleConfirmUnlock}
        courseName={unlockItem?.course_name ?? null}
        unlockCost={unlockCost}
        credits={credits}
        submitting={actingId != null && actingId === unlockTarget}
      />

      <CloseEnquiryDialog
        key={dialogSeq}
        open={closeTarget != null}
        onOpenChange={(open) => !open && setCloseTarget(null)}
        onConfirm={handleConfirmClose}
        courseName={targetItem?.course_name ?? null}
        submitting={actingId != null && actingId === closeTarget}
      />
    </div>
  );
}
