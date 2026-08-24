"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { businessProfileDetailApi } from "../../../apis";
import type { ServiceStudyOption, ServiceStudyOptionInput } from "../../../apis/types";

const STUDY_MODE_OPTIONS = [
  { value: "on_campus", label: "On campus" },
  { value: "online", label: "Online" },
  { value: "hybrid", label: "Hybrid" },
];
const STUDY_LOAD_OPTIONS = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
];
const DURATION_UNIT_OPTIONS = [
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
  { value: "months", label: "Months" },
  { value: "years", label: "Years" },
];

const EMPTY: ServiceStudyOptionInput = {
  name: "", study_mode: "on_campus", study_load: "full_time", duration_value: null, duration_unit: "months", applicable_to: "both",
};

export function StudyOptionsTab({ serviceId }: Readonly<{ serviceId: string }>) {
  const [options, setOptions] = useState<ServiceStudyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ServiceStudyOptionInput>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => businessProfileDetailApi.serviceStudyOptions.list(serviceId).then(setOptions).finally(() => setLoading(false));
  useEffect(() => { load(); }, [serviceId]);

  const handleAdd = async () => {
    setSaving(true);
    try {
      await businessProfileDetailApi.serviceStudyOptions.create(serviceId, form);
      toast.success("Study option added");
      setOpen(false);
      setForm(EMPTY);
      load();
    } catch (e) {
      toast.error("Couldn't add study option", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await businessProfileDetailApi.serviceStudyOptions.remove(serviceId, id);
      setOptions((o) => o.filter((x) => x.id !== id));
    } catch (e) {
      toast.error("Couldn't remove study option", { description: (e as Error).message });
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Study Options</span>
          <Badge variant="secondary">{options.length}</Badge>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add study option
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : options.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground italic">No study options configured yet.</p>
      ) : (
        <div className="space-y-2">
          {options.map((o) => (
            <div key={o.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{o.name || "Study option"}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {o.study_mode.replace("_", " ")} · {o.study_load.replace("_", " ")}
                  {o.duration_value ? ` · ${o.duration_value} ${o.duration_unit}` : ""}
                </p>
              </div>
              <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(o.id)} aria-label="Remove study option">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add study option</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input className="h-10" value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Full-time on campus" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label>Study mode</Label>
                <Combobox options={STUDY_MODE_OPTIONS} value={form.study_mode} onChange={(v) => setForm((f) => ({ ...f, study_mode: v as ServiceStudyOptionInput["study_mode"] }))} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Study load</Label>
                <Combobox options={STUDY_LOAD_OPTIONS} value={form.study_load} onChange={(v) => setForm((f) => ({ ...f, study_load: v as ServiceStudyOptionInput["study_load"] }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Duration</Label>
                <Input className="h-10" inputMode="numeric" value={form.duration_value ?? ""} onChange={(e) => setForm((f) => ({ ...f, duration_value: e.target.value ? Number(e.target.value) : null }))} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Duration unit</Label>
                <Combobox options={DURATION_UNIT_OPTIONS} value={form.duration_unit} onChange={(v) => setForm((f) => ({ ...f, duration_unit: v as ServiceStudyOptionInput["duration_unit"] }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? "Adding…" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
