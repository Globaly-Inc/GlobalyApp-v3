"use client";

import { useState } from "react";
import { Clock, DollarSign, FileText, Link2, Pencil, Trash2, Type, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { feeAmount } from "../utils";
import { CourseLinkPicker } from "./course-link-picker";
import { EditableField, type EditableFieldProps } from "./editable-field";
import { RowActors } from "./row-actors";
import type { CourseFee } from "../apis/types";

export type LinkedCourse = { id: string; name: string | null };

const CHIP_LIMIT = 6;

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

export function FeeCard({
  jobId,
  fee,
  linked,
  selected,
  busy,
  onToggleSelect,
  onEdit,
  onDelete,
  onLinkCourse,
  onUnlinkCourse,
  onSaveField,
}: Readonly<{
  jobId: string;
  fee: CourseFee;
  linked: LinkedCourse[];
  selected: boolean;
  busy: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onLinkCourse: (courseId: string) => void;
  onUnlinkCourse: (courseId: string) => void;
  onSaveField: (column: string, next: string | null) => Promise<unknown>;
}>) {
  const [editingLinks, setEditingLinks] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // Chips read alphabetically, whatever order the links were made in.
  const sorted = [...linked].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" }));
  const visible = showAll ? sorted : sorted.slice(0, CHIP_LIMIT);

  return (
    <Card className="group overflow-hidden">
      <div className="-mt-4 flex items-center justify-between gap-2 rounded-t-xl border-b bg-primary/5 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <DollarSign className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold text-foreground">{fee.name || "Unnamed fee"}</span>
          {fee.student_type && <Badge className="text-xs capitalize">{fee.student_type}</Badge>}
          {fee.period_type && <Badge variant="outline" className="text-xs">{fee.period_type}</Badge>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{feeAmount(fee)}</span>
          <Button
            variant="ghost" size="icon-sm" className="cursor-pointer opacity-0 transition-opacity group-hover:opacity-100"
            title="Edit fee" disabled={busy} onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost" size="icon-sm" className="cursor-pointer text-destructive hover:text-destructive"
            title="Delete fee" disabled={busy} onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <CardContent className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          <Field icon={Type} label="Fee Name" value={fee.name} onSave={(v) => onSaveField("name", v)} />
          <Field icon={DollarSign} label="Currency" value={fee.currency} onSave={(v) => onSaveField("currency", v)} />
          <Field icon={Clock} label="Period Type" value={fee.period_type} onSave={(v) => onSaveField("period_type", v)} />
          <Field
            icon={FileText} label="Description" value={fee.description} multiline
            className="md:col-span-2" onSave={(v) => onSaveField("description", v)}
          />
        </div>

        {fee.installments && fee.installments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {fee.installments.map((installment) => (
              <Badge key={installment.label} variant="secondary" className="text-xs">
                {installment.label}: {fee.currency} {installment.amount}
              </Badge>
            ))}
          </div>
        )}

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
        <RowActors row={fee} className="border-t border-border pt-2" />
      </CardContent>
    </Card>
  );
}
