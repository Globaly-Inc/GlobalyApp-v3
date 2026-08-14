"use client";

import { useEffect, useState } from "react";
import { Brain, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { aiKnowledgeApi } from "../apis";
import type { RackDocumentDetail } from "../apis/types";

/**
 * Split from the Sheet so it can be keyed by id: remounting resets loading/document
 * state without an effect having to set it, which is what React wants.
 */
function DocumentBody({ documentId }: Readonly<{ documentId: string }>) {
  const [document, setDocument] = useState<RackDocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    aiKnowledgeApi
      .getDocument(documentId)
      .then((doc) => { if (!cancelled) setDocument(doc); })
      .catch((e: Error) => { if (!cancelled) toast.error("Failed to load document", { description: e.message }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [documentId]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!document) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">Document could not be loaded.</p>;
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="pr-6 text-base">{document.title ?? "Document"}</SheetTitle>
        <SheetDescription className="break-all">{document.url}</SheetDescription>
      </SheetHeader>

      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <Badge
          className={`gap-1 text-[10px] ${document.is_embedded ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}
        >
          <Brain className="h-3 w-3" />
          {document.is_embedded ? "In brain" : "Not embedded"}
        </Badge>
        <Badge variant="outline" className="text-[10px]">{document.word_count} words</Badge>
        <Badge variant="outline" className="text-[10px]">
          Crawled {new Date(document.crawled_at).toLocaleString()}
        </Badge>
      </div>

      {/* Raw markdown on purpose — this is what the model is given, so it is
          what a reviewer needs to see. */}
      <pre className="flex-1 overflow-auto whitespace-pre-wrap break-words border-t border-border px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        {document.markdown}
      </pre>
    </>
  );
}

/** Shows a crawled document's markdown — the body is only fetched on open. */
export function DocumentDrawer({
  documentId, onClose,
}: Readonly<{ documentId: string | null; onClose: () => void }>) {
  return (
    <Sheet open={!!documentId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-2xl">
        {documentId && <DocumentBody key={documentId} documentId={documentId} />}
      </SheetContent>
    </Sheet>
  );
}
