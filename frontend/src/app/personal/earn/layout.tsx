import { EarnSubNav } from "./components/earn-sub-nav";

// The Earn module shell. Every route under /personal/earn/* renders inside this, so the sub-nav persists
// across My Services, Ambassadors and Referrals — and across My Services' own sub-pages.
export default function EarnLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <EarnSubNav />
      {children}
    </>
  );
}
