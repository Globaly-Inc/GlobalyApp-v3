"use client";

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminRecordsCard, type AdminListRow } from "../../../components/admin-placeholder-view";
import { fetchScholarships } from "../store/scholarships-slice";
import { SCHOLARSHIP_COLUMNS } from "../const";
import type { Scholarship } from "../apis/types";

function toRow(s: Scholarship): AdminListRow {
  return {
    id: s.id,
    title: s.title,
    provider_name: s.provider_name ?? "—",
    country: s.country ?? "—",
    deadline: s.deadline ? new Date(s.deadline).toLocaleDateString() : "—",
    is_published: s.is_published ? "Yes" : "No",
    is_featured: s.is_featured ? "Yes" : "No",
  };
}

export function ScholarshipsView() {
  const dispatch = useAppDispatch();
  const { scholarships } = useAppSelector((state) => state.monitoringScholarships);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchScholarships());
  }, [dispatch]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Scholarships</h1>
        <p className="text-muted-foreground mt-1">Manage scholarship listings, featured placement, and publish status.</p>
      </div>

      <AdminRecordsCard columns={SCHOLARSHIP_COLUMNS} rows={scholarships.map(toRow)} />
    </div>
  );
}
