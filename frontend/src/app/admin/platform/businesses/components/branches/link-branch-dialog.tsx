"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { BRANCH_TYPES } from "../../const";
import type { Branch, BranchType, SharedServices } from "../../apis/types";
import { fetchBusinesses, linkExistingBranch, updateBranch } from "../../store/businesses-slice";
import { ServiceSharingPicker } from "../services/service-sharing-picker";

export function LinkBranchDialog({
  open,
  onOpenChange,
  businessId,
  editBranch,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; businessId: number; editBranch?: Branch | null }>) {
  const dispatch = useAppDispatch();
  const detail = useAppSelector((s) => s.platformBusinesses.detail);
  const parentName = detail?.id === businessId ? detail.business_name : undefined;
  const businesses = useAppSelector((s) => s.platformBusinesses.businesses);
  const businessesStatus = useAppSelector((s) => s.platformBusinesses.status);
  const candidates = useMemo(() => businesses.filter((b) => b.id !== businessId), [businesses, businessId]);
  const isEdit = !!editBranch;

  const [selectedBizId, setSelectedBizId] = useState("");
  const [branchType, setBranchType] = useState<BranchType>("same_company");
  const [sharedServices, setSharedServices] = useState<SharedServices>([]);
  const [saving, setSaving] = useState(false);

  // Re-seed when the sheet opens, or when a different branch is handed in while it is
  // open. Derived by comparing against the previous props during render — seeding from
  // an effect would commit one render of the stale form first. Nothing is re-seeded
  // while closing, so the form does not flash empty behind the exit animation.
  const seedFor = open ? (editBranch ?? null) : undefined;
  const [seededFor, setSeededFor] = useState<Branch | null | undefined>(undefined);
  if (seedFor !== seededFor && open) {
    if (editBranch) {
      setSelectedBizId(String(editBranch.linked_business_id));
      setBranchType(editBranch.branch_type);
      setSharedServices(editBranch.shared_services);
    } else {
      setSelectedBizId("");
      setBranchType("same_company");
      setSharedServices([]);
    }
  }
  if (seedFor !== seededFor) setSeededFor(seedFor);

  useEffect(() => {
    if (open && !editBranch && businesses.length === 0) dispatch(fetchBusinesses({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editBranch]);

  const handleSubmit = async () => {
    if (!selectedBizId) return;
    setSaving(true);
    try {
      if (isEdit && editBranch) {
        await dispatch(
          updateBranch({
            id: businessId,
            branchId: editBranch.id,
            patch: { branch_type: branchType, shared_services: sharedServices },
          }),
        ).unwrap();
        toast.success("Branch updated");
      } else {
        await dispatch(
          linkExistingBranch({
            id: businessId,
            input: {
              business_id: Number(selectedBizId),
              branch_type: branchType,
              shared_services: sharedServices,
            },
          }),
        ).unwrap();
        toast.success("Branch linked", { description: "The business is now linked as a branch." });
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(isEdit ? "Couldn't update branch" : "Couldn't link branch", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" /> {isEdit ? "Edit linked branch" : "Link existing business as branch"}
          </SheetTitle>
          <SheetDescription>
            {isEdit ? (
              <>Update how <strong>{editBranch?.name}</strong> is linked to <strong>{parentName ?? "this business"}</strong>.</>
            ) : (
              <>Connect another verified business to <strong>{parentName ?? "this business"}</strong>. A business can only be a branch of one parent.</>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4">
          <div className="flex flex-col gap-2">
            <Label>
              Business <span className="text-destructive">*</span>
            </Label>
            {isEdit ? (
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{editBranch?.name}</p>
            ) : (
              <>
                <Combobox
                  value={selectedBizId}
                  onChange={setSelectedBizId}
                  options={candidates.map((b) => ({
                    value: String(b.id),
                    label: `${b.business_name}${b.city || b.country_name ? ` · ${[b.city, b.country_name].filter(Boolean).join(", ")}` : ""}`,
                  }))}
                  placeholder="Select a business..."
                  searchPlaceholder="Search businesses..."
                  emptyText="No eligible businesses."
                  loading={businessesStatus === "loading"}
                />
                <p className="text-xs text-muted-foreground">Self is excluded.</p>
              </>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>
              Branch type <span className="text-destructive">*</span>
            </Label>
            <Combobox
              value={branchType}
              onChange={(v) => setBranchType(v as BranchType)}
              options={BRANCH_TYPES}
              placeholder="Select branch type"
            />
          </div>

          <ServiceSharingPicker
            businessId={businessId}
            value={sharedServices}
            onChange={setSharedServices}
            emptyText="Head office has no services to share."
          />
        </div>

        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!selectedBizId || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Save changes" : "Link as branch"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
