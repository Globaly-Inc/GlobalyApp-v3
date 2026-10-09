"use client";

import { useEffect, useRef, useState } from "react";
import { businessProfileDetailApi } from "../../apis";
import type { Accreditation } from "@/app/admin/platform/categories/apis/types";
import type { ServiceEligibility, ServiceFee, ServiceIntake, ServiceStudyUnit } from "../../apis/types";

/** Everything the summary cards preview, fetched together; re-fetched when `refreshKey` changes. */
export function useServiceSummaryData(serviceId: string, refreshKey: string | number) {
  const [fees, setFees] = useState<ServiceFee[]>([]);
  const [intakes, setIntakes] = useState<ServiceIntake[]>([]);
  const [eligibility, setEligibility] = useState<ServiceEligibility[]>([]);
  const [studyUnits, setStudyUnits] = useState<ServiceStudyUnit[]>([]);
  const [accreditations, setAccreditations] = useState<Accreditation[]>([]);
  const [loading, setLoading] = useState(true);

  // Keyed by refreshKey (the parent's current tab) rather than a mount-once ref: this component
  // renders in the sidebar for the whole time the service is being edited, so it never remounts
  // when a fee/intake/etc. gets added on another tab — only re-running this fetch when the
  // caller's key changes (e.g. navigating back to the "summary" tab) picks up those additions.
  const fetchedForRef = useRef<string | number | null>(null);
  useEffect(() => {
    if (fetchedForRef.current === refreshKey) return;
    fetchedForRef.current = refreshKey;
    Promise.all([
      businessProfileDetailApi.serviceFees.list(serviceId),
      businessProfileDetailApi.serviceIntakes.list(serviceId),
      businessProfileDetailApi.serviceEligibility.list(serviceId),
      businessProfileDetailApi.serviceStudyUnits.list(serviceId),
      businessProfileDetailApi.getServiceAccreditations(serviceId),
    ]).then(async ([f, i, e, u, a]) => {
      setFees(f); setIntakes(i); setEligibility(e); setStudyUnits(u);
      if (a.length > 0) {
        const catalog = await businessProfileDetailApi.getAccreditations({ limit: 100 });
        const byId = new Map(catalog.data.map((c) => [c.id, c]));
        setAccreditations(a.map((row) => byId.get(row.accreditation_id)).filter((x): x is Accreditation => Boolean(x)));
      }
    }).finally(() => setLoading(false));
  }, [serviceId, refreshKey]);

  return { fees, intakes, eligibility, studyUnits, accreditations, loading };
}
