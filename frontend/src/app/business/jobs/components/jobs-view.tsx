"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { clearCreateError, createJob, deleteJob, fetchJobs, togglePublished } from "../store/business-jobs-slice";
import type { Job } from "../apis/types";
import { ApplicantsDialog } from "./applicants-dialog";
import { CreateJobDialog } from "./create-job-dialog";
import { JobCard } from "./job-card";

export function JobsView() {
  const dispatch = useAppDispatch();
  const { items, status, error, creating, createError } = useAppSelector((s) => s.businessJobs);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchJobs());
  }, [dispatch]);

  const [createOpen, setCreateOpen] = useState(false);
  const [applicantsFor, setApplicantsFor] = useState<Job | null>(null);
  const loading = status === "loading" && items.length === 0;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Jobs</h1>
          <p className="text-sm text-muted-foreground">Post openings and review applicants.</p>
        </div>
        <Button
          onClick={() => {
            dispatch(clearCreateError());
            setCreateOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          New posting
        </Button>
      </div>

      {status === "failed" && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="text-destructive">{error ?? "Failed to load job postings"}</p>
          <Button variant="link" size="sm" className="px-0" onClick={() => dispatch(fetchJobs())}>
            Try again
          </Button>
        </div>
      )}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      )}

      {!loading && items.length === 0 && status !== "failed" && (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">No job postings yet — create one to start hiring.</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onTogglePublished={() => dispatch(togglePublished({ jobId: job.id, is_published: !job.is_published }))}
              onDelete={() => dispatch(deleteJob(job.id))}
              onViewApplications={() => setApplicantsFor(job)}
            />
          ))}
        </div>
      )}

      <CreateJobDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        submitting={creating}
        error={createError}
        onConfirm={async (input) => {
          const result = await dispatch(createJob(input));
          if (createJob.fulfilled.match(result)) setCreateOpen(false);
        }}
      />

      <ApplicantsDialog job={applicantsFor} onOpenChange={(open) => !open && setApplicantsFor(null)} />
    </div>
  );
}
