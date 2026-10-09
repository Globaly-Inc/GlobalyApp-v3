"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BookOpenCheck } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { businessProfileDetailApi } from "../../../apis";
import { ServiceStudyOptionForm } from "./service-study-option-form";
import { TabSection } from "./tab-section";
import { StudyOptionCard } from "./study-option-card";
import type { ServiceStudyOption, ServiceStudyOptionInput } from "../../../apis/types";

const MONTHS_PER_UNIT: Record<string, number> = { days: 1 / 30, weeks: 1 / 4.345, months: 1, years: 12 };

/** Duration normalised to months so options in different units share one scale. */
function durationInMonths(row: ServiceStudyOption): number | null {
  return row.duration_value ? row.duration_value * (MONTHS_PER_UNIT[row.duration_unit] ?? 1) : null;
}

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

  const months = rows.map(durationInMonths);
  const longest = Math.max(0, ...months.filter((m): m is number => m != null));

  return (
    <>
      <TabSection
        icon={BookOpenCheck}
        title="Study options"
        count={rows.length}
        addLabel="Add study option"
        onAdd={openAdd}
        loading={loading}
        emptyTitle="No study options yet"
        emptyHint="Add how students can take this course — on campus, online or hybrid, full- or part-time."
        summary={
          <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {rows.length} {rows.length === 1 ? "way" : "ways"} to study
          </p>
        }
      >
        <div className="stagger-in grid gap-3 sm:grid-cols-2">
          {rows.map((row, i) => {
            const m = months[i];
            return (
              <StudyOptionCard
                key={row.id}
                option={row}
                durationPct={m != null && longest > 0 ? (m / longest) * 100 : null}
                fillDelayMs={300 + i * 70}
                onEdit={() => openEdit(row)}
                onDelete={() => handleDelete(row.id)}
              />
            );
          })}
        </div>
      </TabSection>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-0 bg-transparent p-0 shadow-none sm:max-w-xl">
          <ServiceStudyOptionForm option={editing ?? undefined} saving={saving} onCancel={() => setFormOpen(false)} onSave={handleSave} />
        </DialogContent>
      </Dialog>
    </>
  );
}
