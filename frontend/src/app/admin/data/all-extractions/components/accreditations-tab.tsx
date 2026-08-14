"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Award, ExternalLink, Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { allExtractionsApi } from "../apis";
import { useConfirmDelete } from "./use-confirm-delete";
import type { Accreditation } from "../apis/types";

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

  if (loading) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Loading accreditations...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {accreditations.length} accreditation{accreditations.length !== 1 ? "s" : ""}
        </p>
        <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
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
        <div className="space-y-2">
          {accreditations.map((acc) => (
            <Card key={acc.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <span className="text-sm font-medium">{acc.name}</span>
                    {acc.issuing_organization && (
                      <p className="text-xs text-muted-foreground">{acc.issuing_organization}</p>
                    )}
                    {acc.website && (
                      <a
                        href={acc.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> {acc.website}
                      </a>
                    )}
                  </div>
                  <Button variant="ghost" size="icon-sm" className="shrink-0" onClick={() => handleDelete(acc.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
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

  async function handleSave() {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const created = await allExtractionsApi.createAccreditation({
        job_id: jobId,
        name: name.trim(),
        issuing_organization: issuingOrg.trim() || undefined,
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
            <Label className="text-xs">Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. AACSB" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Issuing Organization</Label>
            <Input value={issuingOrg} onChange={(e) => setIssuingOrg(e.target.value)} placeholder="e.g. Association to Advance Collegiate Schools of Business" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
