"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Loader2, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { businessProfileDetailApi } from "../../../apis";
import type { ServiceStudyUnit, ServiceStudyUnitInput } from "../../../apis/types";

const UNIT_TYPE_OPTIONS = [
  { value: "compulsory", label: "Compulsory" },
  { value: "elective", label: "Elective" },
];

const EMPTY: ServiceStudyUnitInput = { unit_code: "", unit_name: "", credit_points: null, description: "", unit_type: "compulsory" };

export function StudyUnitsTab({ serviceId }: Readonly<{ serviceId: string }>) {
  const [units, setUnits] = useState<ServiceStudyUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ServiceStudyUnitInput>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => businessProfileDetailApi.serviceStudyUnits.list(serviceId).then(setUnits).finally(() => setLoading(false));
  useEffect(() => { load(); }, [serviceId]);

  const canSave = form.unit_name.trim().length > 0;

  const handleAdd = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await businessProfileDetailApi.serviceStudyUnits.create(serviceId, form);
      toast.success("Study unit added");
      setOpen(false);
      setForm(EMPTY);
      load();
    } catch (e) {
      toast.error("Couldn't add study unit", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await businessProfileDetailApi.serviceStudyUnits.remove(serviceId, id);
      setUnits((u) => u.filter((x) => x.id !== id));
    } catch (e) {
      toast.error("Couldn't remove study unit", { description: (e as Error).message });
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Study Units</span>
          <Badge variant="secondary">{units.length}</Badge>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add unit
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : units.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground italic">No study units assigned yet.</p>
      ) : (
        <div className="space-y-2">
          {units.map((u) => (
            <div key={u.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{u.unit_code ? `${u.unit_code} — ` : ""}{u.unit_name} <Badge variant="outline" className="ml-1 text-[10px] capitalize">{u.unit_type}</Badge></p>
                <p className="text-xs text-muted-foreground">{u.credit_points ? `${u.credit_points} credit points` : "—"}</p>
              </div>
              <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(u.id)} aria-label="Remove unit">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add study unit</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Unit code</Label>
                <Input className="h-10" value={form.unit_code ?? ""} onChange={(e) => setForm((f) => ({ ...f, unit_code: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Unit name<span className="text-destructive"> *</span></Label>
                <Input className="h-10" value={form.unit_name} onChange={(e) => setForm((f) => ({ ...f, unit_name: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Credit points</Label>
                <Input className="h-10" inputMode="numeric" value={form.credit_points ?? ""} onChange={(e) => setForm((f) => ({ ...f, credit_points: e.target.value ? Number(e.target.value) : null }))} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Type</Label>
                <Combobox options={UNIT_TYPE_OPTIONS} value={form.unit_type} onChange={(v) => setForm((f) => ({ ...f, unit_type: v as ServiceStudyUnitInput["unit_type"] }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving || !canSave}>{saving ? "Adding…" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
