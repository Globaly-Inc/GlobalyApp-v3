"use client";

import { FileText, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** Summary-tab description editor with a "Write with AI" ghost button. */
export function DescriptionCard({
  description,
  onDescriptionChange,
  onWriteWithAi,
  generatingDescription,
}: Readonly<{
  description: string;
  onDescriptionChange: (value: string) => void;
  onWriteWithAi: () => void;
  generatingDescription: boolean;
}>) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card text-card-foreground transition-[box-shadow,border-color,transform] duration-300 hover:-translate-y-px hover:border-primary/20 hover:shadow-md">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3.5">
        <h2 className="flex items-center gap-2 font-sans text-sm font-bold tracking-normal">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="size-3.5" />
          </span>
          Description
        </h2>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={generatingDescription} onClick={onWriteWithAi}>
          {generatingDescription ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-primary" />}
          Write with AI
        </Button>
      </header>
      <div className="px-4 py-3.5">
        <Textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Describe the service..."
          rows={8}
          className="min-h-20"
        />
      </div>
    </section>
  );
}
