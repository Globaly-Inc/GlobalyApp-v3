"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { businessProfileDetailApi } from "../../apis";
import type { Branch } from "../../apis/types";

/**
 * Shares the selected services with one or more branches — V1's ServiceBulkAssignDialog.
 *
 * V1 stores this as rows in a `service_branch_sharing` table with a per-service scope. V3 keeps
 * the same fact on the branch itself (`shared_services`: "all", or a list of service ids), so
 * assigning here means unioning the selection into each ticked branch's list. A branch already
 * set to "all" is left alone — it shares everything, including these.
 */
export function ServiceBulkAssignDialog({
  open,
  onOpenChange,
  selectedIds,
  orgBase,
  onAssigned,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  orgBase: string;
  onAssigned: () => void;
}>) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const loadedRef = useRef(false);
  useEffect(() => {
    if (!open || loadedRef.current) return;
    loadedRef.current = true;
    businessProfileDetailApi
      .getBranches({ limit: 100 }, orgBase)
      .then((res) => setBranches(res.data.filter((b) => !b.is_primary)))
      .catch((e: Error) => toast.error("Couldn't load branches", { description: e.message }))
      .finally(() => setLoading(false));
  }, [open, orgBase]);

  const toggle = (branchId: string) => {
    const next = new Set(picked);
    if (next.has(branchId)) next.delete(branchId);
    else next.add(branchId);
    setPicked(next);
  };

  const handleAssign = async () => {
    setSaving(true);
    try {
      const targets = branches.filter((b) => picked.has(b.id) && b.shared_services !== "all");
      await Promise.all(
        targets.map((branch) =>
          businessProfileDetailApi.updateBranch(branch.id, {
            shared_services: [...new Set([...(branch.shared_services as string[]), ...selectedIds])],
          }, orgBase),
        ),
      );
      toast.success(`Shared with ${picked.size} branch${picked.size === 1 ? "" : "es"}`);
      onAssigned();
      onOpenChange(false);
    } catch (e) {
      toast.error("Couldn't share services", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  let body: React.ReactNode;
  if (loading) {
    body = (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  } else if (branches.length === 0) {
    body = (
      <p className="rounded-lg border py-6 text-center text-sm italic text-muted-foreground">
        No branches yet — add one before sharing services.
      </p>
    );
  } else {
    body = (
      <div className="divide-y rounded-lg border">
        {branches.map((branch) => {
          const sharesEverything = branch.shared_services === "all";
          return (
            <div key={branch.id} className="flex items-center gap-3 p-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <MapPin className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{branch.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[branch.city, branch.country].filter(Boolean).join(", ") || "No location set"}
                </p>
              </div>
              {sharesEverything ? (
                <Badge variant="secondary" className="text-xs">Shares all</Badge>
              ) : (
                <Switch checked={picked.has(branch.id)} onCheckedChange={() => toggle(branch.id)} />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Share {selectedIds.length} service{selectedIds.length === 1 ? "" : "s"} with branches
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <p className="text-sm text-muted-foreground">
            Pick the branches that should offer these services. Existing shared services are kept.
          </p>
          {body}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={saving || picked.size === 0}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Share
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
