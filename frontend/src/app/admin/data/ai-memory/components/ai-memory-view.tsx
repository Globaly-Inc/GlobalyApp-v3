"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Brain } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCard, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { fetchLessons, toggleLesson, deleteLesson } from "../store/ai-memory-slice";
import { SCOPE_OPTIONS, SOURCE_OPTIONS } from "../const";
import { LESSON_COLUMNS, LessonRow } from "./lesson-row";

export function AiMemoryView() {
  const dispatch = useAppDispatch();
  const { lessons, status } = useAppSelector((state) => state.dataAiMemory);

  const [scopeFilter, setScopeFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [stepFilter, setStepFilter] = useState("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchLessons());
  }, [dispatch]);

  const stepOptions = useMemo(() => {
    const steps = new Set(lessons.map((l) => l.step).filter(Boolean) as string[]);
    return [{ value: "all", label: "All steps" }, ...[...steps].sort().map((s) => ({ value: s, label: s }))];
  }, [lessons]);

  const filtered = useMemo(() => {
    return lessons.filter((l) => {
      if (scopeFilter !== "all" && l.scope !== scopeFilter) return false;
      if (sourceFilter !== "all" && l.source !== sourceFilter) return false;
      if (stepFilter !== "all" && l.step !== stepFilter) return false;
      return true;
    });
  }, [lessons, scopeFilter, sourceFilter, stepFilter]);

  const handleToggle = async (id: string, current: boolean) => {
    const result = await dispatch(toggleLesson({ id, isActive: !current }));
    if ("error" in result && result.error) {
      toast.error("Failed to update lesson");
      return;
    }
    toast.success(!current ? "Lesson activated" : "Lesson deactivated");
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const result = await dispatch(deleteLesson(deleteId));
    setDeleteId(null);
    if ("error" in result && result.error) {
      toast.error("Failed to delete lesson");
      return;
    }
    toast.success("Lesson deleted");
  };

  return (
    <PageBody className="stagger-in">
      <PageHeader
        title={<><Brain /> AI Memory</>}
        subtitle="Extraction lessons — rules the AI has learned from corrections and manual input."
      />

      <FilterBar>
        <Combobox options={SCOPE_OPTIONS} value={scopeFilter} onChange={(v) => v && setScopeFilter(v)} className="h-9 w-40 text-xs" />

        <Combobox options={stepOptions} value={stepFilter} onChange={(v) => v && setStepFilter(v)} className="h-9 w-40 text-xs" />

        <Combobox options={SOURCE_OPTIONS} value={sourceFilter} onChange={(v) => v && setSourceFilter(v)} className="h-9 w-40 text-xs" />

        <span className="shrink-0 px-2 text-sm text-muted-foreground">
          {filtered.length} lesson{filtered.length === 1 ? "" : "s"}
        </span>
      </FilterBar>

      {status === "loading" && lessons.length === 0 && <ListSkeleton count={5} itemClassName="h-16" />}

      {status === "idle" && filtered.length === 0 && (
        <EmptyState
          icon={Brain}
          title={lessons.length === 0 ? "No lessons learned yet." : "No lessons match the current filters."}
        />
      )}

      {filtered.length > 0 && (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                {LESSON_COLUMNS.map((col) => (
                  <TableHead key={col.label} className={"className" in col ? col.className : undefined}>
                    {"srOnly" in col ? <span className="sr-only">{col.label}</span> : col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((lesson, i) => (
                <LessonRow
                  key={lesson.id}
                  index={i}
                  lesson={lesson}
                  onToggle={() => handleToggle(lesson.id, lesson.is_active)}
                  onDelete={() => setDeleteId(lesson.id)}
                />
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete lesson?</DialogTitle>
            <DialogDescription>
              This will permanently remove this extraction rule. The AI will no longer apply it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" className="cursor-pointer" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageBody>
  );
}
