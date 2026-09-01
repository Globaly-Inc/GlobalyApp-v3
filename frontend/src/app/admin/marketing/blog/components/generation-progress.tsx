"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchPosts, pollGenerationStatus } from "../store/blog-slice";
import type { GenerationStatus } from "../apis/types";

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 60; // 3 minutes — hard stop so a stuck job never polls forever
const TERMINAL: ReadonlySet<GenerationStatus> = new Set(["done", "failed"]);

export function GenerationProgress() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const jobs = useAppSelector((state) => state.marketingBlog.generationJobs);
  const refreshedRef = useRef(false);
  const pollCountRef = useRef(0);

  useEffect(() => {
    if (jobs.length === 0) return undefined;

    const allTerminal = jobs.every((j) => TERMINAL.has(j.status));
    if (allTerminal) {
      if (!refreshedRef.current) {
        refreshedRef.current = true;
        dispatch(fetchPosts());
      }
      return undefined;
    }

    if (pollCountRef.current >= MAX_POLLS) return undefined;

    refreshedRef.current = false;
    // Poll again once the previous response lands — self-throttling, requests never overlap.
    const timer = setTimeout(() => {
      pollCountRef.current += 1;
      dispatch(pollGenerationStatus(jobs.map((j) => j.id)));
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [jobs, dispatch]);

  if (jobs.length === 0) return null;

  const doneCount = jobs.filter((j) => j.status === "done").length;

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-base">AI generation — {doneCount}/{jobs.length} done</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {jobs.map((job) => (
          <div key={job.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              {job.status === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              {job.status === "failed" && <XCircle className="h-4 w-4 text-destructive" />}
              {(job.status === "pending" || job.status === "running") && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              <span className="capitalize text-muted-foreground">{job.status}</span>
              {job.status === "failed" && job.error && <span className="text-destructive">— {job.error}</span>}
              {job.status === "done" && job.error && <span className="text-muted-foreground">({job.error})</span>}
            </div>
            {job.status === "done" && job.blog_post_id && (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={() => router.push(`/admin/marketing/blog/${job.blog_post_id}/edit`)}
              >
                Review draft
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
