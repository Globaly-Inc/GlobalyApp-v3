"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, ChevronLeft, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BranchStepper } from "@/app/admin/platform/businesses/components/branches/branch-stepper";
import { STEPS } from "../const";
import {
  applyTabMapping, autoMapTabs, buildTemplateGroups, importPlan, tabMappingProblem, validateGroups,
} from "../utils";
import type { ImportStatus, InstitutionGroup, Sheet, TabMapping } from "../types";
import { spreadsheetImportApi } from "../apis";
import { UploadStep } from "./upload-step";
import { PreviewStep } from "./preview-step";
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
  const [groups, setGroups] = useState<InstitutionGroup[]>([]);
  const [existingNames, setExistingNames] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ImportStatus>>({});
  const [busy, setBusy] = useState(false);
  const [tabs, setTabs] = useState<Record<string, TabMapping>>({});
  const router = useRouter();

  // Dirty once a file is loaded, until every included institution has been queued.
  useEffect(() => {
    const included = groups.filter((g) => g.include);
    const allQueued = included.length > 0 && included.every((g) => statuses[g.id]?.state === "done");
    onDirtyChange?.(step > 0 && !allQueued);
  }, [step, groups, statuses, onDirtyChange]);

  const issues = useMemo(() => validateGroups(groups, existingNames), [groups, existingNames]);
  const plan = useMemo(() => importPlan(groups, issues), [groups, issues]);
  const importable = plan.filter((p) => p.rows.length > 0);
  const allQueued = importable.length > 0 && importable.every((p) => statuses[p.group.id]?.state === "done");
  // A job already sent (still staging, or done) can't take edits — "Check again" only watches it,
  // so going back to change the file, mapping or rows would look applied and silently not be.
  // Failed jobs don't lock: "Retry failed" re-sends the edited data and replaces them.
  const locked = Object.values(statuses).some((st) => st.state === "done" || (st.state === "importing" && !!st.jobId));

  const reset = () => {
    setStep(0); setSheets([]); setSelected([]);
    setGroups([]); setExistingNames([]); setStatuses({}); setTabs({});
  };

  const onParsed = (parsed: Sheet[], name: string) => {
    setSheets(parsed);
    setFileName(name);
    // Every workbook is read as a tab per section (Institution, Branch, Course, …).
    setTabs(autoMapTabs(parsed));
    setSelected(parsed.map((s) => s.name));
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
    if (step === 2) {
      const problem = tabMappingProblem(selected, tabs);
      if (problem) { toast.error(problem); return; }
      setBusy(true);
      try {
        // Mapped sheets include rows built from cross-section columns, so select them all by name.
        const mappedSheets = applyTabMapping(sheets, selected, tabs);
        const built = buildTemplateGroups(mappedSheets, mappedSheets.map((s) => s.name));
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
        // Staging finishes at "review" (courses await approval); "done" is from before that change.
        if (!job || !["review", "done", "failed"].includes(job.status)) continue;
        queued.delete(groupId);
        if (job.status === "failed") failed++;
        setStatuses((s) => ({
          ...s,
          [groupId]: job.status !== "failed" ? { state: "done", jobId } : { state: "failed", jobId, error: job.error ?? "Failed while importing" },
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
        // Rows the Validate step blocked, one entry per row with all its reasons.
        const blocked = new Map<number, string[]>();
        for (const i of issues) if (i.groupId === g.id && i.blocking && i.row > 0) blocked.set(i.row, [...(blocked.get(i.row) ?? []), i.message]);
        // Every row is reported by its workbook line, so history entries point at the admin's sheet.
        const lineOf = (i: number) => g.rowLines?.[i] ?? i + 1;
        const skipped = [
          ...(g.droppedCourses ?? []),
          ...[...blocked].map(([row, errs]) => ({ row: lineOf(row - 1), course: g.rows[row - 1]?.course_name ?? null, error: errs.join("; ") })),
        ];
        const row_lines = g.rows.map((_, i) => lineOf(i)).filter((_, i) => !blocked.has(i + 1));
        const { job_id } = await spreadsheetImportApi.importInstitution({ institution: { ...g.institution, name: g.name.trim() }, rows, extras: g.extras, skipped, row_lines });
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
            <PreviewStep sheets={sheets} fileName={fileName} selected={selected} onSelectedChange={setSelected} />
          )}
          {step === 2 && <TemplateMapStep sheets={sheets} selected={selected} tabs={tabs} onTabsChange={setTabs} />}
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
