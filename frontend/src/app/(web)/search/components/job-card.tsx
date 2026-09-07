import Link from "next/link";
import { Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JOB_TYPE_LABEL, type SearchJob } from "../types";
import { amountLabel } from "@/lib/utils";

export function JobCard({ job }: Readonly<{ job: SearchJob }>) {
  const company = job.company_name_from_business ?? job.company_name;
  const location = [job.location_city, job.country_name].filter(Boolean).join(", ") || (job.is_remote ? "Remote" : null);
  const jobTypeLabel = job.job_type ? (JOB_TYPE_LABEL[job.job_type] ?? job.job_type) : null;
  // A range when both ends are quoted; a single figure keeps the "+" that says it is a floor.
  const pay = job.pay_min || job.pay_max
    ? `${amountLabel(job.pay_min ?? job.pay_max, job.pay_currency, job.pay_min ? job.pay_max : null)}`
      + `${job.pay_max ? "" : "+"} / ${job.pay_unit ?? "year"}`
    : null;

  return (
    <div className="bg-card border border-border rounded-xl hover:shadow-md transition-shadow overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        <div className="flex-1 min-w-0 flex items-start gap-3 py-3.5 px-4">
          <div className="w-12 h-12 rounded-lg border border-border bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
            {job.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={job.logo_url} alt={company ?? job.title} className="w-full h-full object-contain p-1" />
            ) : (
              <Briefcase className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <h3 className="font-semibold text-foreground leading-snug text-[15px] line-clamp-1">{job.title}</h3>
            <p className="text-xs text-muted-foreground truncate">
              {company}{company && location ? " · " : ""}{location}
            </p>
            {jobTypeLabel && <p className="text-xs font-medium text-primary/90 truncate">{jobTypeLabel}</p>}
          </div>
        </div>

        <div className="w-full sm:w-44 sm:flex-shrink-0 border-t sm:border-t-0 sm:border-l border-border bg-muted/30 px-4 py-3 flex flex-col justify-center gap-2">
          {pay ? (
            <p className="text-sm font-bold text-primary leading-tight whitespace-nowrap">{pay}</p>
          ) : (
            <p className="text-xs text-muted-foreground italic">Salary on enquiry</p>
          )}
          <Link href="/auth/sign-up?redirect=/search">
            <Button size="sm" className="w-full text-xs h-9">Apply Now</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
