"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Award, Globe2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { businessProfileDetailApi } from "../../../apis";

export function ServiceAccreditationForm({
  saving,
  onCancel,
  onSave,
}: Readonly<{ saving: boolean; onCancel: () => void; onSave: (accreditationId: number) => Promise<void> }>) {
  const [name, setName] = useState("");
  const [issuingOrg, setIssuingOrg] = useState("");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [resolving, setResolving] = useState(false);

  const busy = saving || resolving;

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    setResolving(true);
    try {
      let issuingOrgId: number | null = null;
      if (issuingOrg.trim()) {
        const existing = await businessProfileDetailApi.getIssuingOrganizations({ search: issuingOrg.trim(), limit: 1 });
        const match = existing.data.find((o) => o.name.toLowerCase() === issuingOrg.trim().toLowerCase());
        issuingOrgId = match ? match.id : (await businessProfileDetailApi.createIssuingOrganization(issuingOrg.trim())).id;
      }
      const created = await businessProfileDetailApi.createAccreditation({
        name: name.trim(),
        issuing_organization_id: issuingOrgId,
        website: website || null,
        description: description || null,
        sort_order: 0,
        scope_country_ids: [],
      });
      await onSave(created.id);
    } catch (e) {
      toast.error("Save failed", { description: (e as Error).message });
    } finally {
      setResolving(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Award className="h-4 w-4 text-primary" /> Add Accreditation
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
          <Globe2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>Accreditations are <strong>global</strong> — once added, they can be assigned to any institution.</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Name <span className="text-destructive">*</span></Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. AACSB" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Issuing Org</Label>
          <Input value={issuingOrg} onChange={(e) => setIssuingOrg(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Website</Label>
          <Input value={website} onChange={(e) => setWebsite(e.target.value)} type="url" placeholder="https://" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" className="cursor-pointer" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button size="sm" className="gap-1.5 cursor-pointer" onClick={handleSave} disabled={busy}>
            <Save className="h-3.5 w-3.5" />{busy ? "Saving..." : "Add"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
