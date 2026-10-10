/**
 * Shared class strings for the redesigned portal list tabs (Services, Scholarships, Team, Site
 * contents), copied from the approved mockup (https://claude.ai/artifact/PuYPWE4ZkBN3wopVDiahx3)
 * so every tab looks the same. Tables keep a sticky header and a sticky, always-visible
 * Actions column (user preference).
 */

/** Search input: soft fill, brand ring on focus. Pair with a Search icon at left-3. */
export const SEARCH_INPUT =
  "h-10 rounded-[10px] border-[1.5px] border-transparent bg-muted/60 pl-9 transition-[background-color,border-color,box-shadow] focus-visible:border-primary focus-visible:bg-background focus-visible:ring-4 focus-visible:ring-primary/15 dark:bg-muted/60 dark:focus-visible:bg-background";

/** Combobox filter trigger; add FILTER_ACTIVE when it has a value. */
// The Input/Button primitives carry dark:bg-input/30, which tailwind-merge keeps alongside bg-*, so
// every fill here needs its own dark: twin or dark mode shows the primitive's fill instead.
export const FILTER = "h-10 rounded-[10px] border-[1.5px] border-transparent bg-muted/60 text-[12.5px] font-semibold dark:bg-muted/60";
export const FILTER_ACTIVE = "border-primary bg-primary/10 text-primary dark:bg-primary/10";

/** Table frame: its own scroll box so the header can stick and wide tables scroll inside it. */
export const TABLE_WRAP = "max-h-[620px] overflow-auto rounded-[14px] border";
export const TABLE = "w-full border-separate border-spacing-0 text-[13.5px]";
export const TH =
  "sticky top-0 z-[2] whitespace-nowrap border-b bg-muted px-3 py-[11px] text-left text-[11.5px] font-semibold text-muted-foreground";
// Hover tint is mixed into the card colour (opaque), so the sticky Actions cell stays solid.
export const TD = "border-b bg-card px-3 py-2.5 align-middle transition-colors group-hover/row:bg-[color-mix(in_oklab,var(--color-muted)_40%,var(--color-card))] group-last/row:border-b-0";
/** Row: rises in (set style animationDelay), tints on hover via TD's group-hover. */
export const TR = "group/row animate-row-rise";
const STICK = "sticky right-0 shadow-[-10px_0_12px_-12px_rgb(0_0_0/0.35)]";
export const STICKY_TH = `${STICK} z-[3] text-right`;
export const STICKY_TD = `${STICK} z-[1]`;
/** Actions inside the sticky cell: always visible, right-aligned. */
export const ACTIONS = "flex items-center justify-end gap-0.5 whitespace-nowrap [&_button]:active:scale-90";

/** Rows-rise delay, capped so long pages don't wait. */
export const rowDelay = (i: number) => ({ animationDelay: `${Math.min(i, 10) * 35}ms` });
