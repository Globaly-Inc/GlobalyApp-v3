"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AgentcisJobRow } from "./agentcis-job-row";
import type { AgentcisJob } from "../apis/types";

export function AgentcisJobsTable({
  jobs,
  jobsLoading,
  onRefresh,
  onRetry,
  onDelete,
  onViewError,
}: Readonly<{
  jobs: AgentcisJob[];
  jobsLoading: boolean;
  onRefresh: () => void;
  onRetry: (job: AgentcisJob) => void;
  onDelete: (job: AgentcisJob) => void;
  onViewError: (job: AgentcisJob) => void;
}>) {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground">Ongoing Imports</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {jobs.length} job{jobs.length === 1 ? "" : "s"} · auto-refreshes every 5s
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={jobsLoading} className="gap-2">
            <RefreshCw className={`w-3.5 h-3.5 ${jobsLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {jobs.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No imports found. Search and import institutions above.
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="text-left p-3 font-medium">Institution</th>
                  <th className="text-left p-3 font-medium w-28">Status</th>
                  <th className="text-left p-3 font-medium">Progress</th>
                  <th className="text-left p-3 font-medium w-32">Updated</th>
                  <th className="text-right p-3 font-medium w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <AgentcisJobRow key={job.id} job={job} onRetry={onRetry} onDelete={onDelete} onViewError={onViewError} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
