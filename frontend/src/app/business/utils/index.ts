import type { Dispatch, SetStateAction } from "react";
import type { BusinessNavGroup } from "../const";

export function isBusinessNavPathActive(pathname: string | null, href: string): boolean {
  const path = href.split("?")[0]!;
  return pathname === path || (pathname?.startsWith(`${path}/`) ?? false);
}

export function isBusinessNavGroupActive(pathname: string | null, group: BusinessNavGroup): boolean {
  return group.items.some((item) => isBusinessNavPathActive(pathname, item.href));
}

export function clearFieldErrorIfNowValid(
  setFieldErrors: Dispatch<SetStateAction<Record<string, string>>>,
  field: string,
  isNowValid: boolean,
) {
  if (!isNowValid) return;
  setFieldErrors((prev) => {
    if (!prev[field]) return prev;
    const rest = { ...prev };
    delete rest[field];
    return rest;
  });
}
