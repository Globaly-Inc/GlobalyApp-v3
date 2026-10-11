"use client";

import { useState } from "react";
import { Building2, Globe, Hash, Link2, Mail, MapPin, Pencil, Phone, Trash2, Type, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { CourseLinkPicker } from "./course-link-picker";
import { EditableField, type EditableFieldProps } from "./editable-field";
import { FindMissingDetailsButton } from "./find-missing-details-button";
import { RowActors } from "./row-actors";
import type { CampusFull } from "../apis/types";

export type LinkedCourse = { id: string; name: string | null };

const CHIP_LIMIT = 6;

// EditableField keeps its own click-to-edit affordance — this just gives each
// field a visual anchor (icon tile), matching the Institution tab's treatment.
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

export function BranchCard({
  branch,
  jobId,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
  onSaveField,
  onReload,
  linked,
  onLinkCourse,
  onUnlinkCourse,
}: Readonly<{
  branch: CampusFull;
  jobId: string;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSaveField: (column: string, next: string | null) => Promise<unknown>;
  onReload: () => void;
  linked: LinkedCourse[];
  onLinkCourse: (courseId: string) => void;
  onUnlinkCourse: (courseId: string) => void;
}>) {
  const [editingLinks, setEditingLinks] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? linked : linked.slice(0, CHIP_LIMIT);

  const field = (icon: LucideIcon, label: string, column: keyof CampusFull, span: string, multiline = false) => (
    <Field
      icon={icon}
      label={label}
      value={branch[column] as string | null}
      onSave={(v) => onSaveField(column, v)}
      multiline={multiline}
      className={span}
    />
  );
  return (
    <Card className="group overflow-hidden">
      <div className="-mt-4 flex items-center justify-between gap-2 rounded-t-xl border-b bg-primary/5 px-4 py-3">
        <div className="flex items-center gap-3">
          <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Building2 className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold text-foreground">{branch.name || branch.country || "Unnamed branch"}</span>
        </div>
        <div className="flex items-center gap-1">
          <FindMissingDetailsButton target={{ kind: "campus", campusId: branch.id, jobId }} onApplied={onReload} compact />
          <Button
            variant="ghost"
            size="icon-sm"
            className="cursor-pointer opacity-0 transition-opacity group-hover:opacity-100"
            title="Edit branch"
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="cursor-pointer text-destructive hover:text-destructive"
            title="Delete branch"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <CardContent className="p-4">
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-6">
          {field(Type, "Name", "name", "col-span-2 md:col-span-3")}
          {field(Mail, "Email", "email", "col-span-2 md:col-span-3")}
          {field(Phone, "Phone", "phone", "col-span-2 md:col-span-3")}
          {field(Globe, "Country", "country", "col-span-2 md:col-span-3")}
          {field(Building2, "City", "city", "col-span-2 md:col-span-2")}
          {field(MapPin, "State", "state", "col-span-2 md:col-span-2")}
          {field(Hash, "Postcode", "postcode", "col-span-2 md:col-span-2")}
          {field(MapPin, "Address Line", "address", "col-span-2 md:col-span-6", true)}
          {field(Link2, "Map link", "map_link", "col-span-2 md:col-span-6")}
        </div>
        <RowActors row={branch} className="border-t border-border pt-2" />

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
            <Button variant="outline" size="sm" className="h-6 cursor-pointer px-2 text-xs" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show less" : `+${linked.length - CHIP_LIMIT} more`}
            </Button>
          )}
          <Button
            variant="ghost" size="sm" className="h-6 gap-1 cursor-pointer px-2 text-xs"
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
      </CardContent>
    </Card>
  );
}
