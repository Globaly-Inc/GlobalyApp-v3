"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Loader2, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { businessProfileDetailApi } from "../../../apis";
import type { ServiceIntake, ServiceIntakeInput } from "../../../apis/types";

const EMPTY: ServiceIntakeInput = {
  intake_name: "", start_date: null, end_date: null, orientation_date: null, admission_deadline: null,
  intake_month: null, intake_year: null,
};

export function IntakesTab({ serviceId }: Readonly<{ serviceId: string }>) {
  const [intakes, setIntakes] = useState<ServiceIntake[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ServiceIntakeInput>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => businessProfileDetailApi.serviceIntakes.list(serviceId).then(setIntakes).finally(() => setLoading(false));
  useEffect(() => { load(); }, [serviceId]);

  const handleAdd = async () => {
    setSaving(true);
    try {
      await businessProfileDetailApi.serviceIntakes.create(serviceId, form);
      toast.success("Intake added");
      setOpen(false);
      setForm(EMPTY);
      load();
    } catch (e) {
      toast.error("Couldn't add intake", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await businessProfileDetailApi.serviceIntakes.remove(serviceId, id);
      setIntakes((i) => i.filter((x) => x.id !== id));
    } catch (e) {
      toast.error("Couldn't remove intake", { description: (e as Error).message });
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Intakes</span>
          <Badge variant="secondary">{intakes.length}</Badge>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add intake
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : intakes.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground italic">No intakes configured yet.</p>
      ) : (
        <div className="space-y-2">
          {intakes.map((i) => (
            <div key={i.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{i.intake_name || "Intake"}</p>
                <p className="text-xs text-muted-foreground">
                  {[i.start_date, i.admission_deadline ? `Deadline ${i.admission_deadline}` : null].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(i.id)} aria-label="Remove intake">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add intake</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input className="h-10" value={form.intake_name ?? ""} onChange={(e) => setForm((f) => ({ ...f, intake_name: e.target.value }))} placeholder="Spring 2027" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label>Start date</Label>
                <DatePicker value={form.start_date ?? ""} onChange={(v) => setForm((f) => ({ ...f, start_date: v || null }))} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Admission deadline</Label>
                <DatePicker value={form.admission_deadline ?? ""} onChange={(v) => setForm((f) => ({ ...f, admission_deadline: v || null }))} />
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
