"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { EnquiryStatusBadge } from "@/app/business/enquiries/components/enquiry-status-badge";
import { formatDate } from "@/app/personal/earn/services/utils";
import { ENQUIRY_TABLE_HEAD, INBOX_FILTERS } from "../const";
import { clearDetail, fetchEnquiries, fetchEnquiryDetail, fetchEnquiryStats } from "../store/enquiries-slice";
import { EnquiryDetailDialog } from "./enquiry-detail-dialog";
import { EnquiryStatTiles } from "./enquiry-stat-tiles";
import { EnquiryStatusFilter, type FilterKey } from "./enquiry-status-filter";
import { RecordsTable } from "./records-table";

/** "All" is no filter at all, not an empty status list. */
function statusesFor(key: FilterKey): string | undefined {
  return INBOX_FILTERS.find((f) => f.key === key)?.statuses.join(",");
}

/**
 * Read-only oversight of the course-enquiry pipeline.
 *
 * No actions: reassigning a lead or closing someone else's distribution are real powers
 * that need their own audit trail and permission story, exactly as on the Other Services
 * screen. This answers "what came in, who did it reach, and who paid".
 */
export function EnquiriesView() {
  const dispatch = useAppDispatch();
  const { stats, enquiries, listStatus, detail, detailStatus, page, limit, total } = useAppSelector(
    (state) => state.monitoringEnquiries,
  );
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchEnquiryStats());
    dispatch(fetchEnquiries({}));
  }, [dispatch]);

  const load = (params: { filter?: FilterKey; search?: string; page?: number }) =>
    dispatch(
      fetchEnquiries({
        status: statusesFor(params.filter ?? filter),
        search: (params.search ?? search) || undefined,
        page: params.page,
      }),
    );

  const handleSearch = (value: string) => {
    setSearch(value);
    // Debounced: the list query joins four tables, so one request per keystroke is waste.
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load({ search: value }), 300);
  };

  const openDetail = (index: number) => {
    const row = enquiries[index];
    if (!row) return;
    setDetailOpen(true);
    dispatch(fetchEnquiryDetail(row.id));
  };

  const closeDetail = (open: boolean) => {
    setDetailOpen(open);
    if (!open) dispatch(clearDetail());
  };

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Enquiries</h1>
        <p className="mt-1 text-muted-foreground">
          Course enquiries students send, the businesses each one was matched to, and who paid to unlock it.
        </p>
      </div>

      <EnquiryStatTiles stats={stats} />

      <EnquiryStatusFilter
        stats={stats}
        active={filter}
        onChange={(next) => {
          setFilter(next);
          load({ filter: next });
        }}
      />

      <Input
        className="mb-3 max-w-sm"
        placeholder="Search by student, course or institution"
        value={search}
        onChange={(e) => handleSearch(e.target.value)}
      />

      <RecordsTable
        status={listStatus}
        head={ENQUIRY_TABLE_HEAD}
        onRowClick={openDetail}
        emptyText={filter !== "all" || search ? "No enquiries match this filter." : "No enquiries yet."}
        rows={enquiries.map((e) => [
          <span key="s">
            {e.student_name || "—"}
            <span className="block truncate text-xs text-muted-foreground">{e.student_email}</span>
          </span>,
          <span key="c">
            {e.course_name}
            <span className="block truncate text-xs text-muted-foreground">{e.institution_name ?? "—"}</span>
          </span>,
          <EnquiryStatusBadge key="b" status={e.status} />,
          // Against max_accepts, not the recipient count: three businesses may unlock an
          // enquiry (the cap enforced in distributions.service.ts), and how many of those
          // slots are gone is the number worth watching. Reach goes on the second line.
          <span key="r" className="tabular-nums">
            {e.unlocked_count}/{e.max_accepts} unlocked
            <span className="block text-xs text-muted-foreground">
              {e.recipients} sent{e.coins_spent > 0 && ` · ${e.coins_spent} credits`}
            </span>
          </span>,
          [e.preferred_intake, e.preferred_year].filter(Boolean).join(" ") || "—",
          formatDate(e.created_at),
        ])}
      />

      {listStatus === "idle" && total > 0 && (
        <Pagination page={page} limit={limit} total={total} onPageChange={(next) => load({ page: next })} />
      )}

      <EnquiryDetailDialog open={detailOpen} onOpenChange={closeDetail} enquiry={detail} status={detailStatus} />
    </div>
  );
}
