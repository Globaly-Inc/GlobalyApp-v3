"use client";

import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { APPLICATION_STATUS_BADGE_VARIANT, APPLICATION_STATUS_LABEL } from "../const";
import { fetchApplications, reviewApplication } from "../store/business-ambassadors-slice";
import type { Program } from "../apis/types";

export function ApplicationsDialog({ program, onOpenChange }: { program: Program | null; onOpenChange: (open: boolean) => void }) {
  const dispatch = useAppDispatch();
  const { applicationsByProgram, applicationsLoading, reviewingId, reviewError } = useAppSelector(
    (s) => s.businessAmbassadors,
  );

  const loadedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!program || loadedFor.current === program.id) return;
    loadedFor.current = program.id;
    dispatch(fetchApplications(program.id));
  }, [program, dispatch]);

  if (!program) return null;
  const applications = applicationsByProgram[program.id] ?? [];
  const loading = applicationsLoading === program.id && applications.length === 0;

  return (
    <Dialog open={program != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Applications — {program.name}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {reviewError && <p className="text-sm text-destructive">{reviewError}</p>}

          {loading && (
            <>
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </>
          )}

          {!loading && applications.length === 0 && (
            <p className="text-sm text-muted-foreground">No applications yet.</p>
          )}

          {applications.map((application) => (
            <div key={application.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">{application.applicant_name}</p>
                <p className="text-xs text-muted-foreground">{application.applicant_email}</p>
                {application.note && <p className="mt-1 text-sm">{application.note}</p>}
              </div>

              {application.status === "pending" ? (
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={reviewingId === application.id}
                    onClick={() =>
                      dispatch(reviewApplication({ programId: program.id, applicationId: application.id, decision: "rejected" }))
                    }
                  >
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    disabled={reviewingId === application.id}
                    onClick={() =>
                      dispatch(reviewApplication({ programId: program.id, applicationId: application.id, decision: "approved" }))
                    }
                  >
                    Approve
                  </Button>
                </div>
              ) : (
                <Badge variant={APPLICATION_STATUS_BADGE_VARIANT[application.status]} className="shrink-0">
                  {APPLICATION_STATUS_LABEL[application.status]}
                </Badge>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
