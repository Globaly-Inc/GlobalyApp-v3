"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Award, Globe2, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { OneToManySection } from "@/app/personal/profile/section-card";
import { businessesApi } from "../../apis";
import { categoriesApi } from "@/app/admin/platform/categories/apis";
import type { Accreditation } from "@/app/admin/platform/categories/apis/types";
import { ServiceAccreditationForm } from "./service-accreditation-form";
import type { ServiceAccreditation } from "../../apis/types";
import { ApiError } from "@/lib/api/http";

export function ServiceAccreditationsTab({
  kind,
  orgId,
  serviceId,
}: Readonly<{ kind: "business" | "institution"; orgId: number; serviceId: string }>) {
  const [rows, setRows] = useState<ServiceAccreditation[]>([]);
  const [details, setDetails] = useState<Record<number, Accreditation>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [selected, setSelected] = useState("");
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    const load = kind === "business" ? businessesApi.getServiceAccreditations : businessesApi.getInstitutionServiceAccreditations;
    load(orgId, serviceId)
      .then(async (data) => {
        setRows(data);
        if (data.length > 0) {
          const res = await categoriesApi.getAccreditations({ limit: 100 });
          setDetails(Object.fromEntries(res.data.map((a) => [a.id, a])));
        }
      })
      .finally(() => setLoading(false));
  }, [kind, orgId, serviceId]);

  const openAdd = async () => {
    setSelected("");
    setMode("existing");
    const res = await categoriesApi.getAccreditations({ limit: 100 });
    setOptions(res.data.map((a) => ({ value: String(a.id), label: a.name })));
    setDetails((n) => ({ ...n, ...Object.fromEntries(res.data.map((a) => [a.id, a])) }));
    setDialogOpen(true);
  };

  const linkAccreditation = async (accreditationId: number) => {
    const create = kind === "business" ? businessesApi.createServiceAccreditation : businessesApi.createInstitutionServiceAccreditation;
    const created = await create(orgId, serviceId, { accreditation_id: accreditationId });
    setRows((r) => [...r, created]);
    toast.success("Accreditation linked");
    setDialogOpen(false);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await linkAccreditation(Number(selected));
    } catch (e) {
      toast.error("Couldn't link accreditation", { description: (e as ApiError).message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rowId: number) => {
    const del = kind === "business" ? businessesApi.deleteServiceAccreditation : businessesApi.deleteInstitutionServiceAccreditation;
    try {
      await del(orgId, serviceId, rowId);
      setRows((r) => r.filter((x) => x.id !== rowId));
      toast.success("Accreditation removed");
    } catch (e) {
      toast.error("Couldn't remove accreditation", { description: (e as ApiError).message });
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
      <OneToManySection icon={Award} title="Accreditations" count={rows.length} onAdd={openAdd} emptyText="No accreditations linked yet.">
        <div className="space-y-2">
          {rows.map((row) => {
            const a = details[row.accreditation_id];
            return (
              <div key={row.id} className="rounded-lg border bg-primary/5 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Award className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{a?.name ?? `Accreditation #${row.accreditation_id}`}</span>
                        {a?.is_global && <Badge variant="outline" className="text-primary">Global</Badge>}
                      </div>
                      {a?.issuing_organization_name && (
                        <p className="text-xs text-muted-foreground">{a.issuing_organization_name}</p>
                      )}
                      {a?.website && (
                        <a
                          href={a.website} target="_blank" rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <Globe2 className="h-3 w-3" /> Website
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(row.id)} aria-label="Remove accreditation">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </OneToManySection>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={mode === "new" ? "max-h-[90vh] overflow-y-auto border-0 bg-transparent p-0 shadow-none" : undefined}>
          {mode === "existing" ? (
            <>
              <DialogHeader>
                <DialogTitle>Link accreditation</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Label>Accreditation</Label>
                <Combobox value={selected} onChange={setSelected} options={options} placeholder="Select accreditation" searchPlaceholder="Search accreditations..." />
              </div>
              <Button variant="ghost" size="sm" className="w-fit gap-1.5 text-primary" onClick={() => setMode("new")}>
                <Plus className="h-3.5 w-3.5" /> Add a new accreditation
              </Button>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving || !selected}>{saving ? "Saving…" : "Save"}</Button>
              </DialogFooter>
            </>
          ) : (
            <ServiceAccreditationForm saving={saving} onCancel={() => setMode("existing")} onSave={linkAccreditation} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
