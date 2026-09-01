"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Coins, Inbox, Info, RotateCw, SearchX, TriangleAlert } from "lucide-react";
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
import { defaultFilter, filterCounts, statusParam } from "../utils";
import { CloseEnquiryDialog } from "./close-enquiry-dialog";
import { ConfirmUnlockDialog } from "./confirm-unlock-dialog";
import { EnquiryInboxCard, EnquiryInboxCardSkeleton } from "./enquiry-inbox-card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Search } from "lucide-react";
import { INBOX_FILTERS, INBOX_PAGE_SIZE } from "../const";
import { AdminSegmentedTabs } from "@/app/admin/components/admin-segmented-tabs";

export function EnquiriesInboxView() {
  const dispatch = useAppDispatch();
  const { items, status, error, credits, unlockCost, actingId, actionError, total, countsByStatus } =
    useAppSelector((s) => s.businessEnquiries);

  // Ref guard per AGENTS.md — Strict Mode double-invokes effects on mount. The distributions
  // fetch moved to the filter effect below, which already runs on mount with the defaults.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
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
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const counts = useMemo(() => filterCounts(countsByStatus), [countsByStatus]);
  const filter = picked ?? defaultFilter(counts);
  // The server applied the status filter, the search and the paging.
  const visible = items;

  // One effect owns every fetch so the controls cannot race. Debounced for the search box; the
  // tab and page changes ride the same timer, which costs them 250ms and saves a code path.
  useEffect(() => {
    const timer = setTimeout(() => {
      dispatch(fetchDistributions({ page, search: search.trim() || undefined, status: statusParam(filter) }));
    }, 250);
    return () => clearTimeout(timer);
  }, [dispatch, page, search, filter]);

  // Reset in the handlers rather than an effect: a setState in an effect body cascades a render,
  // and here it would also fire a fetch for the stale page before the reset landed.
  const changeSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };
  const changeFilter = (next: InboxFilterKey) => {
    setPicked(next);
    setPage(1);
  };

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

      {/* Tabs above the search — the tabs choose WHICH set you are looking at, the search narrows
          within it, so they read top-to-bottom in that order.
          
          Grouped in their own wrapper with an explicit gap rather than left to the page's
          `space-y-4`: the tabs carry a default `mb-4` of their own, so out here the spacing came
          from whichever of the two rules tailwind-merge happened to resolve. `mb-0` on the tabs
          hands the whole gap to this wrapper, so it is one number in one place.

          `flex flex-col gap-4`, NOT `space-y-*`: space-y works by putting a margin on the
          children, which lost a specificity fight with the tabs' own `mb-*` and collapsed the gap
          to nothing. Flex `gap` belongs to this container, so no child utility can override it. */}
      <div className="flex flex-col gap-4">
        <AdminSegmentedTabs
          options={INBOX_FILTERS.map((f) => ({ value: f.key, label: f.label, count: counts[f.key] }))}
          value={filter}
          onChange={changeFilter}
          className="mb-0"
        />

        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            placeholder="Search by course, student or message..."
            value={search}
            onChange={(e) => changeSearch(e.target.value)}
            className="h-9 pl-8 text-sm"
          />
        </div>
      </div>

      {/* 402 / 409 land here with the server's own wording. */}
      {/* Stated once, above the list — the cost is identical on every card, and repeating it on
          each one was noise that grew with the page size. Same shape as the error banner below,
          in an informational tone. */}
      <div className="flex items-start gap-2.5 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-500/30 dark:bg-blue-500/10">
        <Info className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
        <p className="text-blue-900 dark:text-blue-200">
          Unlocking an enquiry costs <span className="font-semibold">{unlockCost} credits</span>. It reveals the
          student&apos;s full name, contact details and profile, and opens a conversation with them.
        </p>
      </div>

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

      {/* `total > 0`, not `> INBOX_PAGE_SIZE` — every other paginated list in the app shows this
          whenever there are rows, because the "Showing 1–5 of 5" line is useful on a single page
          too. Gating on the page size hid it entirely for anyone with fewer rows than one page. */}
      {total > 0 && <Pagination page={page} total={total} limit={INBOX_PAGE_SIZE} onPageChange={setPage} />}

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
