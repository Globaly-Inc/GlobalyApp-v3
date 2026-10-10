"use client";

import { Reveal } from "@/components/reveal";
import { RegistrationLicensesFields, type RegLicenses } from "../registration-licenses-fields";

/** Only a subsidiary / franchise has its own registration; a Same Company branch gets the parent's
 * from the backend. Kept mounted (ignored on save for Same Company) so it opens and closes smoothly. */
export function BranchRegistrationSection({
  open,
  value,
  onChange,
  countryId,
}: Readonly<{ open: boolean; value: RegLicenses; onChange: (v: RegLicenses) => void; countryId: number | null }>) {
  return (
    // -mt-6 cancels the form's gap while closed; the inner mt-6 restores it once open.
    <div className="-mt-6">
      <Reveal open={open}>
        <div className="mt-6 flex flex-col gap-4 border-t pt-5">
          <p className="text-sm font-semibold">Registration &amp; Licenses</p>
          <RegistrationLicensesFields value={value} onChange={onChange} countryId={countryId} />
        </div>
      </Reveal>
    </div>
  );
}
