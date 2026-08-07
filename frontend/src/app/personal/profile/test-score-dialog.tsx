"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { LanguageTest, LanguageTestInput } from "../apis/types";

const TEST_TYPES = ["IELTS", "TOEFL", "PTE", "Duolingo", "OET", "SAT", "GMAT", "ACT", "GRE", "LSAT"];

const SUB_SCORE_FIELDS: Record<string, string[]> = {
  IELTS: ["Reading", "Writing", "Listening", "Speaking"],
  TOEFL: ["Reading", "Writing", "Listening", "Speaking"],
  PTE: ["Reading", "Writing", "Listening", "Speaking"],
  Duolingo: ["Literacy", "Comprehension", "Conversation", "Production"],
  OET: ["Reading", "Writing", "Listening", "Speaking"],
  SAT: ["Math", "Reading & Writing"],
  GMAT: ["Quantitative", "Verbal", "Integrated Reasoning", "Analytical Writing"],
  ACT: ["English", "Math", "Reading", "Science"],
  GRE: ["Verbal", "Quantitative", "Analytical Writing"],
  LSAT: [],
};

function toInput(item: LanguageTest | null): LanguageTestInput {
  return {
    test_status: item?.test_status ?? "completed",
    test_type: item?.test_type ?? "",
    overall_score: item?.overall_score ?? "",
    test_date: item?.test_date ?? "",
    sub_scores: item?.sub_scores ?? {},
    sort_order: item?.sort_order ?? 0,
  };
}

export function TestScoreDialog({
  open,
  onOpenChange,
  item,
  onSave,
  saving,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: LanguageTest | null;
  onSave: (data: LanguageTestInput) => Promise<boolean>;
  saving: boolean;
}>) {
  const [form, setForm] = useState<LanguageTestInput>(() => toInput(item));

  const handleOpenChange = (next: boolean) => {
    if (next) setForm(toInput(item));
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!form.test_type) return;
    if (!(await onSave(form))) return;
    onOpenChange(false);
  };

  const subFields = form.test_type ? (SUB_SCORE_FIELDS[form.test_type] ?? []) : [];
  const completed = form.test_status === "completed";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Edit Test Score" : "Add Test Score"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Test Type</Label>
            <Select value={form.test_type ?? ""} onValueChange={(v) => setForm((f) => ({ ...f, test_type: v, sub_scores: {} }))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select test" /></SelectTrigger>
              <SelectContent>
                {TEST_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={completed ? "default" : "outline"}
              size="sm"
              onClick={() => setForm((f) => ({ ...f, test_status: "completed" }))}
            >
              Completed
            </Button>
            <Button
              type="button"
              variant={!completed ? "default" : "outline"}
              size="sm"
              onClick={() => setForm((f) => ({ ...f, test_status: "awaiting_results" }))}
            >
              Awaiting Results
            </Button>
          </div>
          {completed && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Overall Score</Label>
                  <Input
                    value={form.overall_score ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, overall_score: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Test Date</Label>
                  <Input
                    type="date"
                    value={form.test_date ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, test_date: e.target.value }))}
                  />
                </div>
              </div>
              {subFields.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {subFields.map((label) => {
                    const key = label.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
                    return (
                      <div className="space-y-2" key={key}>
                        <Label>{label}</Label>
                        <Input
                          value={form.sub_scores?.[key] ?? ""}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, sub_scores: { ...f.sub_scores, [key]: e.target.value } }))
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
