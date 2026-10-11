"use client";

import { useEffect, useRef } from "react";
import { Plus, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCard, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SectionTabs } from "@/components/section-tabs";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { MARA_STATUS_TABS } from "../const";
import {
  fetchMaraAgents,
  setStatusFilter,
} from "../store/mara-agents-slice";
import type { MaraExtractionStatus } from "../apis/types";
import { MARA_AGENT_COLUMNS, MaraAgentRow } from "./mara-agent-row";

export function MaraAgentsView() {
  const dispatch = useAppDispatch();
  const { agents, status, statusFilter } = useAppSelector((s) => s.dataMaraAgents);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchMaraAgents(statusFilter === "all" ? undefined : (statusFilter as MaraExtractionStatus)));
  }, [dispatch, statusFilter]);

  const changeTab = (tab: string) => {
    const next = tab as MaraExtractionStatus | "all";
    dispatch(setStatusFilter(next));
    fetchedRef.current = false;
  };

  // Re-fetch when filter changes after initial load
  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      dispatch(fetchMaraAgents(statusFilter === "all" ? undefined : (statusFilter as MaraExtractionStatus)));
    }
  }, [dispatch, statusFilter]);

  const handleLaunch = () => {
    toast.info("Coming soon", { description: "MARA agent extraction is not yet available (backend returns 503)." });
  };

  return (
    <PageBody>
      <PageHeader
        title={<><UserCheck /> MARA Agents</>}
        subtitle="Registered migration agents extracted from the MARA register, seeded as unclaimed businesses."
      >
        <Button className="gap-1.5 cursor-pointer" onClick={handleLaunch}>
          <Plus className="h-4 w-4" />
          Launch Extraction
        </Button>
      </PageHeader>

      <SectionTabs options={MARA_STATUS_TABS} value={statusFilter} onChange={changeTab} />

      {status === "loading" && <ListSkeleton count={5} itemClassName="h-14" />}
      {status !== "loading" && agents.length === 0 && <EmptyState icon={UserCheck} title="No staged agents in this view." />}
      {status !== "loading" && agents.length > 0 && (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                {MARA_AGENT_COLUMNS.map((col) => (
                  <TableHead key={col.label} numeric={"numeric" in col} className={"className" in col ? col.className : undefined}>
                    {"srOnly" in col ? <span className="sr-only">{col.label}</span> : col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((item) => (
                <MaraAgentRow key={item.id} agent={item} />
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </PageBody>
  );
}
