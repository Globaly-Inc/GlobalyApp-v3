/** Hero art: a workbook with one tab per institution flowing into institution cards. Inline SVG on
 * theme colours (currentColor = primary), so it follows light/dark mode with no image asset. */
export function SpreadsheetIllustration({ className }: Readonly<{ className?: string }>) {
  return (
    <svg viewBox="0 0 360 220" fill="none" aria-hidden="true" className={className}>
      {/* Workbook */}
      <rect x="12" y="24" width="170" height="172" rx="12" className="fill-background" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      <rect x="12" y="24" width="170" height="30" rx="12" fill="currentColor" fillOpacity="0.12" />
      <rect x="12" y="42" width="170" height="12" fill="currentColor" fillOpacity="0.12" />
      <circle cx="28" cy="39" r="4" fill="currentColor" fillOpacity="0.5" />
      <rect x="40" y="36" width="60" height="6" rx="3" fill="currentColor" fillOpacity="0.45" />
      {[0, 1, 2, 3, 4, 5].map((r) => (
        <g key={r}>
          <line x1="12" x2="182" y1={78 + r * 19} y2={78 + r * 19} stroke="currentColor" strokeOpacity="0.1" />
          <rect x="24" y={64 + r * 19} width={r % 2 ? 58 : 72} height="6" rx="3" fill="currentColor" fillOpacity={r === 0 ? 0.55 : 0.22} />
          <rect x="108" y={64 + r * 19} width="26" height="6" rx="3" fill="currentColor" fillOpacity={r === 0 ? 0.55 : 0.16} />
          <rect x="146" y={64 + r * 19} width="22" height="6" rx="3" fill="currentColor" fillOpacity={r === 0 ? 0.55 : 0.16} />
        </g>
      ))}
      <line x1="98" x2="98" y1="54" y2="196" stroke="currentColor" strokeOpacity="0.1" />
      {/* Tabs — one per institution */}
      {[0, 1, 2].map((t) => (
        <rect key={t} x={20 + t * 46} y="196" width="40" height="14" rx="4" fill="currentColor" fillOpacity={t === 0 ? 0.35 : 0.12} />
      ))}

      {/* Flow */}
      <path d="M190 110 C 220 110, 222 62, 250 62" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" strokeDasharray="4 4" />
      <path d="M190 110 L 250 110" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" strokeDasharray="4 4" />
      <path d="M190 110 C 220 110, 222 158, 250 158" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" strokeDasharray="4 4" />

      {/* Institutions */}
      {[62, 110, 158].map((cy, i) => (
        <g key={cy}>
          <rect x="252" y={cy - 20} width="96" height="40" rx="10" className="fill-background" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
          <rect x="262" y={cy - 11} width="22" height="22" rx="6" fill="currentColor" fillOpacity="0.14" />
          {/* Columned building */}
          <path d={`M266 ${cy + 6} h14 M267 ${cy + 4} v-6 M273 ${cy + 4} v-6 M279 ${cy + 4} v-6 M265 ${cy - 3} l8 -5 l8 5 z`} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <rect x="292" y={cy - 8} width={i === 1 ? 44 : 38} height="6" rx="3" fill="currentColor" fillOpacity="0.5" />
          <rect x="292" y={cy + 3} width="28" height="5" rx="2.5" fill="currentColor" fillOpacity="0.2" />
        </g>
      ))}
      {/* Approval check */}
      <circle cx="344" cy="42" r="10" className="fill-emerald-500" />
      <path d="M339.5 42.2 l3 3 l6 -6.2" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
