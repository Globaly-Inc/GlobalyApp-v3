"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ComboboxOption = {
  value: string;
  label: string;
  icon?: ReactNode;
  /** Optional muted second line under the label. */
  description?: string;
};

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  optionsHeading,
  loading = false,
  loadingText = "Loading...",
  disabled = false,
  creatable = false,
  onQueryChange,
  id,
  className,
  contentClassName,
  "aria-invalid": ariaInvalid,
}: Readonly<{
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Small heading shown above the option list (e.g. "Existing"). */
  optionsHeading?: string;
  loading?: boolean;
  loadingText?: string;
  disabled?: boolean;
  creatable?: boolean;
  onQueryChange?: (query: string) => void;
  id?: string;
  className?: string;
  contentClassName?: string;
  "aria-invalid"?: boolean;
}>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.value === value);

  // autoFocus scrolls the page to wherever this input mounts (0,0 in the
  // portal) before floating-ui finishes positioning the popup, jumping the
  // whole page to the top. Focus manually once positioned, without scrolling.
  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true });
  }, [open]);

  const filtered = useMemo(
    () => options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())),
    [options, query]
  );

  const trimmedQuery = query.trim();
  const showCreateOption =
    creatable && trimmedQuery.length > 0 && !options.some((o) => o.label.toLowerCase() === trimmedQuery.toLowerCase());

  function select(option: ComboboxOption) {
    onChange(option.value);
    setOpen(false);
    setQuery("");
  }

  function createFromQuery() {
    onChange(trimmedQuery);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1 + (showCreateOption ? 1 : 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = filtered[activeIndex];
      if (option) select(option);
      else if (showCreateOption && activeIndex === filtered.length) createFromQuery();
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuery("");
          setActiveIndex(0);
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            ref={triggerRef}
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={ariaInvalid}
            disabled={disabled || loading}
            className={cn("w-full h-10 justify-between font-normal", className)}
          >
            {selected ? (
              <span className="flex items-center gap-2 truncate">
                {selected.icon}
                <span className="truncate">{selected.label}</span>
              </span>
            ) : creatable && value ? (
              <span className="truncate">{value}</span>
            ) : (
              <span className="text-muted-foreground">{loading ? loadingText : placeholder}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        }
      />
      {open && (
        <PopoverContent
          anchor={triggerRef}
          className={cn(contentClassName ? cn("min-w-(--anchor-width)", contentClassName) : "w-(--anchor-width)", "p-0")}
          align="start"
        >
          <div className="relative border-b p-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
            <Input
              ref={inputRef}
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
                onQueryChange?.(e.target.value);
              }}
              onKeyDown={onKeyDown}
              className="h-8 border-none pl-8 shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="max-h-[250px] overflow-y-auto p-1">
            {filtered.length === 0 && !showCreateOption ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
            ) : (
              <>
                {optionsHeading && filtered.length > 0 && (
                  <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{optionsHeading}</p>
                )}
                {filtered.map((option, index) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => select(option)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-hidden",
                      index === activeIndex && "bg-muted text-foreground"
                    )}
                  >
                    <Check className={cn("h-4 w-4 shrink-0", value === option.value ? "opacity-100" : "opacity-0")} />
                    {option.icon}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{option.label}</span>
                      {option.description && (
                        <span className="block truncate text-xs text-muted-foreground">{option.description}</span>
                      )}
                    </span>
                  </button>
                ))}
                {showCreateOption && (
                  <button
                    type="button"
                    onClick={createFromQuery}
                    onMouseEnter={() => setActiveIndex(filtered.length)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-hidden",
                      activeIndex === filtered.length && "bg-muted text-foreground"
                    )}
                  >
                    <Check className="h-4 w-4 shrink-0 opacity-0" />
                    <span className="truncate">Use &quot;{trimmedQuery}&quot;</span>
                  </button>
                )}
              </>
            )}
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}
