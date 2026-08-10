import { BusinessShell } from "./business-shell";

export default function BusinessLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <BusinessShell>{children}</BusinessShell>;
}
