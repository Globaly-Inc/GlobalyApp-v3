"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/combobox";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchLedger } from "../store/credits-ledger-slice";
import { REASON_FILTER_OPTIONS } from "../const";
import { LedgerTable } from "./ledger-table";
import { ManualAdjustmentDialog } from "./manual-adjustment-dialog";

export function CreditsLedgerView() {
  const dispatch = useAppDispatch();
  const { entries, status } = useAppSelector((state) => state.creditsLedger);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchLedger({}));
  }, [dispatch]);

  // Re-fetch when filters change (skip on initial mount)
  const isMount = useRef(true);
  useEffect(() => {
    if (isMount.current) { isMount.current = false; return; }
    dispatch(fetchLedger({ reason: reason || undefined, search: search || undefined }));
  }, [dispatch, reason, search]);

  const loading = status === "loading";

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Credit ledger</h1>
          <p className="text-muted-foreground mt-1">All credit transactions across the platform</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Manual adjustment
        </Button>
      </div>

      <div className="flex gap-3 mb-4">
        <Input
          className="max-w-sm"
          placeholder="Search description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex flex-col gap-0 w-52">
          <Combobox
            options={REASON_FILTER_OPTIONS}
            value={reason}
            onChange={(v) => setReason(v)}
            placeholder="All types"
          />
        </div>
      </div>

      <LedgerTable entries={entries} loading={loading} />

      <ManualAdjustmentDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
