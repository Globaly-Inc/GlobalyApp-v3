"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchJobFull } from "../store/all-extractions-slice";
import { JobHeader } from "./job-header";
import { JobStats } from "./job-stats";
import { JobTabsBar, type JobTab } from "./job-tabs-bar";
import { OverviewTab } from "./overview-tab";

const VALID_TABS: JobTab[] = [
  "overview", "context", "institution", "branches", "agents",
  "courses", "fees", "intakes", "eligibility", "units", "study_options", "accreditations",
];

function parseTab(raw: string | null): JobTab {
  if (raw === "progress") return "overview"; // legacy V2 alias
  return (VALID_TABS as string[]).includes(raw ?? "") ? (raw as JobTab) : "overview";
}

export function JobDetailView({ jobId }: Readonly<{ jobId: string }>) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { jobFull, jobFullStatus } = useAppSelector((state) => state.dataAllExtractions);
  const fetchedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (fetchedIdRef.current === jobId) return;
    fetchedIdRef.current = jobId;
    dispatch(fetchJobFull(jobId));
  }, [dispatch, jobId]);

  const activeTab = parseTab(searchParams.get("tab"));

  const setTab = (tab: JobTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`${pathname}?${params.toString()}`);
  };

  const full = jobFull?.job.id === jobId ? jobFull : null;

  if (!full) {
    if (jobFullStatus === "failed") return <p className="text-sm text-muted-foreground">Job not found.</p>;
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <JobHeader job={full.job} />
      <JobStats job={full.job} courses={full.courses} />
      <JobTabsBar active={activeTab} onChange={setTab} />
      {activeTab === "overview" ? (
        <OverviewTab full={full} onJumpToTab={setTab} />
      ) : (
        <p className="text-sm text-muted-foreground py-12 text-center">
          This tab hasn&apos;t been migrated from V2 yet.
        </p>
      )}
    </div>
  );
}
