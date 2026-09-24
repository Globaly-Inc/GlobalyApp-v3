"use client";

import { useMemo, useState } from "react";
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
  onSelect: (courseId: string, name: string | null) => void;
  disabled?: boolean;
  className?: string;
}>) {
  const [open, setOpen] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  // The whole job's course list, loaded when the dialog opens and sorted by the server. Filtering is
  // then local and instant — a job holds hundreds of courses, not thousands.
  const openDialog = async () => {
    setPicked([]);
    setSearch("");
    setOpen(true);
    setLoading(true);
    const all: Course[] = [];
    try {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const res = await allExtractionsApi.getCourses(jobId, { page, limit: PAGE, sort: "name_asc" });
        all.push(...res.data.map((c) => ({ id: c.id, name: c.name })));
        if (page >= res.meta.totalPages) break;
      }
      setCourses(all);
    } catch {
      toast.error("Couldn't load courses");
    } finally {
      setLoading(false);
    }
  };

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

  const confirm = () => {
    for (const id of picked) onSelect(id, courses.find((c) => c.id === id)?.name ?? null);
    setOpen(false);
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Link courses</DialogTitle>
            <DialogDescription>Tick every course to link. Courses already linked are not listed.</DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search courses…" className="h-9 pl-8" autoFocus />
          </div>

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
            <Button type="button" variant="outline" className="h-10 w-1/3 cursor-pointer" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="h-10 w-2/3 cursor-pointer" disabled={picked.length === 0} onClick={confirm}>
              Link {picked.length || ""} course{picked.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
