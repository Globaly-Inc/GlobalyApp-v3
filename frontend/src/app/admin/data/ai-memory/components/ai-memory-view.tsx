"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminRecordsCard } from "../../../components/admin-placeholder-view";
import { fetchSiteProfiles } from "../store/ai-memory-slice";
import { AI_MEMORY_COLUMNS } from "../const";

export function AiMemoryView() {
  const dispatch = useAppDispatch();
  const { profiles } = useAppSelector((state) => state.dataAiMemory);

  useEffect(() => {
    dispatch(fetchSiteProfiles());
  }, [dispatch]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">AI Memory</h1>
        <p className="text-muted-foreground mt-1">Per-site scrape profiles the extraction pipeline has learned from admin corrections.</p>
      </div>

      <AdminRecordsCard columns={AI_MEMORY_COLUMNS} rows={profiles} />
    </div>
  );
}
