import { Activity, BookOpen, Coins, FileSearch, Files } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ExtractionStatusBadge } from "./status-badge";
import type { ExtractionJob } from "../apis/types";

const STAT_STYLES = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
} as const;

/** "1.2M tok" — the number that is always there. Dollars only when every model is priced. */
export function formatLlmSpend(usage: ExtractionJob["usage"] | undefined): { value: string; label: string } {
  if (!usage || usage.calls === 0) return { value: "—", label: "LLM Spend" };
  const tokens = usage.prompt_tokens + usage.output_tokens;
  const tok = tokens >= 1_000_000 ? `${(tokens / 1_000_000).toFixed(1)}M` : tokens >= 1_000 ? `${Math.round(tokens / 1_000)}k` : String(tokens);
  const hits = usage.cache_hits ? ` · ${Math.round((usage.cache_hits / usage.calls) * 100)}% cached` : "";
  return usage.cost_usd !== null
    ? { value: `$${usage.cost_usd.toFixed(2)}`, label: `LLM Spend · ${tok} tok${hits}` }
    : { value: `${tok} tok`, label: `LLM Spend · ${usage.calls} calls${hits}` };
}

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

export function JobStats({
  job, coursesTotal,
}: Readonly<{ job: ExtractionJob; coursesTotal?: number }>) {
  const total = coursesTotal ?? job.verification_total ?? 0;
  const spend = formatLlmSpend(job.usage);

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      <StatCard icon={Files} color="blue" value={job.total_pages_found || "—"} label="Pages Found" />
      <StatCard icon={FileSearch} color="violet" value={job.pages_scraped || 0} label="Scraped" />
      <StatCard icon={BookOpen} color="emerald" value={total} label="Courses" />
      <StatCard icon={Coins} color="rose" value={spend.value} label={spend.label} />
      <StatCard icon={Activity} color="amber" value={<ExtractionStatusBadge status={job.status} />} label="Status" />
    </div>
  );
}
