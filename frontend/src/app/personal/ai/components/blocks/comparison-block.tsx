"use client";

import type { ResponseBlock } from "../../apis/types";

type ComparisonBlockProps = {
  block: Extract<ResponseBlock, { type: "comparison" }>;
};

/** Side-by-side comparison table (courses, countries, careers, …). */
export function ComparisonBlock({ block }: ComparisonBlockProps) {
  return (
    <div className="w-full overflow-hidden rounded-xl border bg-card shadow-xs">
      {block.title && (
        <p className="border-b bg-muted/40 px-4 py-2.5 text-sm font-semibold">{block.title}</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/20">
              <th className="px-4 py-2 text-left font-medium text-muted-foreground" />
              {block.columns.map((col) => (
                <th key={col} className="px-4 py-2 text-left font-semibold">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => (
              <tr key={row.label} className="border-b last:border-b-0">
                <td className="px-4 py-2 font-medium text-muted-foreground">{row.label}</td>
                {block.columns.map((_, i) => (
                  <td key={i} className="px-4 py-2">{row.values[i] ?? "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
