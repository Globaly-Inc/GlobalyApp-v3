import { toast } from "sonner";
import { businessesApi } from "../../apis";

// Mirrors backend's `courseSlug(name, id)` scheme (search/utils/slug.ts) used for public course
// URLs: slugified name + the first 6 hex chars of the course's uuid, dashes stripped.
const coursePublicSlug = (name: string, id: string) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}-${id.replace(/-/g, "").slice(0, 6)}`;

// Opens a course's public page in a new tab using a short-lived preview_token (never the admin's
// own session token, which would be a fully reusable credential sitting in the URL/browser
// history/logs).
export function openInstitutionPublicPreview(institutionId: number, serviceId: string, name: string) {
  const path = `/course/${coursePublicSlug(name, serviceId)}`;
  const tab = window.open("", "_blank");
  businessesApi.mintInstitutionPreviewToken(institutionId)
    .then(({ preview_token }) => { if (tab) tab.location.href = `${path}?preview_token=${encodeURIComponent(preview_token)}`; })
    .catch((e) => {
      // An unpublished institution's course needs this token to bypass the publication
      // filter — opening the bare URL without one just shows a misleading 404 instead of
      // reporting that the preview couldn't be opened.
      tab?.close();
      toast.error("Couldn't open preview", { description: e instanceof Error ? e.message : "Please try again." });
    });
}
