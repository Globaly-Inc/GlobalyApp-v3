"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { allExtractionsApi } from "../apis";
import type { CourseFull } from "../apis/types";

const SEARCH_DEBOUNCE_MS = 300;

export type LinkCoursesToBranchesDialogProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  /** The branch(es) courses will be linked to — one dialog handles both the single-branch
   * "Link courses" action on a branch card and the bulk toolbar action over a selection. */
  branchIds: string[];
  branchLabel: string;
  onLinked: () => void;
}>;

/** Links many courses to many branches at once — every selected course gets linked to every
 * selected branch via the existing per-pair assignJunction endpoint, fired in parallel. No new
 * backend endpoint: this is the same junction courses-tab's per-course "Link branch" already
 * uses, just driven from the Branches side and over multiple entities at once. */
export function LinkCoursesToBranchesDialog({
  open, onOpenChange, jobId, branchIds, branchLabel, onLinked,
}: LinkCoursesToBranchesDialogProps) {
  const [courses, setCourses] = useState<CourseFull[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [linking, setLinking] = useState(false);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedCourseIds([]);
    setSearch("");
    setLoading(true);
    allExtractionsApi.getCourses(jobId, { limit: 200 })
      .then((res) => setCourses(res.data))
      .catch(() => toast.error("Couldn't load courses"))
      .finally(() => setLoading(false));
  }, [open, jobId]);

  const handleSearch = (query: string) => {
    setSearch(query);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await allExtractionsApi.getCourses(jobId, { limit: 200, search: query.trim() || undefined });
        setCourses(res.data);
      } finally {
        setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
  };

  const toggleCourse = (id: string) =>
    setSelectedCourseIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const handleLink = async () => {
    setLinking(true);
    const pairs = branchIds.flatMap((entity_id) => selectedCourseIds.map((course_id) => ({ entity_id, course_id })));
    const results = await Promise.allSettled(
      pairs.map(({ entity_id, course_id }) => allExtractionsApi.assignJunction("campuses", { job_id: jobId, course_id, entity_id })),
    );
    setLinking(false);
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      toast.error(`${failed} of ${pairs.length} links failed`, { description: "The rest were saved — try again for the failed ones." });
    } else {
      toast.success(`Linked ${selectedCourseIds.length} course${selectedCourseIds.length === 1 ? "" : "s"} to ${branchIds.length} branch${branchIds.length === 1 ? "" : "es"}`);
    }
    onLinked();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Link courses to {branchLabel}</DialogTitle>
          <DialogDescription>Select every course that should be linked. Already-linked courses stay linked either way.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => handleSearch(e.target.value)} placeholder="Search courses…" className="h-9 pl-8" />
        </div>

        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading courses…
            </div>
          ) : courses.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No courses found</p>
          ) : (
            courses.map((course) => (
              <label
                key={course.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
              >
                <Checkbox checked={selectedCourseIds.includes(course.id)} onCheckedChange={() => toggleCourse(course.id)} />
                <span className="truncate">{course.name}</span>
              </label>
            ))
          )}
        </div>

        <DialogFooter className="sm:flex-row">
          <Button variant="outline" className="h-10 w-1/3 cursor-pointer" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="h-10 w-2/3 cursor-pointer"
            disabled={linking || selectedCourseIds.length === 0}
            onClick={handleLink}
          >
            {linking ? "Linking…" : `Link ${selectedCourseIds.length || ""} course${selectedCourseIds.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
