// The Earn module shell. Its second-level nav (My Services / Ambassadors / Referrals) lives in the
// sidebar's submenu column now — see src/app/personal/const/index.ts — so this is a pass-through.
export default function EarnLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
