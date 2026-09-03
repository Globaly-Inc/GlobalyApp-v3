"use client";

import { useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { aiKnowledgeApi } from "../apis";
import { TRUST_TIER_OPTIONS } from "../const";
import type { TrustTier } from "../apis/types";

/** Inline card matching SourceForm: pick a PDF/TXT/MD file, extract + embed it server-side. */
export function UploadSourceForm({
  categoryId, onCancel, onDone,
}: Readonly<{ categoryId: string; onCancel: () => void; onDone: () => void }>) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [trustTier, setTrustTier] = useState<TrustTier>("other");
  const [uploading, setUploading] = useState(false);

  const submit = async () => {
    if (!file) { toast.error("Choose a file to upload"); return; }
    setUploading(true);
    try {
      const result = await aiKnowledgeApi.uploadSource(categoryId, file, {
        title: title.trim() || undefined, trust_tier: trustTier,
      });
      const chunks = `${result.chunks} chunk${result.chunks === 1 ? "" : "s"}`;
      // Re-uploading a filename replaces it. Say so — an admin who thinks they
      // added a second copy will go looking for one to delete.
      toast.success(
        result.unchanged
          ? `Already up to date — content unchanged, ${chunks} kept`
          : result.replaced
            ? `Updated — replaced the previous version, ${chunks}, ${result.embedded} embedded`
            : `Uploaded — ${chunks}, ${result.embedded} embedded`,
      );
      onDone();
    } catch (e) {
      toast.error("Upload failed", { description: (e as Error).message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <p className="font-semibold text-foreground">Upload document</p>
        <p className="-mt-2 text-xs text-muted-foreground">
          Uploading a file name that already exists in this category updates it in place —
          the old version and its chunks are replaced, not duplicated.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>File * (PDF, TXT or MD)</Label>
            <Input
              type="file"
              accept=".pdf,.txt,.md"
              className="cursor-pointer"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Defaults to the file name" />
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
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" className="gap-1.5 cursor-pointer" disabled={uploading} onClick={onCancel}>
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
          <Button className="gap-1.5 cursor-pointer" disabled={uploading} onClick={submit}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {uploading ? "Extracting…" : "Upload"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
