// Course URLs are `{slugified-name}-{6-char-id-fragment}` (no dedicated slug
// column) — the fragment is the first 6 hex chars of the course's UUID with
// dashes stripped, so a slug can be derived from a row and parsed back
// without a migration.

export function slugifyCourseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function courseIdFragment(id: string): string {
  return id.replace(/-/g, "").slice(0, 6);
}

export function courseSlug(name: string, id: string): string {
  return `${slugifyCourseName(name)}-${courseIdFragment(id)}`;
}

export function parseCourseIdFragment(slug: string): string | null {
  const match = /-([a-f0-9]{6})$/i.exec(slug);
  return match ? match[1].toLowerCase() : null;
}
