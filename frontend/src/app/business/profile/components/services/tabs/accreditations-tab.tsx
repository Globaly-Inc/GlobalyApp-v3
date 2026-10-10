"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Award, ExternalLink, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { businessProfileDetailApi } from "../../../apis";
import type { Accreditation } from "@/app/admin/platform/categories/apis/types";
import { ServiceAccreditationForm } from "./service-accreditation-form";
import { TabSection } from "./tab-section";
import type { ServiceAccreditationLink } from "../../../apis/types";

const CHIP = "rounded-full px-2 py-0.5 text-[11px] font-semibold";
const STATUS = {
  approved: { label: "Verified", chip: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300", seal: "" },
  pending: { label: "Pending review", chip: "bg-amber-500/15 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300", seal: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  rejected: { label: "Rejected", chip: "bg-destructive/10 text-destructive", seal: "bg-destructive/10 text-destructive" },
  unknown: { label: null, chip: "", seal: "" },
};
/** Same rule as before the redesign: being in the approved catalog lookup means verified (a link
 * row can still carry a stale "pending" from before approval). Otherwise the link's own
 * pending/rejected status; with neither, no status is claimed. */
const statusOf = (row: ServiceAccreditationLink, a?: Accreditation): keyof typeof STATUS => {
  if (a) return "approved";
  const s = row.accreditation_status;
  return s === "pending" || s === "rejected" ? s : "unknown";
};
const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 3).toUpperCase();
const SEAL_GRADIENT =
  "bg-[conic-gradient(from_0deg,var(--color-primary),color-mix(in_oklab,var(--color-primary)_55%,white),var(--color-primary))] text-primary-foreground shadow-[inset_0_0_0_3px_color-mix(in_oklab,var(--color-card)_40%,transparent)]";

export function AccreditationsTab({ serviceId }: Readonly<{ serviceId: string }>) {
  const [rows, setRows] = useState<ServiceAccreditationLink[]>([]);
  const [details, setDetails] = useState<Record<number, Accreditation>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [selected, setSelected] = useState("");
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    businessProfileDetailApi.getServiceAccreditations(serviceId)
      .then(async (data) => {
        setRows(data);
        if (data.length > 0) {
          const res = await businessProfileDetailApi.getAccreditations({ limit: 100 });
          setDetails(Object.fromEntries(res.data.map((a) => [a.id, a])));
        }
      })
      .finally(() => setLoading(false));
  }, [serviceId]);

  const openAdd = async () => {
    setSelected("");
    setMode("existing");
    const res = await businessProfileDetailApi.getAccreditations({ limit: 100 });
    setOptions(res.data.map((a) => ({ value: String(a.id), label: a.name })));
    setDetails((n) => ({ ...n, ...Object.fromEntries(res.data.map((a) => [a.id, a])) }));
    setDialogOpen(true);
  };

  // A just-proposed accreditation isn't in the approved lookup yet, so carry its name/status here.
  const linkAccreditation = async (accreditationId: number, proposedName?: string) => {
    const created = await businessProfileDetailApi.linkServiceAccreditation(serviceId, accreditationId);
    const known = details[accreditationId];
    setRows((r) => [...r, {
      ...created,
      accreditation_name: known?.name ?? proposedName ?? null,
      accreditation_status: known ? "approved" : proposedName ? "pending" : null,
    }]);
    toast.success("Accreditation linked");
    setDialogOpen(false);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await linkAccreditation(Number(selected));
    } catch (e) {
      toast.error("Couldn't link accreditation", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rowId: number) => {
    try {
      await businessProfileDetailApi.unlinkServiceAccreditation(serviceId, rowId);
      setRows((r) => r.filter((x) => x.id !== rowId));
      toast.success("Accreditation removed");
    } catch (e) {
      toast.error("Couldn't remove accreditation", { description: (e as Error).message });
    }
  };

  const statuses = rows.map((row) => statusOf(row, details[row.accreditation_id]));
  const countOf = (s: string) => statuses.filter((x) => x === s).length;

  return (
    <>
      <TabSection
        icon={Award}
        title="Accreditations"
        count={rows.length}
        addLabel="Link accreditation"
        onAdd={openAdd}
        loading={loading}
        emptyTitle="No accreditations linked yet"
        emptyHint="Link the bodies that accredit this course so students can trust it."
        summary={
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            {countOf("approved")} verified · {countOf("pending")} in review
          </p>
        }
      >
        <div className="stagger-in grid gap-3 sm:grid-cols-2">
          {rows.map((row) => {
            const a = details[row.accreditation_id];
            const name = a?.name ?? row.accreditation_name ?? `Accreditation #${row.accreditation_id}`;
            const status = statusOf(row, a);
            const st = STATUS[status];
            return (
              <article
                key={row.id}
                className={`group/card relative grid content-start gap-2.5 overflow-hidden rounded-xl border bg-card p-4 transition-[background-color,box-shadow] hover:bg-primary/[0.02] hover:shadow-md ${status === "rejected" ? "border-destructive/40" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`grid size-12 shrink-0 place-items-center overflow-hidden rounded-full text-[13px] font-bold transition-transform duration-600 ease-[cubic-bezier(.34,1.56,.64,1)] group-hover/card:-rotate-12 group-hover/card:scale-105 ${a?.issuing_organization_logo_url ? "border bg-card" : st.seal || SEAL_GRADIENT}`}
                  >
                    {a?.issuing_organization_logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- remote org logo, arbitrary host
                      <img src={a.issuing_organization_logo_url} alt="" className="size-full object-contain p-1.5" />
                    ) : (
                      initials(name)
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-semibold">{name}</p>
                    {a?.issuing_organization_name && <p className="truncate text-[12.5px] text-muted-foreground">{a.issuing_organization_name}</p>}
                  </div>
                  <div className="shrink-0 opacity-55 transition-opacity focus-within:opacity-100 group-hover/card:opacity-100">
                    <ConfirmDeleteButton onConfirm={() => handleDelete(row.id)} label="Unlink" question="Unlink?" />
                  </div>
                </div>
                {a?.description && <p className="line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">{a.description}</p>}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {st.label && <span className={`${CHIP} ${st.chip}`}>{st.label}</span>}
                    {a?.is_global && <span className={`${CHIP} bg-muted text-muted-foreground`}>Global</span>}
                  </div>
                  {status === "rejected" ? (
                    <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2 text-xs" onClick={openAdd}>
                      <RefreshCw className="h-3 w-3" /> Replace
                    </Button>
                  ) : (
                    a?.website && (
                      <a
                        href={a.website} target="_blank" rel="noreferrer"
                        className="inline-flex min-w-0 items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <span className="truncate">{a.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    )
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </TabSection>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={mode === "new" ? "max-h-[90vh] overflow-y-auto border-0 bg-transparent p-0 shadow-none" : undefined}>
          {mode === "existing" ? (
            <>
              <DialogHeader>
                <DialogTitle>Link accreditation</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Label>Accreditation</Label>
                <Combobox value={selected} onChange={setSelected} options={options} placeholder="Select accreditation" searchPlaceholder="Search accreditations..." />
              </div>
              <Button variant="ghost" size="sm" className="w-fit gap-1.5 text-primary" onClick={() => setMode("new")}>
                <Plus className="h-3.5 w-3.5" /> Add a new accreditation
              </Button>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving || !selected}>{saving ? "Saving…" : "Save"}</Button>
              </DialogFooter>
            </>
          ) : (
            <ServiceAccreditationForm saving={saving} onCancel={() => setMode("existing")} onSave={linkAccreditation} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
