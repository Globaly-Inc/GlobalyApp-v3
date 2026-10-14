import { useEffect, useRef, useState } from "react";
import { businessesApi } from "../../apis";
import { categoriesApi } from "@/app/admin/platform/categories/apis";
import type { Accreditation } from "@/app/admin/platform/categories/apis/types";
import type { ServiceEligibility, ServiceFee, ServiceIntake, ServiceStudyUnit } from "../../apis/types";

export type Kind = "business" | "institution";

export function useServiceSummaryData(kind: Kind, orgId: number, serviceId: string, refreshKey: string | number) {
  const [fees, setFees] = useState<ServiceFee[]>([]);
  const [intakes, setIntakes] = useState<ServiceIntake[]>([]);
  const [eligibility, setEligibility] = useState<ServiceEligibility[]>([]);
  const [studyUnits, setStudyUnits] = useState<ServiceStudyUnit[]>([]);
  const [accreditations, setAccreditations] = useState<Accreditation[]>([]);
  const [loading, setLoading] = useState(true);

  // Keyed by refreshKey (the parent's current tab) rather than a mount-once ref: this component
  // renders in the sidebar for the whole time the service is being edited, so it never remounts
  // when the admin adds a fee/intake/etc. on another tab — only re-running this fetch when the
  // caller's key changes (e.g. navigating back to the "summary" tab) picks up those additions.
  const fetchedForRef = useRef<string | number | null>(null);
  useEffect(() => {
    if (fetchedForRef.current === refreshKey) return;
    fetchedForRef.current = refreshKey;
    const isBiz = kind === "business";
    Promise.all([
      (isBiz ? businessesApi.getServiceFees : businessesApi.getInstitutionServiceFees)(orgId, serviceId),
      (isBiz ? businessesApi.getServiceIntakes : businessesApi.getInstitutionServiceIntakes)(orgId, serviceId),
      (isBiz ? businessesApi.getServiceEligibility : businessesApi.getInstitutionServiceEligibility)(orgId, serviceId),
      (isBiz ? businessesApi.getServiceStudyUnits : businessesApi.getInstitutionServiceStudyUnits)(orgId, serviceId),
      (isBiz ? businessesApi.getServiceAccreditations : businessesApi.getInstitutionServiceAccreditations)(orgId, serviceId),
    ]).then(async ([f, i, e, u, a]) => {
      setFees(f); setIntakes(i); setEligibility(e); setStudyUnits(u);
      if (a.length > 0) {
        const catalog = await categoriesApi.getAccreditations({ limit: 100 });
        const byId = new Map(catalog.data.map((c) => [c.id, c]));
        setAccreditations(a.map((row) => byId.get(row.accreditation_id)).filter((x): x is Accreditation => Boolean(x)));
      }
    }).finally(() => setLoading(false));
  }, [kind, orgId, serviceId, refreshKey]);

  return { fees, intakes, eligibility, studyUnits, accreditations, loading };
}
