"use client";

import { useState } from "react";
import { Slider } from "@/components/ui/slider";

const MAX_FEE = 100000;
const PRESETS: { label: string; min: number; max: number }[] = [
  { label: "Under 20k", min: 0, max: 20000 },
  { label: "20k – 40k", min: 20000, max: 40000 },
  { label: "40k+", min: 40000, max: MAX_FEE },
];

const fieldClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

export function BudgetFilter({ min, max }: Readonly<{ min?: number; max?: number }>) {
  const [range, setRange] = useState<[number, number]>([min ?? 0, max ?? MAX_FEE]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setRange([p.min, p.max])}
            className="rounded-full border border-input px-3 py-1 text-xs text-foreground hover:bg-accent"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label htmlFor="fee_min" className="text-[11px] text-muted-foreground uppercase tracking-wide">Min (AUD)</label>
          <input
            id="fee_min"
            type="number"
            name="fee_min"
            min={0}
            value={range[0]}
            onChange={(e) => setRange([Number(e.target.value) || 0, range[1]])}
            className={fieldClass}
          />
        </div>
        <div className="flex-1">
          <label htmlFor="fee_max" className="text-[11px] text-muted-foreground uppercase tracking-wide">Max (AUD)</label>
          <input
            id="fee_max"
            type="number"
            name="fee_max"
            min={0}
            value={range[1]}
            onChange={(e) => setRange([range[0], Number(e.target.value) || 0])}
            className={fieldClass}
          />
        </div>
      </div>

      <Slider
        value={range}
        onValueChange={(v) => setRange(v as [number, number])}
        min={0}
        max={MAX_FEE}
        step={1000}
      />
      <div className="flex justify-between text-[10px] text-muted-foreground -mt-2">
        <span>$0</span>
        <span>${MAX_FEE / 1000}k+</span>
      </div>
    </div>
  );
}
