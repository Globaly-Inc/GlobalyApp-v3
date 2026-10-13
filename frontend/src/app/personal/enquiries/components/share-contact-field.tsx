"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

/** The opt-in contact-sharing checkbox of NewEnquiryDialog. */
export function ShareContactField({
  checked,
  onCheckedChange,
}: Readonly<{
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}>) {
  // Opt-in, and never a blocker on submitting — declining is a valid choice, so this
  // carries no Required marker and no validation. The distinction between this and the
  // profile data shared regardless is made in EnquirySubmittedDialog, not here.
  return (
    <Label
      htmlFor="share-contact"
      className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5 font-normal"
    >
      <Checkbox
        id="share-contact"
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="mt-0.5"
      />
      <span className="text-sm">
        I&apos;m okay with sharing my contact number and receiving calls from the
        business/institution.
      </span>
    </Label>
  );
}
