"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { MARA_STATUS_TABS } from "../const";
import {
  discardMaraAgent,
  fetchMaraAgents,
  promoteMaraAgent,
  setStatusFilter,
} from "../store/mara-agents-slice";
import type { MaraExtraction, MaraExtractionStatus } from "../apis/types";

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
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">MARA Agents</h1>
        <p className="text-muted-foreground mt-1">
          Registered migration agents extracted from the MARA register, seeded as unclaimed businesses.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex gap-1">
          {MARA_STATUS_TABS.map((tab) => (
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
      ) : agents.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">No staged agents in this view.</p>
      ) : (
        <div className="space-y-2">
          {agents.map((agent) => (
            <MaraAgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Agent Card ───────────────────────────────────────────────────

function MaraAgentCard({ agent }: { agent: MaraExtraction }) {
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
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">MARN {agent.marn}</Badge>
            <span className="font-medium truncate">{agent.agent_name ?? agent.business_name ?? "Unnamed"}</span>
            {agent.registration_status && <Badge>{agent.registration_status}</Badge>}
            {agent.confidence_score !== null && (
              <Badge variant="secondary">conf {Math.round(agent.confidence_score * 100)}%</Badge>
            )}
            <Badge variant={agent.status === "pending" ? "default" : "outline"}>{agent.status}</Badge>
          </div>
          {agent.source_url && (
            <a
              href={agent.source_url}
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
            <div className="flex gap-2 pt-2 border-t">
              <Button size="sm" className="cursor-pointer" disabled={busy} onClick={handlePromote}>
                Promote to unclaimed business
              </Button>
              <Button size="sm" variant="outline" className="cursor-pointer" disabled={busy} onClick={handleDiscard}>
                Discard
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="truncate">
      <span className="text-muted-foreground">{label}:</span> <span>{value ?? "--"}</span>
    </div>
  );
}
