"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, ChevronLeft, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BranchStepper } from "@/app/admin/platform/businesses/components/branches/branch-stepper";
import { DEFAULT_CURRENCY, STEPS, type InstitutionSource } from "../const";
import {
  applyTabMapping, autoMap, autoMapTabs, buildGroups, buildTemplateGroups, importPlan, isTabbedWorkbook, tabMappingProblem, validateGroups,
} from "../utils";
import type { Defaults, ImportStatus, InstitutionGroup, Mapping, Sheet, TabMapping } from "../types";
import { spreadsheetImportApi } from "../apis";
import { UploadStep } from "./upload-step";
import { PreviewStep } from "./preview-step";
import { MapStep } from "./map-step";
import { TemplateMapStep } from "./template-map-step";
import { ValidateStep } from "./validate-step";
import { FinalizeStep } from "./finalize-step";

const POLL_INTERVAL_MS = 2000;
/** Long enough for a large catalogue; past it the wizard stops waiting and points at All Extractions. */
const POLL_TIMEOUT_MS = 5 * 60_000;

/** Mirrors the AgentCIS contacts importer: Upload → Preview → Map → Validate → Finalize.
 * `onDirtyChange` lets the full-screen dialog confirm before throwing away an import in progress. */
export function SpreadsheetImportWizard({ onDirtyChange }: Readonly<{ onDirtyChange?: (dirty: boolean) => void }>) {
  const [step, setStep] = useState(0);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [fileName, setFileName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [source, setSource] = useState<InstitutionSource>("sheet");
  const [mapping, setMapping] = useState<Mapping>({});
  const [defaults, setDefaults] = useState<Defaults>({});
  const [groups, setGroups] = useState<InstitutionGroup[]>([]);
  const [existingNames, setExistingNames] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ImportStatus>>({});
  const [busy, setBusy] = useState(false);
  /** Tab-per-section layout (our template, or a workbook shaped like it) rather than a course per row. */
  const [template, setTemplate] = useState(false);
  const [tabs, setTabs] = useState<Record<string, TabMapping>>({});
  const router = useRouter();

  // Dirty once a file is loaded, until every included institution has been queued.
  useEffect(() => {
    const included = groups.filter((g) => g.include);
    const allQueued = included.length > 0 && included.every((g) => statuses[g.id]?.state === "done");
    onDirtyChange?.(step > 0 && !allQueued);
  }, [step, groups, statuses, onDirtyChange]);

  // Union of the selected tabs' headers, in first-seen order — tabs of one workbook share a layout.
  const headers = useMemo(
    () => [...new Set(sheets.filter((s) => selected.includes(s.name)).flatMap((s) => s.headers))],
    [sheets, selected],
  );
  const issues = useMemo(() => validateGroups(groups, existingNames), [groups, existingNames]);
  const plan = useMemo(() => importPlan(groups, issues), [groups, issues]);
  const importable = plan.filter((p) => p.rows.length > 0);
  const allQueued = importable.length > 0 && importable.every((p) => statuses[p.group.id]?.state === "done");
  // A job already sent (still staging, or done) can't take edits — "Check again" only watches it,
  // so going back to change the file, mapping or rows would look applied and silently not be.
  // Failed jobs don't lock: "Retry failed" re-sends the edited data and replaces them.
  const locked = Object.values(statuses).some((st) => st.state === "done" || (st.state === "importing" && !!st.jobId));

  const reset = () => {
    setStep(0); setSheets([]); setSelected([]); setMapping({}); setDefaults({});
    setGroups([]); setExistingNames([]); setStatuses({}); setTabs({});
  };

  const onParsed = (parsed: Sheet[], name: string) => {
    setSheets(parsed);
    setFileName(name);
    setTemplate(isTabbedWorkbook(parsed));
    setTabs(autoMapTabs(parsed));
    setSelected(parsed.map((s) => s.name));
    const auto = autoMap([...new Set(parsed.flatMap((s) => s.headers))]);
    setMapping(auto);
    // No currency column → USD, shown as an editable default rather than applied silently.
    const mapped = new Set(Object.values(auto));
    // A column naming the institution beats the tab name — Excel cuts tab names at 31 characters.
    setSource(mapped.has("institution_name") ? "column" : "sheet");
    const mapsTuition = ["fee_amount", "domestic_fee_amount", "both_fee_amount"].some((k) => mapped.has(k));
    setDefaults(mapsTuition && !mapped.has("fee_currency") ? { fee_currency: DEFAULT_CURRENCY } : {});
    setStep(1);
  };

  /** Names are re-checked on every forward move: a rename can collide as easily as the original. */
  const checkNames = async (gs: InstitutionGroup[]) => {
    const names = [...new Set(gs.filter((g) => g.include && g.name.trim()).map((g) => g.name.trim()))];
    // The endpoint takes at most 200 names per call (SpreadsheetCheckNamesSchema).
    const batches = Array.from({ length: Math.ceil(names.length / 200) }, (_, i) => names.slice(i * 200, i * 200 + 200));
    const existing = (await Promise.all(batches.map((b) => spreadsheetImportApi.checkNames(b)))).flat();
    setExistingNames(existing);
    return existing;
  };

  const next = async () => {
    if (step === 1 && selected.length === 0) { toast.error("Select at least one tab"); return; }
    if (step === 2 && template) {
      const problem = tabMappingProblem(selected, tabs);
      if (problem) { toast.error(problem); return; }
      setBusy(true);
      try {
        const built = buildTemplateGroups(applyTabMapping(sheets, selected, tabs), selected);
        // One institution per workbook: the Institution tab names exactly one.
        if (built.length !== 1) {
          toast.error("One institution at a time", {
            description: `The Institution tab lists ${built.length}: ${built.map((g) => g.name || "(blank)").slice(0, 5).join(", ")}${built.length > 5 ? "…" : ""}. Keep one institution per file.`,
          });
          return;
        }
        setGroups(built);
        setStatuses({});
        await checkNames(built);
        setStep(3);
      } catch (e) {
        toast.error("Couldn't check institution names", { description: (e as Error).message });
      } finally {
        setBusy(false);
      }
      return;
    }
    if (step === 2) {
      const mapped = new Set(Object.values(mapping));
      if (!mapped.has("course_name")) { toast.error("Map a column to Course name"); return; }
      if (source === "column" && !mapped.has("institution_name")) { toast.error("Map a column to Institution name, or take names from the tab"); return; }
      setBusy(true);
      try {
        const built = buildGroups(sheets, selected, mapping, defaults, source);
        setGroups(built);
        setStatuses({});
        await checkNames(built);
      } catch (e) {
        { toast.error("Couldn't check institution names", { description: (e as Error).message }); return; }
      } finally {
        setBusy(false);
      }
    }
    if (step === 3) {
      setBusy(true);
      try {
        const existing = await checkNames(groups);
        if (importPlan(groups, validateGroups(groups, existing)).every((p) => p.rows.length === 0)) {
          toast.error("Nothing to import", { description: "Every row or institution has an error." });
          return;
        }
      } catch (e) {
        { toast.error("Couldn't check institution names", { description: (e as Error).message }); return; }
      } finally {
        setBusy(false);
      }
    }
    setStep((s) => s + 1);
  };

  // The request only QUEUES a job; the worker stages it later. Wait for each job to settle before
  // calling it a success, so a failure while staging keeps the wizard (file, mapping, fixes) open
  // for "Retry failed" — which replaces the failed job (startImport).
  /** Returns how many jobs failed while staging; any still in `queued` afterwards timed out. */
  const waitForJobs = async (queued: Map<string, string>) => {
    let failed = 0;
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (queued.size && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      for (const [groupId, jobId] of queued) {
        const job = await spreadsheetImportApi.getJobStatus(jobId).catch(() => null);
        if (job?.status !== "done" && job?.status !== "failed") continue;
        queued.delete(groupId);
        if (job.status === "failed") failed++;
        setStatuses((s) => ({
          ...s,
          [groupId]: job.status === "done" ? { state: "done", jobId } : { state: "failed", jobId, error: job.error ?? "Failed while importing" },
        }));
      }
    }
    return failed;
  };

  // One request per institution, in order — a failure (e.g. a name taken meanwhile) doesn't stop the rest.
  const runImport = async () => {
    setBusy(true);
    const queued = new Map<string, string>();
    let failed = 0;
    for (const { group: g, rows } of importable.filter((p) => statuses[p.group.id]?.state !== "done")) {
      // Still staging when the last wait timed out: its job exists and holds the name — resume
      // watching it rather than submitting the institution again (the backend would refuse).
      const pending = statuses[g.id];
      if (pending?.state === "importing" && pending.jobId) { queued.set(g.id, pending.jobId); continue; }
      setStatuses((s) => ({ ...s, [g.id]: { state: "importing" } }));
      try {
        const { job_id } = await spreadsheetImportApi.importInstitution({ institution: { ...g.institution, name: g.name.trim() }, rows, extras: g.extras });
        queued.set(g.id, job_id);
        setStatuses((s) => ({ ...s, [g.id]: { state: "importing", jobId: job_id } }));
      } catch (e) {
        failed++;
        setStatuses((s) => ({ ...s, [g.id]: { state: "failed", error: (e as Error).message } }));
      }
    }
    const sent = queued.size;
    failed += await waitForJobs(queued);
    setBusy(false);
    if (failed) { toast.error(`${failed} institution${failed === 1 ? "" : "s"} failed to import`); return; }
    if (queued.size) {
      toast.info("Still importing", { description: "Staging is taking a while — check All Extractions for the result." });
      return;
    }
    onDirtyChange?.(false);
    toast.success("Import successful", {
      description: `${sent} institution${sent === 1 ? "" : "s"} imported — courses await your approval.`,
    });
    router.push("/admin/data/all-extractions");
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-6">
          {/* Stepper capped at 7xl like the rest of the admin; the step content below stays full width. */}
          <div className="mx-auto w-full max-w-7xl">
            <BranchStepper steps={STEPS} current={step} />
          </div>

          {/* Same place as the AgentCIS importer's: a quiet link under the stepper, not a footer button. */}
          {step > 0 && (
            <button
              type="button"
              disabled={busy || locked}
              title={locked ? "Already sent for import — edits wouldn't apply. Use Start over for a new import." : undefined}
              onClick={() => setStep((s) => s - 1)}
              className="-mb-2 flex w-fit cursor-pointer items-center gap-1 text-sm font-medium text-primary disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
          )}

          {/* The step fills the space between the stepper and the footer, and scrolls inside it. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
          {step === 0 && <UploadStep onParsed={onParsed} />}
          {step === 1 && (
            <PreviewStep sheets={sheets} fileName={fileName} selected={selected} onSelectedChange={setSelected} source={source} onSourceChange={setSource} template={template} onTemplateChange={setTemplate} />
          )}
          {step === 2 && template && <TemplateMapStep sheets={sheets} selected={selected} tabs={tabs} onTabsChange={setTabs} />}
          {step === 2 && !template && (
            <MapStep headers={headers} mapping={mapping} onMappingChange={setMapping} defaults={defaults} onDefaultsChange={setDefaults} source={source} />
          )}
          {step === 3 && <ValidateStep groups={groups} onGroupsChange={setGroups} issues={issues} onEditMapping={() => setStep(2)} />}
          {step === 4 && <FinalizeStep plan={plan} issues={issues} statuses={statuses} />}
          </div>

          {step > 0 && (
            <div className="flex items-center justify-between border-t pt-4">
              <div className="flex gap-2">
                <Button variant="ghost" disabled={busy} onClick={reset} className="gap-1.5">
                  <RotateCcw className="h-4 w-4" /> Start over
                </Button>
              </div>
              {/* In the footer, not the step body, so the action never scrolls out of view. */}
              {step === 4 && (
                <Button disabled={busy || importable.length === 0 || allQueued} onClick={runImport} className="gap-1.5">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {Object.keys(statuses).length === 0 || busy
                    ? `Import ${importable.length} institution${importable.length === 1 ? "" : "s"}`
                    : Object.values(statuses).some((st) => st.state === "failed") ? "Retry failed" : "Check again"}
                </Button>
              )}
              {step < 4 && (
                <Button disabled={busy || (step === 3 && importable.length === 0)} onClick={next} className="gap-1.5">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {step === 2 ? "Let's validate data" : step === 3 ? "Continue to import" : "Next"} <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
    </div>
  );
}
