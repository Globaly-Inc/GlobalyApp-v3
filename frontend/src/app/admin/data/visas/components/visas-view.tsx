"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { VISA_STATUS_TABS } from "../const";
import {
  discardVisa,
  fetchVisas,
  launchVisaExtraction,
  promoteVisa,
  setStatusFilter,
} from "../store/visas-slice";
import type { VisaExtraction, VisaExtractionStatus } from "../apis/types";

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
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Visas</h1>
        <p className="text-muted-foreground mt-1">
          Visa subclasses extracted from immigration department sites, staged for promotion.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex gap-1">
          {VISA_STATUS_TABS.map((tab) => (
            <Button
              key={tab.value}
              variant={statusFilter === tab.value ? "default" : "outline"}
              size="sm"
              className="cursor-pointer"
              onClick={() => changeTab(tab.value)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
        <Button className="gap-1.5 cursor-pointer" onClick={handleLaunch}>
          <Plus className="h-4 w-4" />
          Launch Extraction
        </Button>
      </div>

      {status === "loading" ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : visas.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">No staged visas in this view.</p>
      ) : (
        <div className="space-y-2">
          {visas.map((visa) => (
            <VisaCard key={visa.id} visa={visa} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Visa Card ────────────────────────────────────────────────────

function VisaCard({ visa }: { visa: VisaExtraction }) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [deptId, setDeptId] = useState("");
  const [busy, setBusy] = useState(false);

  const handleDiscard = async () => {
    setBusy(true);
    const result = await dispatch(discardVisa(visa.id));
    setBusy(false);
    if ("error" in result && result.error) {
      toast.error("Discard failed");
      return;
    }
    toast.success("Visa discarded");
  };

  const handlePromote = async () => {
    if (!deptId.trim()) return;
    setBusy(true);
    const result = await dispatch(promoteVisa({ id: visa.id, departmentBusinessId: deptId.trim() }));
    setBusy(false);
    setPromoteOpen(false);
    if ("error" in result && result.error) {
      toast.error("Promote failed");
      return;
    }
    toast.success("Visa promoted as a service");
  };

  return (
    <>
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">{visa.subclass_code ?? "--"}</Badge>
              <span className="font-medium truncate">{visa.name ?? "Unnamed visa"}</span>
              <Badge>{visa.country_code ?? "?"}</Badge>
              {visa.confidence_score !== null && (
                <Badge variant="secondary">conf {Math.round(visa.confidence_score * 100)}%</Badge>
              )}
              <Badge variant={visa.status === "pending" ? "default" : "outline"}>{visa.status}</Badge>
            </div>
            {visa.source_url && (
              <a
                href={visa.source_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 mt-1"
              >
                source <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => setOpen(!open)}>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>

        {open && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Category" value={visa.category} />
              <Field label="Stream" value={visa.visa_stream} />
              <Field label="Duration (mo)" value={visa.duration_months} />
              <Field label="Permanent" value={visa.is_permanent ? "Yes" : "No"} />
              <Field
                label="Fee"
                value={
                  visa.application_fee_amount
                    ? `${visa.application_fee_currency ?? ""} ${visa.application_fee_amount}`
                    : null
                }
              />
              <Field
                label="Processing"
                value={
                  visa.processing_time_min_days
                    ? `${visa.processing_time_min_days}--${visa.processing_time_max_days ?? "?"} d`
                    : null
                }
              />
            </div>
            {visa.description && <p className="text-muted-foreground">{visa.description}</p>}

            {visa.status === "pending" && (
              <div className="flex gap-2 pt-2 border-t">
                <Button size="sm" className="cursor-pointer" disabled={busy} onClick={() => setPromoteOpen(true)}>
                  Promote
                </Button>
                <Button size="sm" variant="outline" className="cursor-pointer" disabled={busy} onClick={handleDiscard}>
                  Discard
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Promote dialog */}
      <Dialog open={promoteOpen} onOpenChange={setPromoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Promote Visa</DialogTitle>
            <DialogDescription>
              Enter the department business ID to promote &quot;{visa.name ?? visa.subclass_code}&quot; as a service.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Department Business ID</Label>
            <Input
              value={deptId}
              onChange={(e) => setDeptId(e.target.value)}
              placeholder="e.g. uuid of the immigration department"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer" onClick={() => setPromoteOpen(false)}>
              Cancel
            </Button>
            <Button className="cursor-pointer" disabled={!deptId.trim() || busy} onClick={handlePromote}>
              {busy ? "Promoting..." : "Promote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span> <span>{value ?? "--"}</span>
    </div>
  );
}
