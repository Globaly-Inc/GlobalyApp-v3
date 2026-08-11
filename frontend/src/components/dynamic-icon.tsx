import { icons, type LucideProps } from "lucide-react";

export function DynamicIcon({
  name,
  fallback = "Package",
  ...props
}: Readonly<{ name?: string | null; fallback?: string } & Omit<LucideProps, "name">>) {
  const registry = icons as Record<string, React.ComponentType<LucideProps>>;
  const Icon = registry[name ?? ""] ?? registry[fallback];
  return Icon ? <Icon {...props} /> : null;
}
