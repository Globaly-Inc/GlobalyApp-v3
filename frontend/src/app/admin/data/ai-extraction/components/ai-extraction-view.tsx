"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminRecordsCard } from "../../../components/admin-placeholder-view";
import { fetchAiExtractionJobs } from "../store/ai-extraction-slice";
import { AI_EXTRACTION_COLUMNS } from "../const";

export function AiExtractionView() {
  const dispatch = useAppDispatch();
  const { jobs } = useAppSelector((state) => state.dataAiExtraction);

  useEffect(() => {
    dispatch(fetchAiExtractionJobs());
  }, [dispatch]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">AI Extraction</h1>
        <p className="text-muted-foreground mt-1">Institution and course scraping pipeline — crawl, extract, and stage for review.</p>
      </div>

      <AdminRecordsCard columns={AI_EXTRACTION_COLUMNS} rows={jobs} />
    </div>
  );
}
