"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APPLICABLE_TO_OPTIONS, DURATION_UNIT_OPTIONS, STUDY_LOAD_OPTIONS, STUDY_MODE_OPTIONS } from "../const";
import type { StudyOption, StudyOptionParams } from "../apis/types";

export function StudyOptionForm({
  option,
  saving,
  onCancel,
  onSave,
}: Readonly<{
  option?: StudyOption;
  saving: boolean;
  onCancel: () => void;
  onSave: (values: StudyOptionParams) => void;
}>) {
  const [mode, setMode] = useState(option?.study_mode ?? "on_campus");
  const [load, setLoad] = useState(option?.study_load ?? "full_time");
  const [duration, setDuration] = useState(option?.duration_value?.toString() ?? "");
  const [unit, setUnit] = useState(option?.duration_unit ?? "months");
  const [applicableTo, setApplicableTo] = useState(option?.applicable_to ?? "both");
  const [saveForReuse, setSaveForReuse] = useState(option?.save_for_reuse ?? false);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{option ? "Edit study option" : "New study option"}</p>
          <Button variant="ghost" size="icon-sm" className="cursor-pointer" title="Close" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Study Mode</Label>
            <Combobox options={STUDY_MODE_OPTIONS} value={mode} onChange={setMode} placeholder="Select mode" creatable />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Study Load</Label>
            <Combobox options={STUDY_LOAD_OPTIONS} value={load} onChange={setLoad} placeholder="Select load" creatable />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="option-duration">Duration</Label>
            <div className="flex gap-2">
              <Input
                id="option-duration"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                inputMode="numeric"
                placeholder="e.g. 3"
                className="w-24"
              />
              <Combobox options={DURATION_UNIT_OPTIONS} value={unit} onChange={setUnit} className="flex-1" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Applicable To</Label>
            <Combobox options={APPLICABLE_TO_OPTIONS} value={applicableTo} onChange={setApplicableTo} placeholder="Select" />
          </div>
        </div>

        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={saveForReuse} onCheckedChange={() => setSaveForReuse((v) => !v)} />
          Save for reuse across courses
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="outline" className="cursor-pointer" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            className="gap-1.5 cursor-pointer"
            disabled={saving}
            onClick={() =>
              onSave({
                study_mode: mode || null,
                study_load: load || null,
                duration_value: duration.trim() === "" ? null : Number(duration),
                duration_unit: duration.trim() === "" ? null : unit,
                applicable_to: applicableTo || null,
                save_for_reuse: saveForReuse,
              })
            }
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {option ? "Save" : "Create"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
