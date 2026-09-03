"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DollarSign, Loader2, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { businessProfileDetailApi } from "../../../apis";
import type { ServiceFee, ServiceFeeInput } from "../../../apis/types";

const STUDENT_TYPE_OPTIONS = [
  { value: "both", label: "Domestic & International" },
  { value: "domestic", label: "Domestic" },
  { value: "international", label: "International" },
];

const EMPTY: ServiceFeeInput = {
  name: "", student_type: "both", period_type: "Per Year", currency: "AUD", total_amount: 0, installments: [],
};

export function CourseFeesTab({ serviceId }: Readonly<{ serviceId: string }>) {
  const [fees, setFees] = useState<ServiceFee[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ServiceFeeInput>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => businessProfileDetailApi.serviceFees.list(serviceId).then(setFees).finally(() => setLoading(false));
  useEffect(() => { load(); }, [serviceId]);

  const handleAdd = async () => {
    setSaving(true);
    try {
      await businessProfileDetailApi.serviceFees.create(serviceId, form);
      toast.success("Fee added");
      setOpen(false);
      setForm(EMPTY);
      load();
    } catch (e) {
      toast.error("Couldn't add fee", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await businessProfileDetailApi.serviceFees.remove(serviceId, id);
      setFees((f) => f.filter((x) => x.id !== id));
    } catch (e) {
      toast.error("Couldn't remove fee", { description: (e as Error).message });
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Course Fees</span>
          <Badge variant="secondary">{fees.length}</Badge>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add fee
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : fees.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground italic">No fees configured yet.</p>
      ) : (
        <div className="space-y-2">
          {fees.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{f.name || "Fee"} <span className="text-xs text-muted-foreground">({f.student_type})</span></p>
                <p className="text-xs text-muted-foreground">{f.currency} {f.total_amount} · {f.period_type}</p>
              </div>
              <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(f.id)} aria-label="Remove fee">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add fee</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input className="h-10" value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Tuition fee" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Applies to</Label>
              <Combobox options={STUDENT_TYPE_OPTIONS} value={form.student_type} onChange={(v) => setForm((f) => ({ ...f, student_type: v as ServiceFeeInput["student_type"] }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input className="h-10" inputMode="decimal" value={String(form.total_amount)} onChange={(e) => setForm((f) => ({ ...f, total_amount: Number(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Input className="h-10" value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Period</Label>
                <Input className="h-10" value={form.period_type} onChange={(e) => setForm((f) => ({ ...f, period_type: e.target.value }))} placeholder="Per Year" />
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
