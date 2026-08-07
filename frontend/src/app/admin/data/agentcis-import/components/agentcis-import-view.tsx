"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminRecordsCard } from "../../../components/admin-placeholder-view";
import { fetchAgentcisBatches } from "../store/agentcis-import-slice";
import { AGENTCIS_IMPORT_COLUMNS } from "../const";

export function AgentcisImportView() {
  const dispatch = useAppDispatch();
  const { batches } = useAppSelector((state) => state.dataAgentcisImport);

  useEffect(() => {
    dispatch(fetchAgentcisBatches());
  }, [dispatch]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">AgentCIS Import</h1>
        <p className="text-muted-foreground mt-1">Bulk-import education agents from AgentCIS export files.</p>
      </div>

      <AdminRecordsCard columns={AGENTCIS_IMPORT_COLUMNS} rows={batches} />
    </div>
  );
}
