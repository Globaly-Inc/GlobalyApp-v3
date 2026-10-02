"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/combobox";
import { allExtractionsApi } from "../apis";
import { SITE_URL_CATEGORY_LABELS } from "../const";
import { SITE_URL_CATEGORIES, type SiteUrlCategory } from "../apis/types";

const OPTIONS = SITE_URL_CATEGORIES.filter((c) => c !== "other").map((c) => ({ value: c, label: SITE_URL_CATEGORY_LABELS[c] }));

/** Site Context tab: add one page or PDF URL to the job's site list, already categorised. */
export function AddSiteUrlForm({ jobId, onAdded }: Readonly<{ jobId: string; onAdded: () => void | Promise<void> }>) {
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<SiteUrlCategory>("fees");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = url.trim();
    if (!value) return;
    setBusy(true);
    try {
      await allExtractionsApi.addSiteUrl(jobId, value, category);
      toast.success("URL added", { description: `Filed under ${SITE_URL_CATEGORY_LABELS[category]} — the matching step reads it on its next run.` });
      setUrl("");
      await onAdded();
    } catch (err) {
      toast.error("Could not add URL", { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  // flex+gap, not space-y — see AGENTS.md on Combobox focus guards
  return (
    <form className="ml-auto flex items-center gap-1.5" onSubmit={submit}>
      <Input
        type="url" value={url} onChange={(e) => setUrl(e.target.value)}
        placeholder="https://… page or PDF" className="h-8 w-64 text-xs"
      />
      <Combobox className="w-40" options={OPTIONS} value={category} onChange={(v) => setCategory(v as SiteUrlCategory)} />
      <Button type="submit" size="sm" className="h-8 gap-1.5 cursor-pointer" disabled={busy || !url.trim()}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
      </Button>
    </form>
  );
}
