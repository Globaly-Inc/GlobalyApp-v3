"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminRecordsCard } from "../../../components/admin-placeholder-view";
import { fetchAmbassadorPrograms } from "../store/ambassador-programs-slice";
import { AMBASSADOR_PROGRAM_COLUMNS } from "../const";

export function AmbassadorProgramsView() {
  const dispatch = useAppDispatch();
  const { programs } = useAppSelector((state) => state.monitoringAmbassadorPrograms);

  useEffect(() => {
    dispatch(fetchAmbassadorPrograms());
  }, [dispatch]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Ambassadors</h1>
        <p className="text-muted-foreground mt-1">Ambassador programs overview across all businesses.</p>
      </div>

      <AdminRecordsCard columns={AMBASSADOR_PROGRAM_COLUMNS} rows={programs} />
    </div>
  );
}
