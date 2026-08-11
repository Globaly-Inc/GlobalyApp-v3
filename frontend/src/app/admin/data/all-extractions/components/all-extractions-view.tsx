"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { PUBLISHABLE_STATUSES, SORT_OPTIONS, type SortOrder } from "../const/index";


import {
  declineJob,
  deleteJob,
  fetchAllExtractions,
  pauseJob,
  promoteJob,
  resumeJob,
} from "../store/all-extractions-slice";
import { ExtractionJobRow } from "./extraction-job-row";
import { NewExtractionDialog } from "./new-extraction-dialog";

export function AllExtractionsView() {
  const dispatch = useAppDispatch();
  const { jobs, status } = useAppSelector((state) => state.dataAllExtractions);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [showDeclined, setShowDeclined] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchAllExtractions());
  }, [dispatch]);

  const declinedCount = jobs.filter((j) => j.status === "declined").length;

  const visibleJobs = useMemo(() => {
    const base = showDeclined ? jobs : jobs.filter((j) => j.status !== "declined");
    const q = searchQuery.trim().toLowerCase();
    const searched = q
      ? base.filter((j) => (j.institution_name || "").toLowerCase().includes(q) || j.institution_url.toLowerCase().includes(q))
      : base;
    return [...searched].sort((a, b) => {
      switch (sortOrder) {
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "name_asc":
          return (a.institution_name || "").localeCompare(b.institution_name || "");
        case "name_desc":
          return (b.institution_name || "").localeCompare(a.institution_name || "");
        case "newest":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
  }, [jobs, showDeclined, searchQuery, sortOrder]);

  const allVisibleSelected = visibleJobs.length > 0 && visibleJobs.every((j) => selectedIds.has(j.id));
  const selectablePublishCount = [...selectedIds].filter((id) => {
    const job = jobs.find((j) => j.id === id);
    return job && PUBLISHABLE_STATUSES.includes(job.status);
  }).length;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(visibleJobs.map((j) => j.id)));
  };

  const runAction = async (thunk: ReturnType<typeof declineJob> | ReturnType<typeof deleteJob> | ReturnType<typeof pauseJob> | ReturnType<typeof resumeJob>, successMessage: string) => {
    const result = await dispatch(thunk);
    if ("error" in result && result.error) {
      toast.error("Action failed", { description: (result.error as { message?: string }).message ?? "Please try again." });
      return;
    }
    toast.success(successMessage);
  };

  const handleBulkPublish = async () => {
    const ids = [...selectedIds].filter((id) => {
      const job = jobs.find((j) => j.id === id);
      return job && PUBLISHABLE_STATUSES.includes(job.status);
    });
    setBulkBusy(true);
    await Promise.all(ids.map((id) => dispatch(promoteJob(id))));
    setBulkBusy(false);
    setSelectedIds(new Set());
    toast.success(`Published ${ids.length} to the live catalog`);
    dispatch(fetchAllExtractions());
  };

  const handleBulkDelete = async () => {
    setConfirmBulkDelete(false);
    setBulkBusy(true);
    await Promise.all([...selectedIds].map((id) => dispatch(deleteJob(id))));
    setBulkBusy(false);
    setSelectedIds(new Set());
    toast.success("Deleted");
    dispatch(fetchAllExtractions());
  };

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">All Extractions</h1>
        <p className="text-muted-foreground mt-1">Every extraction job — ongoing, completed, failed, declined. Nothing is hidden.</p>
      </div>

      {showNewForm && <NewExtractionDialog open={showNewForm} onOpenChange={setShowNewForm} />}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <p className="font-semibold text-foreground">All Extractions</p>
          <p className="text-sm text-muted-foreground">
            {visibleJobs.length} job{visibleJobs.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by name or URL..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-56 pl-8 text-xs"
            />
          </div>

          <Combobox
            options={SORT_OPTIONS}
            value={sortOrder}
            onChange={(v) => setSortOrder(v as SortOrder)}
            className="h-10 w-40 text-xs cursor-pointer"
          />

          <Button variant="outline" className="h-10 text-xs cursor-pointer" onClick={toggleSelectAllVisible}>
            {allVisibleSelected ? "Deselect all" : "Select all"}
          </Button>

          {declinedCount > 0 && (
            <Button variant="ghost" className="gap-1.5 text-xs text-muted-foreground cursor-pointer" onClick={() => setShowDeclined((s) => !s)}>
              {showDeclined ? "Hide" : "Show"} declined ({declinedCount})
            </Button>
          )}

          <Button size="lg" className="h-10 gap-1.5 px-4 cursor-pointer" onClick={() => setShowNewForm(true)}>
            <Plus className="h-4 w-4" />
            New Extraction
          </Button>
        </div>
      </div>
          
      <div className="space-y-3">
        {status === "loading" && jobs.length === 0 && <p className="text-sm text-muted-foreground">Loading…</p>}
        {visibleJobs.map((job) => (
          <ExtractionJobRow
            key={job.id}
            job={job}
            selected={selectedIds.has(job.id)}
            onToggleSelect={() => toggleSelect(job.id)}
            onPause={() => runAction(pauseJob(job.id), "Paused")}
            onResume={() => runAction(resumeJob(job.id), "Resumed")}
            onDecline={() => runAction(declineJob(job.id), "Extraction declined")}
            onDelete={() => runAction(deleteJob(job.id), "Deleted")}
          />
        ))}
      </div>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-background border border-border shadow-lg rounded-full px-4 py-2 flex items-center gap-3">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <span className="text-xs text-muted-foreground">({selectablePublishCount} publishable)</span>
          <Button variant="ghost" className="cursor-pointer" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
          <Button className="gap-1.5 cursor-pointer" disabled={bulkBusy || selectablePublishCount === 0} onClick={handleBulkPublish}>
            Publish {selectablePublishCount} to Business
          </Button>
          <Dialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
            <Button variant="destructive" className="gap-1.5 cursor-pointer" disabled={bulkBusy} onClick={() => setConfirmBulkDelete(true)}>
              Delete {selectedIds.size}
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete {selectedIds.size} extraction(s)?</DialogTitle>
                <DialogDescription>This cannot be undone.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" className="cursor-pointer" onClick={() => setConfirmBulkDelete(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" className="cursor-pointer" onClick={handleBulkDelete}>
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}
