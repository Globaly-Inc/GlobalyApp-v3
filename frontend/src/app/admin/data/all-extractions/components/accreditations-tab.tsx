"use client";

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Award, FileText, Globe, Link2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Combobox } from "@/components/combobox";
import { FieldError } from "@/components/field-error";
import { cn } from "@/lib/utils";
import { categoriesApi } from "@/app/admin/platform/categories/apis";
import { allExtractionsApi } from "../apis";
import { EditableField, useFieldSaver, type EditableFieldProps } from "./editable-field";
import { useConfirmDelete } from "./use-confirm-delete";
import type { Accreditation } from "../apis/types";

// EditableField keeps its own click-to-edit affordance — this just gives each
// field a visual anchor (icon tile), matching the Institution/Branches tabs' treatment.
function Field({ icon: Icon, className, ...field }: Readonly<EditableFieldProps & { icon: LucideIcon }>) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 p-2", className)}>
      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <EditableField {...field} className="flex-1" />
    </div>
  );
}

export function AccreditationsTab({ jobId }: Readonly<{ jobId: string }>) {
  const [accreditations, setAccreditations] = useState<Accreditation[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const fetchedRef = useRef(false);

  async function load() {
    setLoading(true);
    try {
      setAccreditations(await allExtractionsApi.getAccreditations(jobId));
    } catch (e) {
      toast.error("Failed to load accreditations", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  async function handleDelete(id: string) {
    try {
      await allExtractionsApi.deleteAccreditation(id);
      setAccreditations((prev) => prev.filter((a) => a.id !== id));
      toast.success("Accreditation deleted");
    } catch (e) {
      toast.error("Delete failed", { description: (e as Error).message });
    }
  }

  const saveField = useFieldSaver(jobId, load);

  if (loading) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Loading accreditations...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {accreditations.length} accreditation{accreditations.length !== 1 ? "s" : ""}
        </p>
        <Button size="sm" className="gap-1.5 cursor-pointer" onClick={() => setDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Add Accreditation
        </Button>
      </div>

      {accreditations.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Award className="mx-auto mb-3 h-8 w-8 opacity-40" />
            <p className="text-sm">No accreditations yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {accreditations.map((acc) => (
            <Card key={acc.id} className="group overflow-hidden">
              <div className="-mt-4 flex items-center justify-between gap-2 rounded-t-xl border-b bg-primary/5 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">{acc.name || "Unnamed accreditation"}</span>
                </div>
                <Button
                  variant="ghost" size="icon-sm" className="cursor-pointer text-destructive hover:text-destructive"
                  title="Delete accreditation" onClick={() => handleDelete(acc.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <CardContent className="p-4">
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  <Field icon={Award} label="Name" value={acc.name} onSave={(v) => saveField("extraction_accreditations", acc.id, "name", v)} />
                  <Field
                    icon={Globe} label="Issuing organization" value={acc.issuing_organization}
                    onSave={(v) => saveField("extraction_accreditations", acc.id, "issuing_organization", v)}
                  />
                  <Field
                    icon={Link2} label="Website" value={acc.website}
                    onSave={(v) => saveField("extraction_accreditations", acc.id, "website", v)}
                  />
                  <Field
                    icon={FileText} label="Description" value={acc.description} multiline
                    onSave={(v) => saveField("extraction_accreditations", acc.id, "description", v)}
                    className="md:col-span-2"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddAccreditationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        jobId={jobId}
        onCreated={(created) => {
          setAccreditations((prev) => [created, ...prev]);
          setDialogOpen(false);
        }}
      />
    </div>
  );
}

// ── Add dialog ───────────────────────────────────────────────────

import { z } from "zod";

const accreditationSchema = z.object({
  name: z.string().trim().min(1, "Accreditation name is required"),
  issuingOrg: z.string().trim().transform((v) => v || null),
});

function AddAccreditationDialog({
  open,
  onOpenChange,
  jobId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  jobId: string;
  onCreated: (a: Accreditation) => void;
}) {
  const [name, setName] = useState("");
  const [issuingOrg, setIssuingOrg] = useState("");
  const [saving, setSaving] = useState(false);
  const [accreditationOptions, setAccreditationOptions] = useState<{ value: string; label: string }[]>([]);
  const [issuingOrgOptions, setIssuingOrgOptions] = useState<{ value: string; label: string }[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setName("");
    setIssuingOrg("");
    setLoadingOptions(true);
    Promise.all([
      categoriesApi.getAccreditations({ limit: 100 }).catch(() => ({ data: [] })),
      categoriesApi.getIssuingOrganizations({ limit: 100 }).catch(() => ({ data: [] })),
    ])
      .then(([accRes, orgRes]) => {
        setAccreditationOptions(accRes.data.map((a) => ({ value: a.name, label: a.name })));
        setIssuingOrgOptions(orgRes.data.map((o) => ({ value: o.name, label: o.name })));
      })
      .finally(() => setLoadingOptions(false));
  }, [open]);

  async function handleSave() {
    const result = accreditationSchema.safeParse({ name, issuingOrg });
    if (!result.success) {
      const errs: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = String(issue.path[0]);
        if (!errs[key]) errs[key] = issue.message;
      }
      setErrors(errs);
      return;
    }

    setErrors({});
    const d = result.data;
    setSaving(true);
    try {
      const created = await allExtractionsApi.createAccreditation({
        job_id: jobId,
        name: d.name,
        issuing_organization: d.issuingOrg,
      });
      toast.success("Accreditation added");
      onCreated(created);
      setName(""); setIssuingOrg("");
    } catch (e) {
      toast.error("Failed to add accreditation", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Accreditation</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">
              Name <span className="text-destructive">*</span>
            </Label>
            <Combobox
              options={accreditationOptions}
              value={name}
              onChange={(v) => {
                setName(v);
                if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
              }}
              placeholder="Select or type accreditation name..."
              loading={loadingOptions}
              creatable
            />
            <FieldError message={errors.name} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Issuing Organization</Label>
            <Combobox
              options={issuingOrgOptions}
              value={issuingOrg}
              onChange={setIssuingOrg}
              placeholder="Select or type issuing organization..."
              loading={loadingOptions}
              creatable
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" className="cursor-pointer" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
