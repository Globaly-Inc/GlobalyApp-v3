"use client";

import { useState } from "react";
import { Calendar, CalendarClock, CalendarDays, Link2, Pencil, Trash2, Type, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { CourseLinkPicker } from "./course-link-picker";
import { EditableField, type EditableFieldProps } from "./editable-field";
import { IntakeCustomDates } from "./intake-custom-dates";
import { RowActors } from "./row-actors";
import type { Intake } from "../apis/types";

export type LinkedCourse = { id: string; name: string | null };

/** Native date inputs need YYYY-MM-DD; the API hands back full timestamps. */
const CHIP_LIMIT = 6;

function Field({ icon: Icon, className, ...field }: Readonly<EditableFieldProps & { icon: LucideIcon }>) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 p-2", className)}>
      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <EditableField {...field} className="flex-1" />
    </div>
  );
}

export function IntakeCard({
  jobId,
  intake,
  linked,
  selected,
  busy,
  onToggleSelect,
  onDelete,
  onLinkCourse,
  onUnlinkCourse,
  onSaveField,
}: Readonly<{
  jobId: string;
  intake: Intake;
  linked: LinkedCourse[];
  selected: boolean;
  busy: boolean;
  onToggleSelect: () => void;
  onDelete: () => void;
  onLinkCourse: (courseId: string) => void;
  onUnlinkCourse: (courseId: string) => void;
  onSaveField: (column: string, next: string | null | unknown[]) => Promise<unknown>;
}>) {
  const [editingLinks, setEditingLinks] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? linked : linked.slice(0, CHIP_LIMIT);
  // Read off the string, not through Date(): "2026-09" parses as UTC midnight on the 1st, which is
  // the fabrication this feature removes — and in a timezone behind UTC it lands in 2026-08.
  const year = intake.intake_year ?? (intake.start_date?.slice(0, 4) ? Number(intake.start_date.slice(0, 4)) : null);

  return (
    <Card className="group overflow-hidden">
      <div className="-mt-4 flex items-center justify-between gap-2 rounded-t-xl border-b bg-primary/5 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Calendar className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold text-foreground">{intake.intake_name || "Unnamed intake"}</span>
          {year && <Badge variant="outline" className="text-xs">{year}</Badge>}
          <Badge className="bg-primary/10 text-xs text-primary">
            {linked.length} course{linked.length === 1 ? "" : "s"}
          </Badge>
        </div>
        <Button
          variant="ghost" size="icon-sm" className="cursor-pointer text-destructive hover:text-destructive"
          title="Delete intake" disabled={busy} onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <CardContent className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          <Field icon={Type} label="Intake Name" value={intake.intake_name} onSave={(v) => onSaveField("intake_name", v)} />
          <Field icon={Calendar} label="Start Date" datePrecision value={intake.start_date} onSave={(v) => onSaveField("start_date", v)} />
          <Field icon={Calendar} label="End Date" datePrecision value={intake.end_date} onSave={(v) => onSaveField("end_date", v)} />
          <Field icon={CalendarClock} label="Admission Deadline" datePrecision value={intake.admission_deadline} onSave={(v) => onSaveField("admission_deadline", v)} />
          <Field icon={CalendarDays} label="Orientation" datePrecision value={intake.orientation_date} onSave={(v) => onSaveField("orientation_date", v)} />
        </div>

        <IntakeCustomDates
          dates={intake.custom_dates ?? []}
          onSave={(next) => onSaveField("custom_dates", next)}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
          {visible.map((course) => (
            <Badge key={course.id} className="gap-1 bg-primary/10 text-xs text-primary">
              {course.name ?? "Unnamed course"}
              {editingLinks && (
                <button type="button" className="cursor-pointer" title="Unlink course" onClick={() => onUnlinkCourse(course.id)}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
          {linked.length === 0 && <span className="text-xs text-muted-foreground">Not linked to any course</span>}
          {linked.length > CHIP_LIMIT && (
            <Button variant="outline" size="sm" className="h-6 px-2 text-xs cursor-pointer" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show less" : `+${linked.length - CHIP_LIMIT} more`}
            </Button>
          )}
          <Button
            variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs cursor-pointer"
            onClick={() => setEditingLinks((v) => !v)}
          >
            <Pencil className="h-3 w-3" />
            {editingLinks ? "Done" : "Edit"}
          </Button>
        </div>

        {editingLinks && (
          <CourseLinkPicker
            jobId={jobId}
            excludeIds={linked.map((c) => c.id)}
            onSelect={onLinkCourse}
            className="h-8 text-xs"
          />
        )}
        <RowActors row={intake} className="border-t border-border pt-2" />
      </CardContent>
    </Card>
  );
}
