import type { LucideIcon } from "lucide-react";
import type { OverviewStats } from "../apis";

export interface StatCardConfig {
  key: keyof OverviewStats;
  label: string;
  icon: LucideIcon;
}
