"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { BookOpen, Clock, Layers, Link2, Pencil, Trash2, Type, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { CourseLinkPicker } from "./course-link-picker";
import { EditableField, type EditableFieldProps } from "./editable-field";
import { RowActors } from "./row-actors";
import type { StudyOption } from "../apis/types";

export type LinkedCourse = { id: string; name: string | null };

const CHIP_LIMIT = 6;
const humanize = (v: string | null) => (v ? v.replaceAll("_", " ") : "");

// EditableField keeps its own click-to-edit affordance — this just gives each
// field a visual anchor (icon tile), matching the Institution/Branches tabs' treatment.
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

export function StudyOptionCard({
  jobId,
  option,
  linked,
  selected,
  onToggleSelect,
  busy,
  onEdit,
  onDelete,
  onLinkCourse,
  onUnlinkCourse,
  onSaveField,
}: Readonly<{
  jobId: string;
  option: StudyOption;
  linked: LinkedCourse[];
  selected: boolean;
  onToggleSelect: () => void;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onLinkCourse: (courseId: string) => void;
  onUnlinkCourse: (courseId: string) => void;
  onSaveField: (column: string, next: string | null) => Promise<unknown>;
}>) {
  const [editingLinks, setEditingLinks] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? linked : linked.slice(0, CHIP_LIMIT);
  const title = option.name || humanize(option.study_mode) || "Study option";

  return (
    <Card className="group overflow-hidden">
      <div className="-mt-4 flex items-center justify-between gap-2 rounded-t-xl border-b bg-primary/5 px-4 py-3">
        <div className="flex items-center gap-3">
          <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Clock className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold capitalize text-foreground">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="icon-sm"
            className="cursor-pointer opacity-0 transition-opacity group-hover:opacity-100"
            title="Edit study option" disabled={busy} onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost" size="icon-sm" className="cursor-pointer text-destructive hover:text-destructive"
            title="Delete study option" disabled={busy} onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <CardContent className="p-4">
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <Field icon={Type} label="Name" value={option.name} onSave={(v) => onSaveField("name", v)} className="col-span-2" />
          <Field icon={BookOpen} label="Study mode" value={option.study_mode} onSave={(v) => onSaveField("study_mode", v)} />
          <Field icon={Layers} label="Study load" value={option.study_load} onSave={(v) => onSaveField("study_load", v)} />
          <Field
            icon={Clock} label="Duration"
            value={option.duration_value != null ? String(option.duration_value) : null}
            onSave={(v) => onSaveField("duration_value", v)}
          />
          <Field icon={Clock} label="Duration unit" value={option.duration_unit} onSave={(v) => onSaveField("duration_unit", v)} />
          <Field
            icon={Users} label="Applicable to" value={option.applicable_to}
            onSave={(v) => onSaveField("applicable_to", v)} className="col-span-2 md:col-span-2"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
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
            className="mt-2 h-8 text-xs"
          />
        )}
        <RowActors row={option} className="border-t border-border pt-2" />
      </CardContent>
    </Card>
  );
}
