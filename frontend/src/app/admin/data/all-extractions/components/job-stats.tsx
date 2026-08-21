import { Activity, BookOpen, FileSearch, Files } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ExtractionStatusBadge } from "./status-badge";
import type { CourseRow, ExtractionJob } from "../apis/types";

const STAT_STYLES = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
} as const;

function StatCard({
  icon: Icon,
  color,
  value,
  label,
}: Readonly<{ icon: typeof Files; color: keyof typeof STAT_STYLES; value: React.ReactNode; label: string }>) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex items-center gap-4 py-5">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${STAT_STYLES[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-2xl font-bold leading-tight">{value}</div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function JobStats({ job, courses = [] }: Readonly<{ job: ExtractionJob; courses?: CourseRow[] }>) {
  const total = courses?.length || job.verification_total || 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard icon={Files} color="blue" value={job.total_pages_found || "—"} label="Pages Found" />
      <StatCard icon={FileSearch} color="violet" value={job.pages_scraped || 0} label="Scraped" />
      <StatCard icon={BookOpen} color="emerald" value={total} label="Courses" />
      <StatCard icon={Activity} color="amber" value={<ExtractionStatusBadge status={job.status} />} label="Status" />
    </div>
  );
}
