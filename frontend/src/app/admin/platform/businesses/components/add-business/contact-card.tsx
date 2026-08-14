"use client";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";
import { Combobox, type ComboboxOption } from "@/components/combobox";

export function ContactCard({
  firstName,
  onFirstNameChange,
  lastName,
  onLastNameChange,
  email,
  onEmailChange,
  emailError,
  phoneCountryId,
  onPhoneCountryChange,
  phoneCountryOptions,
  phoneNumber,
  onPhoneNumberChange,
}: Readonly<{
  firstName: string;
  onFirstNameChange: (value: string) => void;
  lastName: string;
  onLastNameChange: (value: string) => void;
  email: string;
  onEmailChange: (value: string) => void;
  emailError?: string;
  phoneCountryId: string;
  onPhoneCountryChange: (value: string) => void;
  phoneCountryOptions: ComboboxOption[];
  phoneNumber: string;
  onPhoneNumberChange: (value: string) => void;
}>) {
  return (
    <Card className="space-y-4 p-6">
      <h3 className="text-sm font-semibold text-foreground">Contact</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>Owner First Name</Label>
          <Input className="h-10" value={firstName} onChange={(e) => onFirstNameChange(e.target.value)} placeholder="e.g. Alicia" />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Owner Last Name</Label>
          <Input className="h-10" value={lastName} onChange={(e) => onLastNameChange(e.target.value)} placeholder="e.g. Tan" />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Email *</Label>
          <Input className="h-10" type="email" aria-invalid={!!emailError} value={email} onChange={(e) => onEmailChange(e.target.value)} placeholder="info@business.com" />
          <p className="text-xs text-muted-foreground">Used to create the business owner account.</p>
          <FieldError message={emailError} />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Phone</Label>
          <div className="grid grid-cols-[130px_1fr] gap-3">
            <Combobox
              value={phoneCountryId}
              onChange={onPhoneCountryChange}
              options={phoneCountryOptions}
              placeholder="Code"
              searchPlaceholder="Search countries..."
            />
            <Input className="h-10" value={phoneNumber} onChange={(e) => onPhoneNumberChange(e.target.value)} placeholder="(201) 555-0123" />
          </div>
        </div>
      </div>
    </Card>
  );
}
