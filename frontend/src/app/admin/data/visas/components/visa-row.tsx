"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { TableCell, TableRow } from "@/components/ui/table";
import { useAppDispatch } from "@/lib/hooks";
import { discardVisa, promoteVisa } from "../store/visas-slice";
import type { VisaExtraction } from "../apis/types";

/** Column headers for the rows below — kept beside the row so the two can't drift apart. */
export const VISA_COLUMNS = [
  { label: "Visa" },
  { label: "Country", className: "hidden md:table-cell" },
  { label: "Confidence", className: "hidden lg:table-cell", numeric: true },
  { label: "Status" },
  { label: "Actions", className: "w-px", srOnly: true },
] as const;

export function VisaRow({ visa }: Readonly<{ visa: VisaExtraction }>) {
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
      <TableRow className={open ? "border-b-0" : undefined}>
        <TableCell primary>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant="outline">{visa.subclass_code ?? "--"}</Badge>
            <span className="truncate font-medium text-foreground">{visa.name ?? "Unnamed visa"}</span>
            {/* Fallbacks for the columns hidden on narrow screens. */}
            <Badge className="md:hidden">{visa.country_code ?? "?"}</Badge>
            {visa.confidence_score !== null && (
              <Badge variant="secondary" className="lg:hidden">conf {Math.round(visa.confidence_score * 100)}%</Badge>
            )}
          </div>
          {visa.source_url && (
            <a
              href={visa.source_url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            >
              source <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </TableCell>
        <TableCell className="hidden md:table-cell">
          <Badge>{visa.country_code ?? "?"}</Badge>
        </TableCell>
        <TableCell numeric className="hidden lg:table-cell">
          {visa.confidence_score !== null ? (
            <Badge variant="secondary">conf {Math.round(visa.confidence_score * 100)}%</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell>
          <Badge variant={visa.status === "pending" ? "default" : "outline"}>{visa.status}</Badge>
        </TableCell>
        <TableCell>
          <Button
            size="icon-sm"
            variant="ghost"
            className="cursor-pointer"
            aria-label={open ? "Hide details" : "Show details"}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </TableCell>
      </TableRow>

      {open && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={VISA_COLUMNS.length} className="whitespace-normal pt-0">
            <div className="space-y-3 rounded-md bg-muted/40 p-3 text-sm">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label="Category" value={visa.category} />
                <Field label="Stream" value={visa.visa_stream} />
                <Field label="Duration (mo)" value={visa.duration_months} />
                <Field label="Permanent" value={visa.is_permanent ? "Yes" : "No"} />
                <Field
                  label="Fee"
                  value={visa.application_fee_amount ? `${visa.application_fee_currency ?? ""} ${visa.application_fee_amount}` : null}
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
                <div className="flex flex-wrap gap-2 border-t pt-2">
                  <Button size="sm" className="cursor-pointer" disabled={busy} onClick={() => setPromoteOpen(true)}>
                    Promote
                  </Button>
                  <Button size="sm" variant="outline" className="cursor-pointer" disabled={busy} onClick={handleDiscard}>
                    Discard
                  </Button>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}

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

function Field({ label, value }: Readonly<{ label: string; value: string | number | null | undefined }>) {
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span> <span>{value ?? "--"}</span>
    </div>
  );
}
