"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/segmented-control";
import type { Lookup } from "@/app/admin/platform/categories/apis/types";
import { businessProfileDetailApi } from "../../apis";
import { ORIGIN_OPTIONS, STATUS_OPTIONS, ServiceFilters, type ServiceFilterValues } from "./service-filters";

// Institutions only — extraction_courses.course_category splits their catalog into degree
// programs and standalone offerings, so the tab shows one or the other rather than a single
// list where a workshop sits next to a Bachelor's degree with no way to tell them apart.
const COURSE_CATEGORY_TABS = [
  { value: "academic", label: "Academic Courses" },
  { value: "short_course", label: "Short Courses" },
] as const;
export type CourseCategory = (typeof COURSE_CATEGORY_TABS)[number]["value"];

export function ServiceToolbar({
  readOnly, isInstitution, courseCategory, onCourseCategoryChange, search, onSearchChange, filters, onFiltersChange,
}: Readonly<{
  readOnly: boolean;
  isInstitution: boolean;
  courseCategory: CourseCategory;
  onCourseCategoryChange: (v: CourseCategory) => void;
  search: string;
  onSearchChange: (v: string) => void;
  filters: ServiceFilterValues;
  onFiltersChange: (v: ServiceFilterValues) => void;
}>) {
  const [degreeLevels, setDegreeLevels] = useState<Lookup[]>([]);
  useEffect(() => {
    if (!isInstitution || readOnly) return;
    businessProfileDetailApi.getLookups("degree-levels").then((res) => setDegreeLevels(res.data)).catch(() => setDegreeLevels([]));
  }, [isInstitution, readOnly]);

  // "/" jumps to search, unless the user is already typing somewhere.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (filters.published) chips.push({ key: "status", label: STATUS_OPTIONS.find((o) => o.value === filters.published)?.label ?? filters.published, clear: () => onFiltersChange({ ...filters, published: undefined }) });
  if (filters.origin) chips.push({ key: "origin", label: ORIGIN_OPTIONS.find((o) => o.value === filters.origin)?.label ?? filters.origin, clear: () => onFiltersChange({ ...filters, origin: undefined }) });
  if (filters.degree_level) chips.push({ key: "degree", label: degreeLevels.find((d) => d.slug === filters.degree_level)?.name ?? filters.degree_level, clear: () => onFiltersChange({ ...filters, degree_level: undefined }) });
  if (search.trim()) chips.push({ key: "search", label: `“${search.trim()}”`, clear: () => onSearchChange("") });

  return (
    <div className="mb-3 flex flex-col gap-3">
      {isInstitution && (
        <SegmentedControl aria-label="Course type" options={COURSE_CATEGORY_TABS} value={courseCategory} onChange={onCourseCategoryChange} />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-[1_1_240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            type="search"
            className="h-10 border-transparent bg-muted/60 pl-9 transition-[background-color,border-color,box-shadow] hover:border-border focus-visible:border-primary focus-visible:bg-background focus-visible:ring-4 focus-visible:ring-primary/15"
            placeholder={readOnly ? "Search courses..." : "Search services..."}
            aria-label={readOnly ? "Search courses" : "Search services"}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        {!readOnly && <ServiceFilters value={filters} onChange={onFiltersChange} isInstitution={isInstitution} degreeLevels={degreeLevels} />}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <span key={c.key} className="animate-pop-in inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs font-semibold text-primary">
              {c.label}
              <button type="button" onClick={c.clear} aria-label={`Remove filter ${c.label}`} className="flex size-4.5 items-center justify-center rounded-full hover:bg-primary/15">
                <X className="size-3" />
              </button>
            </span>
          ))}
          {chips.length > 1 && (
            <button type="button" className="px-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground" onClick={() => { onSearchChange(""); onFiltersChange({}); }}>
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
