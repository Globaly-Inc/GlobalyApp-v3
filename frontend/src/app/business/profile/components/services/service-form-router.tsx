"use client";

import { useAuthState } from "@/app/auth/store/auth-slice";
import { ServiceFormView } from "./service-form-view";
import { InstitutionServiceFormView } from "./institution-service-form-view";
import { isInstitutionOrg } from "../../utils";

// Membership lists + the active org (not user_category, which only gives the PRIMARY role) decide
// whether businessId is a business or an institution — see isInstitutionOrg.
export function ServiceFormRouter({ businessId, serviceId }: Readonly<{ businessId: number; serviceId?: string }>) {
  const { user } = useAuthState();
  const isInstitution = isInstitutionOrg(user, businessId);

  return isInstitution
    ? <InstitutionServiceFormView businessId={businessId} serviceId={serviceId} />
    : <ServiceFormView businessId={businessId} serviceId={serviceId} />;
}
