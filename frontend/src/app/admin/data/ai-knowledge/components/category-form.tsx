"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { geoApi, type Country } from "@/app/geo/apis";
import { CATEGORY_KIND_OPTIONS } from "../const";
import type { CategoryKind, CategoryParams, RackCategory } from "../apis/types";

/** Backend accepts /^[a-z0-9-]+$/ only, so anything else collapses to a hyphen. */
const slugify = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Same character rule as slugify, minus the edge trim: stripping trailing hyphens
 * while someone is mid-word means "au-" never survives long enough to become "au-visa".
 */
const sanitiseSlug = (value: string) => slugify(value).concat(/[^a-z0-9]$/.test(value) ? "-" : "");

/** country_code is nullable — an explicit option is the only way to clear it again. */
const NO_COUNTRY = { value: "", label: "No country (global)" };

export function CategoryForm({
  category, saving, onCancel, onSave,
}: Readonly<{ category?: RackCategory; saving: boolean; onCancel: () => void; onSave: (v: CategoryParams) => void }>) {
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [label, setLabel] = useState(category?.label ?? "");
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? "visa");
  const [country, setCountry] = useState(category?.country_code ?? "");
  const [countries, setCountries] = useState<Country[]>([]);

  // An existing category's slug is already referenced elsewhere — never rewrite it
  // from the label. Only a brand-new, untouched slug tracks what is being typed.
  const [slugTouched, setSlugTouched] = useState(!!category);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    geoApi.getCountries().then(setCountries).catch(() => setCountries([]));
  }, []);

  const countryOptions = useMemo(
    () => [NO_COUNTRY, ...countries.map((c) => ({ value: c.iso2, label: `${c.name} (${c.iso2})` }))],
    [countries],
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Label *</Label>
        <Input
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          placeholder="Australia — Visa"
          className="h-8 text-xs"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Slug *</Label>
        <Input
          value={slug}
          onChange={(e) => { setSlugTouched(true); setSlug(sanitiseSlug(e.target.value)); }}
          placeholder="au-visa"
          className="h-8 text-xs"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Kind</Label>
        <Combobox
          options={CATEGORY_KIND_OPTIONS}
          value={kind}
          onChange={(v) => setKind(v as CategoryKind)}
          className="h-8 cursor-pointer text-xs"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Country</Label>
        <Combobox
          options={countryOptions}
          value={country}
          onChange={setCountry}
          placeholder={NO_COUNTRY.label}
          className="h-8 cursor-pointer text-xs"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-7 cursor-pointer text-xs" onClick={onCancel}>Cancel</Button>
        <Button
          size="sm" className="h-7 cursor-pointer text-xs" disabled={saving}
          onClick={() => {
            if (!label.trim() || !slug.trim()) { toast.error("Label and slug are required"); return; }
            onSave({ label: label.trim(), slug: slug.trim(), kind, country_code: country || null });
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
