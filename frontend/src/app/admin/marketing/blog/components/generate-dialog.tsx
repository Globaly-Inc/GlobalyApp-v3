"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/combobox";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { COUNTRY_FILTER_OPTIONS, TOPIC_FILTER_TABS } from "../const";
import { startGeneration } from "../store/blog-slice";
import type { BlogTopic } from "../apis/types";

const COUNT_OPTIONS = [1, 2, 3, 4, 5];

export function GenerateDialog({
  open,
  onOpenChange,
  onStarted,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; onStarted: () => void }>) {
  const dispatch = useAppDispatch();
  const existingKeywords = useAppSelector((state) => state.marketingBlog.keywords);
  const [selected, setSelected] = useState<string[]>([]);
  const [context, setContext] = useState("");
  const [count, setCount] = useState(1);
  const [topic, setTopic] = useState<BlogTopic | "all">("all");
  const [country, setCountry] = useState("all");
  const [submitting, setSubmitting] = useState(false);

  const addKeyword = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || selected.includes(trimmed)) return;
    setSelected((prev) => [...prev, trimmed]);
  };

  const removeKeyword = (value: string) => setSelected((prev) => prev.filter((k) => k !== value));

  const reset = () => {
    setSelected([]);
    setContext("");
    setCount(1);
    setTopic("all");
    setCountry("all");
  };

  const handleSubmit = async () => {
    if (selected.length === 0) {
      toast.error("Add at least one keyword");
      return;
    }
    setSubmitting(true);
    const result = await dispatch(
      startGeneration({
        keywords: selected,
        context: context.trim() || undefined,
        count,
        topic: topic === "all" ? undefined : topic,
        country: country === "all" ? undefined : country,
      }),
    );
    setSubmitting(false);
    if (result.meta.requestStatus === "rejected") {
      toast.error("Something went wrong", { description: "Please try again." });
      return;
    }
    toast.success(`Generating ${count} blog post${count > 1 ? "s" : ""}…`);
    reset();
    onOpenChange(false);
    onStarted();
  };

  const keywordOptions = existingKeywords
    .filter((k) => !selected.includes(k.keyword))
    .map((k) => ({ value: k.keyword, label: k.keyword }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate with AI</DialogTitle>
          <DialogDescription>Gemini drafts the article and Higgsfield generates a cover. Review before publishing.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">Keywords</span>
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selected.map((k) => (
                  <Badge key={k} variant="secondary" className="gap-1 pr-1">
                    {k}
                    <button type="button" onClick={() => removeKeyword(k)} className="rounded-sm hover:bg-muted-foreground/20">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <Combobox
              value=""
              onChange={addKeyword}
              options={keywordOptions}
              creatable
              placeholder="Pick an existing keyword or type a new one…"
              searchPlaceholder="Search or type a new keyword…"
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">Context (optional)</span>
            <Textarea
              placeholder="Any specific angle, facts, or brief for the writer…"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">Count</span>
              <Select value={String(count)} onValueChange={(v) => setCount(Number(v))}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNT_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">Topic</span>
              <Combobox value={topic} onChange={(v) => setTopic(v as BlogTopic | "all")} options={TOPIC_FILTER_TABS} />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">Country</span>
              <Combobox value={country} onChange={setCountry} options={COUNTRY_FILTER_OPTIONS} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-1.5">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
