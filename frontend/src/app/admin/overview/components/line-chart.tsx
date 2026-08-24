"use client";

import type { ChartPoint } from "../types";

// ponytail: tiny SVG line chart instead of recharts — swap in a chart lib if tooltips/zoom get requested
const H = 280;
const PAD = { top: 10, right: 12, bottom: 28, left: 40 };

export function LineChart({
  data,
  color,
  wide = false,
}: Readonly<{ data: ChartPoint[]; color: string; wide?: boolean }>) {
  // SVG scales with container width keeping aspect ratio — full-width charts need a wider viewBox
  const W = wide ? 1200 : 600;
  const max = Math.max(1, ...data.map((d) => d.count));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (data.length > 1 ? (i / (data.length - 1)) * innerW : innerW / 2);
  const y = (c: number) => PAD.top + innerH - (c / max) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const labelSkip = data.length > 15 ? Math.ceil(data.length / 8) : 1;
  const polyline = data.map((d, i) => `${x(i)},${y(d.count)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Line chart">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray="3 3" />
          <text x={PAD.left - 8} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--muted-foreground)">
            {Number(t.toFixed(2))}
          </text>
        </g>
      ))}
      {data.map((d, i) =>
        i % labelSkip === 0 ? (
          <text key={d.label} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">
            {d.label}
          </text>
        ) : null,
      )}
      {data.length > 1 && <polyline points={polyline} fill="none" stroke={color} strokeWidth="2" />}
      {data.map((d, i) => (
        <circle key={`${d.label}-dot`} cx={x(i)} cy={y(d.count)} r="3" fill={color}>
          <title>{`${d.label}: ${d.count}`}</title>
        </circle>
      ))}
    </svg>
  );
}
