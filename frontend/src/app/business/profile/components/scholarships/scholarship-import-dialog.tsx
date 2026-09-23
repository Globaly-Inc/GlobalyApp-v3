"use client";

import { useEffect, useState } from "react";
import { read, utils } from "xlsx";
import { UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { categoriesApi, type CountryOption } from "@/app/admin/platform/categories/apis";
import { flagFromIso2 } from "@/app/admin/platform/categories/utils";
import { Combobox } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAppDispatch } from "@/lib/hooks";
import { businessProfileDetailApi } from "../../apis";
import type { ScholarshipInput } from "../../apis/types";
import { fetchScholarships } from "../../store/business-profile-detail-slice";
import { buildInputFromMapping, guessMapping, IMPORT_FIELDS, type ColumnMapping } from "@/app/admin/monitoring/scholarships/utils";
import { ImportMappingRow } from "@/app/admin/monitoring/scholarships/components/import-mapping-row";

// Same client-parses-the-spreadsheet, server-just-queues-rows flow as the superadmin editor's
// ScholarshipImportDialog — reuses its mapping utils/UI verbatim (pure, entity-agnostic), but
// talks to the business-scoped import endpoint so every row lands on this business's own id.
type Step = "select" | "map" | "importing" | "done";
type RowResult = { key: string; title: string; status: "ok" | "skipped" | "error"; detail?: string };
type ParsedRow = { sheet: string; row: number; data: Record<string, unknown> };

const POLL_INTERVAL_MS = 1000;

export function ScholarshipImportDialog({
  open,
  onOpenChange,
  businessId,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; businessId: number }>) {
  const dispatch = useAppDispatch();
  const [step, setStep] = useState<Step>("select");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [defaultCountry, setDefaultCountry] = useState("");
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<RowResult[]>([]);

  useEffect(() => {
    if (open && countries.length === 0) categoriesApi.getCountries().then(setCountries);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ignore: only re-checks the already-loaded flag, no reactive value to add
  }, [open]);

  const countryOptions = [{ value: "", label: "— None —" }, ...countries.map((c) => ({ value: c.name, label: `${flagFromIso2(c.iso2)} ${c.name}` }))];

  const reset = () => {
    setStep("select");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setDefaultCountry("");
    setResults([]);
  };

  const handleFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const workbook = read(buffer, { type: "array" });

    const allRows: ParsedRow[] = [];
    const headerSet = new Set<string>();
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const sheetRows = utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
      sheetRows.forEach((data, i) => {
        allRows.push({ sheet: sheetName, row: i + 2, data });
        Object.keys(data).forEach((h) => headerSet.add(h));
      });
    }

    const detectedHeaders = [...headerSet];
    setHeaders(detectedHeaders);
    setRows(allRows);
    setMapping(guessMapping(detectedHeaders));
    setStep("map");
  };

  const handleImport = async () => {
    setStep("importing");

    const skippedResults: RowResult[] = [];
    const inputs: ScholarshipInput[] = [];
    for (const { sheet, row, data } of rows) {
      const mapped = buildInputFromMapping(data, mapping, defaultCountry);
      if (mapped.status === "skipped") {
        skippedResults.push({ key: `${sheet}-${row}`, title: `${sheet} row ${row}`, status: "skipped", detail: mapped.reason });
      } else {
        inputs.push(mapped.input);
      }
    }
    setResults(skippedResults);
    setProgress({ done: skippedResults.length, total: rows.length });

    if (inputs.length === 0) {
      setStep("done");
      return;
    }

    try {
      const job = await businessProfileDetailApi.startScholarshipImport(inputs);
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        const current = await businessProfileDetailApi.getScholarshipImportJob(job.id);
        const rowResults: RowResult[] = current.results.map((r, i) => ({ key: `job-${i}`, title: r.title, status: r.status, detail: r.detail }));
        setResults([...skippedResults, ...rowResults]);
        setProgress({ done: skippedResults.length + current.processed_rows, total: rows.length });
        if (current.status === "completed" || current.status === "failed") break;
      }
      await dispatch(fetchScholarships({ id: businessId, params: {} }));
      setStep("done");
    } catch (e) {
      // Otherwise the dialog is stuck on "importing" forever — that step also blocks the Close
      // button, so a failed start/poll left the admin with no way out and no retry. Some rows
      // may already have been created by the time this failed; falling back to "map" (rather
      // than "done") makes that ambiguity visible instead of claiming success.
      toast.error("Import failed", { description: e instanceof Error ? e.message : "Please try again." });
      setStep("map");
    }
  };

  const ok = results.filter((r) => r.status === "ok").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "error").length;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (step !== "importing") { onOpenChange(next); if (!next) reset(); } }}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk import scholarships</DialogTitle>
        </DialogHeader>

        {step === "select" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Upload an .xlsx, .xls, or .csv file. You&apos;ll map its columns to our fields before anything is imported.
            </p>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground hover:bg-muted/50">
              <UploadCloud className="h-6 w-6" />
              Click to choose a spreadsheet
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </label>
          </div>
        )}

        {step === "map" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {rows.length} row{rows.length !== 1 ? "s" : ""} found. Map each field to a column — leave a field
              as &quot;None&quot; to skip it. Nothing is imported until you confirm below.
            </p>

            <div className="flex flex-col gap-3 rounded-md border border-border p-4">
              {IMPORT_FIELDS.map((field) => (
                <ImportMappingRow
                  key={field.key}
                  field={field}
                  headers={headers}
                  mapping={mapping}
                  onChange={(key, header) => setMapping((m) => ({ ...m, [key]: header || undefined }))}
                />
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="sch-import-country">Default country (used when Country column is empty)</Label>
              <Combobox
                id="sch-import-country"
                options={countryOptions}
                value={defaultCountry}
                onChange={setDefaultCountry}
                placeholder="— None —"
                creatable
              />
            </div>
          </div>
        )}

        {(step === "importing" || step === "done") && (
          <div className="flex flex-col gap-4">
            {step === "importing" && (
              <p className="text-sm text-muted-foreground">Importing {progress.done}/{progress.total}…</p>
            )}
            <div className="max-h-64 overflow-y-auto rounded-md border border-border">
              {results.map((r) => (
                <div key={r.key} className="flex items-center justify-between border-b border-border px-3 py-2 text-xs last:border-b-0">
                  <span className="truncate">{r.title}</span>
                  <span className={r.status === "ok" ? "text-green-600" : r.status === "skipped" ? "text-muted-foreground" : "text-destructive"}>
                    {r.status === "ok" ? "Created" : r.status === "skipped" ? r.detail : `Error: ${r.detail}`}
                  </span>
                </div>
              ))}
            </div>
            {step === "done" && <p className="text-sm text-foreground">{ok} created, {skipped} skipped, {failed} failed.</p>}
          </div>
        )}

        <DialogFooter>
          {step === "map" && (
            <>
              <Button variant="outline" onClick={reset}>Back</Button>
              <Button onClick={handleImport} disabled={!mapping.title}>Import {rows.length} row{rows.length !== 1 ? "s" : ""}</Button>
            </>
          )}
          {(step === "select" || step === "importing" || step === "done") && (
            <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }} disabled={step === "importing"}>
              {step === "importing" ? "Importing…" : "Close"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
