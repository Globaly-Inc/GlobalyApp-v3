type ClassValue = string | false | null | undefined;

/**
 * Joins class names, dropping falsy ones.
 *
 * Deliberately not clsx + tailwind-merge: nothing on this page relies on a
 * later class overriding an earlier conflicting one, so two dependencies would
 * buy nothing.
 */
export function cn(...classes: ClassValue[]) {
  return classes.filter(Boolean).join(" ");
}
