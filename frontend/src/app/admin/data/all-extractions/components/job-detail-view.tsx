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

  const renderTab = () => {
    switch (activeTab) {
      case "overview":
        return <OverviewTab full={full} onJumpToTab={setTab} onReload={reload} />;
      case "context":
        return <ContextTab job={full.job} onReload={reload} />;
      case "institution":
        return <InstitutionTab overview={full.overview} jobId={jobId} onReload={reload} isVisaServiceJob={isVisaServiceJob} />;
      case "courses":
        return <CoursesTab jobId={jobId} job={full.job} onReload={reload} onJumpToContext={() => setTab("context")} />;
      case "branches":
        return <BranchesTab jobId={jobId} job={full.job} onReload={reload} onJumpToContext={() => setTab("context")} />;
      case "agents":
        return <AgentsTab jobId={jobId} job={full.job} onReload={reload} onJumpToContext={() => setTab("context")} />;
      case "fees":
        return <FeesTab jobId={jobId} job={full.job} onReload={reload} onJumpToContext={() => setTab("context")} />;
      case "intakes":
        return <IntakesTab jobId={jobId} job={full.job} onReload={reload} onJumpToContext={() => setTab("context")} />;
      case "eligibility":
        return <EligibilityTab jobId={jobId} job={full.job} onReload={reload} onJumpToContext={() => setTab("context")} />;
      case "units":
        return <StudyUnitsTab jobId={jobId} job={full.job} onReload={reload} onJumpToContext={() => setTab("context")} />;
      case "study_options":
        return <StudyOptionsTab jobId={jobId} job={full.job} onReload={reload} onJumpToContext={() => setTab("context")} />;
      case "accreditations":
        return <AccreditationsTab jobId={jobId} />;
      case "visa_services":
        return <VisaServicesTab jobId={jobId} />;
      default:
        return (
          <p className="text-sm text-muted-foreground py-12 text-center">
            This tab hasn&apos;t been migrated from V2 yet.
          </p>
        );
    }
  };

  return (
    <div className="space-y-6">
      <JobHeader job={full.job} onReload={reload} />
      <JobStats job={full.job} coursesTotal={full.tabCounts.courses} />
      <JobTabsBar
        active={activeTab}
        onChange={setTab}
        tabs={visibleTabs}
        institutionLabel={isVisaServiceJob ? "Business" : undefined}
        counts={full.tabCounts}
      />
      {renderTab()}
    </div>
  );
}
