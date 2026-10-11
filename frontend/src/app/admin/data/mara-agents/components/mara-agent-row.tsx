"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { useAppDispatch } from "@/lib/hooks";
import { discardMaraAgent, promoteMaraAgent } from "../store/mara-agents-slice";
import type { MaraExtraction } from "../apis/types";

/** Column headers for the rows below — kept beside the row so the two can't drift apart. */
export const MARA_AGENT_COLUMNS = [
  { label: "Agent" },
  { label: "Registration", className: "hidden md:table-cell" },
  { label: "Confidence", className: "hidden lg:table-cell", numeric: true },
  { label: "Status" },
  { label: "Actions", className: "w-px", srOnly: true },
] as const;

export function MaraAgentRow({ agent }: Readonly<{ agent: MaraExtraction }>) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleDiscard = async () => {
    setBusy(true);
    const result = await dispatch(discardMaraAgent(agent.id));
    setBusy(false);
    if ("error" in result && result.error) {
      toast.error("Discard failed");
      return;
    }
    toast.success("Agent discarded");
  };

  const handlePromote = async () => {
    setBusy(true);
    const result = await dispatch(promoteMaraAgent(agent.id));
    setBusy(false);
    if ("error" in result && result.error) {
      toast.error("Promote failed");
      return;
    }
    toast.success("Agent promoted as unclaimed business");
  };

  return (
    <>
      <TableRow className={open ? "border-b-0" : undefined}>
        <TableCell primary>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant="outline">MARN {agent.marn}</Badge>
            <span className="truncate font-medium text-foreground">{agent.agent_name ?? agent.business_name ?? "Unnamed"}</span>
            {/* Fallbacks for the columns hidden on narrow screens. */}
            {agent.registration_status && <Badge className="md:hidden">{agent.registration_status}</Badge>}
            {agent.confidence_score !== null && (
              <Badge variant="secondary" className="lg:hidden">conf {Math.round(agent.confidence_score * 100)}%</Badge>
            )}
          </div>
          {agent.source_url && (
            <a
              href={agent.source_url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            >
              source <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </TableCell>
        <TableCell className="hidden md:table-cell">
          {agent.registration_status ? <Badge>{agent.registration_status}</Badge> : <span className="text-muted-foreground">—</span>}
        </TableCell>
        <TableCell numeric className="hidden lg:table-cell">
          {agent.confidence_score !== null ? (
            <Badge variant="secondary">conf {Math.round(agent.confidence_score * 100)}%</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell>
          <Badge variant={agent.status === "pending" ? "default" : "outline"}>{agent.status}</Badge>
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
          <TableCell colSpan={MARA_AGENT_COLUMNS.length} className="whitespace-normal pt-0">
            <div className="space-y-3 rounded-md bg-muted/40 p-3 text-sm">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label="Business" value={agent.business_name} />
                <Field label="Email" value={agent.email} />
                <Field label="Phone" value={agent.phone} />
                <Field label="Website" value={agent.website} />
                <Field label="Registered" value={agent.registration_date} />
                <Field label="Expires" value={agent.expiry_date} />
                <Field
                  label="Office"
                  value={[agent.office_city, agent.office_state, agent.office_country].filter(Boolean).join(", ") || null}
                />
                <Field label="Languages" value={agent.languages_spoken?.join(", ") || null} />
                <Field label="Practice areas" value={agent.practice_areas?.join(", ") || null} />
              </div>

              {agent.status === "pending" && (
                <div className="flex flex-wrap gap-2 border-t pt-2">
                  <Button size="sm" className="cursor-pointer" disabled={busy} onClick={handlePromote}>
                    Promote to unclaimed business
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
    </>
  );
}

function Field({ label, value }: Readonly<{ label: string; value: string | null | undefined }>) {
  return (
    <div className="truncate">
      <span className="text-muted-foreground">{label}:</span> <span>{value ?? "--"}</span>
    </div>
  );
}
