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
import { ContextTab } from "./context-tab";
import { InstitutionTab } from "./institution-tab";
import { CoursesTab } from "./courses-tab";
import { BranchesTab } from "./branches-tab";
import { AgentsTab } from "./agents-tab";
import { FeesTab } from "./fees-tab";
import { IntakesTab } from "./intakes-tab";
import { EligibilityTab } from "./eligibility-tab";
import { StudyUnitsTab } from "./study-units-tab";
import { StudyOptionsTab } from "./study-options-tab";
import { AccreditationsTab } from "./accreditations-tab";
import { VisaServicesTab } from "./visa-services-tab";

const COURSE_JOB_TABS: JobTab[] = [
  "overview", "context", "institution", "branches", "agents",
  "courses", "fees", "intakes", "eligibility", "units", "study_options", "accreditations",
];
// A visa_service job never populates courses/campuses/agents/fees/etc. — those tabs would
// only ever show "no data" for it, so show its own review tab instead.
const VISA_SERVICE_JOB_TABS: JobTab[] = ["overview", "context", "institution", "visa_services"];
const VALID_TABS: JobTab[] = [...new Set([...COURSE_JOB_TABS, ...VISA_SERVICE_JOB_TABS])];

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

  const reload = () => dispatch(fetchJobFull(jobId));

  const activeTab = parseTab(searchParams.get("tab"));

  const setTab = (tab: JobTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`${pathname}?${params.toString()}`);
  };

  const full = jobFull?.job.id === jobId ? jobFull : null;
  const isVisaServiceJob = full?.job.source_type === "visa_service";
  const visibleTabs = isVisaServiceJob ? VISA_SERVICE_JOB_TABS : COURSE_JOB_TABS;

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
      <JobHeader job={full.job} onReload={reload} />
      <JobStats job={full.job} courses={full.courses} />
      <JobTabsBar
        active={activeTab}
        onChange={setTab}
        tabs={visibleTabs}
        institutionLabel={isVisaServiceJob ? "Business" : undefined}
      />
      {activeTab === "overview" ? (
        <OverviewTab full={full} onJumpToTab={setTab} onReload={reload} />
      ) : activeTab === "context" ? (
        <ContextTab job={full.job} onReload={reload} />
      ) : activeTab === "institution" ? (
        <InstitutionTab overview={full.overview} jobId={jobId} onReload={reload} isVisaServiceJob={isVisaServiceJob} />
      ) : activeTab === "courses" ? (
        <CoursesTab jobId={jobId} job={full.job} onReload={reload} onJumpToContext={() => setTab("context")} />
      ) : activeTab === "branches" ? (
        <BranchesTab jobId={jobId} job={full.job} onReload={reload} onJumpToContext={() => setTab("context")} />
      ) : activeTab === "agents" ? (
        <AgentsTab jobId={jobId} job={full.job} onReload={reload} onJumpToContext={() => setTab("context")} />
      ) : activeTab === "fees" ? (
        <FeesTab jobId={jobId} job={full.job} onReload={reload} onJumpToContext={() => setTab("context")} />
      ) : activeTab === "intakes" ? (
        <IntakesTab jobId={jobId} job={full.job} onReload={reload} onJumpToContext={() => setTab("context")} />
      ) : activeTab === "eligibility" ? (
        <EligibilityTab jobId={jobId} job={full.job} onReload={reload} onJumpToContext={() => setTab("context")} />
      ) : activeTab === "units" ? (
        <StudyUnitsTab jobId={jobId} job={full.job} onReload={reload} onJumpToContext={() => setTab("context")} />
      ) : activeTab === "study_options" ? (
        <StudyOptionsTab jobId={jobId} job={full.job} onReload={reload} onJumpToContext={() => setTab("context")} />
      ) : activeTab === "accreditations" ? (
        <AccreditationsTab jobId={jobId} />
      ) : activeTab === "visa_services" ? (
        <VisaServicesTab jobId={jobId} />
      ) : (
        <p className="text-sm text-muted-foreground py-12 text-center">
          This tab hasn&apos;t been migrated from V2 yet.
        </p>
      )}
    </div>
  );
}
