"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WidgetAnalytics } from "../../apis/types";

type Row = WidgetAnalytics["monthly"][number];
type Key = Exclude<keyof Row, "month">;

/**
 * One titled series over the six months, with the same numbers available as a table underneath.
 * The table is not a fallback for a broken chart — it is how someone reads exact values, and how
 * anyone not using a pointer reads the series at all.
 */
export function MonthlyChart({
  title, rows, series, kind, id,
}: Readonly<{ title: string; rows: Row[]; series: Key; kind: "bar" | "area"; id: string }>) {
  const axis = { tick: { fontSize: 11 }, className: "text-muted-foreground" } as const;
  const tooltip = (
    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }} />
  );

  return (
    <section>
      <h3 className="mb-2 text-xs font-medium text-muted-foreground">{title}</h3>

      <ResponsiveContainer width="100%" height={200}>
        {kind === "bar" ? (
          <BarChart data={rows} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis dataKey="month" {...axis} />
            <YAxis {...axis} width={48} allowDecimals={false} />
            {tooltip}
            <Bar dataKey={series} name={title} fill="var(--primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        ) : (
          <AreaChart data={rows} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="month" {...axis} />
            <YAxis {...axis} width={48} allowDecimals={false} />
            {tooltip}
            <Area type="monotone" dataKey={series} name={title} stroke="var(--primary)" fill={`url(#${id}-fill)`} strokeWidth={2} dot={false} />
          </AreaChart>
        )}
      </ResponsiveContainer>

      <details className="mt-1">
        <summary className="inline-flex cursor-pointer list-none items-center text-xs font-medium text-primary hover:underline">
          View as a table
        </summary>
        <table className="mt-2 w-full text-xs">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="text-muted-foreground">
              <th scope="col" className="py-1 text-left font-medium">Month</th>
              <th scope="col" className="py-1 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.month} className="border-t border-border">
                <td className="py-1">{row.month}</td>
                <td className="py-1 text-right tabular-nums">{row[series].toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
