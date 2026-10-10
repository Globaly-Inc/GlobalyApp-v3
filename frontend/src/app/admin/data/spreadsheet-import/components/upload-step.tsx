"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, FileSpreadsheet, Loader2, UploadCloud } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MAX_FILE_MB } from "../const";
import { parseWorkbook } from "../utils";
import type { Sheet } from "../types";

const CHECKLIST = [
  "One institution per file — its name goes in the Institution tab.",
  "At least one course in the Courses tab.",
  "Course Names on the other tabs match the Courses tab — separate several with ; or leave blank for every course.",
  "Tabs you don't need can stay empty. Fees without a currency are saved in USD.",
];

export function UploadStep({ onParsed }: Readonly<{ onParsed: (sheets: Sheet[], fileName: string) => void }>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error("File too large", { description: `The limit is ${MAX_FILE_MB} MB.` });
      return;
    }
    setParsing(true);
    try {
      const sheets = await parseWorkbook(file);
      if (sheets.length === 0) toast.error("No data found", { description: "Every tab is empty or has no header row." });
      else onParsed(sheets, file.name);
    } catch (e) {
      toast.error("Couldn't read the file", { description: (e as Error).message });
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">Upload your spreadsheet</h2>
        <p className="text-sm text-muted-foreground">
          Our template, or your own sheet — next you&apos;ll match its tabs and columns to ours, then fix any problems
          before anything is saved. Imported courses stay hidden until you approve them.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
          className={cn(
            "flex min-h-64 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center",
            dragging ? "border-primary bg-primary/5" : "border-border",
          )}
        >
          {parsing ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <UploadCloud className="h-8 w-8 text-primary" />}
          <p className="text-sm">Drag your file here or <span className="font-semibold text-primary">Browse</span></p>
          <p className="text-xs text-muted-foreground">.xlsx, .xls or .csv — up to {MAX_FILE_MB} MB</p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </button>

        <Card>
          <CardContent className="flex flex-col gap-3 p-4 text-sm">
            <p className="flex items-center gap-2 font-medium"><FileSpreadsheet className="h-4 w-4" /> Before you upload</p>
            <ul className="flex flex-col gap-2 text-muted-foreground">
              {CHECKLIST.map((item) => (
                <li key={item} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="border-t pt-3 text-xs text-muted-foreground">
              Rows with problems aren&apos;t lost — they&apos;re flagged so you can fix them, and the rest still import.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
