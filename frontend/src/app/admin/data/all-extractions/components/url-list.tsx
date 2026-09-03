"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** A growable list of URL inputs for one guided-URL bucket. */
export function UrlList({
  id,
  values,
  onChange,
}: Readonly<{ id: string; values: string[]; onChange: (next: string[]) => void }>) {
  // Always render at least one input so an empty bucket still has somewhere to type.
  const rows = values.length > 0 ? values : [""];

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((url, index) => (
        // Index key on purpose: rows are positional and two blank rows are indistinguishable.
        <div key={index} className="flex items-center gap-1.5">
          <Input
            id={index === 0 ? id : undefined}
            type="url"
            placeholder="https://university.edu/…"
            value={url}
            onChange={(e) => onChange(rows.map((r, i) => (i === index ? e.target.value : r)))}
          />
          {rows.length > 1 && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 cursor-pointer"
              title="Remove URL"
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-fit gap-1 px-1.5 text-xs cursor-pointer"
        onClick={() => onChange([...rows, ""])}
      >
        <Plus className="h-3 w-3" />
        Add URL
      </Button>
    </div>
  );
}
