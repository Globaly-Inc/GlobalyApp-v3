"use client";

import { FileText, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormSection } from "@/components/ui/form-section";

/** Summary-tab description editor with a "Write with AI" button. */
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
    <FormSection
      title={<><FileText /> Description</>}
      columns={1}
      action={
        <Button variant="outline" size="sm" className="gap-1.5" disabled={generatingDescription} onClick={onWriteWithAi}>
          {generatingDescription ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-primary" />}
          Write with AI
        </Button>
      }
    >
      <Textarea
        aria-label="Description"
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        placeholder="Describe the service..."
        rows={8}
        className="min-h-20"
      />
    </FormSection>
  );
}
