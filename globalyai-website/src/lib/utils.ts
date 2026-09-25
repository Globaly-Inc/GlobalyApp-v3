type ClassValue = string | false | null | undefined;

/**
 * Joins class names, dropping falsy ones.
 *
 * Deliberately not clsx + tailwind-merge: two dependencies to resolve a
 * conflict that should not be written in the first place. The cost is that a
 * later class does NOT override an earlier one — both land, and the order of
 * the generated stylesheet decides. So a component must not hard-code a
 * utility its callers also pass: <LearningCore /> did, with max-w, and the
 * mobile call site's max-w-[9rem] lost to the component's own max-w-[17rem],
 * which put a rotating 272px orbit on a 320px screen.
 */
export function cn(...classes: ClassValue[]) {
  return classes.filter(Boolean).join(" ");
}
