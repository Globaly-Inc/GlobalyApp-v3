import { DetailHeaderCard } from "@/components/detail-header-card";
import { RowActors } from "./row-actors";
import { JobStatusBadge } from "./job-status-badge";
import type { ExtractionJob, InstitutionOverview } from "../apis/types";

export function JobStats({
  job, overview, coursesTotal,
}: Readonly<{ job: ExtractionJob; overview: InstitutionOverview | null; coursesTotal?: number }>) {
  const total = coursesTotal ?? job.verification_total ?? 0;
  const name = job.institution_name || "Extraction Review";

  // LLM spend (tokens / $) is deliberately not shown here — admins asked for it off the cards.
  // job.usage still arrives on the wire for the timeline and cost accounting.
  return (
    <DetailHeaderCard
      coverUrl={overview?.cover_url || null}
      logoUrl={overview?.logo_url || null}
      logoFallback={name.charAt(0).toUpperCase()}
      stats={[
        { label: "Pages Found", value: job.total_pages_found || "—" },
        { label: "Scraped", value: job.pages_scraped || 0 },
        { label: "Courses", value: total },
        { label: "Status", value: <JobStatusBadge status={job.status} /> },
      ]}
    >
      <RowActors row={job} />
    </DetailHeaderCard>
  );
}
