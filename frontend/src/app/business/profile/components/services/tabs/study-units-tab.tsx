"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Loader2, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { OneToManySection } from "@/app/personal/profile/section-card";
import { businessProfileDetailApi } from "../../../apis";
import { ServiceStudyUnitForm } from "./service-study-unit-form";
import type { ServiceStudyUnit, ServiceStudyUnitInput } from "../../../apis/types";

const UNIT_TYPE_LABELS: Record<string, string> = { compulsory: "Compulsory", elective: "Elective" };

export function StudyUnitsTab({ serviceId }: Readonly<{ serviceId: string }>) {
  const [rows, setRows] = useState<ServiceStudyUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceStudyUnit | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    businessProfileDetailApi.serviceStudyUnits.list(serviceId).then(setRows).finally(() => setLoading(false));
  }, [serviceId]);

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (row: ServiceStudyUnit) => { setEditing(row); setFormOpen(true); };

  const handleSave = async (input: ServiceStudyUnitInput) => {
    setSaving(true);
    try {
      if (editing) {
        const updated = await businessProfileDetailApi.serviceStudyUnits.update(serviceId, editing.id, input);
        setRows((r) => r.map((x) => (x.id === editing.id ? updated : x)));
        toast.success("Study unit updated");
      } else {
        const created = await businessProfileDetailApi.serviceStudyUnits.create(serviceId, input);
        setRows((r) => [...r, created]);
        toast.success("Study unit added");
      }
      setFormOpen(false);
    } catch (e) {
      toast.error("Couldn't save study unit", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await businessProfileDetailApi.serviceStudyUnits.remove(serviceId, id);
      setRows((r) => r.filter((x) => x.id !== id));
      toast.success("Study unit removed");
    } catch (e) {
      toast.error("Couldn't remove study unit", { description: (e as Error).message });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <OneToManySection icon={BookOpen} title="Study units" count={rows.length} onAdd={openAdd} emptyText="No study units assigned yet.">
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between rounded-lg border bg-primary/5 p-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {row.unit_code && <span className="text-sm font-medium text-primary">{row.unit_code}</span>}
                    <span className="text-sm font-medium">{row.unit_name}</span>
                    <Badge className="bg-primary text-primary-foreground hover:bg-primary">
                      {UNIT_TYPE_LABELS[row.unit_type]}
                    </Badge>
                  </div>
                  {row.credit_points ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{row.credit_points} credit points</p>
                  ) : null}
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="icon-sm" variant="ghost" onClick={() => openEdit(row)} aria-label="Edit study unit">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(row.id)} aria-label="Delete study unit">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </OneToManySection>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-0 bg-transparent p-0 shadow-none sm:max-w-xl">
          <ServiceStudyUnitForm unit={editing ?? undefined} saving={saving} onCancel={() => setFormOpen(false)} onSave={handleSave} />
        </DialogContent>
      </Dialog>
    </>
  );
}
