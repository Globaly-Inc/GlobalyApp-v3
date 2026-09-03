"use client";

import { AlertCircle, BookOpen, Check, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/combobox";
import { cn } from "@/lib/utils";
import { EditableField } from "./editable-field";
import type { Accreditation, AccreditationAssignment, LibraryAccreditation } from "../apis/types";

const CLEAR = "__clear__";

export function ScrapedAccreditationCard({
  scraped, rows, library, selected, onToggleSelected, onMap, onAddNew, onSaveField, onDelete,
}: Readonly<{
  scraped: Accreditation;
  /** This scraped row's junction rows (one per linked course). */
  rows: AccreditationAssignment[];
  library: LibraryAccreditation[];
  selected: boolean;
  onToggleSelected: () => void;
  onMap: (accreditationId: string | null) => void;
  onAddNew: () => void;
  onSaveField: (column: string, value: string | null) => Promise<unknown>;
  onDelete: () => void;
}>) {
  const mappedIds = new Set(rows.map((r) => r.accreditation_id));
  const mixed = mappedIds.size > 1;
  const mapped = !mixed ? (rows[0]?.accreditation_id ?? null) : null;
  const courseNames = [...new Set(rows.map((r) => r.course_name).filter(Boolean))] as string[];

  const options = [
    ...(mapped ? [{ value: CLEAR, label: "— Clear mapping —" }] : []),
    { value: "__add__", label: "+ Add new library entry…" },
    ...library.map((a) => ({ value: a.id, label: a.name })),
  ];

  return (
    <Card className={cn("transition-all", selected && "ring-2 ring-primary/40")}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <Checkbox checked={selected} onCheckedChange={onToggleSelected} className="mt-1" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {mapped ? (
                  <Badge className="gap-1 border-0 bg-primary/10 text-xs text-primary">
                    <Check className="h-3 w-3" /> Mapped
                  </Badge>
                ) : mixed ? (
                  <Badge variant="outline" className="gap-1 border-muted-foreground/40 text-xs text-muted-foreground">
                    <AlertCircle className="h-3 w-3" /> Mixed mappings
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 border-destructive/40 text-xs text-destructive">
                    Unmapped
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Combobox
                  options={options}
                  value={mapped ?? ""}
                  onChange={(v) => {
                    if (v === "__add__") onAddNew();
                    else onMap(v === CLEAR ? null : v);
                  }}
                  placeholder="Map to library…"
                  className="h-8 w-56 text-xs"
                />
                <Button
                  variant="ghost" size="icon-sm" title="Delete scraped accreditation"
                  className="cursor-pointer text-destructive hover:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <EditableField label="Scraped Name" value={scraped.name} onSave={(v) => onSaveField("name", v)} />
              <EditableField label="Issuing Org" value={scraped.issuing_organization} onSave={(v) => onSaveField("issuing_organization", v)} />
            </div>
            <EditableField label="Website" value={scraped.website} placeholder="https://" onSave={(v) => onSaveField("website", v)} />

            {courseNames.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <BookOpen className="h-3 w-3 text-muted-foreground" />
                {courseNames.map((name) => (
                  <Badge key={name} variant="secondary" className="text-[10px]">{name}</Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
