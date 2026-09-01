"use client";

import { AdminSegmentedTabs } from "@/app/admin/components/admin-segmented-tabs";
import { INBOX_FILTERS, type InboxFilterKey } from "../const";
import type { AdminEnquiryStats } from "../apis";

export type FilterKey = InboxFilterKey | "all";

/**
 * New / Unlocked / Closed — the same three buckets the business inbox uses, plus All.
 * Eight raw statuses would be eight pills, most of them dead on a young platform; the
 * three buckets partition every status, so nothing is unreachable.
 *
 * The v1 admin screen showed these counts as a grid of stat cards. The counts are the
 * same information, but a pill is a control: seeing "Unlocked 3" and being unable to
 * click it was the worst of both.
 *
 * All four always render, including at zero — a fixed taxonomy, so "New 0" is a fact.
 */
export function EnquiryStatusFilter({
  stats,
  active,
  onChange,
}: Readonly<{ stats: AdminEnquiryStats | null; active: FilterKey; onChange: (key: FilterKey) => void }>) {
  const counts = new Map((stats?.statuses ?? []).map((s) => [s.status, Number(s.count)]));
  const countOf = (statuses: readonly string[]) =>
    statuses.reduce((sum, status) => sum + (counts.get(status) ?? 0), 0);

  // Rendered through the shared segmented control rather than a local pill: the business inbox
  // shows the same three buckets, and two hand-rolled versions of one filter would drift.
  return (
    <AdminSegmentedTabs
      options={[
        { value: "all" as FilterKey, label: "All", count: stats?.total ?? 0 },
        ...INBOX_FILTERS.map((f) => ({ value: f.key as FilterKey, label: f.label, count: countOf(f.statuses) })),
      ]}
      value={active}
      onChange={onChange}
      className="mb-3"
    />
  );
}
