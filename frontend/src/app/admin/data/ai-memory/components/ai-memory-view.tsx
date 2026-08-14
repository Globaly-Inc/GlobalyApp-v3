"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2, Brain } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">AI Memory</h1>
        <p className="text-muted-foreground mt-1">
          Extraction lessons — rules the AI has learned from corrections and manual input.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Select value={scopeFilter} onValueChange={(v) => v && setScopeFilter(v)}>
          <SelectTrigger className="h-9 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCOPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={stepFilter} onValueChange={(v) => v && setStepFilter(v)}>
          <SelectTrigger className="h-9 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {stepOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sourceFilter} onValueChange={(v) => v && setSourceFilter(v)}>
          <SelectTrigger className="h-9 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-xs text-muted-foreground ml-2">
          {filtered.length} lesson{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Loading */}
      {status === "loading" && lessons.length === 0 && (
        <p className="text-sm text-muted-foreground">Loading...</p>
      )}

      {/* Empty */}
      {status === "idle" && filtered.length === 0 && (
        <div className="py-16 text-center space-y-2">
          <Brain className="h-8 w-8 mx-auto text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {lessons.length === 0 ? "No lessons learned yet." : "No lessons match the current filters."}
          </p>
        </div>
      )}

      {/* Lesson list */}
      <div className="space-y-3">
        {filtered.map((lesson) => (
          <Card key={lesson.id} className="p-4">
            <div className="flex items-start gap-4">
              <Switch
                checked={lesson.is_active}
                onCheckedChange={() => handleToggle(lesson.id, lesson.is_active)}
                className="mt-0.5 shrink-0"
              />

              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-sm text-foreground">{lesson.rule}</p>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={lesson.scope === "global" ? "default" : "secondary"}>
                    {lesson.scope === "global" ? "Global" : lesson.domain || "domain"}
                  </Badge>
                  {lesson.step && (
                    <Badge variant="outline">{lesson.step}</Badge>
                  )}
                  <Badge variant={lesson.source === "manual" ? "outline" : "secondary"}>
                    {lesson.source}
                  </Badge>
                  {!lesson.is_active && (
                    <Badge variant="destructive" className="text-[10px]">Inactive</Badge>
                  )}
                </div>

                {(lesson.example_bad || lesson.example_good) && (
                  <div className="text-xs space-y-0.5 text-muted-foreground">
                    {lesson.example_bad && (
                      <p>
                        <span className="text-destructive font-medium">Bad:</span> {lesson.example_bad}
                      </p>
                    )}
                    {lesson.example_good && (
                      <p>
                        <span className="text-emerald-600 font-medium">Good:</span> {lesson.example_good}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive shrink-0 cursor-pointer"
                onClick={() => setDeleteId(lesson.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

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
    </div>
  );
}
