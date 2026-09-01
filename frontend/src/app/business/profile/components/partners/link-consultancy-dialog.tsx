"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useAppDispatch } from "@/lib/hooks";
import { geoApi, type Country } from "@/app/geo/apis";
// import { CountryMultiSelect } from "@/app/admin/platform/businesses/components/shared/country-multi-select";
import type { BusinessRelation, BusinessSearchResult, PartnerKind } from "../../apis/types";
import { businessProfileDetailApi } from "../../apis";
import { createRelation, updateRelation } from "../../store/business-profile-detail-slice";

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
  const isEdit = !!editRelation;

  const [countries, setCountries] = useState<Country[]>([]);
  const [results, setResults] = useState<BusinessSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  // "<kind>:<id>", e.g. "institution:42". The two id spaces collide, so the id alone is not a
  // usable key for the picker or for what gets submitted.
  const [partnerRef, setPartnerRef] = useState("");
  const [countryIds, setCountryIds] = useState<number[]>([]);
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleQueryChange = async (query: string) => {
    setLoading(true);
    try {
      const rows = await businessProfileDetailApi.searchBusinesses({
        search: query || undefined,
        include_institutions: true,
      });
      setResults(rows);
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
      setPartnerRef(`${editRelation.partner_kind}:${editRelation.partner_id}`);
      setCountryIds(editRelation.country_ids ?? []);
      setValidFrom(editRelation.valid_from ?? "");
      setValidUntil(editRelation.valid_until ?? "");
      setNotes(editRelation.notes ?? "");
    } else {
      setPartnerRef("");
      setCountryIds([]);
      setValidFrom("");
      setValidUntil("");
      setNotes("");
      handleQueryChange("");
    }
    if (countries.length === 0) geoApi.getCountries().then(setCountries).catch(() => setCountries([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editRelation]);

  const handleSubmit = async () => {
    if (!partnerRef) return;
    const [partnerKind, partnerId] = partnerRef.split(":");
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
              partner_business_id: Number(partnerId),
              partner_kind: partnerKind as PartnerKind,
              country_ids: countryIds,
              valid_from: validFrom || null,
              valid_until: validUntil || null,
              notes: notes || null,
              apply_to_branches: true,
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
                Update the partnership with <strong>{editRelation?.partner_name}</strong>.
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
              <div className="flex h-10 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted">
                  {editRelation?.partner_logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={editRelation.partner_logo_url} alt="" className="h-full w-full rounded object-contain" />
                  ) : (
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
                {editRelation?.partner_name}
              </div>
            ) : (
              <Combobox
                value={partnerRef}
                onChange={setPartnerRef}
                options={results.map((b) => ({ value: `${b.kind}:${b.id}`, label: b.business_name }))}
                placeholder="Select a consultancy or institution..."
                searchPlaceholder="Search consultancies and institutions..."
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
        </div>

        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!partnerRef || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Save changes" : "Link consultancy"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
