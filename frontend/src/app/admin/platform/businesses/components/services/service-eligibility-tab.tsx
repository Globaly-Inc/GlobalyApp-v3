"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { OneToManySection } from "@/app/personal/profile/section-card";
import { businessesApi } from "../../apis";
import { fetchLookup } from "@/app/admin/platform/categories/store/categories-slice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { ServiceEligibilityForm } from "./service-eligibility-form";
import type { ServiceEligibility, ServiceEligibilityInput } from "../../apis/types";
import { ApiError } from "@/lib/api/http";

const SCORE_TYPE_LABELS: Record<string, string> = {
  percentage: "Percentage", gpa_4: "GPA (4.0)", gpa_10: "GPA (10.0)", cgpa: "CGPA",
};

export function ServiceEligibilityTab({
  kind,
  orgId,
  serviceId,
}: Readonly<{ kind: "business" | "institution"; orgId: number; serviceId: string }>) {
  const dispatch = useAppDispatch();
  const degreeLevels = useAppSelector((s) => s.platformCategories.degreeLevels.data);
  const [rows, setRows] = useState<ServiceEligibility[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceEligibility | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    if (degreeLevels.length === 0) dispatch(fetchLookup({ kind: "degree-levels" }));
    const load = kind === "business" ? businessesApi.getServiceEligibility : businessesApi.getInstitutionServiceEligibility;
    load(orgId, serviceId).then(setRows).finally(() => setLoading(false));
  }, [kind, orgId, serviceId, dispatch, degreeLevels.length]);

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (row: ServiceEligibility) => { setEditing(row); setFormOpen(true); };

  const handleSave = async (input: ServiceEligibilityInput) => {
    setSaving(true);
    try {
      if (editing) {
        const update = kind === "business" ? businessesApi.updateServiceEligibility : businessesApi.updateInstitutionServiceEligibility;
        const updated = await update(orgId, serviceId, editing.id, input);
        setRows((r) => r.map((x) => (x.id === editing.id ? updated : x)));
        toast.success("Eligibility requirement updated");
      } else {
        const create = kind === "business" ? businessesApi.createServiceEligibility : businessesApi.createInstitutionServiceEligibility;
        const created = await create(orgId, serviceId, input);
        setRows((r) => [...r, created]);
        toast.success("Eligibility requirement added");
      }
      setFormOpen(false);
    } catch (e) {
      toast.error("Couldn't save requirement", { description: (e as ApiError).message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    const del = kind === "business" ? businessesApi.deleteServiceEligibility : businessesApi.deleteInstitutionServiceEligibility;
    try {
      await del(orgId, serviceId, id);
      setRows((r) => r.filter((x) => x.id !== id));
      toast.success("Requirement removed");
    } catch (e) {
      toast.error("Couldn't remove requirement", { description: (e as ApiError).message });
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
      <OneToManySection icon={ShieldCheck} title="Eligibility" count={rows.length} onAdd={openAdd} emptyText="No eligibility requirements configured yet.">
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-lg border p-3">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">{row.name || "Untitled requirement"}</span>
                  <Badge variant="secondary" className="capitalize">{row.applicable_to === "both" ? "All Students" : row.applicable_to}</Badge>
                  <Badge variant="outline">Global</Badge>
                </div>
                <div className="flex gap-1">
                  <Button size="icon-sm" variant="ghost" onClick={() => openEdit(row)} aria-label="Edit requirement">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(row.id)} aria-label="Delete requirement">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {(row.degree_level_id || (row.score_type && row.min_score)) && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {row.degree_level_id && (
                    <Badge variant="outline" className="gap-1 font-normal">
                      Min. degree <span className="font-semibold">{degreeLevels.find((d) => d.id === row.degree_level_id)?.name ?? "—"}</span>
                    </Badge>
                  )}
                  {row.score_type && row.min_score && (
                    <Badge variant="outline" className="gap-1 font-normal">
                      Min score <span className="font-semibold">{row.min_score} ({SCORE_TYPE_LABELS[row.score_type]})</span>
                    </Badge>
                  )}
                </div>
              )}

              {row.language_tests.length > 0 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {row.language_tests.map((t, i) => (
                    <div key={`${t.test_type_name}-${i}`} className="rounded-lg border p-2.5">
                      <p className="text-[10px] uppercase text-muted-foreground">{t.test_type_name}</p>
                      <p className="text-base font-bold">{t.overall_score}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </OneToManySection>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-0 bg-transparent p-0 shadow-none sm:max-w-2xl">
          <ServiceEligibilityForm requirement={editing ?? undefined} saving={saving} onCancel={() => setFormOpen(false)} onSave={handleSave} />
        </DialogContent>
      </Dialog>
    </>
  );
}
