"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Lookup } from "@/app/admin/platform/categories/apis/types";
import { businessProfileDetailApi } from "../../apis";
import type { BusinessService } from "../../apis/types";

const DURATION_UNITS = ["days", "weeks", "months", "years"].map((unit) => ({ value: unit, label: unit }));

/**
 * Schema-field ids for the catalog keys this dialog writes, keyed by service category.
 *
 * Every category carries its own `degree_level` / `area_of_study` field row with its own id, so a
 * selection spanning categories must resolve the id per service. Writing one category's id onto a
 * service in another files the value under the wrong field definition.
 */
type FieldIdsByCategory = Map<number, { degree_level?: number; area_of_study?: number }>;

/**
 * Sets degree level, subject area and/or duration across every selected service — V1's
 * ServiceBulkUpdateDialog. Each field is opt-in, so an untouched field can't be blanked.
 *
 * The three live in different places in V3: degree level and subject area are schema field
 * values, while duration belongs to the service's first study option.
 */
export function ServiceBulkUpdateDialog({
  open,
  onOpenChange,
  services,
  orgBase,
  onUpdated,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The selected services themselves — each row's category decides which field ids it writes. */
  services: BusinessService[];
  orgBase: string;
  onUpdated: () => void;
}>) {
  const [degreeLevels, setDegreeLevels] = useState<Lookup[]>([]);
  const [areasOfStudy, setAreasOfStudy] = useState<Lookup[]>([]);
  const [fieldIdsByCategory, setFieldIdsByCategory] = useState<FieldIdsByCategory>(new Map());
  const [saving, setSaving] = useState(false);

  const [enabled, setEnabled] = useState({ degree_level: false, area_of_study: false, duration: false });
  const [degreeLevelId, setDegreeLevelId] = useState("");
  const [areaOfStudyId, setAreaOfStudyId] = useState("");
  const [durationValue, setDurationValue] = useState("");
  const [durationUnit, setDurationUnit] = useState("months");

  const loadedRef = useRef(false);
  useEffect(() => {
    if (!open || loadedRef.current) return;
    loadedRef.current = true;
    businessProfileDetailApi.getLookups("degree-levels", { limit: 200 }, orgBase).then((res) => setDegreeLevels(res.data));
    businessProfileDetailApi.getLookups("areas-of-study", { limit: 200 }, orgBase).then((res) => setAreasOfStudy(res.data));
    businessProfileDetailApi.getServiceCategories({ limit: 100 }, orgBase).then((res) => {
      const byCategory: FieldIdsByCategory = new Map();
      for (const category of res.data) {
        const ids: { degree_level?: number; area_of_study?: number } = {};
        for (const field of category.schema_fields) {
          if (field.key === "degree_level") ids.degree_level = field.id;
          if (field.key === "area_of_study") ids.area_of_study = field.id;
        }
        byCategory.set(category.id, ids);
      }
      setFieldIdsByCategory(byCategory);
    });
  }, [open, orgBase]);

  /** Returns false when the service's category has no field to hold one of the enabled values. */
  const applyFieldValues = async (service: BusinessService) => {
    const ids = service.service_category_id != null ? fieldIdsByCategory.get(service.service_category_id) : undefined;
    const values: { schema_field_id: number; value: unknown }[] = [];
    let complete = true;

    if (enabled.degree_level && degreeLevelId) {
      if (ids?.degree_level == null) complete = false;
      else values.push({ schema_field_id: ids.degree_level, value: Number(degreeLevelId) });
    }
    if (enabled.area_of_study && areaOfStudyId) {
      if (ids?.area_of_study == null) complete = false;
      else values.push({ schema_field_id: ids.area_of_study, value: Number(areaOfStudyId) });
    }

    if (values.length > 0) await businessProfileDetailApi.updateServiceFieldValues(service.id, values, orgBase);
    return complete;
  };

  const applyDuration = async (serviceId: string) => {
    if (!enabled.duration || !durationValue) return;
    const duration_value = Number(durationValue);
    const duration_unit = durationUnit as "days" | "weeks" | "months" | "years";
    const existing = await businessProfileDetailApi.serviceStudyOptions.list(serviceId, orgBase);
    // The list column reads the first study option's duration, so that's the one to move.
    const first = existing[0];
    if (first) {
      await businessProfileDetailApi.serviceStudyOptions.update(serviceId, first.id, { duration_value, duration_unit }, orgBase);
      return;
    }
    await businessProfileDetailApi.serviceStudyOptions.create(serviceId, {
      name: null,
      study_mode: "on_campus",
      study_load: "full_time",
      duration_value,
      duration_unit,
      applicable_to: "both",
    }, orgBase);
  };

  const handleSave = async () => {
    const chosen =
      (enabled.degree_level && degreeLevelId) || (enabled.area_of_study && areaOfStudyId) || (enabled.duration && durationValue);
    if (!chosen) {
      toast.error("No fields selected", { description: "Enable and fill at least one field to update." });
      return;
    }
    setSaving(true);
    try {
      let skipped = 0;
      for (const service of services) {
        if (!(await applyFieldValues(service))) skipped += 1;
        await applyDuration(service.id);
      }
      const count = services.length;
      toast.success(`Updated ${count} service${count === 1 ? "" : "s"}`, {
        // Silence would read as success on a row whose category has no such field to write to.
        description: skipped > 0 ? `${skipped} had no matching field on their category and kept their previous value.` : undefined,
      });
      onUpdated();
      onOpenChange(false);
    } catch (e) {
      toast.error("Bulk update failed", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: keyof typeof enabled) => setEnabled((prev) => ({ ...prev, [key]: !prev[key] }));
  const plural = services.length === 1 ? "" : "s";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk update {services.length} service{plural}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <p className="text-sm text-muted-foreground">
            Enable the fields you want to update. Only enabled fields will be changed.
          </p>

          <div className="flex items-start gap-3">
            <Checkbox className="mt-3" checked={enabled.degree_level} onCheckedChange={() => toggle("degree_level")} />
            <div className="flex flex-1 flex-col gap-1.5">
              <Label className={enabled.degree_level ? undefined : "text-muted-foreground"}>Degree level</Label>
              <Combobox
                options={degreeLevels.map((l) => ({ value: String(l.id), label: l.name }))}
                value={degreeLevelId}
                onChange={setDegreeLevelId}
                disabled={!enabled.degree_level}
                placeholder="Select degree level"
              />
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox className="mt-3" checked={enabled.area_of_study} onCheckedChange={() => toggle("area_of_study")} />
            <div className="flex flex-1 flex-col gap-1.5">
              <Label className={enabled.area_of_study ? undefined : "text-muted-foreground"}>Subject area</Label>
              <Combobox
                options={areasOfStudy.map((l) => ({ value: String(l.id), label: l.name }))}
                value={areaOfStudyId}
                onChange={setAreaOfStudyId}
                disabled={!enabled.area_of_study}
                placeholder="Select subject area"
              />
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox className="mt-3" checked={enabled.duration} onCheckedChange={() => toggle("duration")} />
            <div className="flex flex-1 flex-col gap-1.5">
              <Label className={enabled.duration ? undefined : "text-muted-foreground"}>Duration</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={0}
                  className="w-24"
                  placeholder="Value"
                  value={durationValue}
                  onChange={(e) => setDurationValue(e.target.value)}
                  disabled={!enabled.duration}
                />
                <Combobox
                  className="w-32"
                  options={DURATION_UNITS}
                  value={durationUnit}
                  onChange={setDurationUnit}
                  disabled={!enabled.duration}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update {services.length} service{plural}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
