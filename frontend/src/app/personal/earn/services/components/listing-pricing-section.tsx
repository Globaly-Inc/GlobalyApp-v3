"use client";

import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { FormSection } from "@/components/ui/form-section";
import { Combobox } from "@/components/combobox";
import { formatMoney } from "../utils";
import type { ListingFormModel } from "./use-listing-form";

export function ListingPricingSection({ model }: Readonly<{ model: ListingFormModel }>) {
  const { form, setForm, errors, currencyOptions, priceMinor, symbol } = model;
  return (
    <FormSection title="Pricing" description="What buyers pay for one booking." columns={1} contentClassName="sm:grid-cols-[1fr_auto]">
      <FormField label="Price" htmlFor="price" required error={errors.price}>
        <div className="relative">
          {/* The symbol sits in the field so there is no doubt what unit is being asked for. */}
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {symbol}
          </span>
          <Input
            id="price"
            inputMode="decimal"
            className="h-10 pl-8"
            value={form.price}
            placeholder="50"
            aria-invalid={!!errors.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
          />
        </div>
      </FormField>

      <FormField label="Currency" htmlFor="currency">
        <Combobox
          id="currency"
          className="sm:w-28"
          options={currencyOptions}
          value={form.currency}
          onChange={(value) => setForm((f) => ({ ...f, currency: value }))}
          searchPlaceholder="Search..."
        />
      </FormField>

      {/* The confirmation that makes the unit unambiguous. V2 asked for cents and showed nothing back. */}
      {priceMinor !== null && priceMinor > 0 && (
        <p className="-mt-2 text-sm text-muted-foreground sm:col-span-full">
          Buyers will pay <strong className="text-foreground">{formatMoney(priceMinor, form.currency)}</strong>
        </p>
      )}
    </FormSection>
  );
}
