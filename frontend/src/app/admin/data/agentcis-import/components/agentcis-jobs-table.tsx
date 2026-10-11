"use client";

import { Inbox, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCard, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
          <EmptyState compact icon={Inbox} title="No imports found." description="Search and import institutions above." />
        ) : (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Institution</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead className="hidden w-32 lg:table-cell">Updated</TableHead>
                  <TableHead className="w-20"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <AgentcisJobRow key={job.id} job={job} onRetry={onRetry} onDelete={onDelete} onViewError={onViewError} />
                ))}
              </TableBody>
            </Table>
          </TableCard>
        )}
      </CardContent>
    </Card>
  );
}
