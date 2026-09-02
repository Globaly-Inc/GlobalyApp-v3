"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CURRENCY_CODES } from "../data/currency-rates";
import { useCurrency } from "./currency-context";

/**
 * Navbar currency picker. A DropdownMenu rather than the house Combobox: this is a tiny fixed enum
 * rendered inline in the header, where Combobox's h-10 searchable field is the wrong shape — same
 * exception AGENTS.md makes for the sharing-scope picker, and it matches the account menu beside it.
 */
export function CurrencySelect({ className }: Readonly<{ className?: string }>) {
  const { currency, setCurrency } = useCurrency();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Currency: ${currency}`}
            className={cn(
              "flex h-10 items-center gap-1 rounded-full border border-border px-3 text-sm font-medium",
              "text-foreground/80 hover:bg-muted hover:text-foreground cursor-pointer",
              className,
            )}
          />
        }
      >
        {currency}
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-32 p-1.5">
        {CURRENCY_CODES.map((code) => (
          <DropdownMenuItem
            key={code}
            className="cursor-pointer px-1.5 py-1.5 flex items-center justify-between"
            onClick={() => setCurrency(code)}
          >
            {code}
            {code === currency && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
