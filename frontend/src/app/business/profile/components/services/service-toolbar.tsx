"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/segmented-control";
import type { Lookup } from "@/app/admin/platform/categories/apis/types";
import { businessProfileDetailApi } from "../../apis";
import { ServiceFilters, type ServiceFilterValues } from "./service-filters";
import { SEARCH_INPUT } from "../portal-ui/portal-ui";

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

  return (
    <div className="flex flex-col gap-4">
      {isInstitution && (
        <SegmentedControl className="rounded-[10px]" aria-label="Course type" options={COURSE_CATEGORY_TABS} value={courseCategory} onChange={onCourseCategoryChange} />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-[1_1_240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            type="search"
            className={SEARCH_INPUT}
            placeholder={readOnly ? "Search courses…" : "Search services…"}
            aria-label={readOnly ? "Search courses" : "Search services"}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        {!readOnly && <ServiceFilters value={filters} onChange={onFiltersChange} isInstitution={isInstitution} degreeLevels={degreeLevels} />}
      </div>
    </div>
  );
}
