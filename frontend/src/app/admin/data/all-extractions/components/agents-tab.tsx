"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { History, Loader2, Plus, RefreshCw, Save, Search, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/combobox";
import { FieldError } from "@/components/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { geoApi, type Country } from "@/app/geo/apis";
import { countriesApi, type City } from "@/app/admin/platform/countries/apis";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PhoneInput } from "@/components/ui/phone-input";
import { allExtractionsApi } from "../apis";
import { latestTimestamp } from "../utils";
import { EditableField, useFieldSaver } from "./editable-field";
import { StepActionBar } from "./step-action-bar";
import { useConfirmDelete } from "./use-confirm-delete";
import type { AgentFull, AgentRun, ExtractionJob } from "../apis/types";

import { z } from "zod";

type AgentValues = {
  name: string; country: string; email: string; phone: string; website: string;
  city: string; state: string; postcode: string; address: string;
};
const EMPTY: AgentValues = {
  name: "", country: "", email: "", phone: "", website: "",
  city: "", state: "", postcode: "", address: "",
};

const agentSchema = z.object({
  name: z.string().trim().min(1, "Agent name is required"),
  country: z.string(),
  email: z
    .string()
    .trim()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "Please enter a valid email address",
    }),
  phone: z.string(),
  website: z
    .string()
    .trim()
    .refine((v) => !v || (() => { try { new URL(v); return true; } catch { return false; } })(), {
      message: "Please enter a valid URL (e.g. https://example.com)",
    }),
  city: z.string(),
  state: z.string(),
  postcode: z.string(),
  address: z.string(),
});

function runStatusClass(status: string) {
  if (status === "completed" || status === "done") return "bg-emerald-500/15 text-emerald-700";
  if (status === "failed") return "bg-destructive/15 text-destructive";
  if (status === "running") return "bg-blue-500/15 text-blue-700";
  return "bg-muted text-muted-foreground";
}

function ExtractionHistory({
  runs,
  loading,
  rerunning,
  onRerun,
}: Readonly<{ runs: AgentRun[]; loading: boolean; rerunning: boolean; onRerun: () => void }>) {
  const last = runs[0];
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4 text-primary" />
            Extraction History
          </CardTitle>
          <Button size="sm" className="h-8 gap-1.5 cursor-pointer" onClick={onRerun} disabled={rerunning}>
            <RefreshCw className={cn("h-3.5 w-3.5", rerunning && "animate-spin")} />
            {rerunning ? "Running…" : "Run again"}
          </Button>
        </div>
        {last && (
          <p className="pt-1 text-xs text-muted-foreground">
            Last run: <span className="font-medium text-foreground">{new Date(last.started_at).toLocaleString()}</span>
            {" · "}
            <span className="font-medium text-foreground">{last.agents_found} agents</span>
            {last.agents_new > 0 && <span className="text-emerald-600"> (+{last.agents_new} new)</span>}
            {last.agents_removed > 0 && <span className="text-destructive"> (-{last.agents_removed} removed)</span>}
          </p>
        )}
      </CardHeader>
      {!loading && runs.length > 0 && (
        <CardContent className="pt-0">
          <div className="max-h-48 space-y-1.5 overflow-y-auto">
            {runs.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-muted/50">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={cn("inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium", runStatusClass(r.status))}>
                    {r.status}
                  </span>
                  <span className="text-muted-foreground">{new Date(r.started_at).toLocaleString()}</span>
                  {r.provider && <code className="rounded bg-muted px-1 text-[10px]">{r.provider}</code>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-medium">{r.agents_found}</span>
                  {r.agents_new > 0 && <span className="text-emerald-600">+{r.agents_new}</span>}
                  {r.agents_removed > 0 && <span className="text-destructive">-{r.agents_removed}</span>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function AddAgentForm({
  saving,
  onCancel,
  onSave,
}: Readonly<{ saving: boolean; onCancel: () => void; onSave: (v: AgentValues) => void }>) {
  const [values, setValues] = useState<AgentValues>(EMPTY);
  const [countries, setCountries] = useState<Country[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (key: keyof AgentValues, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  useEffect(() => {
    geoApi.getCountries()
      .then(setCountries)
      .catch((e: Error) => toast.error("Could not load countries", { description: e.message }));
  }, []);

  // Same country → city dependency as the branch form.
  const countryId = countries.find((c) => c.name === values.country)?.id;
  useEffect(() => {
    if (!countryId) {
      setCities([]);
      return;
    }
    setCitiesLoading(true);
    countriesApi.getCitiesByCountry(countryId)
      .then(setCities)
      .catch((e: Error) => toast.error("Could not load cities", { description: e.message }))
      .finally(() => setCitiesLoading(false));
  }, [countryId]);

  const handleSave = () => {
    const result = agentSchema.safeParse(values);
    if (!result.success) {
      const errs: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = String(issue.path[0]);
        if (!errs[key]) errs[key] = issue.message;
      }
      setErrors(errs);
      return;
    }
    setErrors({});
    onSave(values);
  };

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" />
          Add Agent
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-name">
              Agent / Agency Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="agent-name"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. AECC Global"
              aria-invalid={Boolean(errors.name)}
            />
            <FieldError message={errors.name} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-country">Country</Label>
            <Combobox
              id="agent-country"
              options={countries.map((c) => ({ value: c.name, label: c.name }))}
              value={values.country}
              onChange={(v) => setValues((prev) => ({ ...prev, country: v, city: "" }))}
              placeholder="Select country"
              loading={countries.length === 0}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-email">Email</Label>
            <Input
              id="agent-email"
              type="email"
              value={values.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="contact@..."
              aria-invalid={Boolean(errors.email)}
            />
            <FieldError message={errors.email} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-phone">Phone</Label>
            <PhoneInput
              id="agent-phone"
              value={values.phone}
              onChange={(v) => set("phone", v)}
              preferredCountryName={values.country}
              placeholder="Phone number"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-city">City</Label>
            <Combobox
              id="agent-city"
              options={cities.map((c) => ({ value: c.name, label: c.name }))}
              value={values.city}
              onChange={(v) => {
                const picked = cities.find((c) => c.name === v);
                setValues((prev) => ({ ...prev, city: v, state: prev.state || picked?.state_name || "" }));
              }}
              placeholder={countryId ? "Select city" : "Select a country first"}
              disabled={!countryId}
              loading={citiesLoading}
              creatable
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-state">State / Region</Label>
            <Input id="agent-state" value={values.state} onChange={(e) => set("state", e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-postcode">Postcode</Label>
            <Input id="agent-postcode" value={values.postcode} onChange={(e) => set("postcode", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-website">Website</Label>
            <Input
              id="agent-website"
              value={values.website}
              onChange={(e) => set("website", e.target.value)}
              placeholder="https://..."
              aria-invalid={Boolean(errors.website)}
            />
            <FieldError message={errors.website} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="agent-address">Address</Label>
          <Textarea id="agent-address" value={values.address} onChange={(e) => set("address", e.target.value)} rows={3} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" className="cursor-pointer" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button className="gap-1.5 cursor-pointer" disabled={saving} onClick={handleSave}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AgentCard({
  agent,
  selected,
  onToggleSelect,
  onDelete,
  onSaveField,
}: Readonly<{
  agent: AgentFull;
  selected: boolean;
  onToggleSelect: () => void;
  onDelete: () => void;
  onSaveField: (column: string, next: string | null) => Promise<unknown>;
}>) {
  const field = (label: string, column: keyof AgentFull, span?: string, multiline = false) => (
    <EditableField
      label={label}
      value={agent[column] as string | null}
      onSave={(v) => onSaveField(column, v)}
      multiline={multiline}
      className={span}
    />
  );
  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-4">
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} className="mt-1 shrink-0" />
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Users className="h-4 w-4 text-muted-foreground" />
        </div>

        <div className="grid flex-1 grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
          {field("Agent / Agency Name", "name")}
          {field("Country", "country")}
          {field("Email", "email")}
          {field("Phone", "phone")}
          {field("Website", "website", "md:col-span-2")}
          {field("Address", "address", "md:col-span-2", true)}
          {field("City", "city")}
          {field("State / Region", "state")}
          {field("Postcode", "postcode")}
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 cursor-pointer text-destructive hover:text-destructive"
          title="Delete agent"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </CardContent>
    </Card>
  );
}

export function AgentsTab({
  jobId,
  job,
  onReload,
  onJumpToContext,
}: Readonly<{
  jobId: string;
  job: ExtractionJob;
  onReload: () => void;
  onJumpToContext: () => void;
}>) {
  const [agents, setAgents] = useState<AgentFull[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [runsLoading, setRunsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const fetchedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      setAgents(await allExtractionsApi.getAgents(jobId));
    } catch (e) {
      toast.error("Failed to load agents", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  const loadRuns = useCallback(async () => {
    try {
      setRuns(await allExtractionsApi.getAgentRuns(jobId));
    } catch (e) {
      toast.error("Failed to load extraction history", { description: (e as Error).message });
    } finally {
      setRunsLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    load();
    loadRuns();
  }, [load, loadRuns]);

  const handleRerun = async () => {
    setRerunning(true);
    try {
      await allExtractionsApi.runStep(jobId, "agents");
      toast.success("Agents extraction started", { description: "Running in the background — you can switch tabs." });
      onReload();
      await Promise.all([load(), loadRuns()]);
    } catch (e) {
      toast.error("Run failed", { description: (e as Error).message });
    } finally {
      setRerunning(false);
    }
  };

  const handleCreate = async (values: AgentValues) => {
    setSaving(true);
    try {
      await allExtractionsApi.createAgent({
        job_id: jobId,
        ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim() || null])),
      });
      toast.success("Agent added");
      setAdding(false);
      await load();
    } catch (e) {
      toast.error("Failed to add agent", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ids: string[]) => {
    const many = ids.length > 1;
    if (!(await confirm(many ? `Delete ${ids.length} agents?` : "Delete agent?"))) return;
    try {
      await Promise.all(ids.map((id) => allExtractionsApi.deleteAgent(id)));
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
      toast.success(many ? `${ids.length} agents deleted` : "Agent deleted");
      await load();
    } catch (e) {
      toast.error("Delete failed", { description: (e as Error).message });
    }
  };

  const saveField = useFieldSaver(jobId, load);
  const { confirm, dialog } = useConfirmDelete();

  const query = search.trim().toLowerCase();
  const visible = query
    ? agents.filter((a) =>
        [a.name, a.country, a.email, a.city].some((f) => (f ?? "").toLowerCase().includes(query)),
      )
    : agents;

  return (
    <div>
      {dialog}
      <StepActionBar
        jobId={jobId}
        step="agents"
        label="Agents"
        progress={(job.pipeline_progress as Record<string, unknown> | null)?.agents}
        lastUpdated={latestTimestamp(agents)}
        hasData={agents.length > 0}
        guidedUrls={job.guided_urls}
        contextKey="agents_urls"
        contextLabel="agents URLs"
        onChanged={onReload}
        onAddContext={onJumpToContext}
      />

      <div className="space-y-3">
        <ExtractionHistory runs={runs} loading={runsLoading} rerunning={rerunning} onRerun={handleRerun} />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={agents.length > 0 && selectedIds.length === agents.length}
                onCheckedChange={() =>
                  setSelectedIds(selectedIds.length === agents.length ? [] : agents.map((a) => a.id))
                }
                disabled={agents.length === 0}
              />
              Select all ({agents.length})
            </label>
            {selectedIds.length > 0 && (
              <Button
                variant="destructive" size="sm" className="h-8 gap-1.5 cursor-pointer"
                onClick={() => handleDelete(selectedIds)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete {selectedIds.length}
              </Button>
            )}
            {query && <span className="text-sm text-muted-foreground">{visible.length} matching</span>}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, country, email, city…"
                className="h-9 w-64 pl-7 text-xs"
              />
            </div>
            <Button className="gap-1.5 cursor-pointer" disabled={adding} onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" />
              Add Agent
            </Button>
          </div>
        </div>

        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl p-0 border-0 bg-transparent shadow-none">
            <AddAgentForm saving={saving} onCancel={() => setAdding(false)} onSave={handleCreate} />
          </DialogContent>
        </Dialog>

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && visible.length === 0 && !adding && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Users className="mx-auto mb-3 h-8 w-8 opacity-40" />
              <p className="text-sm">{query ? "No agents match your search" : "No agents yet"}</p>
              {!query && (
                <p className="mt-1 text-xs">Add agent directory URLs in the Context tab, then run the extraction.</p>
              )}
              {query && (
                <Button variant="ghost" size="sm" className="mt-2 gap-1.5 cursor-pointer" onClick={() => setSearch("")}>
                  <X className="h-3.5 w-3.5" />
                  Clear search
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {visible.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            selected={selectedIds.includes(agent.id)}
            onToggleSelect={() =>
              setSelectedIds((prev) => (prev.includes(agent.id) ? prev.filter((x) => x !== agent.id) : [...prev, agent.id]))
            }
            onDelete={() => handleDelete([agent.id])}
            onSaveField={(column, next) => saveField("extraction_agents", agent.id, column, next)}
          />
        ))}
      </div>
    </div>
  );
}
