"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Package, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { applyClientFilter } from "@/lib/filter-matcher";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { useAuthState } from "@/app/auth/store/auth-slice";
import { useColumnPreferences } from "@/lib/use-column-preferences";
import { useUniversalFilter } from "@/lib/use-universal-filter";
import { SERVICES_MODULE_KEY, SERVICES_PAGE_SIZE, SERVICE_COLUMNS, buildServiceFilterFields } from "../../const";
import {
  deleteServiceThunk, fetchAllServices, toggleServicePublished, updateService,
} from "../../store/business-profile-detail-slice";
import { distinctOptions, flattenService, sortServices } from "../../utils";
import type { BusinessService } from "../../apis/types";
import { ServiceBulkActionsBar, type BulkAction } from "../services/service-bulk-actions-bar";
import { ServiceListDialogs } from "../services/service-list-dialogs";
import { ServiceListToolbar } from "../services/service-list-toolbar";
import { ServiceManagementTable, type SortState } from "../services/service-management-table";

/**
 * Service management — V1's `/business/services` page, rendered as this profile's Services tab.
 * Identical for a business or an institution: the whole catalog is loaded once and then
 * searched, filtered, sorted and paginated in the browser, as V1 does — the condition builder
 * can combine any fields with AND/OR, which no query string on `/services/search` expresses.
 */
export function ServicesTab({ businessId }: Readonly<{ businessId: number }>) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { items: services, status } = useAppSelector((state) => state.businessProfileDetail.services);

  // Same institution-vs-business resolution as business-profile-detail-view.tsx — the dialogs
  // below make their own direct API calls (not thunks), so they need the org base explicitly.
  const { user: authUser } = useAuthState();
  const isInstitution =
    !authUser?.businesses.some((b) => b.id === businessId) && !!authUser?.institutions.some((i) => i.id === businessId);
  const orgBase = isInstitution ? "/institutions" : "/businesses";

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ column: null, direction: null });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingService, setDeletingService] = useState<BusinessService | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [feeService, setFeeService] = useState<BusinessService | null>(null);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const columnPrefs = useColumnPreferences({ module: SERVICES_MODULE_KEY, allColumns: SERVICE_COLUMNS });

  const fieldDefinitions = useMemo(
    () =>
      buildServiceFilterFields({
        categories: distinctOptions(services, (s) => s.category_name),
        degreeLevels: distinctOptions(services, (s) => s.degree_level),
        areasOfStudy: distinctOptions(services, (s) => s.area_of_study),
      }),
    [services],
  );
  const filter = useUniversalFilter({ moduleKey: SERVICES_MODULE_KEY, fieldDefinitions });

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchAllServices({ id: businessId })).finally(() => setHasLoaded(true));
  }, [dispatch, businessId]);

  const hasActiveFilters = search.trim().length > 0 || filter.activeCount > 0;

  const { rows, total } = useMemo(() => {
    let filtered = services;
    const query = search.trim().toLowerCase();
    if (query) filtered = filtered.filter((s) => s.name.toLowerCase().includes(query));
    if (filter.activeCount > 0) {
      const matched = new Set(applyClientFilter(filtered.map(flattenService), filter.filterConfig).map((r) => r.id as string));
      filtered = filtered.filter((s) => matched.has(s.id));
    }
    const sorted = sortServices(filtered, sort.column, sort.direction);
    const start = (page - 1) * SERVICES_PAGE_SIZE;
    return { rows: sorted.slice(start, start + SERVICES_PAGE_SIZE), total: filtered.length };
  }, [services, search, filter.activeCount, filter.filterConfig, sort, page]);

  const handlePageChange = (next: number) => setPage(next);

  // Third click on the same header clears the sort, matching V1.
  const handleSortChange = (column: string) =>
    setSort((prev) => {
      if (prev.column !== column) return { column, direction: "asc" };
      if (prev.direction === "asc") return { column, direction: "desc" };
      return { column: null, direction: null };
    });

  const clearAll = () => {
    setSearch("");
    filter.clearFilters();
    setPage(1);
  };

  const handleTogglePublish = async (serviceId: string, next: boolean) => {
    try {
      await dispatch(toggleServicePublished({ id: businessId, serviceId, is_published: next })).unwrap();
      toast.success(next ? "Service published" : "Service unpublished");
    } catch (e) {
      toast.error("Couldn't update service", { description: (e as Error).message });
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

  const handleBulkAction = async (action: BulkAction) => {
    const ids = [...selectedIds];
    if (action === "update_fields") return setShowBulkUpdate(true);
    if (action === "assign_shared") return setShowBulkAssign(true);
    if (action === "delete") {
      await Promise.all(ids.map((serviceId) => dispatch(deleteServiceThunk({ id: businessId, serviceId }))));
      toast.success(`Deleted ${ids.length} service${ids.length === 1 ? "" : "s"}`);
    } else {
      const is_published = action === "publish";
      await Promise.all(ids.map((serviceId) => dispatch(toggleServicePublished({ id: businessId, serviceId, is_published }))));
      toast.success(`${is_published ? "Published" : "Unpublished"} ${ids.length} service${ids.length === 1 ? "" : "s"}`);
    }
    setSelectedIds(new Set());
  };

  let body: React.ReactNode;
  if (!hasLoaded || status === "loading") {
    body = (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      // V1's empty state sits bare on the page — no dashed box around it.
      <div className="py-16 text-center">
        <Package className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
        <p className="mb-4 text-muted-foreground">
          {hasActiveFilters ? "No services match your filters." : "No services yet. Add your first service to get started."}
        </p>
        {hasActiveFilters && (
          <Button variant="outline" size="sm" onClick={clearAll}>
            Clear filters
          </Button>
        )}
      </div>
    );
  } else {
    body = (
      <ServiceManagementTable
        services={rows}
        allColumns={SERVICE_COLUMNS}
        orderedVisibleColumns={columnPrefs.orderedVisibleColumns}
        frozenColumns={columnPrefs.frozenColumns}
        sort={sort}
        onSortChange={handleSortChange}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
        onRowClick={(service) => router.push(`/business/profile/${businessId}/services/${service.id}/edit`)}
        actions={{
          onEdit: (id) => router.push(`/business/profile/${businessId}/services/${id}/edit`),
          onTogglePublish: handleTogglePublish,
          onEditFees: setFeeService,
          onPriceSave: handlePriceSave,
          onDelete: setDeletingService,
        }}
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Service management</h2>
          <p className="text-sm text-muted-foreground">Manage your service listings.</p>
        </div>
        <Button className="h-10" onClick={() => router.push(`/business/profile/${businessId}/services/add`)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add service
        </Button>
      </div>

      <ServiceListToolbar
        filter={filter}
        fieldDefinitions={fieldDefinitions}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          // Page 1 of the new result set, and a selection of rows that may no longer be listed
          // would make the bulk bar act on things the user can't see.
          setPage(1);
          setSelectedIds(new Set());
        }}
        hasActiveFilters={hasActiveFilters}
        onClear={clearAll}
        showFilter
        searchPlaceholder="Search services..."
        columns={{
          allColumns: SERVICE_COLUMNS,
          visibleColumns: columnPrefs.visibleColumns,
          frozenColumns: columnPrefs.frozenColumns,
          onToggleColumn: columnPrefs.toggleColumn,
          onToggleFreeze: columnPrefs.toggleFreeze,
          onReset: columnPrefs.resetToDefaults,
        }}
      />

      {body}

      {total > 0 && <Pagination page={page} total={total} limit={SERVICES_PAGE_SIZE} onPageChange={handlePageChange} />}

      {selectedIds.size > 0 && (
        <ServiceBulkActionsBar
          selectedCount={selectedIds.size}
          totalItems={total}
          onSelectAll={() => setSelectedIds(new Set(rows.map((s) => s.id)))}
          onDeselectAll={() => setSelectedIds(new Set())}
          onAction={handleBulkAction}
        />
      )}

      <ServiceListDialogs
        selectedIds={[...selectedIds]}
        selectedServices={services.filter((s) => selectedIds.has(s.id))}
        orgBase={orgBase}
        bulkUpdateOpen={showBulkUpdate}
        onBulkUpdateOpenChange={setShowBulkUpdate}
        onBulkUpdated={() => {
          dispatch(fetchAllServices({ id: businessId }));
          setSelectedIds(new Set());
        }}
        bulkAssignOpen={showBulkAssign}
        onBulkAssignOpenChange={setShowBulkAssign}
        onBulkAssigned={() => setSelectedIds(new Set())}
        feeService={feeService}
        onFeeServiceClose={() => setFeeService(null)}
        deletingService={deletingService}
        onDeletingServiceClose={() => setDeletingService(null)}
        onConfirmDelete={handleDelete}
        deleting={deleting}
      />
    </div>
  );
}
