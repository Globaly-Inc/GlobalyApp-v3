"use client";

import { useAuthState } from "@/app/auth/store/auth-slice";
import { ServiceFormView } from "./service-form-view";
import { InstitutionServiceFormView } from "./institution-service-form-view";

// A dual-role user's membership lists (not user_category, which only gives their PRIMARY role)
// are the authoritative source for whether businessId belongs to a business or an institution —
// same check business-profile-detail-view.tsx uses to pick which detail view to render.
export function ServiceFormRouter({ businessId, serviceId }: Readonly<{ businessId: number; serviceId?: string }>) {
  const { user } = useAuthState();
  const isInstitution =
    !user?.businesses.some((b) => b.id === businessId) && !!user?.institutions.some((i) => i.id === businessId);

  return isInstitution
    ? <InstitutionServiceFormView businessId={businessId} serviceId={serviceId} />
    : <ServiceFormView businessId={businessId} serviceId={serviceId} />;
}
