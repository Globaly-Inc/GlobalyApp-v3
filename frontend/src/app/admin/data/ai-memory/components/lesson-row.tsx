"use client";

import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import type { Lesson } from "../apis/types";

/** Column headers for the rows below — kept beside the row so the two can't drift apart. */
export const LESSON_COLUMNS = [
  { label: "Rule" },
  { label: "Scope", className: "hidden md:table-cell" },
  { label: "Step", className: "hidden lg:table-cell" },
  { label: "Source", className: "hidden lg:table-cell" },
  { label: "Active", className: "w-px" },
  { label: "Actions", className: "w-px", srOnly: true },
] as const;

export function LessonRow({
  lesson, onToggle, onDelete, index = 0,
}: Readonly<{ lesson: Lesson; onToggle: () => void; onDelete: () => void; index?: number }>) {
  return (
    <TableRow className="animate-row-rise" style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}>
      <TableCell primary className="whitespace-normal break-words">
        <p className="text-foreground">
          {lesson.rule}
          {!lesson.is_active && (
            <Badge variant="destructive" className="ml-2 align-middle text-xs">Inactive</Badge>
          )}
        </p>
        {(lesson.example_bad || lesson.example_good) && (
          <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {lesson.example_bad && (
              <p>
                <span className="font-medium text-destructive">Bad:</span> {lesson.example_bad}
              </p>
            )}
            {lesson.example_good && (
              <p>
                <span className="font-medium text-success">Good:</span> {lesson.example_good}
              </p>
            )}
          </div>
        )}
        {/* Fallbacks for the columns hidden on narrow screens. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 lg:hidden">
          <Badge variant={lesson.scope === "global" ? "default" : "secondary"} className="md:hidden">
            {lesson.scope === "global" ? "Global" : lesson.domain || "domain"}
          </Badge>
          {lesson.step && <Badge variant="outline">{lesson.step}</Badge>}
          <Badge variant={lesson.source === "manual" ? "outline" : "secondary"}>{lesson.source}</Badge>
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <Badge variant={lesson.scope === "global" ? "default" : "secondary"}>
          {lesson.scope === "global" ? "Global" : lesson.domain || "domain"}
        </Badge>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        {lesson.step ? <Badge variant="outline">{lesson.step}</Badge> : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <Badge variant={lesson.source === "manual" ? "outline" : "secondary"}>{lesson.source}</Badge>
      </TableCell>
      <TableCell>
        <Switch checked={lesson.is_active} onCheckedChange={onToggle} aria-label="Toggle lesson active" />
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Delete lesson"
          className="cursor-pointer text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
