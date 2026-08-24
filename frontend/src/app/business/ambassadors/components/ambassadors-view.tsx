"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { clearCreateError, createProgram, fetchPrograms, setProgramStatus } from "../store/business-ambassadors-slice";
import type { Program } from "../apis/types";
import { ApplicationsDialog } from "./applications-dialog";
import { CreateProgramDialog } from "./create-program-dialog";
import { ProgramCard } from "./program-card";

export function AmbassadorsView() {
  const dispatch = useAppDispatch();
  const { programs, status, error, creating, createError } = useAppSelector((s) => s.businessAmbassadors);

  // Ref guard per AGENTS.md — Strict Mode double-invokes effects on mount.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchPrograms());
  }, [dispatch]);

  const [createOpen, setCreateOpen] = useState(false);
  const [applicationsFor, setApplicationsFor] = useState<Program | null>(null);

  const loading = status === "loading" && programs.length === 0;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Ambassador Programs</h1>
          <p className="text-sm text-muted-foreground">Recruit students to refer leads for a commission.</p>
        </div>
        <Button
          onClick={() => {
            dispatch(clearCreateError());
            setCreateOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          New program
        </Button>
      </div>

      {status === "failed" && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="text-destructive">{error ?? "Failed to load ambassador programs"}</p>
          <Button variant="link" size="sm" className="px-0" onClick={() => dispatch(fetchPrograms())}>
            Try again
          </Button>
        </div>
      )}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      )}

      {!loading && programs.length === 0 && status !== "failed" && (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">No ambassador programs yet — create one to start recruiting.</p>
        </div>
      )}

      {programs.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {programs.map((program) => (
            <ProgramCard
              key={program.id}
              program={program}
              onStatusChange={(newStatus) => dispatch(setProgramStatus({ programId: program.id, status: newStatus }))}
              onViewApplications={() => setApplicationsFor(program)}
            />
          ))}
        </div>
      )}

      <CreateProgramDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        submitting={creating}
        error={createError}
        onConfirm={async (input) => {
          const result = await dispatch(createProgram(input));
          if (createProgram.fulfilled.match(result)) setCreateOpen(false);
        }}
      />

      <ApplicationsDialog program={applicationsFor} onOpenChange={(open) => !open && setApplicationsFor(null)} />
    </div>
  );
}
