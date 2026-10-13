"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { FileText, GraduationCap, Hash, Link2, Pencil, Percent, Trash2, Type, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { CourseLinkPicker } from "./course-link-picker";
import { EditableField } from "./editable-field";
import { EligibilityTestSummary } from "./eligibility-test-summary";
import { RowActors } from "./row-actors";
import type { EligibilityRequirement } from "../apis/types";

export type LinkedCourse = { id: string; name: string | null };

const CHIP_LIMIT = 6;

type EditableFieldProps = Parameters<typeof EditableField>[0];

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

export function RequirementCard({
  jobId,
  requirement,
  linked,
  selected,
  busy,
  onToggleSelect,
  onEdit,
  onDelete,
  onSaveField,
  onLinkCourse,
  onUnlinkCourse,
}: Readonly<{
  jobId: string;
  requirement: EligibilityRequirement;
  linked: LinkedCourse[];
  selected: boolean;
  busy: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSaveField: (column: string, next: string | null) => Promise<unknown>;
  onLinkCourse: (courseId: string) => void;
  onUnlinkCourse: (courseId: string) => void;
}>) {
  const [editingLinks, setEditingLinks] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? linked : linked.slice(0, CHIP_LIMIT);

  const numberField = (v: string | null) => (v === null ? null : (Number(v) as unknown as string));

  return (
    <Card className="group overflow-hidden">
      <div className="-mt-4 flex items-center justify-between gap-2 rounded-t-xl border-b bg-primary/5 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <GraduationCap className="h-4 w-4" />
          </div>
          <span className="truncate text-sm font-semibold text-foreground">{requirement.name || "Requirement"}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            className="cursor-pointer opacity-0 transition-opacity group-hover:opacity-100"
            title="Edit"
            disabled={busy}
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="cursor-pointer text-destructive hover:text-destructive"
            title="Delete"
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <CardContent className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <Field
            icon={Type} label="Name" value={requirement.name}
            onSave={(v) => onSaveField("name", v)} className="col-span-2 md:col-span-2"
          />
          <Field
            icon={Users} label="Applicable To" value={requirement.applicable_to}
            onSave={(v) => onSaveField("applicable_to", v)} className="col-span-2 md:col-span-2"
          />
          <Field
            icon={GraduationCap} label="Min Degree Level" value={requirement.min_degree_level}
            onSave={(v) => onSaveField("min_degree_level", v)} className="col-span-2 md:col-span-2"
          />
          <Field
            icon={Hash} label="Score Type" value={requirement.score_type}
            onSave={(v) => onSaveField("score_type", v)} className="col-span-2 md:col-span-2"
          />
          <Field
            icon={Percent} label="Min Score %" value={requirement.min_score_percent?.toString() ?? null}
            onSave={(v) => onSaveField("min_score_percent", numberField(v))} className="col-span-2 md:col-span-2"
          />
          <Field
            icon={Percent} label="Min Score" value={requirement.min_score?.toString() ?? null}
            onSave={(v) => onSaveField("min_score", numberField(v))} className="col-span-2 md:col-span-2"
          />
          <Field
            icon={FileText} label="Description" value={requirement.description} multiline
            onSave={(v) => onSaveField("description", v)} className="col-span-2 md:col-span-4"
          />
        </div>

        {/* The tests themselves, not just a count — a reviewer had to open the edit form on
            every row to see whether GRE/IELTS had actually been captured. */}
        <EligibilityTestSummary
          languageTests={requirement.language_tests}
          academicTests={requirement.academic_tests}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Badge className="text-xs">
            Shared by {linked.length} course{linked.length === 1 ? "" : "s"}
          </Badge>
        </div>

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
        <RowActors row={requirement} className="border-t border-border pt-2" />
      </CardContent>
    </Card>
  );
}
