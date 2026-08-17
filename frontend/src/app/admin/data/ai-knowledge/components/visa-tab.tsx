"use client";

import { useState } from "react";
import { Pencil, Plus, Shield, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { aiKnowledgeApi } from "../apis";
import type { VisaEntry, VisaParams } from "../apis/types";
import { useConfirmDelete } from "./use-confirm-delete";
import { EmptyState, ListSkeleton } from "./shared";

const csv = (values: string[] | null) => (values ?? []).join(", ");
const parseCsv = (raw: string) => {
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : null;
};
const num = (raw: string) => (raw.trim() === "" ? null : Number(raw));

function VisaForm({
  entry, saving, onCancel, onSave,
}: Readonly<{
  entry?: VisaEntry;
  saving: boolean;
  onCancel: () => void;
  onSave: (values: VisaParams) => void;
}>) {
  const [country, setCountry] = useState(entry?.destination_country ?? "");
  const [visaType, setVisaType] = useState(entry?.visa_type ?? "");
  const [nationalities, setNationalities] = useState(csv(entry?.eligible_nationalities ?? null));
  const [documents, setDocuments] = useState(csv(entry?.required_documents ?? null));
  const [rejections, setRejections] = useState(csv(entry?.common_rejections ?? null));
  const [processingDays, setProcessingDays] = useState(String(entry?.processing_time_days ?? ""));
  const [fee, setFee] = useState(String(entry?.application_fee_usd ?? ""));
  const [workHours, setWorkHours] = useState(String(entry?.work_rights_hours ?? ""));
  const [postStudy, setPostStudy] = useState(entry?.post_study_visa ?? "");
  const [verified, setVerified] = useState(entry?.last_verified_date ?? "");
  const [active, setActive] = useState(entry?.active ?? true);

  const submit = () => {
    if (!country.trim() || !visaType.trim()) {
      toast.error("Destination country and visa type are required");
      return;
    }
    onSave({
      destination_country: country.trim(),
      visa_type: visaType.trim(),
      eligible_nationalities: parseCsv(nationalities),
      required_documents: parseCsv(documents),
      common_rejections: parseCsv(rejections),
      processing_time_days: num(processingDays),
      application_fee_usd: num(fee),
      work_rights_hours: num(workHours),
      post_study_visa: postStudy.trim() || null,
      last_verified_date: verified || null,
      active,
    });
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <p className="font-semibold text-foreground">{entry ? "Edit visa entry" : "New visa entry"}</p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Destination country *</Label>
            <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Australia" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Visa type *</Label>
            <Input value={visaType} onChange={(e) => setVisaType(e.target.value)} placeholder="Student visa (subclass 500)" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Processing time (days)</Label>
            <Input type="number" value={processingDays} onChange={(e) => setProcessingDays(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Application fee (USD)</Label>
            <Input type="number" value={fee} onChange={(e) => setFee(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Work rights (hours / fortnight)</Label>
            <Input type="number" value={workHours} onChange={(e) => setWorkHours(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Post-study visa</Label>
            <Input value={postStudy} onChange={(e) => setPostStudy(e.target.value)} placeholder="Subclass 485" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Eligible nationalities</Label>
            <Input value={nationalities} onChange={(e) => setNationalities(e.target.value)} placeholder="NP, IN, VN — blank means all" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Required documents</Label>
            <Input value={documents} onChange={(e) => setDocuments(e.target.value)} placeholder="CoE, OSHC, GTE statement" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Common rejection reasons</Label>
            <Input value={rejections} onChange={(e) => setRejections(e.target.value)} placeholder="Insufficient funds, weak GTE" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Last verified</Label>
            <Input type="date" value={verified} onChange={(e) => setVerified(e.target.value)} />
          </div>
        </div>

        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
          <Switch checked={active} onCheckedChange={setActive} />
          Active
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="outline" className="gap-1.5 cursor-pointer" onClick={onCancel}>
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
          <Button className="cursor-pointer" disabled={saving} onClick={submit}>
            {entry ? "Save changes" : "Create entry"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function VisaTab({
  entries, loading, onReload,
}: Readonly<{ entries: VisaEntry[]; loading: boolean; onReload: () => void }>) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { confirm, dialog } = useConfirmDelete();

  const run = async (action: () => Promise<unknown>, success: string) => {
    setSaving(true);
    try {
      await action();
      toast.success(success);
      onReload();
    } catch (e) {
      toast.error("Action failed", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {dialog}

      <div className="flex justify-end">
        <Button className="gap-1.5 cursor-pointer" disabled={adding} onClick={() => { setAdding(true); setEditingId(null); }}>
          <Plus className="h-4 w-4" />
          Add visa entry
        </Button>
      </div>

      {adding && (
        <VisaForm
          saving={saving}
          onCancel={() => setAdding(false)}
          onSave={(values) => run(async () => { await aiKnowledgeApi.createVisa(values); setAdding(false); }, "Visa entry created")}
        />
      )}

      {loading && <ListSkeleton />}

      {!loading && entries.length === 0 && !adding && (
        <EmptyState icon={Shield} title="No visa entries yet" hint="Add one so the counsellor can answer visa questions." />
      )}

      {entries.map((entry) =>
        editingId === entry.id ? (
          <VisaForm
            key={entry.id}
            entry={entry}
            saving={saving}
            onCancel={() => setEditingId(null)}
            onSave={(values) => run(async () => { await aiKnowledgeApi.updateVisa(entry.id, values); setEditingId(null); }, "Visa entry updated")}
          />
        ) : (
          <Card key={entry.id}>
            <CardContent className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">{entry.visa_type}</p>
                  <Badge variant="outline" className="text-xs">{entry.destination_country}</Badge>
                  <Badge className={entry.active ? "text-xs" : "bg-muted text-xs text-muted-foreground"}>
                    {entry.active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {entry.processing_time_days != null && <span>{entry.processing_time_days} day processing</span>}
                  {entry.work_rights_hours != null && <span>{entry.work_rights_hours}h / fortnight work rights</span>}
                  {entry.application_fee_usd != null && <span>${entry.application_fee_usd} fee</span>}
                  <span>Last verified: {entry.last_verified_date ?? "Never"}</span>
                </div>
                {(entry.required_documents?.length ?? 0) > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {entry.required_documents!.map((doc) => (
                      <Badge key={doc} variant="outline" className="text-[10px]">{doc}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon-sm" className="cursor-pointer" title="Edit" onClick={() => { setEditingId(entry.id); setAdding(false); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost" size="icon-sm" title="Delete"
                  className="cursor-pointer text-destructive hover:text-destructive"
                  onClick={async () => {
                    if (!(await confirm(`Delete "${entry.visa_type}"?`))) return;
                    run(() => aiKnowledgeApi.deleteVisa(entry.id), "Visa entry deleted");
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ),
      )}
    </div>
  );
}
