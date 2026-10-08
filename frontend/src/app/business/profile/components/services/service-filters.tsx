"use client";

import { Combobox } from "@/components/combobox";
import { cn } from "@/lib/utils";
import type { Lookup } from "@/app/admin/platform/categories/apis/types";
import type { ServiceSearchParams } from "../../apis/types";

/** The Services tab's server-side filters — every page, not just the loaded one. */
export type ServiceFilterValues = Pick<ServiceSearchParams, "published" | "origin" | "degree_level">;

const ALL = "all";
export const STATUS_OPTIONS = [
  { value: ALL, label: "All statuses" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
];
export const ORIGIN_OPTIONS = [
  { value: ALL, label: "All sources" },
  { value: "extracted", label: "Extracted" },
  { value: "manual", label: "Manually added" },
];

/** A picker with a value set gets a tinted border so active filters stand out. */
const active = (on: boolean) => cn("h-10", on && "border-primary bg-primary/5 text-primary");

export function ServiceFilters({ value, onChange, isInstitution, degreeLevels }: Readonly<{
  value: ServiceFilterValues;
  onChange: (value: ServiceFilterValues) => void;
  isInstitution: boolean;
  degreeLevels: Lookup[];
}>) {
  // "all" in the picker = the filter left off.
  const set = <K extends keyof ServiceFilterValues>(key: K, v: string) =>
    onChange({ ...value, [key]: v === ALL ? undefined : v });

  return (
    <>
      <Combobox className={cn("w-36", active(!!value.published))} options={STATUS_OPTIONS} value={value.published ?? ALL} onChange={(v) => set("published", v)} placeholder="Status" />
      {isInstitution && (
        <>
          <Combobox className={cn("w-40", active(!!value.origin))} options={ORIGIN_OPTIONS} value={value.origin ?? ALL} onChange={(v) => set("origin", v)} placeholder="Source" />
          <Combobox
            className={cn("w-44", active(!!value.degree_level))}
            options={[{ value: ALL, label: "All degree levels" }, ...degreeLevels.map((d) => ({ value: d.slug, label: d.name }))]}
            value={value.degree_level ?? ALL}
            onChange={(v) => set("degree_level", v)}
            placeholder="Degree level"
          />
        </>
      )}
    </>
  );
}
