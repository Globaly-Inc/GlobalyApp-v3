"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Loader2, RefreshCcw, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { allExtractionsApi } from "../apis";
import type { VisaService } from "../apis/types";
import { useConfirmDelete } from "./use-confirm-delete";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "discarded", label: "Discarded" },
];

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  discarded: "bg-red-100 text-red-700",
};

const humanize = (v: string | null | undefined) => (v ? v.replaceAll("_", " ") : null);
const money = (amount: number | null, currency: string | null) =>
  amount != null ? `${currency ?? ""} ${amount}`.trim() : null;

function Field({ label, value }: Readonly<{ label: string; value: string | number | null | undefined }>) {
  if (value == null || value === "") return null;
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span> <span>{value}</span>
    </div>
  );
}

/** Minimal review UI for extraction_visa_services — list, expand, approve/discard/delete.
 * Deliberately not a full multi-tab editor like courses: this is a flat table with no
 * junctions, so there's nothing to link/unlink. */
export function VisaServicesTab({ jobId }: Readonly<{ jobId: string }>) {
  const [services, setServices] = useState<VisaService[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const fetchedForRef = useRef<string | null>(null);
  const { confirm, dialog } = useConfirmDelete();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await allExtractionsApi.getVisaServices(jobId, statusFilter === "all" ? undefined : statusFilter);
      setServices(data);
    } catch (e) {
      toast.error("Failed to load visa services", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [jobId, statusFilter]);

  useEffect(() => {
    const key = `${jobId}:${statusFilter}`;
    if (fetchedForRef.current === key) return;
    fetchedForRef.current = key;
    load();
  }, [load, jobId, statusFilter]);

  return (
    <div>
      {dialog}
      <div className="mb-4 flex gap-1">
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab.value}
            variant={statusFilter === tab.value ? "default" : "outline"}
            size="sm"
            className="cursor-pointer"
            onClick={() => setStatusFilter(tab.value)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : services.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <p className="text-sm">No visa services in this view yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {services.map((service) => (
            <VisaServiceCard
              key={service.id}
              jobId={jobId}
              service={service}
              onChanged={load}
              onConfirmDelete={() => confirm("Delete this visa service?")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VisaServiceCard({
  jobId,
  service,
  onChanged,
  onConfirmDelete,
}: Readonly<{ jobId: string; service: VisaService; onChanged: () => void; onConfirmDelete: () => Promise<boolean> }>) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      onChanged();
    } catch (e) {
      toast.error("Action failed", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium truncate">{service.name}</span>
            {service.registration_number && <Badge variant="outline">{service.registration_number}</Badge>}
            <Badge className={STATUS_BADGE[service.status] ?? ""}>{service.status}</Badge>
          </div>
          {(service.provider_name || service.country) && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[service.provider_name, service.country].filter(Boolean).join(" · ")}
            </p>
          )}
          {service.source_url && (
            <a
              href={service.source_url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            >
              source <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {open && (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Type" value={humanize(service.type)} />
            <Field label="Registration body" value={service.registration_body} />
            <Field label="Fee" value={money(service.fee_amount, service.fee_currency)} />
            <Field label="Success rate" value={service.success_rate != null ? `${service.success_rate}%` : null} />
            <Field label="Years experience" value={service.years_experience} />
            <Field label="Team size" value={service.team_size} />
            <Field label="Contact" value={service.contact_email ?? service.contact_phone} />
            <Field label="Rating" value={service.average_rating != null ? `${service.average_rating} (${service.review_count ?? 0})` : null} />
          </div>
          {service.visa_types_handled?.length ? (
            <div className="flex flex-wrap gap-1">
              {service.visa_types_handled.map((v) => (
                <Badge key={v} variant="outline" className="text-[10px]">{v}</Badge>
              ))}
            </div>
          ) : null}
          {service.description && <p className="text-muted-foreground">{service.description}</p>}

          <div className="flex gap-2 border-t pt-2">
            {service.source_url && (
              <Button
                size="sm" variant="outline" className="gap-1.5 cursor-pointer" disabled={busy}
                onClick={() =>
                  run(
                    () => allExtractionsApi.runStep(jobId, "visa_service_data", { visa_service_id: service.id }),
                    "Re-extraction started — running in the background",
                  )
                }
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                Re-extract
              </Button>
            )}
            {service.status !== "approved" && (
              <Button
                size="sm" className="gap-1.5 cursor-pointer" disabled={busy}
                onClick={() => run(() => allExtractionsApi.approveVisaService(service.id), "Visa service approved")}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Approve
              </Button>
            )}
            {service.status !== "discarded" && (
              <Button
                size="sm" variant="outline" className="gap-1.5 cursor-pointer" disabled={busy}
                onClick={() => run(() => allExtractionsApi.discardVisaService(service.id), "Visa service discarded")}
              >
                <XCircle className="h-3.5 w-3.5" />
                Discard
              </Button>
            )}
            <Button
              size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive cursor-pointer" disabled={busy}
              onClick={async () => {
                if (!(await onConfirmDelete())) {
                  return;
                }
                await run(() => allExtractionsApi.deleteVisaService(service.id), "Visa service deleted");
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
