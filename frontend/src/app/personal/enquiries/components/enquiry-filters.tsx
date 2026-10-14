"use client";

import { SectionTabs } from "@/components/section-tabs";
import { STATUS_FILTERS, type StatusFilterKey } from "../const";

/**
 * Status tabs over the list (`ui/tabs`, via the shared segmented switcher).
 *
 * Empty buckets are dropped rather than shown at zero — a "Converted 0" tab is a
 * dead control. If that leaves nothing but "All" plus one bucket, the whole row is
 * hidden: filtering a list where every row is in the same bucket says nothing.
 */
export function EnquiryFilters({
  counts,
  active,
  onChange,
}: Readonly<{
  counts: Record<StatusFilterKey, number>;
  active: StatusFilterKey;
  onChange: (key: StatusFilterKey) => void;
}>) {
  const visible = STATUS_FILTERS.filter((f) => f.key === "all" || counts[f.key] > 0);
  if (visible.length < 3) return null;

  return (
    <SectionTabs
      options={visible.map((f) => ({ value: f.key, label: f.label, count: counts[f.key] }))}
      value={active}
      onChange={onChange}
      className="mb-0"
    />
  );
}
