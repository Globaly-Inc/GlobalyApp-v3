"use client";

import { FormField } from "@/components/ui/form-field";
import { FormSection } from "@/components/ui/form-section";
import { Combobox } from "@/components/combobox";
import type { ListingFormModel } from "./use-listing-form";

export function ListingLocationSection({ model }: Readonly<{ model: ListingFormModel }>) {
  const { form, setForm, errors, countryOptions, cityOptions, citiesLoading } = model;
  return (
    <FormSection title="Location" description="Where you offer this service. Leave blank to offer it anywhere." columns={2}>
      <FormField label="Country" htmlFor="country">
        <Combobox
          id="country"
          options={countryOptions}
          value={form.countryId}
          // Changing the country clears the city — the old one belongs to a different country.
          onChange={(value) => setForm((f) => ({ ...f, countryId: value, cityId: "" }))}
          placeholder="Any country"
          searchPlaceholder="Search countries..."
        />
      </FormField>

      <FormField label="City" htmlFor="city" error={errors.cityId}>
        <Combobox
          id="city"
          options={cityOptions}
          value={form.cityId}
          onChange={(value) => setForm((f) => ({ ...f, cityId: value }))}
          placeholder={form.countryId ? "Any city" : "Pick a country first"}
          searchPlaceholder="Search cities..."
          loading={citiesLoading}
          disabled={!form.countryId}
        />
      </FormField>
    </FormSection>
  );
}
