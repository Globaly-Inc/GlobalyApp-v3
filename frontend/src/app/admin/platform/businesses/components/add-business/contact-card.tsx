"use client";

import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { FormSection } from "@/components/ui/form-section";
import { Combobox, type ComboboxOption } from "@/components/combobox";

export function ContactCard({
  firstName,
  onFirstNameChange,
  firstNameError,
  lastName,
  onLastNameChange,
  lastNameError,
  email,
  onEmailChange,
  emailError,
  phoneCountryId,
  onPhoneCountryChange,
  phoneCountryOptions,
  phoneNumber,
  onPhoneNumberChange,
  phoneError,
}: Readonly<{
  firstName: string;
  onFirstNameChange: (value: string) => void;
  firstNameError?: string;
  lastName: string;
  onLastNameChange: (value: string) => void;
  lastNameError?: string;
  email: string;
  onEmailChange: (value: string) => void;
  emailError?: string;
  phoneCountryId: string;
  onPhoneCountryChange: (value: string) => void;
  phoneCountryOptions: ComboboxOption[];
  phoneNumber: string;
  onPhoneNumberChange: (value: string) => void;
  phoneError?: string;
}>) {
  return (
    <FormSection title="Contact" columns={2}>
      <FormField label="Owner First Name" htmlFor="owner-first-name" required error={firstNameError}>
        <Input id="owner-first-name" className="h-10" aria-invalid={!!firstNameError} value={firstName} onChange={(e) => onFirstNameChange(e.target.value)} placeholder="e.g. Alicia" />
      </FormField>
      <FormField label="Owner Last Name" htmlFor="owner-last-name" required error={lastNameError}>
        <Input id="owner-last-name" className="h-10" aria-invalid={!!lastNameError} value={lastName} onChange={(e) => onLastNameChange(e.target.value)} placeholder="e.g. Tan" />
      </FormField>
      <FormField label="Email" htmlFor="owner-email" required hint="Used to create the business owner account." error={emailError}>
        <Input id="owner-email" className="h-10" type="email" aria-invalid={!!emailError} value={email} onChange={(e) => onEmailChange(e.target.value)} placeholder="info@business.com" />
      </FormField>
      <FormField label="Phone" htmlFor="owner-phone" error={phoneError}>
        <div className="grid grid-cols-[130px_1fr] gap-3">
          <Combobox
            value={phoneCountryId}
            onChange={onPhoneCountryChange}
            options={phoneCountryOptions}
            placeholder="Code"
            searchPlaceholder="Search countries..."
          />
          <Input id="owner-phone" className="h-10" aria-invalid={!!phoneError} value={phoneNumber} onChange={(e) => onPhoneNumberChange(e.target.value)} placeholder="(201) 555-0123" />
        </div>
      </FormField>
    </FormSection>
  );
}
