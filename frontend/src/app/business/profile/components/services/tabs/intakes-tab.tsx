"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Calendar, Loader2, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { OneToManySection } from "@/app/personal/profile/section-card";
import { cn } from "@/lib/utils";
import { businessProfileDetailApi } from "../../../apis";
import { ServiceIntakeForm } from "./service-intake-form";
import type { ServiceIntake, ServiceIntakeInput } from "../../../apis/types";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dateParts(value: string) {
  const d = new Date(value);
  return { month: MONTH_ABBR[d.getMonth()], day: d.getDate(), year: d.getFullYear() };
}

/** The tile's date: a full date when there is one, else the month/year an extracted intake
 *  often only has, else null — never a placeholder that looks like a broken date. */
function tileParts(intake: ServiceIntake): { top: string; main: string; bottom: string } | null {
  const ref = intake.start_date ?? intake.end_date;
  if (ref) {
    const p = dateParts(ref);
    return { top: p.month ?? "", main: String(p.day), bottom: String(p.year) };
  }
  if (intake.intake_month || intake.intake_year) {
    return { top: intake.intake_month ? MONTH_ABBR[intake.intake_month - 1] ?? "" : "", main: String(intake.intake_year ?? ""), bottom: "" };
  }
  return null;
}

/** null = no date at all, so it can't honestly be called upcoming or ended. */
function isEnded(intake: ServiceIntake): boolean | null {
  const ref = intake.end_date ?? intake.start_date;
  if (ref) return new Date(ref) < new Date();
  if (intake.intake_year) {
    const now = new Date();
    const month = intake.intake_month ?? 12;
    return intake.intake_year < now.getFullYear() || (intake.intake_year === now.getFullYear() && month < now.getMonth() + 1);
  }
  return null;
}

function dateSummary(intake: ServiceIntake) {
  const bits = [
    intake.start_date && `Starts ${formatDate(intake.start_date)}`,
    intake.admission_deadline && `Apply by ${formatDate(intake.admission_deadline)}`,
    intake.end_date && `Ends ${formatDate(intake.end_date)}`,
  ].filter(Boolean);
  return bits.length > 0 ? bits.join(" · ") : "No dates set yet — edit to add them";
}

function formatDate(value: string) {
  const d = new Date(value);
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** `allowMonth` — institution intakes store month-only dates; a business service's are `date` columns. */
export function IntakesTab({ serviceId, allowMonth = false }: Readonly<{ serviceId: string; allowMonth?: boolean }>) {
  const [intakes, setIntakes] = useState<ServiceIntake[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceIntake | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    businessProfileDetailApi.serviceIntakes.list(serviceId).then(setIntakes).finally(() => setLoading(false));
  }, [serviceId]);

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (intake: ServiceIntake) => { setEditing(intake); setFormOpen(true); };

  const handleSave = async (input: ServiceIntakeInput) => {
    setSaving(true);
    try {
      if (editing) {
        const updated = await businessProfileDetailApi.serviceIntakes.update(serviceId, editing.id, input);
        setIntakes((i) => i.map((x) => (x.id === editing.id ? updated : x)));
        toast.success("Intake updated");
      } else {
        const created = await businessProfileDetailApi.serviceIntakes.create(serviceId, input);
        setIntakes((i) => [...i, created]);
        toast.success("Intake added");
      }
      setFormOpen(false);
    } catch (e) {
      toast.error("Couldn't save intake", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (intakeId: number) => {
    try {
      await businessProfileDetailApi.serviceIntakes.remove(serviceId, intakeId);
      setIntakes((i) => i.filter((x) => x.id !== intakeId));
      toast.success("Intake removed");
    } catch (e) {
      toast.error("Couldn't remove intake", { description: (e as Error).message });
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
            const ended = isEnded(intake);
            const parts = tileParts(intake);
            return (
              <div key={intake.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div
                  className={cn(
                    "flex min-h-14 w-16 shrink-0 flex-col items-center justify-center rounded-md py-1.5 text-center",
                    ended || !parts ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
                  )}
                >
                  {parts ? (
                    <>
                      {parts.top && <span className="text-[10px] font-semibold uppercase">{parts.top}</span>}
                      <span className="text-lg font-bold leading-tight">{parts.main}</span>
                      {parts.bottom && <span className="text-[10px]">{parts.bottom}</span>}
                    </>
                  ) : (
                    <Calendar className="h-5 w-5" aria-label="No date set" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{intake.intake_name || "Untitled intake"}</p>
                    {ended === null ? (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">Date not set</Badge>
                    ) : (
                      <Badge variant={ended ? "secondary" : "default"} className="text-[10px]">
                        {ended ? "Ended" : "Upcoming"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {dateSummary(intake)}
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
          <ServiceIntakeForm intake={editing ?? undefined} saving={saving} onCancel={() => setFormOpen(false)} onSave={handleSave} allowMonth={allowMonth} />
        </DialogContent>
      </Dialog>
    </>
  );
}
