"use client";

import { useState } from "react";
import { Globe, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { aiKnowledgeApi } from "../apis";
import type { CountryGuide, GuideParams } from "../apis/types";
import { useConfirmDelete } from "./use-confirm-delete";
import { EmptyState, ListSkeleton } from "./shared";

function GuideForm({
  guide, saving, onCancel, onSave,
}: Readonly<{ guide?: CountryGuide; saving: boolean; onCancel: () => void; onSave: (v: GuideParams) => void }>) {
  const [country, setCountry] = useState(guide?.country ?? "");
  const [system, setSystem] = useState(guide?.education_system ?? "");
  const [cities, setCities] = useState((guide?.popular_cities ?? []).join(", "));
  const [culture, setCulture] = useState(guide?.culture_notes ?? "");
  const [studentLife, setStudentLife] = useState(guide?.student_life ?? "");
  const [climate, setClimate] = useState(guide?.climate ?? "");
  const [verified, setVerified] = useState(guide?.last_verified_date ?? "");
  const [active, setActive] = useState(guide?.active ?? true);

  const submit = () => {
    if (!country.trim()) {
      toast.error("Country is required");
      return;
    }
    const parsed = cities.split(",").map((c) => c.trim()).filter(Boolean);
    onSave({
      country: country.trim(),
      education_system: system.trim() || null,
      popular_cities: parsed.length ? parsed : null,
      culture_notes: culture.trim() || null,
      student_life: studentLife.trim() || null,
      climate: climate.trim() || null,
      last_verified_date: verified || null,
      active,
    });
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <p className="font-semibold text-foreground">{guide ? "Edit country guide" : "New country guide"}</p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Country *</Label>
            <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Australia" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Education system</Label>
            <Input value={system} onChange={(e) => setSystem(e.target.value)} placeholder="AQF levels 1-10" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Popular cities</Label>
            <Input value={cities} onChange={(e) => setCities(e.target.value)} placeholder="Melbourne, Sydney" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Climate</Label>
            <Input value={climate} onChange={(e) => setClimate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Last verified</Label>
            <Input type="date" value={verified} onChange={(e) => setVerified(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Culture notes</Label>
          <Textarea rows={3} className="min-h-20" value={culture} onChange={(e) => setCulture(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Student life</Label>
          <Textarea rows={3} className="min-h-20" value={studentLife} onChange={(e) => setStudentLife(e.target.value)} />
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
            {guide ? "Save changes" : "Create guide"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function GuidesTab({
  guides, loading, onReload,
}: Readonly<{ guides: CountryGuide[]; loading: boolean; onReload: () => void }>) {
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
          Add country guide
        </Button>
      </div>

      {adding && (
        <GuideForm
          saving={saving}
          onCancel={() => setAdding(false)}
          onSave={(values) => run(async () => { await aiKnowledgeApi.createGuide(values); setAdding(false); }, "Country guide created")}
        />
      )}

      {loading && <ListSkeleton />}

      {!loading && guides.length === 0 && !adding && (
        <EmptyState icon={Globe} title="No country guides yet" hint="Describe what living and studying there is like." />
      )}

      {guides.map((guide) =>
        editingId === guide.id ? (
          <GuideForm
            key={guide.id}
            guide={guide}
            saving={saving}
            onCancel={() => setEditingId(null)}
            onSave={(values) => run(async () => { await aiKnowledgeApi.updateGuide(guide.id, values); setEditingId(null); }, "Country guide updated")}
          />
        ) : (
          <Card key={guide.id}>
            <CardContent className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">Study in {guide.country}</p>
                  <Badge className={guide.active ? "text-xs" : "bg-muted text-xs text-muted-foreground"}>
                    {guide.active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Cities: {(guide.popular_cities ?? []).join(", ") || "None listed"}
                </p>
                {guide.education_system && (
                  <p className="mt-1 text-xs text-muted-foreground">{guide.education_system}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon-sm" className="cursor-pointer" title="Edit" onClick={() => { setEditingId(guide.id); setAdding(false); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost" size="icon-sm" title="Delete"
                  className="cursor-pointer text-destructive hover:text-destructive"
                  onClick={async () => {
                    if (!(await confirm(`Delete the ${guide.country} guide?`))) return;
                    run(() => aiKnowledgeApi.deleteGuide(guide.id), "Country guide deleted");
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
