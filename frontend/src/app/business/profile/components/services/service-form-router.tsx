"use client";

import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuthState } from "@/app/auth/store/auth-slice";
import { ServiceFormView } from "./service-form-view";
import { InstitutionServiceFormView } from "./institution-service-form-view";
import { isInstitutionOrg } from "../../utils";
import { useOrgContext } from "../use-org-context";

// A deep link must first switch the session to the org in the URL — saves go to the ACTIVE org —
// and only then pick the editor, from that same active org (isInstitutionOrg), so the editor and
// the tenant it writes to can't disagree. `?org=` names the exact org when a business and an
// institution share this numeric id.
export function ServiceFormRouter({ businessId, serviceId }: Readonly<{ businessId: number; serviceId?: string }>) {
  const { user } = useAuthState();
  const ready = useOrgContext(businessId, useSearchParams().get("org"));

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return isInstitutionOrg(user, businessId)
    ? <InstitutionServiceFormView businessId={businessId} serviceId={serviceId} />
    : <ServiceFormView businessId={businessId} serviceId={serviceId} />;
}
