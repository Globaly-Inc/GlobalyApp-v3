"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { formatDate } from "@/app/personal/earn/services/utils";
import { AdminSegmentedTabs } from "../../../components/admin-segmented-tabs";
import {
  AdminMonitoringTable,
  AdminStatTile,
} from "../../../components/admin-monitoring-table";
import { fetchTrainingPrograms, fetchTrainingStats } from "../store/training-slice";
import type { TrainingAudience } from "../apis/types";

const AUDIENCE_FILTERS: Array<{ value: TrainingAudience | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "agents", label: "Agents" },
  { value: "ambassadors", label: "Ambassadors" },
  { value: "students", label: "Students" },
];

/**
 * Read-only oversight of training across every business: which courses exist,
 * how many people are enrolled, and how many verifiable certificates they have
 * earned.
 *
 * No actions. Publishing or revoking somebody else's course, and voiding a
 * certificate, are real powers that need their own audit trail.
 */
export function TrainingView() {
  const dispatch = useAppDispatch();
  const { programs, stats, total, listStatus, statsStatus, error } = useAppSelector(
    (state) => state.monitoringTraining,
  );
  const [audience, setAudience] = useState<TrainingAudience | "all">("all");

  // Keyed on the serialized params rather than a bare mount effect, so React
  // Strict Mode's double-invoke does not fire two identical requests.
  const lastQueryRef = useRef<string>("");
  useEffect(() => {
    const params = audience === "all" ? {} : { target_audience: audience };
    const key = JSON.stringify(params);
    if (lastQueryRef.current === key) return;
    lastQueryRef.current = key;
    dispatch(fetchTrainingPrograms(params));
  }, [dispatch, audience]);

  useEffect(() => {
    dispatch(fetchTrainingStats());
  }, [dispatch]);

  const completionRate =
    stats && stats.enrolments.total > 0
      ? `${Math.round((stats.certificates.total / stats.enrolments.total) * 100)}%`
      : "—";

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Training</h1>
        <p className="mt-1 text-muted-foreground">
          Training programs across all businesses — enrolment, certificates and learner streaks.
        </p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatTile
          label="Programs"
          value={statsStatus === "loading" ? "…" : String(stats?.programs.total ?? 0)}
          hint={`${stats?.programs.published ?? 0} published`}
        />
        <AdminStatTile
          label="Enrolments"
          value={statsStatus === "loading" ? "…" : String(stats?.enrolments.total ?? 0)}
          hint={`${stats?.enrolments.last_30_days ?? 0} in the last 30 days`}
        />
        <AdminStatTile
          label="Certificates"
          value={statsStatus === "loading" ? "…" : String(stats?.certificates.total ?? 0)}
          hint={`${completionRate} of enrolments · ${stats?.certificates.gold ?? 0} gold · ${stats?.certificates.expired ?? 0} expired`}
        />
        <AdminStatTile
          label="Learner XP"
          value={statsStatus === "loading" ? "…" : String(stats?.gamification.total_xp ?? 0)}
          hint={`${stats?.gamification.learners ?? 0} learners · longest streak ${stats?.gamification.longest_streak ?? 0}`}
        />
      </div>

      <AdminSegmentedTabs<TrainingAudience | "all">
        value={audience}
        onChange={setAudience}
        options={AUDIENCE_FILTERS}
      />

      {error && listStatus === "failed" && <p className="mb-3 text-sm text-destructive">{error}</p>}

      <AdminMonitoringTable
        status={listStatus}
        emptyLabel="No training programs yet."
        head={[
          "Program",
          "Business",
          "Audience",
          "State",
          "Chapters",
          "Enrolled",
          "Certificates",
          "Pass mark",
          "Created",
        ]}
        rows={programs.map((p) => [
          <span key="t" className="block truncate" title={p.category ?? undefined}>
            {p.title}
          </span>,
          <span key="b" className="block truncate">
            {p.business_name ?? `Business ${p.business_id}`}
          </span>,
          p.target_audience,
          <span key="s" className="flex gap-1">
            <Badge
              variant="secondary"
              className={cn(
                p.is_published
                  ? "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {p.is_published ? "published" : "draft"}
            </Badge>
            {p.is_mandatory && (
              <Badge
                variant="secondary"
                className="bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
              >
                mandatory
              </Badge>
            )}
          </span>,
          String(p.chapters),
          String(p.enrolments),
          String(p.certificates_issued),
          `${p.passing_score}%`,
          formatDate(p.created_at),
        ])}
      />

      {listStatus === "idle" && programs.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing {programs.length} of {total}.
        </p>
      )}
    </div>
  );
}
