"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

export function InvitesSearch({ value, onChange }: Readonly<{ value: string; onChange: (value: string) => void }>) {
  return (
    <div className="relative mb-4 w-full sm:max-w-sm">
      <Search aria-hidden className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        aria-label="Search invites"
        placeholder="Search by name or email…"
        autoComplete="off"
        className="h-10 pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
