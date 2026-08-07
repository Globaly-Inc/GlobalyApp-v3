"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminRecordsCard } from "../../../components/admin-placeholder-view";
import { fetchMaraAgents } from "../store/mara-agents-slice";
import { MARA_AGENT_COLUMNS } from "../const";

export function MaraAgentsView() {
  const dispatch = useAppDispatch();
  const { agents } = useAppSelector((state) => state.dataMaraAgents);

  useEffect(() => {
    dispatch(fetchMaraAgents());
  }, [dispatch]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">MARA Agents</h1>
        <p className="text-muted-foreground mt-1">Registered migration agents extracted from the MARA register, seeded as unclaimed businesses.</p>
      </div>

      <AdminRecordsCard columns={MARA_AGENT_COLUMNS} rows={agents} />
    </div>
  );
}
