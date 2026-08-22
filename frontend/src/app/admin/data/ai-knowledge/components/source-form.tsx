"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CRAWL_FREQUENCY_OPTIONS, TRUST_TIER_OPTIONS } from "../const";
import type { CrawlFrequency, RackSource, SourceParams, TrustTier } from "../apis/types";

/** Add or edit a crawled URL source. Uploaded files use UploadSourceForm instead. */
export function SourceForm({
  source, categoryId, saving, onCancel, onSave,
}: Readonly<{
  source?: RackSource; categoryId: string; saving: boolean;
  onCancel: () => void; onSave: (v: SourceParams) => void;
}>) {
  const [url, setUrl] = useState(source?.url ?? "");
  const [title, setTitle] = useState(source?.title ?? "");
  const [trustTier, setTrustTier] = useState<TrustTier>(source?.trust_tier ?? "other");
  const [frequency, setFrequency] = useState<CrawlFrequency>(source?.crawl_frequency ?? "monthly");
  const [maxPages, setMaxPages] = useState(String(source?.max_pages ?? ""));
  const [active, setActive] = useState(source?.active ?? true);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <p className="font-semibold text-foreground">{source ? "Edit source" : "New source"}</p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>URL *</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://immi.homeaffairs.gov.au/visas/student" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Student visa hub" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Trust tier</Label>
            <Combobox
              options={TRUST_TIER_OPTIONS}
              value={trustTier}
              onChange={(v) => setTrustTier(v as TrustTier)}
              className="cursor-pointer"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Crawl frequency</Label>
            <Combobox
              options={CRAWL_FREQUENCY_OPTIONS}
              value={frequency}
              onChange={(v) => setFrequency(v as CrawlFrequency)}
              className="cursor-pointer"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Max pages per crawl</Label>
            <Input type="number" value={maxPages} onChange={(e) => setMaxPages(e.target.value)} placeholder="25" />
          </div>
        </div>

        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
          <Switch checked={active} onCheckedChange={setActive} />
          Active
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="outline" className="gap-1.5 cursor-pointer" onClick={onCancel}>
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
          <Button
            className="cursor-pointer" disabled={saving}
            onClick={() => {
              if (!url.trim()) { toast.error("URL is required"); return; }
              onSave({
                category_id: categoryId, url: url.trim(), title: title.trim() || null,
                trust_tier: trustTier, crawl_frequency: frequency,
                max_pages: maxPages.trim() ? Number(maxPages) : null, active,
              });
            }}
          >
            {source ? "Save changes" : "Add source"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
