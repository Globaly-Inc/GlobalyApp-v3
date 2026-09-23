"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BookOpenCheck, Clock, Loader2, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { OneToManySection } from "@/app/personal/profile/section-card";
import { businessProfileDetailApi } from "../../../apis";
import { ServiceStudyOptionForm } from "./service-study-option-form";
import type { ServiceStudyOption, ServiceStudyOptionInput } from "../../../apis/types";

const STUDY_MODE_LABELS: Record<string, string> = { on_campus: "On campus", online: "Online", hybrid: "Hybrid" };
const STUDY_LOAD_LABELS: Record<string, string> = { full_time: "Full time", part_time: "Part time" };

export function StudyOptionsTab({ serviceId }: Readonly<{ serviceId: string }>) {
  const [rows, setRows] = useState<ServiceStudyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceStudyOption | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    businessProfileDetailApi.serviceStudyOptions.list(serviceId).then(setRows).finally(() => setLoading(false));
  }, [serviceId]);

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (row: ServiceStudyOption) => { setEditing(row); setFormOpen(true); };

  const handleSave = async (input: ServiceStudyOptionInput) => {
    setSaving(true);
    try {
      if (editing) {
        const updated = await businessProfileDetailApi.serviceStudyOptions.update(serviceId, editing.id, input);
        setRows((r) => r.map((x) => (x.id === editing.id ? updated : x)));
        toast.success("Study option updated");
      } else {
        const created = await businessProfileDetailApi.serviceStudyOptions.create(serviceId, input);
        setRows((r) => [...r, created]);
        toast.success("Study option added");
      }
      setFormOpen(false);
    } catch (e) {
      toast.error("Couldn't save study option", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await businessProfileDetailApi.serviceStudyOptions.remove(serviceId, id);
      setRows((r) => r.filter((x) => x.id !== id));
      toast.success("Study option removed");
    } catch (e) {
      toast.error("Couldn't remove study option", { description: (e as Error).message });
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
      <OneToManySection icon={BookOpenCheck} title="Study options" count={rows.length} onAdd={openAdd} emptyText="No study options configured yet.">
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between rounded-lg border bg-primary/5 p-3">
              <div className="flex items-center gap-2.5">
                <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-primary text-primary-foreground hover:bg-primary">
                      {STUDY_MODE_LABELS[row.study_mode] || "Study option"}
                    </Badge>
                    <span className="text-sm font-medium">{STUDY_LOAD_LABELS[row.study_load]}</span>
                    <span className="text-sm font-medium capitalize">{row.applicable_to}</span>
                  </div>
                  {row.duration_value ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{row.duration_value} {row.duration_unit}</p>
                  ) : null}
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="icon-sm" variant="ghost" onClick={() => openEdit(row)} aria-label="Edit study option">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(row.id)} aria-label="Delete study option">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </OneToManySection>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-0 bg-transparent p-0 shadow-none sm:max-w-xl">
          <ServiceStudyOptionForm option={editing ?? undefined} saving={saving} onCancel={() => setFormOpen(false)} onSave={handleSave} />
        </DialogContent>
      </Dialog>
    </>
  );
}
