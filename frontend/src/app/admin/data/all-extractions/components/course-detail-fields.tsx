"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Label } from "@/components/ui/label";
import { LookupCombobox } from "@/components/lookup-combobox";
import { Textarea } from "@/components/ui/textarea";
import type { CourseFull } from "../apis/types";

export function CourseDetailFields({ course, patchCourse }: Readonly<{
  course: CourseFull;
  patchCourse: (patch: Record<string, unknown>) => Promise<boolean>;
}>) {
  const [editingDescription, setEditingDescription] = useState(false);
  const [description, setDescription] = useState(course.description ?? "");

  // Re-seed when a different course is selected, or after a save round-trips.
  useEffect(() => {
    setDescription(course.description ?? "");
    setEditingDescription(false);
  }, [course]);

  return (
    <>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Degree level</Label>
        {/* Closed platform lists (2026-09-08): a course may only be linked to a level/area that
            already exists, so neither picker can create one. The server re-derives the link
            codes from what's picked. */}
        <LookupCombobox
          kind="degree-levels"
          value={course.degree_level ?? ""}
          onChange={(v) => patchCourse({ degree_level: v || null })}
          placeholder="Select degree level"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Subject area</Label>
        {/* Bound to the LINK, not to `subject_area` — that column holds the page's own wording
            ("Civil Engineering"), which is never one of the 14 options, so the picker rendered
            blank on a correctly linked course. */}
        <LookupCombobox
          kind="areas-of-study"
          by="slug"
          value={course.subject_area_code ?? ""}
          onChange={(v) => patchCourse({ subject_area_code: v || null })}
          placeholder="Select subject area"
        />
        {course.subject_area && (
          <p className="text-xs text-muted-foreground">Extracted as “{course.subject_area}”</p>
        )}
      </div>
    </div>

    <div className="flex flex-col gap-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Description</Label>
      {editingDescription ? (
        <Textarea
          autoFocus
          value={description}
          rows={4}
          placeholder="Add a description…"
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => {
            setEditingDescription(false);
            if (description.trim() !== (course.description ?? "")) {
              patchCourse({ description: description.trim() || null });
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="group/desc flex w-full items-start justify-between gap-3 rounded-md p-2 text-left text-sm transition-colors cursor-pointer hover:bg-muted/60"
          onClick={() => setEditingDescription(true)}
        >
          <span>{course.description || <span className="italic text-muted-foreground">Add a description…</span>}</span>
          <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/desc:opacity-100" />
        </button>
      )}
    </div>
    </>
  );
}
