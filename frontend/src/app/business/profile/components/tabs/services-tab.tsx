"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthState } from "@/app/auth/store/auth-slice";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ServiceFilterValues } from "../services/service-filters";
import { ServiceToolbar, type CourseCategory } from "../services/service-toolbar";
import { ServiceTableSkeleton } from "../services/service-table-skeleton";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { businessApi } from "@/app/business/apis";
import { deleteServiceThunk, fetchServices, toggleServicePublished, updateService } from "../../store/business-profile-detail-slice";
import type { BusinessService } from "../../apis/types";
import { DeleteServiceDialog } from "../services/delete-service-dialog";
import { ServiceManagementTable, type ColumnKey, type SortColumn, type SortState } from "../services/service-management-table";
import { useCourseApproval } from "../services/use-course-approval";
import { ServiceBulkBar } from "../services/service-bulk-bar";
import { SelectAllBanner } from "../services/select-all-banner";
import { useServiceBulkActions } from "../services/use-service-bulk-actions";
import { ServiceStatsStrip } from "../services/service-stats-strip";
import { PortalPageHeader } from "../portal-ui/portal-page-header";
import { PortalAddButton } from "../portal-ui/portal-add-button";

const PAGE_SIZE = 10;
const DEFAULT_COLUMNS: ColumnKey[] = ["category", "degree_level", "area_of_study", "price", "status"];
// Short courses have no degree_level/area_of_study (those are academic-course fields only —
// see courseToService) — showing them here would just be an empty "—" in every row.
const SHORT_COURSE_COLUMNS: ColumnKey[] = ["category", "price", "status"];

export function ServicesTab({
  businessId, readOnly = false, isInstitution = false,
}: Readonly<{ businessId: number; readOnly?: boolean; isInstitution?: boolean }>) {
  const router = useRouter();
  // Names the exact org in the link — ids alone can collide across businesses and institutions.
  const activeOrgId = useAuthState().user?.orgId;
  const orgQuery = activeOrgId ? `?org=${encodeURIComponent(activeOrgId)}` : "";
  const dispatch = useAppDispatch();
  const { items: services, status, total } = useAppSelector((state) => state.businessProfileDetail.services);
  const [deletingService, setDeletingService] = useState<BusinessService | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ServiceFilterValues>({});
  const [courseCategory, setCourseCategory] = useState<CourseCategory>("academic");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ column: null, direction: "asc" });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(new Set(DEFAULT_COLUMNS));

  useEffect(() => {
    if (!isInstitution) return;
    setVisibleColumns(new Set(courseCategory === "short_course" ? SHORT_COURSE_COLUMNS : DEFAULT_COLUMNS));
  }, [isInstitution, courseCategory]);

  const [hasLoaded, setHasLoaded] = useState(false);
  const listParams = { search: search || undefined, course_category: isInstitution ? courseCategory : undefined, ...filters };
  const fetchPage = (p: number) => {
    dispatch(fetchServices({
      id: businessId,
      params: { ...listParams, page: p, limit: PAGE_SIZE },
    })).finally(() => setHasLoaded(true));
  };

  // The "Review courses & services" onboarding step is marked done here, once this tab has
  // actually loaded in front of the owner — not on the checklist link's click, which fired before
  // navigation even landed.
  const reviewedRef = useRef(false);
  useEffect(() => {
    // An empty tab isn't a review — wait until there's something in it.
    if (!hasLoaded || reviewedRef.current || total === 0) return;
    reviewedRef.current = true;
    businessApi.markCoursesReviewed().catch(() => {});
  }, [hasLoaded, total]);

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
  }, [dispatch, businessId, search, courseCategory, filters]);

  const handlePageChange = (p: number) => {
    setPage(p);
    fetchPage(p);
  };

  const handleSortChange = (column: SortColumn) => {
    setSort((s) => (s.column === column ? { column, direction: s.direction === "asc" ? "desc" : "asc" } : { column, direction: "asc" }));
  };

  // Filters (status, source, degree level) run on the server across every page; only column sort
  // is page-local — the search endpoint has no sort param, and a page is just PAGE_SIZE rows.
  const pageRows = useMemo(() => {
    let rows = services;
    if (sort.column === "price") {
      // s.price is a formatted currency string ("AUD 4,500"), not a raw number — a string
      // compare would sort "AUD 1,200" before "AUD 450" (lexical, not numeric). An institution
      // fee can also list more than one amount ("AUD 4,500 · International: AUD 3,250") — stripping
      // every non-digit from the whole string would concatenate them into one meaningless number,
      // so only the FIRST amount is parsed out and used for ordering.
      const numericPrice = (s: BusinessService) => {
        const match = s.price?.match(/[\d,]+(?:\.\d+)?/);
        const value = match ? Number(match[0].replace(/,/g, "")) : NaN;
        return Number.isFinite(value) ? value : (sort.direction === "asc" ? Infinity : -Infinity);
      };
      rows = [...rows].sort((a, b) => (numericPrice(a) - numericPrice(b)) * (sort.direction === "asc" ? 1 : -1));
    } else if (sort.column) {
      const col = sort.column;
      const key = (s: BusinessService): string => {
        if (col === "name") return s.name;
        if (col === "category") return s.category_name ?? "";
        if (col === "degree_level") return s.degree_level ?? "";
        if (col === "area_of_study") return s.area_of_study ?? "";
        return s.is_published ? "1" : "0";
      };
      rows = [...rows].sort((a, b) => key(a).localeCompare(key(b)) * (sort.direction === "asc" ? 1 : -1));
    }
    return rows;
  }, [services, sort]);

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

  const { canApprove, approve } = useCourseApproval(() => fetchPage(page));
  const bulk = useServiceBulkActions({
    businessId, services, pageRows, selectedIds, setSelectedIds, approve,
    scopeKey: `${search}|${courseCategory}|${JSON.stringify(filters)}`,
    scopeParams: listParams,
    reload: () => fetchPage(page),
  });
  const { scope, selectedRows, pageAllSelected, clearSelection } = bulk;

  const filtering = !!(search.trim() || filters.published || filters.origin || filters.degree_level);

  return (
    <div className="grid gap-4">
      <PortalPageHeader
        title={readOnly ? "Courses" : "Service management"}
        count={hasLoaded ? total : null}
        subtitle={readOnly ? "Courses extracted for this institution." : "Manage your service listings."}
      >
        {!readOnly && (
          <PortalAddButton onClick={() => router.push(`/business/profile/${businessId}/services/add${orgQuery}`)}>Add service</PortalAddButton>
        )}
      </PortalPageHeader>

      {/* Read-only "Courses" view has no publish states to summarise. Refreshes when the list changes (publish toggles, deletes). */}
      {!readOnly && <ServiceStatsStrip courseCategory={isInstitution ? courseCategory : undefined} isInstitution={isInstitution} refreshKey={services} />}

      <ServiceToolbar
        readOnly={readOnly}
        isInstitution={isInstitution}
        courseCategory={courseCategory}
        onCourseCategoryChange={setCourseCategory}
        search={search}
        onSearchChange={setSearch}
        filters={filters}
        onFiltersChange={setFilters}
      />

      {!hasLoaded || status === "loading" ? (
        <ServiceTableSkeleton columns={visibleColumns.size} />
      ) : pageRows.length === 0 ? (
        <div className="grid justify-items-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed p-[30px] text-center text-muted-foreground">
          {filtering ? (
            <>
              <b className="text-foreground">{readOnly ? "No courses match these filters" : "No services match these filters"}</b>
              <span>Try another search or clear a filter.</span>
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => { setSearch(""); setFilters({}); }}>Clear all filters</Button>
            </>
          ) : (
            <b className="text-foreground">{readOnly ? "No courses yet" : "No services yet"}</b>
          )}
        </div>
      ) : (
        <>
        {!readOnly && pageAllSelected && total > pageRows.length && (
          <SelectAllBanner
            pageCount={pageRows.length}
            total={total}
            allSelected={!!scope.allRows && selectedIds.size >= scope.allRows.length}
            loading={scope.loading}
            onSelectAll={async () => {
              const rows = await scope.selectAll();
              if (rows) setSelectedIds(new Set(rows.map((s) => s.id)));
            }}
            onClear={clearSelection}
          />
        )}
        <ServiceManagementTable
          services={pageRows}
          visibleColumns={visibleColumns}
          sort={sort}
          onSortChange={handleSortChange}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          onEdit={(id) => router.push(`/business/profile/${businessId}/services/${id}/edit${orgQuery}`)}
          onTogglePublish={handleTogglePublish}
          onApprove={canApprove ? (id) => approve([id]) : undefined}
          onPriceSave={handlePriceSave}
          onDelete={setDeletingService}
          readOnly={readOnly}
          isInstitution={isInstitution}
          query={search.trim()}
        />
        </>
      )}

      {/* Mockup footer: muted "Showing a–b of N" left, pager right. The grid gap spaces it, not Pagination's own mt-4. */}
      {total > 0 && (
        <div className="text-[12.5px] tabular-nums text-muted-foreground [&>div]:mt-0 [&_p]:text-[12.5px] [&_button]:size-[30px] [&_button]:rounded-lg">
          <Pagination page={page} total={total} limit={PAGE_SIZE} onPageChange={handlePageChange} />
        </div>
      )}

      {!readOnly && (
        <ServiceBulkBar
          selected={selectedRows}
          canApprove={canApprove}
          onApprove={bulk.handleBulkApprove}
          onPublish={() => bulk.handleBulkPublish(true)}
          onUnpublish={() => bulk.handleBulkPublish(false)}
          onDelete={bulk.handleBulkDelete}
          onClear={clearSelection}
        />
      )}

      <DeleteServiceDialog
        service={deletingService}
        onOpenChange={(open) => { if (!open) setDeletingService(null); }}
        onConfirm={handleDelete}
        deleting={deleting}
      />
    </div>
  );
}
