"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Pagination } from "@/components/ui/pagination";
import { AdminSegmentedTabs } from "@/app/admin/components/admin-segmented-tabs";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchBusinessCategoryOptions } from "@/app/admin/platform/categories/store/categories-slice";
import { DynamicIcon } from "@/components/dynamic-icon";
import {
  deleteBusinessThunk,
  fetchBusinesses,
  sendBulkClaimRequests,
  sendClaimRequest,
  updateBusinessPublished,
  updateBusinessStatus,
} from "../store/businesses-slice";
import { filterBusinessesBySourceAndOwnership } from "../utils";
import type { Business, BusinessSort, ListingRef } from "../apis/types";
import { BusinessCard } from "./shared/business-card";
import { DeleteBusinessDialog } from "./shared/delete-business-dialog";
import { BulkDeleteDialog } from "./shared/bulk-delete-dialog";
import { ClaimRequestDialog, type ClaimRequestTarget } from "./shared/claim-request-dialog";
import { BusinessFiltersBar } from "./shared/business-filters-bar";
import { BusinessSelectionBar } from "./shared/business-selection-bar";

export function BusinessesView() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { businesses, total, status } = useAppSelector((state) => state.platformBusinesses);
  const categories = useAppSelector((state) => state.platformCategories.businessCategoryOptions);

  const [tab, setTab] = useState<"businesses" | "services" | "claims">("businesses");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [ownershipFilter, setOwnershipFilter] = useState("all");
  const [sort, setSort] = useState("created_desc");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  // Server-side filters change the result set, so a stale page would fall off the end.
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(value), 300);
  };

  // The list mixes both tables, so business 19 and institution 19 are different rows with the
  // same id — row identity (React keys, selection) must be {kind, id}, not id alone.
  const keyOf = (b: Business) => `${b.kind}-${b.id}`;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [publishBusyId, setPublishBusyId] = useState<number | null>(null);
  const [claimRequestBusy, setClaimRequestBusy] = useState(false);
  const [claimRequestTarget, setClaimRequestTarget] = useState<ClaimRequestTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Business | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const fetchedCategoriesRef = useRef(false);
  useEffect(() => {
    if (fetchedCategoriesRef.current) return;
    fetchedCategoriesRef.current = true;
    if (categories.length > 0) return;
    dispatch(fetchBusinessCategoryOptions());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildBusinessesParams = () => ({
    search: debouncedSearch || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    category: categoryFilter !== "all" ? Number(categoryFilter) : undefined,
    sort: sort as BusinessSort,
    page,
    limit,
  });

  const lastBusinessesFetchKey = useRef<string | null>(null);
  useEffect(() => {
    const params = buildBusinessesParams();
    const key = JSON.stringify(params);
    if (lastBusinessesFetchKey.current === key) return;
    lastBusinessesFetchKey.current = key;
    dispatch(fetchBusinesses(params));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, debouncedSearch, statusFilter, categoryFilter, sort, page, limit]);

  const categoryOptions = useMemo(
    () => [
      { value: "all", label: "All categories" },
      ...categories.map((c) => ({
        value: String(c.id),
        label: c.name,
        icon: <DynamicIcon name={c.icon} fallback="Building2" className="h-4 w-4" />,
      })),
    ],
    [categories],
  );

  const filteredBusinesses = useMemo(
    () => filterBusinessesBySourceAndOwnership(businesses, sourceFilter, ownershipFilter),
    [businesses, sourceFilter, ownershipFilter],
  );

  // The claims tab is the same list, pre-filtered: anything an admin has sent a claim
  // request for and nobody has accepted yet. Accepted ones flip to "claimed" and drop out.
  const displayed = tab === "claims"
    ? businesses.filter((b) => b.claim_status === "claim_pending")
    : filteredBusinesses;

  const visibleKeys = filteredBusinesses.map(keyOf);
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selected.has(k));
  const someSelected = selected.size > 0;

  /** The selected rows as {kind, id} refs — every mutation routes by kind. */
  const selectedRefs = (): ListingRef[] =>
    [...selected].map((k) => {
      const [kind, id] = k.split("-");
      return { kind: kind as ListingRef["kind"], id: Number(id) };
    });

  const toggleOne = (key: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((s) => {
      const next = new Set(s);
      if (allVisibleSelected) visibleKeys.forEach((k) => next.delete(k));
      else visibleKeys.forEach((k) => next.add(k));
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const runVerify = (b: Business) =>
    dispatch(updateBusinessStatus({ kind: b.kind, id: b.id, status: "verified" }))
      .unwrap()
      .then(() => {
        toast.success("Business verified");
        dispatch(fetchBusinesses(buildBusinessesParams()));
      })
      .catch((e: Error) => toast.error("Couldn't update status", { description: e.message }));

  const runSuspend = (b: Business) =>
    dispatch(updateBusinessStatus({ kind: b.kind, id: b.id, status: "suspended" }))
      .unwrap()
      .then(() => {
        toast.success("Business suspended");
        dispatch(fetchBusinesses(buildBusinessesParams()));
      })
      .catch((e: Error) => toast.error("Couldn't update status", { description: e.message }));

  const runSendClaimRequest = async () => {
    if (!claimRequestTarget) return;
    setClaimRequestBusy(true);
    try {
      if (claimRequestTarget.kind === "single") {
        const b = claimRequestTarget.business;
        await dispatch(sendClaimRequest({ kind: b.kind, id: b.id })).unwrap();
        // The link goes to the listing's own contact email when nobody owns it yet — see
        // sendClaimRequest / sendInstitutionClaimRequest on the backend.
        toast.success(`Claim request sent to ${b.owner_email ?? b.email ?? "the listed contact"}`);
      } else {
        const refs = selectedRefs();
        await dispatch(sendBulkClaimRequests(refs)).unwrap();
        toast.success(`Queued claim requests for ${refs.length} businesses`);
        clearSelection();
      }
      setClaimRequestTarget(null);
    } catch (e) {
      toast.error("Couldn't send claim request", { description: (e as Error).message });
    } finally {
      setClaimRequestBusy(false);
    }
  };

  const runTogglePublish = async (b: Business, next: boolean) => {
    setPublishBusyId(b.id);
    try {
      await dispatch(updateBusinessPublished({ kind: b.kind, id: b.id, is_published: next })).unwrap();
      toast.success(next ? "Business published" : "Business unpublished");
    } catch (e) {
      toast.error("Couldn't update publish status", { description: (e as Error).message });
    } finally {
      setPublishBusyId(null);
    }
  };

  const runDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await dispatch(deleteBusinessThunk({ kind: deleteTarget.kind, id: deleteTarget.id })).unwrap();
      toast.success("Business deleted");
      setDeleteTarget(null);
      dispatch(fetchBusinesses(buildBusinessesParams()));
    } catch (e) {
      toast.error("Couldn't delete business", { description: (e as Error).message });
    } finally {
      setDeleting(false);
    }
  };

  const bulkUpdateStatus = async (target: "verified" | "suspended") => {
    const refs = selectedRefs();
    if (refs.length === 0) return;
    setBulkBusy(true);
    const results = await Promise.all(
      refs.map((r) => dispatch(updateBusinessStatus({ ...r, status: target })).unwrap().then(() => true).catch(() => false)),
    );
    const ok = results.filter(Boolean).length;
    setBulkBusy(false);
    clearSelection();
    toast[ok < refs.length ? "error" : "success"](`Updated ${ok} of ${refs.length}`);
    dispatch(fetchBusinesses(buildBusinessesParams()));
  };

  const bulkDelete = async () => {
    const refs = selectedRefs();
    if (refs.length === 0) return;
    setBulkBusy(true);
    const results = await Promise.all(
      refs.map((r) => dispatch(deleteBusinessThunk(r)).unwrap().then(() => true).catch(() => false)),
    );
    const ok = results.filter(Boolean).length;
    setBulkBusy(false);
    setBulkDeleteOpen(false);
    clearSelection();
    toast[ok < refs.length ? "error" : "success"](`Deleted ${ok} of ${refs.length}`);
    dispatch(fetchBusinesses(buildBusinessesParams()));
  };

  let list: React.ReactNode;
  if (status === "loading") {
    list = (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  } else if (displayed.length === 0) {
    list = (
      <div className="py-12 text-center text-muted-foreground">
        <Building2 className="mx-auto mb-3 h-12 w-12 opacity-30" />
        <p>{tab === "claims" ? "No pending claim requests." : "No businesses found."}</p>
      </div>
    );
  } else {
    list = (
      <div className="space-y-3">
        {displayed.map((b) => (
          <BusinessCard
            key={keyOf(b)}
            business={b}
            selected={selected.has(keyOf(b))}
            onToggleSelect={() => toggleOne(keyOf(b))}
            onView={() => router.push(`/admin/platform/businesses/${b.id}?kind=${b.kind}`)}
            onVerify={() => runVerify(b)}
            onSuspend={() => runSuspend(b)}
            onTogglePublish={() => runTogglePublish(b, !b.is_published)}
            onDelete={() => setDeleteTarget(b)}
            onSendClaimRequest={() =>
              // Recipient decided here, from the row: the owner's address if this listing has an
              // owner, otherwise its own contact email. Same rule the backend applies.
              setClaimRequestTarget({ kind: "single", business: b, recipient: b.owner_email ?? b.email })
            }
            publishBusy={publishBusyId === b.id}
            claimRequestBusy={claimRequestBusy && claimRequestTarget?.kind === "single" && claimRequestTarget.business.id === b.id}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Business Management</h1>
          <p className="mt-1 text-muted-foreground">Verify, manage, and pre-seed business accounts.</p>
        </div>
        <Button className="cursor-pointer gap-1" onClick={() => router.push("/admin/platform/businesses/add")}>
          <Plus className="h-4 w-4" />
          Add Business
        </Button>
      </div>

      <AdminSegmentedTabs
        options={[
          { value: "businesses", label: "Businesses" },
          { value: "services", label: "Services" },
          { value: "claims", label: "Claim Requests" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "services" ? (
        <div className="py-12 text-center text-muted-foreground">
          <p>Services management is coming soon.</p>
        </div>
      ) : tab === "claims" ? (
        list
      ) : (
        <>
      <BusinessFiltersBar
        search={search}
        onSearchChange={handleSearchChange}
        statusFilter={statusFilter}
        onStatusChange={resetPage(setStatusFilter)}
        categoryFilter={categoryFilter}
        onCategoryChange={resetPage(setCategoryFilter)}
        categoryOptions={categoryOptions}
        sourceFilter={sourceFilter}
        onSourceChange={setSourceFilter}
        ownershipFilter={ownershipFilter}
        onOwnershipChange={setOwnershipFilter}
        sort={sort}
        onSortChange={resetPage(setSort)}
      />

      {status !== "loading" && filteredBusinesses.length > 0 && (
        <div className="flex items-center gap-3 px-1">
          <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} aria-label="Select all visible" />
          <span className="text-xs text-muted-foreground">
            {someSelected ? `${selected.size} selected` : `Select all ${visibleKeys.length} visible`}
          </span>
        </div>
      )}

      {list}

      {status !== "loading" && total > 0 && (
        <Pagination
          page={page}
          limit={limit}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={resetPage(setLimit)}
          align="end"
        />
      )}

      {someSelected && (
        <BusinessSelectionBar
          count={selected.size}
          bulkBusy={bulkBusy}
          onClear={clearSelection}
          onVerify={() => bulkUpdateStatus("verified")}
          onSuspend={() => bulkUpdateStatus("suspended")}
          onDeleteClick={() => setBulkDeleteOpen(true)}
          onSendClaimRequestsClick={() => setClaimRequestTarget({ kind: "bulk", count: selected.size })}
        />
      )}
        </>
      )}

      <DeleteBusinessDialog
        business={deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={runDelete}
        deleting={deleting}
      />
      <BulkDeleteDialog
        open={bulkDeleteOpen}
        count={selected.size}
        onOpenChange={setBulkDeleteOpen}
        onConfirm={bulkDelete}
        deleting={bulkBusy}
      />
      <ClaimRequestDialog
        target={claimRequestTarget}
        onOpenChange={(open) => !open && setClaimRequestTarget(null)}
        onConfirm={runSendClaimRequest}
        sending={claimRequestBusy}
      />
    </div>
  );
}
