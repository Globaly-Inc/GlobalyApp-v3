"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronDown, ChevronRight, CornerDownRight, GraduationCap, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AuthMeBusiness } from "@/app/auth/apis";

/** `parent_id` — the parent org (same kind) when this org is one of its branches. */
export type SwitcherOrg = AuthMeBusiness & { kind?: "business" | "institution"; parent_id?: number | null };

/**
 * Orders orgs so each branch sits right under its parent, with its nesting depth. A branch whose
 * parent the user isn't a member of is shown top-level. Ids are only unique per kind, so the
 * parent is matched on kind + id.
 */
type NestedOrg = { org: SwitcherOrg; depth: number; root: string; branchCount: number };

function nestBranches(orgs: SwitcherOrg[]): NestedOrg[] {
  const key = (kind: SwitcherOrg["kind"], id: number) => `${kind ?? "business"}:${id}`;
  const present = new Set(orgs.map((o) => key(o.kind, o.id)));
  const children = new Map<string, SwitcherOrg[]>();
  const roots: SwitcherOrg[] = [];
  for (const o of orgs) {
    const parentKey = o.parent_id != null ? key(o.kind, o.parent_id) : null;
    if (parentKey && present.has(parentKey)) children.set(parentKey, [...(children.get(parentKey) ?? []), o]);
    else roots.push(o);
  }
  const out: NestedOrg[] = [];
  const seen = new Set<string>();
  const visit = (o: SwitcherOrg, depth: number, root: string) => {
    const k = key(o.kind, o.id);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ org: o, depth, root, branchCount: children.get(k)?.length ?? 0 });
    for (const c of children.get(k) ?? []) visit(c, depth + 1, root);
  };
  roots.forEach((r) => visit(r, 0, key(r.kind, r.id)));
  // ponytail: a parent cycle has no root to start from — list any leftovers flat.
  orgs.forEach((o) => visit(o, 0, key(o.kind, o.id)));
  return out;
}

// Ported from V1's BusinessLayout businessSwitcher: lives inline in the header (not inside the
// account menu), always visible once the user owns at least one business, and always offers a
// way to start another — switching businesses and switching accounts are different actions and
// V1 keeps them in separate menus for exactly that reason.
export function BusinessSwitcher({
  businesses,
  activeOrgId,
  onSwitch,
}: Readonly<{ businesses: SwitcherOrg[]; activeOrgId: string | null; onSwitch: (orgId: string) => void }>) {
  const router = useRouter();
  const active = businesses.find((b) => b.org_id === activeOrgId) ?? businesses[0];
  const nested = nestBranches(businesses);
  // Each head office's branches fold away; the active org's group opens by itself on every open.
  const activeRoot = nested.find((n) => n.org.org_id === activeOrgId)?.root ?? null;
  const [openRoots, setOpenRoots] = useState<Set<string>>(new Set());
  const toggleRoot = (root: string) =>
    setOpenRoots((prev) => { const next = new Set(prev); if (next.has(root)) next.delete(root); else next.add(root); return next; });

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) setOpenRoots(new Set(activeRoot ? [activeRoot] : [])); }}>
      <DropdownMenuTrigger
        render={
          <button
            className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm font-semibold hover:bg-muted cursor-pointer"
            type="button"
          />
        }
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted overflow-hidden">
          {active?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={active.logo_url} alt="" className="size-full object-contain p-0.5" />
          ) : active?.kind === "institution" ? (
            <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </span>
        <span className="max-w-[160px] truncate" title={active?.business_name}>{active?.business_name ?? "Business"}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {/* The org list scrolls on its own — an org with many branches would otherwise push
            "Add Organisation" off the screen. */}
        <DropdownMenuGroup className="scrollbar-thin max-h-[min(60vh,28rem)] overflow-y-auto">
          {nested.filter(({ depth, root }) => depth === 0 || openRoots.has(root)).map(({ org: b, depth, root, branchCount }) => (
            <DropdownMenuItem
              key={b.org_id}
              className="cursor-pointer gap-2"
              // Indent + an arrow mark a branch under the org above it.
              style={depth ? { paddingLeft: `${0.5 + depth * 1.25}rem` } : undefined}
              onClick={() => onSwitch(b.org_id)}
            >
              {depth > 0 && <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted overflow-hidden">
                {b.logo_url ? (
                  <img src={b.logo_url} alt="" className="size-full object-contain p-0.5" />
                ) : b.kind === "institution" ? (
                  <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block truncate text-sm" title={b.business_name}>{b.business_name}</span>
                <span className="block truncate text-xs text-muted-foreground capitalize">
                  {[depth ? "Branch" : b.kind === "institution" ? "Institution" : null, b.role].filter(Boolean).join(" · ")}
                </span>
              </span>
              {b.org_id === activeOrgId && <Check className="h-4 w-4 text-primary shrink-0" />}
              {depth === 0 && branchCount > 0 && (
                <button
                  type="button"
                  // Toggles the branches without switching org or closing the menu.
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleRoot(root); }}
                  aria-label={openRoots.has(root) ? `Hide ${b.business_name}'s branches` : `Show ${b.business_name}'s branches`}
                  aria-expanded={openRoots.has(root)}
                  className="flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {branchCount}
                  <ChevronRight className={`h-3.5 w-3.5 transition-transform ${openRoots.has(root) ? "rotate-90" : ""}`} />
                </button>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer" onClick={() => router.push("/business/onboarding?new=1")}>
          <Plus /> Add Organisation
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
