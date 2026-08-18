// Standalone, deliberately outside the (web) route group: that layout adds the marketing navbar and
// footer, and this page is a focused conversion step between a shared link and sign-up.
export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
