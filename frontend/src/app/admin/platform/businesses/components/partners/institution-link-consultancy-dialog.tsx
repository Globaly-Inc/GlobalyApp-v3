"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchCountries } from "@/app/admin/platform/categories/store/categories-slice";
import { businessesApi } from "../../apis";
import type { Business, BusinessRelation } from "../../apis/types";
import { createInstitutionPartner, fetchInstitutionPartners, updateInstitutionPartner } from "../../store/institution-detail-slice";
// import { CountryMultiSelect } from "../shared/country-multi-select";

// Institution-initiated "Link consultancy" — inverse write of LinkConsultancyDialog: the picked
// business becomes the row's owner, this institution is the partner. See
// business-representations.repository.ts createRelationForInstitution.
export function InstitutionLinkConsultancyDialog({
  open,
  onOpenChange,
  institutionId,
  editRelation,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId: number;
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
  const [saving, setSaving] = useState(false);

  const handleQueryChange = async (query: string) => {
    setLoading(true);
    try {
      // kind: "business" — the create endpoint here only ever writes a business as the owner,
      // so institutions must never be selectable (and never worth fetching over the wire).
      const { data } = await businessesApi.getBusinesses({ search: query || undefined, kind: "business" });
      setResults(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (editRelation) {
      setSelected(String(editRelation.partner_id));
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
          updateInstitutionPartner({
            id: institutionId,
            partnerId: editRelation.id,
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
          createInstitutionPartner({
            id: institutionId,
            input: {
              business_id: Number(selected),
              country_ids: countryIds,
              valid_from: validFrom || null,
              valid_until: validUntil || null,
              notes: notes || null,
            },
          }),
        ).unwrap();
        toast.success("Consultancy linked");
      }
      dispatch(fetchInstitutionPartners({ id: institutionId }));
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
                Update the partnership with <strong>{editRelation?.partner_name}</strong>.
              </>
            ) : (
              "Authorise a consultancy to represent this institution."
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4">
          <div className="flex flex-col gap-2">
            <Label>
              Consultancy <span className="text-destructive">*</span>
            </Label>
            {isEdit ? (
              <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm">{editRelation?.partner_name}</div>
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

          {/* <div className="flex flex-col gap-2">
            <Label>Countries</Label>
            <CountryMultiSelect
              options={countries.map((c) => ({ value: c.id, label: c.name }))}
              value={countryIds}
              onChange={setCountryIds}
            />
          </div> */}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label>Valid from</Label>
              <DatePicker value={validFrom} onChange={setValidFrom} defaultMonth={new Date()} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Valid until</Label>
              <DatePicker value={validUntil} onChange={setValidUntil} defaultMonth={new Date()} toYear={new Date().getFullYear() + 10} />
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
