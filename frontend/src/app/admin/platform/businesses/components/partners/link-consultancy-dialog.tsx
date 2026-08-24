"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchCountries } from "@/app/admin/platform/categories/store/categories-slice";
import { businessesApi } from "../../apis";
import type { Business, BusinessRelation } from "../../apis/types";
import { createRelation, updateRelation } from "../../store/businesses-slice";
import { CountryMultiSelect } from "../shared/country-multi-select";
export function LinkConsultancyDialog({
  open,
  onOpenChange,
  businessId,
  businessName,
  editRelation,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: number;
  businessName?: string;
  editRelation?: BusinessRelation | null;
}>) {
  const dispatch = useAppDispatch();
  const countries = useAppSelector((state) => state.platformCategories.countries);
  const isEdit = !!editRelation;

  const [results, setResults] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState("");
  const [countryIds, setCountryIds] = useState<number[]>([]);
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [applyToBranches, setApplyToBranches] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleQueryChange = async (query: string) => {
    setLoading(true);
    try {
      const { data } = await businessesApi.getBusinesses({ search: query || undefined });
      setResults(data.filter((b) => b.id !== businessId));
    } finally {
      setLoading(false);
    }
  };

  // Base UI's Dialog.Root only invokes onOpenChange for internally-triggered
  // closes (ESC, backdrop, close button) — not when a parent flips `open` to
  // true via prop. Reacting to the prop directly is what actually fires on open.
  useEffect(() => {
    if (!open) return;
    if (editRelation) {
      setSelected(String(editRelation.business_id));
      setCountryIds(editRelation.country_ids ?? []);
      setValidFrom(editRelation.valid_from ?? "");
      setValidUntil(editRelation.valid_until ?? "");
      setNotes(editRelation.notes ?? "");
    } else {
      setSelected("");
      setCountryIds([]);
      setValidFrom("");
      setValidUntil("");
      setNotes("");
      setApplyToBranches(true);
      handleQueryChange("");
    }
    if (countries.length === 0) dispatch(fetchCountries());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editRelation]);

  const handleSubmit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      if (isEdit && editRelation) {
        await dispatch(
          updateRelation({
            id: businessId,
            relationId: editRelation.id,
            patch: {
              country_ids: countryIds,
              valid_from: validFrom || null,
              valid_until: validUntil || null,
              notes: notes || null,
            },
          }),
        ).unwrap();
        toast.success("Partnership updated");
      } else {
        await dispatch(
          createRelation({
            id: businessId,
            input: {
              partner_business_id: Number(selected),
              relation_type: "partner",
              country_ids: countryIds,
              valid_from: validFrom || null,
              valid_until: validUntil || null,
              notes: notes || null,
              apply_to_branches: applyToBranches,
            },
          }),
        ).unwrap();
        toast.success("Consultancy linked");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(isEdit ? "Couldn't update partnership" : "Couldn't link consultancy", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> {isEdit ? "Edit partnership" : "Link consultancy"}
          </SheetTitle>
          <SheetDescription>
            {isEdit ? (
              <>
                Update the partnership with <strong>{editRelation?.business_name}</strong>.
              </>
            ) : (
              <>
                Connect a verified consultancy to <strong>{businessName ?? "this institution"}</strong>.
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4">
          <div className="flex flex-col gap-2">
            <Label>
              Consultancy <span className="text-destructive">*</span>
            </Label>
            {isEdit ? (
              <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm">{editRelation?.business_name}</div>
            ) : (
              <Combobox
                value={selected}
                onChange={setSelected}
                options={results.map((b) => ({ value: String(b.id), label: b.business_name }))}
                placeholder="Select a consultancy..."
                searchPlaceholder="Search consultancies..."
                loading={loading}
                onQueryChange={handleQueryChange}
              />
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>Countries</Label>
            <CountryMultiSelect
              options={countries.map((c) => ({ value: c.id, label: c.name }))}
              value={countryIds}
              onChange={setCountryIds}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label>Valid from</Label>
              <DatePicker value={validFrom} onChange={setValidFrom} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Valid until</Label>
              <DatePicker value={validUntil} onChange={setValidUntil} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Notes</Label>
            <Textarea
              placeholder="Optional context for this partnership..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-24"
            />
          </div>
          {/* TODO */}
          {/* <label className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
            <Checkbox
              checked={applyToBranches}
              onCheckedChange={(checked) => setApplyToBranches(checked === true)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium">Also apply to all branches</span>
              <span className="block text-xs text-muted-foreground">
                Creates a partnership row for every branch of this institution.
              </span>
            </span>
          </label> */}
        </div>

        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!selected || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Save changes" : "Link consultancy"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
