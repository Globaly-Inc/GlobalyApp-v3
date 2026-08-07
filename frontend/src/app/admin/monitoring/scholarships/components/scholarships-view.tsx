"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminRecordsCard } from "../../../components/admin-placeholder-view";
import { fetchScholarships } from "../store/scholarships-slice";
import { SCHOLARSHIP_COLUMNS } from "../const";

export function ScholarshipsView() {
  const dispatch = useAppDispatch();
  const { scholarships } = useAppSelector((state) => state.monitoringScholarships);

  useEffect(() => {
    dispatch(fetchScholarships());
  }, [dispatch]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Scholarships</h1>
        <p className="text-muted-foreground mt-1">Manage scholarship listings, featured placement, and publish status.</p>
      </div>

      <AdminRecordsCard columns={SCHOLARSHIP_COLUMNS} rows={scholarships} />
    </div>
  );
}
