"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AdminSegmentedTabs } from "@/app/admin/components/admin-segmented-tabs";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchBusinessCategories } from "@/app/admin/platform/categories/store/categories-slice";
import {
  deleteBusinessThunk,
  fetchBusinesses,
  updateBusinessPublished,
  updateBusinessStatus,
} from "../store/businesses-slice";
import { filterBusinessesBySourceAndOwnership } from "../utils";
import type { Business } from "../apis/types";
import { BusinessCard } from "./shared/business-card";
import { DeleteBusinessDialog } from "./shared/delete-business-dialog";
import { BulkDeleteDialog } from "./shared/bulk-delete-dialog";
import { BusinessFiltersBar } from "./shared/business-filters-bar";
import { BusinessSelectionBar } from "./shared/business-selection-bar";

export function BusinessesView() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { businesses, status } = useAppSelector((state) => state.platformBusinesses);
  const categories = useAppSelector((state) => state.platformCategories.businessCategories.data);

  const [tab, setTab] = useState<"businesses" | "services" | "claims">("businesses");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [ownershipFilter, setOwnershipFilter] = useState("all");

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [publishBusyId, setPublishBusyId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Business | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const fetchedCategoriesRef = useRef(false);
  useEffect(() => {
    if (fetchedCategoriesRef.current) return;
    fetchedCategoriesRef.current = true;
    if (categories.length > 0) return;
    dispatch(fetchBusinessCategories({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildBusinessesParams = () => ({
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    category: categoryFilter !== "all" ? Number(categoryFilter) : undefined,
  });

  const lastBusinessesFetchKey = useRef<string | null>(null);
  useEffect(() => {
    const params = buildBusinessesParams();
    const key = JSON.stringify(params);
    if (lastBusinessesFetchKey.current === key) return;
    lastBusinessesFetchKey.current = key;
    dispatch(fetchBusinesses(params));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, search, statusFilter, categoryFilter]);

  const categoryOptions = useMemo(
    () => [{ value: "all", label: "All categories" }, ...categories.map((c) => ({ value: String(c.id), label: c.name }))],
    [categories],
  );

  const filteredBusinesses = useMemo(
    () => filterBusinessesBySourceAndOwnership(businesses, sourceFilter, ownershipFilter),
    [businesses, sourceFilter, ownershipFilter],
  );

  const visibleIds = filteredBusinesses.map((b) => b.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleOne = (id: number) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((s) => {
      const next = new Set(s);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const runVerify = (id: number) =>
    dispatch(updateBusinessStatus({ id, status: "verified" }))
      .unwrap()
      .then(() => {
        toast.success("Business verified");
        dispatch(fetchBusinesses(buildBusinessesParams()));
      })
      .catch((e: Error) => toast.error("Couldn't update status", { description: e.message }));

  const runSuspend = (id: number) =>
    dispatch(updateBusinessStatus({ id, status: "suspended" }))
      .unwrap()
      .then(() => {
        toast.success("Business suspended");
        dispatch(fetchBusinesses(buildBusinessesParams()));
      })
      .catch((e: Error) => toast.error("Couldn't update status", { description: e.message }));

  const runTogglePublish = async (id: number, next: boolean) => {
    setPublishBusyId(id);
    try {
      await dispatch(updateBusinessPublished({ id, is_published: next })).unwrap();
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
      await dispatch(deleteBusinessThunk(deleteTarget.id)).unwrap();
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
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkBusy(true);
    const results = await Promise.all(
      ids.map((id) => dispatch(updateBusinessStatus({ id, status: target })).unwrap().then(() => true).catch(() => false)),
    );
    const ok = results.filter(Boolean).length;
    setBulkBusy(false);
    clearSelection();
    toast[ok < ids.length ? "error" : "success"](`Updated ${ok} of ${ids.length}`);
    dispatch(fetchBusinesses(buildBusinessesParams()));
  };

  const bulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkBusy(true);
    const results = await Promise.all(
      ids.map((id) => dispatch(deleteBusinessThunk(id)).unwrap().then(() => true).catch(() => false)),
    );
    const ok = results.filter(Boolean).length;
    setBulkBusy(false);
    setBulkDeleteOpen(false);
    clearSelection();
    toast[ok < ids.length ? "error" : "success"](`Deleted ${ok} of ${ids.length}`);
    dispatch(fetchBusinesses(buildBusinessesParams()));
  };

  let list: React.ReactNode;
  if (status === "loading") {
    list = (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  } else if (filteredBusinesses.length === 0) {
    list = (
      <div className="py-12 text-center text-muted-foreground">
        <Building2 className="mx-auto mb-3 h-12 w-12 opacity-30" />
        <p>No businesses found.</p>
      </div>
    );
  } else {
    list = (
      <div className="space-y-3">
        {filteredBusinesses.map((b) => (
          <BusinessCard
            key={b.id}
            business={b}
            selected={selected.has(b.id)}
            onToggleSelect={() => toggleOne(b.id)}
            onView={() => router.push(`/admin/platform/businesses/${b.id}`)}
            onVerify={() => runVerify(b.id)}
            onSuspend={() => runSuspend(b.id)}
            onTogglePublish={() => runTogglePublish(b.id, !b.is_published)}
            onDelete={() => setDeleteTarget(b)}
            publishBusy={publishBusyId === b.id}
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

      {tab !== "businesses" ? (
        <div className="py-12 text-center text-muted-foreground">
          <p>{tab === "services" ? "Services" : "Claim requests"} management is coming soon.</p>
        </div>
      ) : (
        <>
      <BusinessFiltersBar
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
        categoryOptions={categoryOptions}
        sourceFilter={sourceFilter}
        onSourceChange={setSourceFilter}
        ownershipFilter={ownershipFilter}
        onOwnershipChange={setOwnershipFilter}
      />

      {status !== "loading" && filteredBusinesses.length > 0 && (
        <div className="flex items-center gap-3 px-1">
          <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} aria-label="Select all visible" />
          <span className="text-xs text-muted-foreground">
            {someSelected ? `${selected.size} selected` : `Select all ${visibleIds.length} visible`}
          </span>
        </div>
      )}

      {list}

      {someSelected && (
        <BusinessSelectionBar
          count={selected.size}
          bulkBusy={bulkBusy}
          onClear={clearSelection}
          onVerify={() => bulkUpdateStatus("verified")}
          onSuspend={() => bulkUpdateStatus("suspended")}
          onDeleteClick={() => setBulkDeleteOpen(true)}
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
    </div>
  );
}
