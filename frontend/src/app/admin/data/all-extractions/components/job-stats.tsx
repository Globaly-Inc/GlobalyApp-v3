import { CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ExtractionStatusBadge } from "./status-badge";
import type { CourseRow, ExtractionJob } from "../apis/types";

export function JobStats({ job, courses }: Readonly<{ job: ExtractionJob; courses: CourseRow[] }>) {
  const verified = courses.filter((c) => c.verification_status === "confirmed" || c.verification_status === "verified").length;
  const mismatch = courses.filter((c) => c.verification_status === "mismatch" || c.verification_status === "flagged").length;
  const pending = courses.filter((c) => !c.verification_status || c.verification_status === "pending").length;
  const total = courses.length || job.verification_total || 0;
  const checked = verified + mismatch;
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-5 pb-4 text-center">
          <p className="text-2xl font-bold">{job.total_pages_found || "—"}</p>
          <p className="text-xs text-muted-foreground mt-1">Pages Found</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-5 pb-4 text-center">
          <p className="text-2xl font-bold">{job.pages_scraped || 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Scraped</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="text-center mb-2">
            <p className="text-2xl font-bold">
              {verified}
              <span className="text-base font-normal text-muted-foreground">/{total}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Courses Verified</p>
          </div>
          <Progress value={pct} className="h-1.5" />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              {verified}
            </span>
            {mismatch > 0 && (
              <span className="flex items-center gap-1 text-destructive">
                <XCircle className="h-3 w-3" />
                {mismatch}
              </span>
            )}
            <span className="text-muted-foreground/70">{pending} pending</span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-5 pb-4 text-center">
          <ExtractionStatusBadge status={job.status} />
          <p className="text-xs text-muted-foreground mt-1">Status</p>
        </CardContent>
      </Card>
    </div>
  );
}
