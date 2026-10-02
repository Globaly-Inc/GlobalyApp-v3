"use client";

import { useEffect, useState } from "react";
import { Combobox } from "@/components/combobox";
import type { Lookup } from "@/app/admin/platform/categories/apis/types";
import { businessProfileDetailApi } from "../../apis";
import type { ServiceSearchParams } from "../../apis/types";

/** The Services tab's server-side filters — every page, not just the loaded one. */
export type ServiceFilterValues = Pick<ServiceSearchParams, "published" | "origin" | "degree_level">;

const ALL = "all";
const STATUS_OPTIONS = [
  { value: ALL, label: "All statuses" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
];
const ORIGIN_OPTIONS = [
  { value: ALL, label: "All sources" },
  { value: "extracted", label: "Extracted" },
  { value: "manual", label: "Manually added" },
];

export function ServiceFilters({ value, onChange, isInstitution }: Readonly<{
  value: ServiceFilterValues;
  onChange: (value: ServiceFilterValues) => void;
  isInstitution: boolean;
}>) {
  const [degreeLevels, setDegreeLevels] = useState<Lookup[]>([]);
  useEffect(() => {
    if (!isInstitution) return;
    businessProfileDetailApi.getLookups("degree-levels").then((res) => setDegreeLevels(res.data)).catch(() => setDegreeLevels([]));
  }, [isInstitution]);

  // "all" in the picker = the filter left off.
  const set = <K extends keyof ServiceFilterValues>(key: K, v: string) =>
    onChange({ ...value, [key]: v === ALL ? undefined : v });

  return (
    <>
      <Combobox className="h-10 w-36" options={STATUS_OPTIONS} value={value.published ?? ALL} onChange={(v) => set("published", v)} placeholder="Status" />
      {isInstitution && (
        <>
          <Combobox className="h-10 w-40" options={ORIGIN_OPTIONS} value={value.origin ?? ALL} onChange={(v) => set("origin", v)} placeholder="Source" />
          <Combobox
            className="h-10 w-44"
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
