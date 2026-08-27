"use client";

import { z } from "zod";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Building2, Globe, Hash, History, Loader2, Mail, MapPin, Phone, Plus, RefreshCw, Save,
  Search, Trash2, Type, Users, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FieldError } from "@/components/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/ui/pagination";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { geoApi, type City, type Country } from "@/app/geo/apis";
import { allExtractionsApi } from "../apis";
import { latestTimestamp } from "../utils";
import { EditableField, useFieldSaver, type EditableFieldProps } from "./editable-field";
import { StepActionBar } from "./step-action-bar";
import { useConfirmDelete } from "./use-confirm-delete";
import type { AgentFull, AgentRun, ExtractionJob } from "../apis/types";

const DEFAULT_PAGE_SIZE = 10;

type AgentValues = {
  name: string; country: string; email: string; phone: string; website: string;
  city: string; state: string; postcode: string; address: string;
};
const EMPTY: AgentValues = {
  name: "", country: "", email: "", phone: "", website: "",
  city: "", state: "", postcode: "", address: "",
};

const agentSchema = z.object({
  name: z.string().trim().min(1, "Agent / Agency name is required"),
  country: z.string(),
  email: z
    .string()
    .trim()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: "Enter a valid email address" }),
  phone: z.string(),
  website: z
    .string()
    .trim()
    .refine((v) => !v || /^https?:\/\//i.test(v), { message: "Website must start with http:// or https://" }),
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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [countries, setCountries] = useState<Country[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);

  const set = (key: keyof AgentValues, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => { const next = { ...e }; delete next[key]; return next; });
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
    geoApi.getCities(countryId)
      .then(setCities)
      .catch((e: Error) => toast.error("Could not load cities", { description: e.message }))
      .finally(() => setCitiesLoading(false));
  }, [countryId]);

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
              aria-invalid={!!errors.name}
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
              aria-invalid={!!errors.email}
            />
            <FieldError message={errors.email} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-phone">Phone</Label>
            <Input id="agent-phone" value={values.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+61 ..." />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-city">City</Label>
            <Combobox
              id="agent-city"
              options={cities.map((c) => ({ value: c.name, label: c.name }))}
              value={values.city}
              onChange={(v) => {
                const picked = cities.find((c) => c.name === v);
                setValues((prev) => ({ ...prev, city: v, state: prev.state || picked?.stateName || "" }));
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
              aria-invalid={!!errors.website}
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
          <Button
            className="gap-1.5 cursor-pointer"
            disabled={saving}
            onClick={() => {
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
            }}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// EditableField keeps its own click-to-edit affordance — this just gives each
// field a visual anchor (icon tile), matching Branches/Institution tabs' treatment.
function Field({ icon: Icon, className, ...field }: Readonly<EditableFieldProps & { icon: LucideIcon }>) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 p-2", className)}>
      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <EditableField {...field} className="flex-1" />
    </div>
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
  const field = (icon: LucideIcon, label: string, column: keyof AgentFull, span: string, multiline = false) => (
    <Field
      icon={icon}
      label={label}
      value={agent[column] as string | null}
      onSave={(v) => onSaveField(column, v)}
      multiline={multiline}
      className={span}
    />
  );
  return (
    <Card className="group overflow-hidden">
      <div className="-mt-4 flex items-center justify-between gap-2 rounded-t-xl border-b bg-primary/5 px-4 py-3">
        <div className="flex items-center gap-3">
          <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Users className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold text-foreground">{agent.name || agent.country || "Unnamed agent"}</span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="cursor-pointer text-destructive hover:text-destructive"
          title="Delete agent"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <CardContent className="p-4">
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-6">
          {field(Type, "Agent / Agency Name", "name", "col-span-2 md:col-span-3")}
          {field(Mail, "Email", "email", "col-span-2 md:col-span-3")}
          {field(Phone, "Phone", "phone", "col-span-2 md:col-span-3")}
          {field(Globe, "Country", "country", "col-span-2 md:col-span-3")}
          {field(Globe, "Website", "website", "col-span-2 md:col-span-3")}
          {field(Building2, "City", "city", "col-span-2 md:col-span-2")}
          {field(MapPin, "State / Region", "state", "col-span-2 md:col-span-2")}
          {field(Hash, "Postcode", "postcode", "col-span-2 md:col-span-2")}
          {field(MapPin, "Address", "address", "col-span-2 md:col-span-6", true)}
        </div>
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
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [runsLoading, setRunsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const fetchedRef = useRef(false);

  // Accepts overrides for the same reason study-units-tab.tsx does — setState is async, so a
  // caller that also resets page/search right before reloading needs the new values applied
  // to THIS fetch immediately, not next render's stale closure.
  const load = useCallback(async (overrides?: { page?: number; limit?: number; search?: string }) => {
    try {
      const res = await allExtractionsApi.getAgentsFiltered(jobId, {
        page: overrides?.page ?? page,
        limit: overrides?.limit ?? limit,
        search: (overrides?.search ?? search).trim() || undefined,
      });
      setAgents(res.data);
      setTotal(res.meta?.total ?? 0);
    } catch (e) {
      toast.error("Failed to load agents", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [jobId, page, limit, search]);

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
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      load();
      return;
    }
    // Debounce so typing in the search box doesn't fire a request per keystroke.
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  // Independent of search/pagination — fetch once (and again if the job changes).
  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  // A search change invalidates the current page.
  useEffect(() => {
    setPage(1);
  }, [search]);

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

  return (
    <div>
      {dialog}
      <StepActionBar
        jobId={jobId}
        step="agents"
        label="Agents"
        progress={(job.pipeline_progress as Record<string, unknown> | null)?.agents}
        lastUpdated={latestTimestamp(agents)}
        hasData={total > 0}
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
              {total} agent{total === 1 ? "" : "s"}
              {search.trim() && ` · ${agents.length} on this page`}
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

        {!loading && agents.length === 0 && !adding && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Users className="mx-auto mb-3 h-8 w-8 opacity-40" />
              <p className="text-sm">{search.trim() ? "No agents match your search" : "No agents yet"}</p>
              {!search.trim() && (
                <p className="mt-1 text-xs">Add agent directory URLs in the Context tab, then run the extraction.</p>
              )}
              {search.trim() && (
                <Button variant="ghost" size="sm" className="mt-2 gap-1.5 cursor-pointer" onClick={() => setSearch("")}>
                  <X className="h-3.5 w-3.5" />
                  Clear search
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {agents.map((agent) => (
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

        {total > 0 && (
          <Pagination
            page={page}
            total={total}
            limit={limit}
            onPageChange={setPage}
            align="end"
            onPageSizeChange={(next) => { setLimit(next); setPage(1); }}
          />
        )}
      </div>
    </div>
  );
}
