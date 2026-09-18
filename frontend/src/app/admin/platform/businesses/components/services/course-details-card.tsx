"use client";

import { useState } from "react";
import { GraduationCap, Pencil } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/combobox";
import { Label } from "@/components/ui/label";
import type { Accreditation } from "@/app/admin/platform/categories/apis/types";

type Option = { value: string; label: string };
type NamedLookup = { id: number; name: string };

function Field({ label, value }: Readonly<{ label: string; value: string | null }>) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      {value ? <p className="text-sm">{value}</p> : <p className="text-sm italic text-muted-foreground">Not set</p>}
    </div>
  );
}

export function CourseDetailsCard({
  degreeLevelValue, areaOfStudyValue, awardedByValue,
  degreeLevels, areasOfStudy, accreditations,
  onChangeDegreeLevel, onChangeAreaOfStudy, onChangeAwardedBy,
  onSearchDegreeLevel, onSearchAreaOfStudy, onSearchAwardedBy,
  degreeLevelOptions, areaOfStudyOptions, awardedByOptions,
  loadingDegreeLevel, loadingAreaOfStudy, loadingAwardedBy,
  onSave,
}: Readonly<{
  degreeLevelValue: string; areaOfStudyValue: string; awardedByValue: string;
  degreeLevels: NamedLookup[]; areasOfStudy: NamedLookup[]; accreditations: Accreditation[];
  onChangeDegreeLevel: (v: string) => void; onChangeAreaOfStudy: (v: string) => void; onChangeAwardedBy: (v: string) => void;
  onSearchDegreeLevel: (q: string) => void; onSearchAreaOfStudy: (q: string) => void; onSearchAwardedBy: (q: string) => void;
  degreeLevelOptions: Option[]; areaOfStudyOptions: Option[]; awardedByOptions: Option[];
  loadingDegreeLevel: boolean; loadingAreaOfStudy: boolean; loadingAwardedBy: boolean;
  onSave: () => Promise<void>;
}>) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const degreeLevelName = degreeLevels.find((d) => String(d.id) === degreeLevelValue)?.name ?? null;
  const areaOfStudyName = areasOfStudy.find((a) => String(a.id) === areaOfStudyValue)?.name ?? null;
  const awardedByAcc = accreditations.find((a) => String(a.id) === awardedByValue) ?? null;

  return (
    <Card className="gap-0 overflow-hidden">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-semibold">Course details</h2>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing((v) => !v)} aria-label="Edit course details">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
      <CardContent className="p-5">
        {editing ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Degree level</Label>
              <Combobox
                options={degreeLevelOptions}
                value={degreeLevelValue}
                onChange={onChangeDegreeLevel}
                onQueryChange={onSearchDegreeLevel}
                loading={loadingDegreeLevel}
                placeholder="Select level"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Area of study</Label>
              <Combobox
                options={areaOfStudyOptions}
                value={areaOfStudyValue}
                onChange={onChangeAreaOfStudy}
                onQueryChange={onSearchAreaOfStudy}
                loading={loadingAreaOfStudy}
                placeholder="Select area"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Awarded by</Label>
              <Combobox
                options={awardedByOptions}
                value={awardedByValue}
                onChange={onChangeAwardedBy}
                onQueryChange={onSearchAwardedBy}
                loading={loadingAwardedBy}
                placeholder="Select institution"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" disabled={saving} onClick={handleSave}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {awardedByAcc ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Awarded by</p>
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12 shrink-0 rounded-md border">
                    {awardedByAcc.issuing_organization_logo_url && (
                      <AvatarImage src={awardedByAcc.issuing_organization_logo_url} alt={awardedByAcc.name} className="object-contain p-1" />
                    )}
                    <AvatarFallback className="rounded-md text-xs font-bold">
                      {awardedByAcc.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{awardedByAcc.name}</p>
                    {awardedByAcc.website && (
                      <a href={awardedByAcc.website} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-primary hover:underline">
                        {awardedByAcc.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <Field label="Awarded by" value={null} />
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Degree level" value={degreeLevelName} />
              <Field label="Area of study" value={areaOfStudyName} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
