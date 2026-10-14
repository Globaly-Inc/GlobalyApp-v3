/** Row of summary tiles; tiles rise in one after another. */
export function PortalStats({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="stagger-in grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5">{children}</div>;
}
