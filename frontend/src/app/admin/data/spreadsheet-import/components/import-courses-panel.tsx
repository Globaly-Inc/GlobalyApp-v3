"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { allExtractionsApi } from "@/app/admin/data/all-extractions/apis";
import type { CourseFull, Paginated } from "@/app/admin/data/all-extractions/apis/types";

type NotImported = { row: number; course: string | null; error: string; kind?: "duplicate" };
const PAGE_SIZE = 50;

/** One import's courses: those staged on the job, and the sheet rows that didn't become a course of
 * their own — left out by the wizard (`skipped`), failed while staging (`errors`, first 50 kept), or
 * merged into an earlier row's course (`merged`). */
export function ImportCoursesPanel({ jobId }: Readonly<{ jobId: string }>) {
  const [page, setPage] = useState(1);
  const [courses, setCourses] = useState<Paginated<CourseFull> | null>(null);
  const [leftOut, setLeftOut] = useState<NotImported[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    allExtractionsApi.getJob(jobId)
      .then((job) => {
        const p = (job.pipeline_progress ?? {}) as { skipped?: NotImported[]; errors?: NotImported[]; merged?: NotImported[] };
        setLeftOut([...(p.skipped ?? []), ...(p.errors ?? []), ...(p.merged ?? [])].sort((a, b) => a.row - b.row));
      })
      .catch((e: Error) => setError(e.message));
  }, [jobId]);

  useEffect(() => {
    allExtractionsApi.getCourses(jobId, { page, limit: PAGE_SIZE, sort: "name_asc" })
      .then(setCourses)
      .catch((e: Error) => setError(e.message));
  }, [jobId, page]);

  const duplicates = leftOut?.filter((r) => r.kind === "duplicate") ?? null;
  const notImported = leftOut?.filter((r) => r.kind !== "duplicate") ?? null;

  if (error) return <p className="text-sm text-destructive">Couldn&apos;t load courses: {error}</p>;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-emerald-700">Imported ({courses?.meta.total ?? "…"})</p>
        {!courses ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
          <>
            <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
              {courses.data.map((c) => <li key={c.id} className="truncate" title={c.name}>{c.name}</li>)}
              {courses.data.length === 0 && <li className="text-muted-foreground">No courses.</li>}
            </ul>
            {courses.meta.totalPages > 1 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                Page {page} of {courses.meta.totalPages}
                <Button variant="outline" size="sm" disabled={page >= courses.meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            )}
          </>
        )}
      </div>
      <RowList title="Duplicates" tone="text-amber-700" rows={duplicates} empty="No duplicate rows." />
      <RowList title="Not imported" tone="text-destructive" rows={notImported} empty="Every course row was imported." />
    </div>
  );
}

/** A titled list of sheet rows that didn't become a course of their own, each with its reason. */
function RowList({ title, tone, rows, empty }: Readonly<{ title: string; tone: string; rows: NotImported[] | null; empty: string }>) {
  return (
    <div className="flex flex-col gap-2">
      <p className={`text-xs font-semibold ${tone}`}>{title} ({rows?.length ?? "…"})</p>
      {!rows ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto whitespace-normal text-sm">
          {rows.map((r, i) => (
            <li key={i}>
              <span className="font-medium">{r.course || "(no name)"}</span>{" "}
              <span className="text-xs text-muted-foreground">row {r.row}</span>
              <p className={`text-xs ${tone}`}>{r.error}</p>
            </li>
          ))}
          {rows.length === 0 && <li className="text-muted-foreground">{empty}</li>}
        </ul>
      )}
    </div>
  );
}
