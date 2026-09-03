"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Package, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/combobox";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { deleteServiceThunk, fetchServices, toggleServicePublished, updateService } from "../../store/business-profile-detail-slice";
import type { BusinessService } from "../../apis/types";
import { DeleteServiceDialog } from "../services/delete-service-dialog";
import { ServiceColumnPicker } from "../services/service-column-picker";
import { ServiceManagementTable, type ColumnKey, type SortColumn, type SortState } from "../services/service-management-table";

const PAGE_SIZE = 10;
const DEFAULT_COLUMNS: ColumnKey[] = ["category", "degree_level", "area_of_study", "duration", "location", "price", "status"];
const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
];

export function ServicesTab({ businessId, readOnly = false }: Readonly<{ businessId: number; readOnly?: boolean }>) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { items: services, status, total } = useAppSelector((state) => state.businessProfileDetail.services);
  const [deletingService, setDeletingService] = useState<BusinessService | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ column: null, direction: "asc" });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(new Set(DEFAULT_COLUMNS));

  const [hasLoaded, setHasLoaded] = useState(false);
  const fetchPage = (p: number) => {
    dispatch(fetchServices({ id: businessId, params: { search: search || undefined, page: p, limit: PAGE_SIZE } })).finally(() => setHasLoaded(true));
  };

  // Debounced, backend-driven search — the backend already supports `search` (and, for
  // institutions, filters their extraction courses by it too), so this no longer fetches
  // everything and filters client-side.
  const fetchedRef = useRef(false);
  useEffect(() => {
    setPage(1);
    const isFirstRun = !fetchedRef.current;
    fetchedRef.current = true;
    const timer = setTimeout(() => fetchPage(1), isFirstRun ? 0 : 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, businessId, search]);

  const handlePageChange = (p: number) => {
    setPage(p);
    fetchPage(p);
  };

  const handleSortChange = (column: SortColumn) => {
    setSort((s) => (s.column === column ? { column, direction: s.direction === "asc" ? "desc" : "asc" } : { column, direction: "asc" }));
  };

  // Status filter and sort apply only within the current backend page — the search endpoint has
  // no status/sort query params, and a page is only PAGE_SIZE rows, so this is a light, page-local
  // refinement rather than a full re-query.
  const pageRows = useMemo(() => {
    let rows = services;
    if (statusFilter !== "all") {
      rows = rows.filter((s) => (statusFilter === "published" ? s.is_published : !s.is_published));
    }
    if (sort.column) {
      const col = sort.column;
      const key = (s: BusinessService): string => {
        if (col === "name") return s.name;
        if (col === "category") return s.category_name ?? "";
        if (col === "degree_level") return s.degree_level ?? "";
        if (col === "area_of_study") return s.area_of_study ?? "";
        if (col === "duration") return s.duration ?? "";
        if (col === "status") return s.is_published ? "1" : "0";
        return s.price ?? "";
      };
      rows = [...rows].sort((a, b) => key(a).localeCompare(key(b)) * (sort.direction === "asc" ? 1 : -1));
    }
    return rows;
  }, [services, statusFilter, sort]);

  const handleTogglePublish = async (serviceId: string, next: boolean) => {
    try {
      await dispatch(toggleServicePublished({ id: businessId, serviceId, is_published: next })).unwrap();
      toast.success(next ? "Service published" : "Service unpublished");
    } catch (e) {
      toast.error("Couldn't update service", { description: (e as Error).message });
    }
  };

  const handleDelete = async () => {
    if (!deletingService) return;
    setDeleting(true);
    try {
      await dispatch(deleteServiceThunk({ id: businessId, serviceId: deletingService.id })).unwrap();
      toast.success("Service deleted");
      setDeletingService(null);
    } catch (e) {
      toast.error("Couldn't delete service", { description: (e as Error).message });
    } finally {
      setDeleting(false);
    }
  };

  const handlePriceSave = async (serviceId: string, price: number) => {
    try {
      await dispatch(updateService({ id: businessId, serviceId, patch: { price } })).unwrap();
      toast.success("Price updated");
    } catch (e) {
      toast.error("Couldn't update price", { description: (e as Error).message });
    }
  };

  const handleBulkPublish = async (is_published: boolean) => {
    await Promise.all([...selectedIds].map((id) => dispatch(toggleServicePublished({ id: businessId, serviceId: id, is_published }))));
    toast.success(is_published ? "Services published" : "Services unpublished");
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    await Promise.all([...selectedIds].map((id) => dispatch(deleteServiceThunk({ id: businessId, serviceId: id }))));
    toast.success("Services deleted");
    setSelectedIds(new Set());
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">{readOnly ? "Courses" : "Service management"}</h2>
          <p className="text-sm text-muted-foreground">
            {readOnly ? "Courses extracted for this institution." : "Manage your service listings."}
          </p>
        </div>
        {!readOnly && (
          <Button className="h-10" onClick={() => router.push(`/business/profile/${businessId}/services/add`)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add service
          </Button>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {!readOnly && (
            <Combobox className="h-10 w-40" options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} placeholder="Filter" />
          )}
          {!readOnly && selectedIds.size > 0 && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-sm">
              <span>{selectedIds.size} selected</span>
              <Button size="sm" variant="outline" onClick={() => handleBulkPublish(true)}>Publish</Button>
              <Button size="sm" variant="outline" onClick={() => handleBulkPublish(false)}>Unpublish</Button>
              <Button size="sm" variant="outline" className="text-destructive" onClick={handleBulkDelete}>Delete</Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-56">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-10 pl-9" placeholder={readOnly ? "Search courses..." : "Search services..."} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <ServiceColumnPicker visibleColumns={visibleColumns} onChange={setVisibleColumns} />
        </div>
      </div>

      {!hasLoaded || status === "loading" ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : pageRows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
          <Package className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">{readOnly ? "No courses yet" : "No services yet"}</p>
        </div>
      ) : (
        <ServiceManagementTable
          services={pageRows}
          visibleColumns={visibleColumns}
          sort={sort}
          onSortChange={handleSortChange}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          onEdit={(id) => router.push(`/business/profile/${businessId}/services/${id}/edit`)}
          onTogglePublish={handleTogglePublish}
          onPriceSave={handlePriceSave}
          onDelete={setDeletingService}
          readOnly={readOnly}
        />
      )}

      {total > 0 && <Pagination page={page} total={total} limit={PAGE_SIZE} onPageChange={handlePageChange} />}

      <DeleteServiceDialog
        service={deletingService}
        onOpenChange={(open) => { if (!open) setDeletingService(null); }}
        onConfirm={handleDelete}
        deleting={deleting}
      />
    </div>
  );
}
