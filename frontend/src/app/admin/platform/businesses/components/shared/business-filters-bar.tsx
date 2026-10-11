"use client";

import { useEffect, useMemo, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterBar, SearchInput } from "@/components/ui/filter-bar";
import { Combobox } from "@/components/combobox";
import { DynamicIcon } from "@/components/dynamic-icon";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchBusinessCategoryOptions } from "@/app/admin/platform/categories/store/categories-slice";
import { OWNERSHIP_FILTER_OPTIONS, SORT_OPTIONS, SOURCE_FILTER_OPTIONS, STATUS_FILTER_OPTIONS } from "../../const";
import type { useBusinessListParams } from "../use-business-list-params";

const COMBOBOX_CLASS = "h-10 w-44 cursor-pointer bg-background";

export function BusinessFiltersBar({
  params: p,
  total,
}: Readonly<{ params: ReturnType<typeof useBusinessListParams>; total: number }>) {
  const dispatch = useAppDispatch();
  const categories = useAppSelector((state) => state.platformCategories.businessCategoryOptions);

  const fetchedCategoriesRef = useRef(false);
  useEffect(() => {
    if (fetchedCategoriesRef.current) return;
    fetchedCategoriesRef.current = true;
    if (categories.length > 0) return;
    dispatch(fetchBusinessCategoryOptions());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <FilterBar>
      <SearchInput placeholder="Search businesses..." value={p.search} onChange={(e) => p.handleSearchChange(e.target.value)} />
      <Combobox options={STATUS_FILTER_OPTIONS} value={p.statusFilter} onChange={(v) => p.resetPage(p.setStatusFilter, v)} className={COMBOBOX_CLASS} />
      <Combobox options={categoryOptions} value={p.categoryFilter} onChange={(v) => p.resetPage(p.setCategoryFilter, v)} className={COMBOBOX_CLASS} />
      <Combobox options={SOURCE_FILTER_OPTIONS} value={p.sourceFilter} onChange={(v) => p.resetPage(p.setSourceFilter, v)} className={COMBOBOX_CLASS} />
      <Combobox options={OWNERSHIP_FILTER_OPTIONS} value={p.ownershipFilter} onChange={(v) => p.resetPage(p.setOwnershipFilter, v)} className={COMBOBOX_CLASS} />
      <Combobox options={SORT_OPTIONS} value={p.sort} onChange={(v) => p.resetPage(p.setSort, v)} className={COMBOBOX_CLASS} />
      {p.hasActiveFilters && (
        <Button variant="ghost" className="h-10 gap-1.5 text-muted-foreground cursor-pointer" onClick={p.clearFilters}>
          <X className="h-4 w-4" />
          Clear filters
        </Button>
      )}
      <span className="shrink-0 px-2 text-sm text-muted-foreground">
        {total} {total === 1 ? "business" : "businesses"}
      </span>
    </FilterBar>
  );
}
