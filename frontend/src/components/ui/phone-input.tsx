"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parsePhoneNumberFromString, getCountries, getCountryCallingCode, AsYouType } from "libphonenumber-js";
import type { CountryCode } from "libphonenumber-js";
import { ChevronDown, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

// ── helpers ──────────────────────────────────────────────────────────────────

export function flagEmoji(iso2: string): string {
  // Regional indicator symbols: offset from 'A' (0x41) → 0x1F1E6
  return [...iso2.toUpperCase()]
    .map((c) => String.fromCodePoint(c.codePointAt(0)! - 0x41 + 0x1f1e6))
    .join("");
}

/** Split a stored phone string like "+61 412 345 678" into dial-code + local number. */
function splitPhone(value: string): { dialCode: string; local: string } {
  if (!value.trim()) return { dialCode: "", local: "" };
  try {
    const parsed = parsePhoneNumberFromString(value);
    if (parsed) {
      return {
        dialCode: `+${parsed.countryCallingCode}`,
        local: parsed.nationalNumber,
      };
    }
  } catch { /* fall through */ }
  // Fallback: value might just be a bare local number stored from before
  return { dialCode: "", local: value };
}

// ── types ────────────────────────────────────────────────────────────────────

type DialOption = {
  iso2: CountryCode;
  dialCode: string;   // "+61"
  label: string;      // "Australia (+61)"
  flag: string;       // emoji
};

// ── build option list once ───────────────────────────────────────────────────

const ALL_DIAL_OPTIONS: DialOption[] = getCountries()
  .map((iso2) => {
    try {
      const code = `+${getCountryCallingCode(iso2)}`;
      return { iso2, dialCode: code, label: `${iso2} (${code})`, flag: flagEmoji(iso2) };
    } catch {
      return null;
    }
  })
  .filter(Boolean)
  .sort((a, b) => a!.label.localeCompare(b!.label)) as DialOption[];

// ── component ─────────────────────────────────────────────────────────────────

export interface PhoneInputProps {
  /** Controlled full value, e.g. "+61412345678" or "+61 412 345 678" */
  value: string;
  onChange: (value: string) => void;
  /** Pre-select a dial code based on a country name, e.g. "Australia" */
  preferredCountryName?: string;
  placeholder?: string;
  id?: string;
  "aria-invalid"?: boolean;
  className?: string;
  disabled?: boolean;
}

export function PhoneInput({
  value,
  onChange,
  preferredCountryName,
  placeholder = "Phone number",
  id,
  "aria-invalid": ariaInvalid,
  className,
  disabled,
}: Readonly<PhoneInputProps>) {
  // Parse initial value once
  const initial = useMemo(() => splitPhone(value), []);  // eslint-disable-line react-hooks/exhaustive-deps

  const [dialCode, setDialCode] = useState(initial.dialCode);
  const [localNumber, setLocalNumber] = useState(initial.local);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // When the selected country (in the parent form) changes, pre-fill the dial code
  // if none has been chosen yet.
  useEffect(() => {
    if (dialCode || !preferredCountryName) return;
    const match = ALL_DIAL_OPTIONS.find((o) =>
      preferredCountryName.toLowerCase().includes(o.iso2.toLowerCase()) ||
      o.label.toLowerCase().startsWith(preferredCountryName.toLowerCase().slice(0, 3))
    );
    if (match) setDialCode(match.dialCode);
  }, [preferredCountryName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (dropdownOpen) {
      setTimeout(() => searchRef.current?.focus({ preventScroll: true }), 50);
    } else {
      setSearch("");
    }
  }, [dropdownOpen]);

  const filtered = useMemo(
    () =>
      search.trim()
        ? ALL_DIAL_OPTIONS.filter(
            (o) =>
              o.label.toLowerCase().includes(search.toLowerCase()) ||
              o.dialCode.includes(search)
          )
        : ALL_DIAL_OPTIONS,
    [search]
  );

  const selectedOption = ALL_DIAL_OPTIONS.find((o) => o.dialCode === dialCode);

  const emit = (code: string, local: string) => {
    if (!code && !local) { onChange(""); return; }
    if (!code) { onChange(local); return; }
    // Format as user types using AsYouType for a nice display, but emit raw concatenation
    // so the parent can store a parseable string.
    const formatted = new AsYouType().input(`${code}${local.replace(/\D/g, "")}`);
    onChange(formatted || `${code}${local}`);
  };

  const handleDialSelect = (option: DialOption) => {
    setDialCode(option.dialCode);
    setDropdownOpen(false);
    emit(option.dialCode, localNumber);
  };

  const handleLocalChange = (raw: string) => {
    // Allow digits, spaces, hyphens, parens
    const sanitized = raw.replace(/[^\d\s\-().+]/g, "");
    setLocalNumber(sanitized);
    emit(dialCode, sanitized);
  };

  return (
    <div ref={containerRef} className={cn("relative flex h-10 rounded-lg border border-input bg-transparent focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50", ariaInvalid && "border-destructive ring-3 ring-destructive/20", disabled && "pointer-events-none opacity-50", className)}>
      {/* ── Dial-code selector ── */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setDropdownOpen((o) => !o)}
        className="flex shrink-0 cursor-pointer items-center gap-1.5 border-r border-input pl-2.5 pr-2 text-sm text-foreground hover:bg-muted/40 rounded-l-lg transition-colors"
      >
        {selectedOption ? (
          <>
            <span className="text-base leading-none">{selectedOption.flag}</span>
            <span className="text-xs text-muted-foreground">{selectedOption.dialCode}</span>
          </>
        ) : (
          <Phone className="h-4 w-4 text-muted-foreground" />
        )}
        <ChevronDown className="h-3 w-3 text-muted-foreground opacity-60" />
      </button>

      {/* ── Number field ── */}
      <input
        id={id}
        type="tel"
        inputMode="tel"
        value={localNumber}
        onChange={(e) => handleLocalChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        className="min-w-0 flex-1 rounded-r-lg bg-transparent px-2.5 py-1 text-sm outline-none placeholder:text-muted-foreground"
      />

      {/* ── Dropdown ── */}
      {dropdownOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          <div className="border-b border-border p-1.5">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search country..."
              className="w-full rounded-md bg-muted/50 px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">No results</p>
            )}
            {filtered.map((opt) => (
              <button
                key={opt.iso2}
                type="button"
                onClick={() => handleDialSelect(opt)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted",
                  dialCode === opt.dialCode && "bg-muted font-medium"
                )}
              >
                <span className="text-sm">{opt.flag}</span>
                <span className="flex-1 truncate">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
