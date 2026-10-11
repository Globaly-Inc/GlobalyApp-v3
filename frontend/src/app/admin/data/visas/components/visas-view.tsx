"use client";

import { useEffect, useRef } from "react";
import { Plus, Stamp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCard, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SectionTabs } from "@/components/section-tabs";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { VISA_STATUS_TABS } from "../const";
import {
  fetchVisas,
  setStatusFilter,
} from "../store/visas-slice";
import type { VisaExtractionStatus } from "../apis/types";
import { VISA_COLUMNS, VisaRow } from "./visa-row";

export function VisasView() {
  const dispatch = useAppDispatch();
  const { visas, status, statusFilter } = useAppSelector((s) => s.dataVisas);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchVisas(statusFilter === "all" ? undefined : (statusFilter as VisaExtractionStatus)));
  }, [dispatch, statusFilter]);

  const changeTab = (tab: string) => {
    const next = tab as VisaExtractionStatus | "all";
    dispatch(setStatusFilter(next));
    fetchedRef.current = false;
  };

  // Re-fetch when filter changes after initial load
  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      dispatch(fetchVisas(statusFilter === "all" ? undefined : (statusFilter as VisaExtractionStatus)));
    }
  }, [dispatch, statusFilter]);

  const handleLaunch = () => {
    toast.info("Coming soon", { description: "Visa extraction is not yet available (backend returns 503)." });
  };

  return (
    <PageBody>
      <PageHeader
        title={<><Stamp /> Visas</>}
        subtitle="Visa subclasses extracted from immigration department sites, staged for promotion."
      >
        <Button className="gap-1.5 cursor-pointer" onClick={handleLaunch}>
          <Plus className="h-4 w-4" />
          Launch Extraction
        </Button>
      </PageHeader>

      <SectionTabs options={VISA_STATUS_TABS} value={statusFilter} onChange={changeTab} />

      {status === "loading" && <ListSkeleton count={5} itemClassName="h-14" />}
      {status !== "loading" && visas.length === 0 && <EmptyState icon={Stamp} title="No staged visas in this view." />}
      {status !== "loading" && visas.length > 0 && (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                {VISA_COLUMNS.map((col) => (
                  <TableHead key={col.label} numeric={"numeric" in col} className={"className" in col ? col.className : undefined}>
                    {"srOnly" in col ? <span className="sr-only">{col.label}</span> : col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visas.map((item) => (
                <VisaRow key={item.id} visa={item} />
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </PageBody>
  );
}
