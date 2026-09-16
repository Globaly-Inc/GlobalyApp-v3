"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Calendar, Loader2, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { OneToManySection } from "@/app/personal/profile/section-card";
import { cn } from "@/lib/utils";
import { businessesApi } from "../../apis";
import { ServiceIntakeForm } from "./service-intake-form";
import type { ServiceIntake, ServiceIntakeInput } from "../../apis/types";
import { ApiError } from "@/lib/api/http";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dateParts(value: string) {
  const d = new Date(value);
  return { month: MONTH_ABBR[d.getMonth()], day: d.getDate(), year: d.getFullYear() };
}

function isEnded(intake: ServiceIntake) {
  const ref = intake.end_date ?? intake.start_date;
  return ref ? new Date(ref) < new Date() : false;
}

function formatDate(value: string) {
  const d = new Date(value);
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function ServiceIntakesTab({
  kind,
  orgId,
  serviceId,
}: Readonly<{ kind: "business" | "institution"; orgId: number; serviceId: string }>) {
  const [intakes, setIntakes] = useState<ServiceIntake[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceIntake | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    const load = kind === "business" ? businessesApi.getServiceIntakes : businessesApi.getInstitutionServiceIntakes;
    load(orgId, serviceId)
      .then(setIntakes)
      .finally(() => setLoading(false));
  }, [kind, orgId, serviceId]);

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (intake: ServiceIntake) => { setEditing(intake); setFormOpen(true); };

  const handleSave = async (input: ServiceIntakeInput) => {
    setSaving(true);
    try {
      if (editing) {
        const update = kind === "business" ? businessesApi.updateServiceIntake : businessesApi.updateInstitutionServiceIntake;
        const updated = await update(orgId, serviceId, editing.id, input);
        setIntakes((i) => i.map((x) => (x.id === editing.id ? updated : x)));
        toast.success("Intake updated");
      } else {
        const create = kind === "business" ? businessesApi.createServiceIntake : businessesApi.createInstitutionServiceIntake;
        const created = await create(orgId, serviceId, input);
        setIntakes((i) => [...i, created]);
        toast.success("Intake added");
      }
      setFormOpen(false);
    } catch (e) {
      toast.error("Couldn't save intake", { description: (e as ApiError).message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (intakeId: number) => {
    const del = kind === "business" ? businessesApi.deleteServiceIntake : businessesApi.deleteInstitutionServiceIntake;
    try {
      await del(orgId, serviceId, intakeId);
      setIntakes((i) => i.filter((x) => x.id !== intakeId));
      toast.success("Intake removed");
    } catch (e) {
      toast.error("Couldn't remove intake", { description: (e as ApiError).message });
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
      <OneToManySection icon={Calendar} title="Intakes" count={intakes.length} onAdd={openAdd} emptyText="No intakes configured yet.">
        <div className="space-y-3">
          {intakes.map((intake) => {
            const ref = intake.start_date ?? intake.end_date;
            const ended = isEnded(intake);
            const parts = ref ? dateParts(ref) : null;
            return (
              <div key={intake.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div
                  className={cn(
                    "flex w-16 shrink-0 flex-col items-center rounded-md py-1.5 text-center",
                    ended ? "bg-muted" : "bg-primary/10",
                  )}
                >
                  <span className={cn("text-[10px] font-semibold uppercase", ended ? "text-muted-foreground" : "text-primary")}>
                    {parts?.month ?? "--"}
                  </span>
                  <span className={cn("text-lg font-bold leading-tight", ended ? "text-muted-foreground" : "text-primary")}>
                    {parts?.day ?? "-"}
                  </span>
                  <span className={cn("text-[10px]", ended ? "text-muted-foreground" : "text-primary")}>{parts?.year ?? ""}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{intake.intake_name || "Untitled intake"}</p>
                    <Badge variant={ended ? "secondary" : "default"} className="text-[10px]">
                      {ended ? "Ended" : "Upcoming"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {intake.end_date ? `Ends ${formatDate(intake.end_date)}` : "No end date set"}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="icon-sm" variant="ghost" onClick={() => openEdit(intake)} aria-label="Edit intake">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(intake.id)} aria-label="Delete intake">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </OneToManySection>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-0 bg-transparent p-0 shadow-none sm:max-w-2xl">
          <ServiceIntakeForm intake={editing ?? undefined} saving={saving} onCancel={() => setFormOpen(false)} onSave={handleSave} />
        </DialogContent>
      </Dialog>
    </>
  );
}
