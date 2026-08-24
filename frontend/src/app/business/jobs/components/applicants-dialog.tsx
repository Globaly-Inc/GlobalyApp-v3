"use client";

import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { APPLICATION_STATUS_BADGE_VARIANT, APPLICATION_STATUS_LABEL } from "../const";
import { fetchApplications, reviewApplication } from "../store/business-jobs-slice";
import type { ApplicationStatus, Job } from "../apis/types";

export function ApplicantsDialog({ job, onOpenChange }: { job: Job | null; onOpenChange: (open: boolean) => void }) {
  const dispatch = useAppDispatch();
  const { applicationsByJob, applicationsLoading } = useAppSelector((s) => s.businessJobs);

  const loadedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!job || loadedFor.current === job.id) return;
    loadedFor.current = job.id;
    dispatch(fetchApplications(job.id));
  }, [job, dispatch]);

  if (!job) return null;
  const applications = applicationsByJob[job.id] ?? [];
  const loading = applicationsLoading === job.id && applications.length === 0;

  const setStatus = (applicationId: number, status: ApplicationStatus) =>
    dispatch(reviewApplication({ jobId: job.id, applicationId, status }));

  return (
    <Dialog open={job != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Applicants — {job.title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {loading && (
            <>
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </>
          )}
          {!loading && applications.length === 0 && <p className="text-sm text-muted-foreground">No applicants yet.</p>}

          {applications.map((application) => (
            <div key={application.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">{application.applicant_name}</p>
                <p className="text-xs text-muted-foreground">{application.applicant_email}</p>
                {application.cover_note && <p className="mt-1 text-sm">{application.cover_note}</p>}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                <Badge variant={APPLICATION_STATUS_BADGE_VARIANT[application.status]}>
                  {APPLICATION_STATUS_LABEL[application.status]}
                </Badge>
                {application.status === "applied" && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setStatus(application.id, "rejected")}>
                      Reject
                    </Button>
                    <Button size="sm" onClick={() => setStatus(application.id, "hired")}>
                      Hire
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
