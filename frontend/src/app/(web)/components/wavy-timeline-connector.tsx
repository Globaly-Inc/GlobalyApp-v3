export function WavyTimelineConnector({ steps }: Readonly<{ steps: number }>) {
  let d = "M 50 0";
  for (let i = 0; i < steps; i++) {
    const y0 = i * 100;
    const yMid = y0 + 50;
    const y1 = y0 + 100;
    const bulgeX = i % 2 === 0 ? 78 : 22;
    d += ` C 50 ${y0 + 25} ${bulgeX} ${y0 + 25} ${bulgeX} ${yMid}`;
    d += ` C ${bulgeX} ${yMid + 25} 50 ${yMid + 25} 50 ${y1}`;
  }

  return (
    <svg
      className="pointer-events-none absolute inset-0 hidden h-full w-full md:block"
      viewBox={`0 0 100 ${steps * 100}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={d} fill="none" stroke="hsl(var(--primary) / 0.25)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
