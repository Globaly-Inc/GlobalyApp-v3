import { PersonalShell } from "./personal-shell";

export default function PersonalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <PersonalShell>{children}</PersonalShell>;
}
