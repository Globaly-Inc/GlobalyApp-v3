"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Coins, Inbox, Info, RotateCw, SearchX, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, SearchInput } from "@/components/ui/filter-bar";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCard, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { EnquiryInboxRow, INBOX_COLUMNS } from "./enquiry-inbox-row";
import { Pagination } from "@/components/ui/pagination";
import { INBOX_FILTERS, INBOX_PAGE_SIZE } from "../const";
import { SectionTabs } from "@/components/section-tabs";

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
    // Width and padding come from PortalShell (width="default" in BusinessShell) — no max-w here.
    <PageBody>
      <PageHeader title={<><Inbox /> Enquiries</>} subtitle="Student enquiries matched to your business.">
        {credits != null && (
          <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <Coins className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">{credits}</span>
            <span className="text-muted-foreground">credits · {unlockCost} per unlock</span>
          </div>
        )}
      </PageHeader>

      {/* Tabs above the search — the tabs choose WHICH set you are looking at, the search narrows
          within it, so they read top-to-bottom in that order. `mb-0` hands the gap to PageBody. */}
      <SectionTabs
        options={INBOX_FILTERS.map((f) => ({ value: f.key, label: f.label, count: counts[f.key] }))}
        value={filter}
        onChange={changeFilter}
        className="mb-0"
      />

      <FilterBar>
        <SearchInput
          placeholder="Search by course, student or message..."
          value={search}
          onChange={(e) => changeSearch(e.target.value)}
        />
        <span className="shrink-0 px-2 text-sm text-muted-foreground">
          {total} enquir{total === 1 ? "y" : "ies"}
        </span>
      </FilterBar>

      {/* 402 / 409 land here with the server's own wording. */}
      {/* Stated once, above the list — the cost is identical on every card, and repeating it on
          each one was noise that grew with the page size. Same shape as the error banner below,
          in an informational tone. */}
      <div className="flex items-start gap-2.5 rounded-md border border-info/30 bg-info/10 p-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
        <p className="text-foreground">
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

      {loadingFirstPage && <ListSkeleton count={3} itemClassName="h-20" />}

      {/* Two empty states: nothing matched yet, versus nothing in the chosen filter. The
          second must not read as "you have no leads". */}
      {!loadingFirstPage && status !== "failed" && visible.length === 0 && (
        <EmptyState
          icon={items.length === 0 ? Inbox : SearchX}
          title={items.length === 0 ? "No enquiries yet" : "Nothing in this filter"}
          description={
            items.length === 0
              ? "Student enquiries matching your courses and location appear here as soon as they are distributed."
              : "No enquiry is in this state right now. Try another tab to see the rest."
          }
        />
      )}

      {visible.length > 0 && (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                {INBOX_COLUMNS.map((col) => (
                  <TableHead key={col.label} className={"className" in col ? col.className : undefined}>
                    {"srOnly" in col ? <span className="sr-only">{col.label}</span> : col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((item) => (
                <EnquiryInboxRow
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
            </TableBody>
          </Table>
        </TableCard>
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
    </PageBody>
  );
}
