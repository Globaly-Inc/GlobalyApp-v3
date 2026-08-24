"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Coins, Inbox, RotateCw, SearchX, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  clearActionError,
  closeDistribution,
  fetchCredits,
  fetchDistributions,
  unlockDistribution,
} from "../store/business-enquiries-slice";
import type { InboxFilterKey } from "../const";
import { applyInboxFilter, defaultFilter, filterCounts } from "../utils";
import { CloseEnquiryDialog } from "./close-enquiry-dialog";
import { ConfirmUnlockDialog } from "./confirm-unlock-dialog";
import { EnquiryInboxCard, EnquiryInboxCardSkeleton } from "./enquiry-inbox-card";
import { InboxFilters } from "./inbox-filters";

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

  // Derived until touched, the same shape as the enquiry dialog's institution field: the
  // landing pill depends on data that arrives after mount, and this avoids setting state
  // in an effect (which this repo lints against) while still honouring a real click.
  const [picked, setPicked] = useState<InboxFilterKey | null>(null);
  const counts = useMemo(() => filterCounts(items), [items]);
  const filter = picked ?? defaultFilter(counts);
  const visible = useMemo(() => applyInboxFilter(items, filter), [items, filter]);

  const loadingFirstPage = status === "loading" && items.length === 0;

  return (
    <div className="mx-auto max-w-4xl space-y-4 md:space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Enquiries</h1>
          <p className="mt-1 text-sm text-muted-foreground">Student enquiries matched to your business.</p>
        </div>
        {credits != null && (
          <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <Coins className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">{credits}</span>
            <span className="text-muted-foreground">credits · {unlockCost} per unlock</span>
          </div>
        )}
      </div>

      {items.length > 0 && <InboxFilters counts={counts} active={filter} onChange={setPicked} />}

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
        <Card className="items-center gap-2 border border-dashed border-destructive/40 px-6 py-12 text-center ring-0">
          <TriangleAlert className="size-6 text-destructive" aria-hidden />
          <p className="font-semibold text-foreground">Couldn&apos;t load your enquiries</p>
          <p className="max-w-sm text-sm text-muted-foreground">{error ?? "Something went wrong on our side."}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => dispatch(fetchDistributions())}>
            <RotateCw className="size-3.5" aria-hidden />
            Try again
          </Button>
        </Card>
      )}

      {loadingFirstPage && (
        <div className="space-y-3">
          <EnquiryInboxCardSkeleton />
          <EnquiryInboxCardSkeleton />
          <EnquiryInboxCardSkeleton />
        </div>
      )}

      {/* Two empty states: nothing matched yet, versus nothing in the chosen filter. The
          second must not read as "you have no leads". */}
      {!loadingFirstPage && status !== "failed" && visible.length === 0 && (
        <Card className="items-center gap-2 border border-dashed border-border bg-card/40 px-6 py-14 text-center ring-0">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            {items.length === 0 ? <Inbox className="size-6" aria-hidden /> : <SearchX className="size-6" aria-hidden />}
          </div>
          <p className="mt-1 font-semibold text-foreground">
            {items.length === 0 ? "No enquiries yet" : "Nothing in this filter"}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {items.length === 0
              ? "Student enquiries matching your courses and location appear here as soon as they are distributed."
              : "No enquiry is in this state right now. Try another tab to see the rest."}
          </p>

        </Card>
      )}

      {visible.length > 0 && (
        <div className="space-y-3">
          {visible.map((item) => (
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
