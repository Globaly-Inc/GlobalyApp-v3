"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { businessProfileDetailApi } from "../../../apis";
import type { ServiceEligibility, ServiceEligibilityInput } from "../../../apis/types";

const APPLICABLE_TO_OPTIONS = [
  { value: "both", label: "Domestic & International" },
  { value: "domestic", label: "Domestic" },
  { value: "international", label: "International" },
];
const SCORE_TYPE_OPTIONS = [
  { value: "percentage", label: "Percentage" },
  { value: "gpa_4", label: "GPA (4.0)" },
  { value: "gpa_10", label: "GPA (10.0)" },
  { value: "cgpa", label: "CGPA" },
];

const EMPTY: ServiceEligibilityInput = {
  name: "", applicable_to: "both", degree_level_id: null, score_type: null, min_score: null,
  description: "", academic_tests: [], language_tests: [],
};

export function EligibilityTab({ serviceId }: Readonly<{ serviceId: string }>) {
  const [rows, setRows] = useState<ServiceEligibility[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ServiceEligibilityInput>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => businessProfileDetailApi.serviceEligibility.list(serviceId).then(setRows).finally(() => setLoading(false));
  useEffect(() => { load(); }, [serviceId]);

  const handleAdd = async () => {
    setSaving(true);
    try {
      await businessProfileDetailApi.serviceEligibility.create(serviceId, form);
      toast.success("Eligibility requirement added");
      setOpen(false);
      setForm(EMPTY);
      load();
    } catch (e) {
      toast.error("Couldn't add requirement", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await businessProfileDetailApi.serviceEligibility.remove(serviceId, id);
      setRows((r) => r.filter((x) => x.id !== id));
    } catch (e) {
      toast.error("Couldn't remove requirement", { description: (e as Error).message });
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Eligibility</span>
          <Badge variant="secondary">{rows.length}</Badge>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add requirement
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground italic">No eligibility requirements configured yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{r.name || "Requirement"} <span className="text-xs text-muted-foreground">({r.applicable_to})</span></p>
                <p className="text-xs text-muted-foreground">
                  {r.min_score != null ? `Min score: ${r.min_score}${r.score_type ? ` (${r.score_type})` : ""}` : r.description || "—"}
                </p>
              </div>
              <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(r.id)} aria-label="Remove requirement">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add eligibility requirement</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input className="h-10" value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Minimum academic score" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Applies to</Label>
              <Combobox options={APPLICABLE_TO_OPTIONS} value={form.applicable_to} onChange={(v) => setForm((f) => ({ ...f, applicable_to: v as ServiceEligibilityInput["applicable_to"] }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label>Score type</Label>
                <Combobox options={SCORE_TYPE_OPTIONS} value={form.score_type ?? ""} onChange={(v) => setForm((f) => ({ ...f, score_type: (v || null) as ServiceEligibilityInput["score_type"] }))} placeholder="None" />
              </div>
              <div className="space-y-2">
                <Label>Minimum score</Label>
                <Input className="h-10" inputMode="decimal" value={form.min_score ?? ""} onChange={(e) => setForm((f) => ({ ...f, min_score: e.target.value ? Number(e.target.value) : null }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={3} value={form.description ?? ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
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
