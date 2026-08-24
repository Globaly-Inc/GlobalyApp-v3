"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Award, Loader2, Plus, Trash2 } from "lucide-react";
import type { Accreditation } from "@/app/admin/platform/categories/apis/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { businessProfileDetailApi } from "../../../apis";
import type { ServiceAccreditationLink } from "../../../apis/types";

export function AccreditationsTab({ serviceId }: Readonly<{ serviceId: string }>) {
  const [links, setLinks] = useState<ServiceAccreditationLink[]>([]);
  const [catalog, setCatalog] = useState<Accreditation[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    Promise.all([
      businessProfileDetailApi.getServiceAccreditations(serviceId),
      businessProfileDetailApi.getAccreditations({ limit: 100 }),
    ]).then(([linkRows, cat]) => {
      setLinks(linkRows);
      setCatalog(cat.data);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [serviceId]);

  const catalogById = new Map(catalog.map((a) => [a.id, a]));
  const linkedIds = new Set(links.map((l) => l.accreditation_id));
  const options = catalog.filter((a) => !linkedIds.has(a.id)).map((a) => ({ value: String(a.id), label: a.name }));

  const handleAdd = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await businessProfileDetailApi.linkServiceAccreditation(serviceId, Number(selected));
      toast.success("Accreditation linked");
      setOpen(false);
      setSelected("");
      load();
    } catch (e) {
      toast.error("Couldn't link accreditation", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: number) => {
    try {
      await businessProfileDetailApi.unlinkServiceAccreditation(serviceId, id);
      setLinks((l) => l.filter((x) => x.id !== id));
    } catch (e) {
      toast.error("Couldn't remove accreditation", { description: (e as Error).message });
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Accreditations</span>
          <Badge variant="secondary">{links.length}</Badge>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Link accreditation
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : links.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground italic">No accreditations linked yet.</p>
      ) : (
        <div className="space-y-2">
          {links.map((l) => (
            <div key={l.id} className="flex items-center justify-between rounded-lg border p-3">
              <p className="text-sm font-medium">{catalogById.get(l.accreditation_id)?.name ?? `Accreditation #${l.accreditation_id}`}</p>
              <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => handleRemove(l.id)} aria-label="Remove accreditation">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Link accreditation</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-2">
            <Combobox options={options} value={selected} onChange={setSelected} placeholder="Select accreditation" searchPlaceholder="Search accreditations..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving || !selected}>{saving ? "Linking…" : "Link"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
