"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Eye, ArrowUpRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchExtractedJobs, promoteExtractedJob } from "../store/extracted-data-slice";
import { PUBLISHABLE_STATUSES } from "../const";
import { ExtractionStatusBadge } from "../../all-extractions/components/status-badge";

export function ExtractedDataView() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { jobs, status, error } = useAppSelector((state) => state.dataExtractedData);

  const [searchQuery, setSearchQuery] = useState("");
  const [showDeclined, setShowDeclined] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchExtractedJobs());
  }, [dispatch]);

  const declinedCount = jobs.filter((j) => j.status === "declined").length;

  const visibleJobs = useMemo(() => {
    const base = showDeclined ? jobs : jobs.filter((j) => j.status !== "declined");
    const q = searchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (j) =>
        (j.institution_name || "").toLowerCase().includes(q) ||
        j.institution_url.toLowerCase().includes(q),
    );
  }, [jobs, showDeclined, searchQuery]);

  const handlePromote = async (id: string) => {
    setPromotingId(id);
    const result = await dispatch(promoteExtractedJob(id));
    setPromotingId(null);
    if ("error" in result && result.error) {
      toast.error("Publish failed", {
        description: (result.error as { message?: string }).message ?? "Please try again.",
      });
      return;
    }
    toast.success("Published to live catalog");
  };

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Extracted Data</h1>
        <p className="text-muted-foreground mt-1">
          Completed extraction jobs ready for review and publishing.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-muted-foreground">
          {visibleJobs.length} job{visibleJobs.length === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by name or URL..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-56 pl-8 text-xs"
            />
          </div>
          {declinedCount > 0 && (
            <Button
              variant="ghost"
              className="text-xs text-muted-foreground cursor-pointer"
              onClick={() => setShowDeclined((s) => !s)}
            >
              {showDeclined ? "Hide" : "Show"} declined ({declinedCount})
            </Button>
          )}
        </div>
      </div>

      {status === "loading" && jobs.length === 0 && (
        <p className="text-sm text-muted-foreground">Loading...</p>
      )}

      {status === "idle" && visibleJobs.length === 0 && (
        <div className="py-16 text-center text-sm text-muted-foreground">
          No completed extractions yet.
        </div>
      )}

      <div className="space-y-3">
        {visibleJobs.map((job) => {
          const canPublish = PUBLISHABLE_STATUSES.includes(job.status);
          const score =
            job.verification_total > 0
              ? `${Math.round((job.verification_score / job.verification_total) * 100)}%`
              : null;

          return (
            <Card key={job.id} className="flex flex-row items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-foreground truncate">
                    {job.institution_name || job.institution_url}
                  </p>
                  <ExtractionStatusBadge status={job.status} />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                  <span>{job.courses_extracted} courses</span>
                  {score && <span>Verification: {score}</span>}
                  <span>
                    {new Date(job.created_at).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  className="gap-1.5 cursor-pointer"
                  onClick={() => router.push(`/admin/data/all-extractions/${job.id}`)}
                >
                  <Eye className="h-3.5 w-3.5" />
                  View
                </Button>
                {canPublish && (
                  <Button
                    className="gap-1.5 cursor-pointer"
                    disabled={promotingId === job.id}
                    onClick={() => handlePromote(job.id)}
                  >
                    {promotingId === job.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    )}
                    Publish
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
