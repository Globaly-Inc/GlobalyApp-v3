"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, ListChecks, PencilLine, ShieldCheck, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
// ponytail: borrowed from all-extractions (22 importers there) rather than moved to @/components.
import { useConfirmDelete } from "@/app/admin/data/all-extractions/components/use-confirm-delete";
import { SpreadsheetIllustration } from "./spreadsheet-illustration";
import { SpreadsheetImportWizard } from "./spreadsheet-import-wizard";

const HOW_IT_WORKS = [
  { icon: Download, title: "Download the template", text: "One tab for each part of an institution — the same tabs as an extraction." },
  { icon: PencilLine, title: "Fill it in", text: "One institution per file. Link fees, intakes and the rest to courses by name." },
  { icon: ListChecks, title: "Upload & validate", text: "Problems are flagged per row and fixable in place. Rows with errors are skipped." },
  { icon: ShieldCheck, title: "Approve", text: "The institution becomes an extraction; its courses wait for your approval." },
];

/** The template's tabs, in its order — each lands on the extraction tab of the same name. */
const TEMPLATE_TABS = [
  "Institution", "Branches", "Agents", "Courses", "Fees", "Intakes", "Eligibility",
  "Scholarships", "Study Units", "Study Options", "Accreditations",
];

export function SpreadsheetImportView() {
  const [open, setOpen] = useState(false);
  // A ref, not state: read inside onOpenChange, where a stale closure would miss the latest value.
  const dirtyRef = useRef(false);
  const { confirm, dialog: confirmDialog } = useConfirmDelete();

  const close = async (next: boolean) => {
    if (next) return setOpen(true);
    if (dirtyRef.current && !(await confirm(
      "Discard this import?",
      "The file, mapping and fixes you've made will be lost.",
      { confirmLabel: "Discard" },
    ))) return;
    dirtyRef.current = false;
    setOpen(false);
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <Card className="overflow-hidden">
        <CardContent className="grid items-center gap-8 p-6 md:grid-cols-[1.1fr_1fr] md:p-10">
          <div className="flex flex-col gap-4">
            <span className="flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <FileSpreadsheet className="h-3.5 w-3.5" /> Bulk import
            </span>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Import an institution from a spreadsheet</h1>
            <p className="text-sm text-muted-foreground md:text-base">
              Bring in a complete institution in one go — its profile, branches, agents, courses, fees, intakes,
              eligibility, scholarships, study units, study options and accreditations. Nothing goes public until you
              approve it.
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              <Button className="gap-1.5" onClick={() => setOpen(true)}>
                <Upload className="h-4 w-4" /> Import from spreadsheet
              </Button>
              <Button variant="outline" className="gap-1.5" render={<a href="/templates/institution-import-template.xlsx" download />}>
                <Download className="h-4 w-4" /> Download template
              </Button>
            </div>
          </div>
          <div className="rounded-2xl bg-primary/5 p-4 text-primary md:p-6">
            <SpreadsheetIllustration className="h-auto w-full" />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {HOW_IT_WORKS.map(({ icon: Icon, title, text }, i) => (
          <Card key={title}>
            <CardContent className="flex flex-col gap-2 p-5">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-xs font-medium text-muted-foreground">Step {i + 1}</span>
              </div>
              <p className="font-semibold">{title}</p>
              <p className="text-sm text-muted-foreground">{text}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-5">
          <p className="text-sm font-semibold">What you can import</p>
          <div className="flex flex-wrap gap-2">
            {TEMPLATE_TABS.map((t) => (
              <span key={t} className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> {t}
              </span>
            ))}
          </div>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-muted-foreground">
            <li>One institution per file — its name goes once, in the <strong>Institution</strong> tab.</li>
            <li>
              <strong>Course Names</strong> links a fee, intake, requirement or unit to courses — separate several with{" "}
              <code>;</code>, or leave it blank for every course.
            </li>
            <li>Only an institution name and at least one course are required. Fees with no currency default to USD.</li>
            <li>Not using the template? Upload your own sheet — you match its tabs and columns to ours before importing.</li>
          </ul>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={close}>
        {/* Full screen: the Validate step's tables are wide, and a centred modal would scroll both ways. */}
        <DialogContent showCloseButton={false} className="h-dvh max-h-dvh w-screen max-w-none overflow-hidden rounded-none border-0 p-6 sm:max-w-none">
          {/* A bare ✕ in the corner, as the AgentCIS importer has — not the dialog's boxed ghost button. */}
          <button type="button" aria-label="Close" onClick={() => close(false)} className="absolute top-4 right-4 cursor-pointer text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
          <DialogTitle className="sr-only">Spreadsheet import</DialogTitle>
          <DialogDescription className="sr-only">Upload, map, validate and import institutions from a spreadsheet.</DialogDescription>
          {/* Mounted only while open, so every opening starts a fresh import. */}
          {open && <SpreadsheetImportWizard onDirtyChange={(d) => { dirtyRef.current = d; }} />}
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  );
}
