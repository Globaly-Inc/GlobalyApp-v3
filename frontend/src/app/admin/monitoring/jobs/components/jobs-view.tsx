"use client";

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminRecordsCard } from "../../../components/admin-placeholder-view";
import { fetchJobs } from "../store/jobs-slice";
import { JOB_COLUMNS } from "../const";

export function JobsView() {
  const dispatch = useAppDispatch();
  const { jobs } = useAppSelector((state) => state.monitoringJobs);
  const fetchedRef = useRef(false);

  useEffect(() => {
    // Guards against React StrictMode's dev-only double-invoke of this effect on mount.
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchJobs());
  }, [dispatch]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Jobs</h1>
        <p className="text-muted-foreground mt-1">Job postings across all businesses, with search and status filters.</p>
      </div>

      <AdminRecordsCard columns={JOB_COLUMNS} rows={jobs} />
    </div>
  );
}
