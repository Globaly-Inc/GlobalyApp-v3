"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link2, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { allExtractionsApi } from "../apis";

type Course = { id: string; name: string | null };

const PAGE = 100; // the list endpoint's page cap
const MAX_PAGES = 20;

/**
 * "Link courses…" — a button that opens a dialog listing every course of the job, alphabetically,
 * with a search box and a checkbox per row; one "Link N courses" click fires onSelect once per
 * pick. Replaced a paged combobox that showed ten rows at a time and closed on every pick, which
 * made linking a dozen courses to one fee a dozen scroll-and-hunt cycles. Same props as before, so
 * every tab (fees, intakes, study options, eligibility, units, branches, the fee form) gets it.
 */
export function CourseLinkPicker({
  jobId,
  excludeIds,
  onSelect,
  disabled,
  className,
}: Readonly<{
  jobId: string;
  excludeIds: string[];
  /** Called once per picked course, IN SEQUENCE — a returned promise is awaited before the next
   *  pick fires. Tab callers link-then-reload inside it, so firing all picks at once let an early
   *  request's reload land last and show a list missing later links (review, 2026-09-24). */
  onSelect: (courseId: string, name: string | null) => void | Promise<unknown>;
  disabled?: boolean;
  className?: string;
}>) {
  const [open, setOpen] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [linking, setLinking] = useState(false);
  // The job has more courses than MAX_PAGES × PAGE — the local list is a prefix, not the whole job.
  const [truncated, setTruncated] = useState(false);

  // The whole job's course list, loaded when the dialog opens and sorted by the server. Filtering is
  // then local and instant — a job holds hundreds of courses, not thousands.
  const openDialog = async () => {
    setPicked([]);
    setSearch("");
    setOpen(true);
    setLoading(true);
    const all: Course[] = [];
    try {
      let totalPages = 1;
      for (let page = 1; page <= MAX_PAGES; page++) {
        const res = await allExtractionsApi.getCourses(jobId, { page, limit: PAGE, sort: "name_asc" });
        all.push(...res.data.map((c) => ({ id: c.id, name: c.name })));
        totalPages = res.meta.totalPages;
        if (page >= totalPages) break;
      }
      setCourses(all);
      setTruncated(totalPages > MAX_PAGES);
    } catch {
      toast.error("Couldn't load courses");
    } finally {
      setLoading(false);
    }
  };

  // Past the cap, a course beyond the loaded prefix is unreachable by local filtering (review,
  // 2026-09-24: a deep-scraped job can stage more than 2,000). So while truncated, the search box
  // also asks the list endpoint — which searches the whole job — and merges its hits in. Debounced
  // like every other search box here; setState happens inside the async callback, not the effect.
  useEffect(() => {
    const q = search.trim();
    if (!truncated || !q) return;
    const t = setTimeout(async () => {
      try {
        const res = await allExtractionsApi.getCourses(jobId, { page: 1, limit: PAGE, search: q, sort: "name_asc" });
        setCourses((prev) => {
          const seen = new Set(prev.map((c) => c.id));
          const extra = res.data.filter((c) => !seen.has(c.id)).map((c) => ({ id: c.id, name: c.name }));
          return extra.length ? [...prev, ...extra] : prev;
        });
      } catch {
        // Local results still show; a failed remote search just means no extra rows.
      }
    }, 300);
    return () => clearTimeout(t);
  }, [jobId, search, truncated]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return courses
      .filter((c) => !excludeIds.includes(c.id))
      .filter((c) => !q || (c.name ?? "").toLowerCase().includes(q))
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" }));
  }, [courses, excludeIds, search]);

  const allVisiblePicked = visible.length > 0 && visible.every((c) => picked.includes(c.id));
  const toggle = (id: string) => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleAllVisible = () =>
    setPicked((prev) => (allVisiblePicked
      ? prev.filter((id) => !visible.some((c) => c.id === id))
      : [...new Set([...prev, ...visible.map((c) => c.id)])]));

  const confirm = async () => {
    setLinking(true);
    try {
      for (const id of picked) await onSelect(id, courses.find((c) => c.id === id)?.name ?? null);
    } finally {
      setLinking(false);
      setOpen(false);
    }
  };

  return (
    <>
      <Button
        type="button" variant="outline" size="sm"
        className={cn("gap-1.5 cursor-pointer", className)}
        disabled={disabled}
        onClick={openDialog}
      >
        <Link2 className="h-3.5 w-3.5" />
        {disabled ? "All courses linked" : "Link courses…"}
      </Button>

      <Dialog open={open} onOpenChange={(next) => { if (!linking) setOpen(next); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Link courses</DialogTitle>
            <DialogDescription>Tick every course to link. Courses already linked are not listed.</DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search courses…" className="h-9 pl-8" autoFocus />
          </div>
          {truncated && !loading && (
            <p className="px-2 text-xs text-muted-foreground">
              Showing the first {(PAGE * MAX_PAGES).toLocaleString()} courses alphabetically — search to find the rest.
            </p>
          )}

          {!loading && visible.length > 0 && (
            <label className="flex cursor-pointer items-center gap-2.5 px-2 text-xs text-muted-foreground">
              <Checkbox checked={allVisiblePicked} onCheckedChange={toggleAllVisible} />
              Select all shown ({visible.length})
            </label>
          )}

          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading courses…
              </div>
            ) : visible.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {search ? "No matches" : "Every course is already linked"}
              </p>
            ) : (
              visible.map((course) => (
                <label key={course.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                  <Checkbox checked={picked.includes(course.id)} onCheckedChange={() => toggle(course.id)} />
                  <span className="truncate">{course.name ?? "Unnamed course"}</span>
                </label>
              ))
            )}
          </div>

          <DialogFooter className="sm:flex-row">
            <Button type="button" variant="outline" className="h-10 w-1/3 cursor-pointer" disabled={linking} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="h-10 w-2/3 cursor-pointer gap-1.5" disabled={picked.length === 0 || linking} onClick={confirm}>
              {linking && <Loader2 className="h-4 w-4 animate-spin" />}
              {linking ? "Linking…" : `Link ${picked.length || ""} course${picked.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
