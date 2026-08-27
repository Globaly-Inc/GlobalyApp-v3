import { httpDelete, httpGet, httpPatchForm, httpPostForm } from "@/lib/api/http";
import type { Guide, GuideFiles, GuideInput, GuideListParams, GuideWithLeadCount, Paginated } from "./types";

const BASE = "/admin/marketing/guides";

function toQuery(params: GuideListParams): string {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  if (params.search) search.set("search", params.search);
  if (params.is_published !== undefined) search.set("is_published", String(params.is_published));
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

// One multipart request per save: a "data" JSON part plus any picked files — matches the
// backend's readGuideMultipart (copied from countries.routes.ts).
function buildFormData(input: Partial<GuideInput>, files: GuideFiles): FormData {
  const form = new FormData();
  if (files.background_image) form.append("background_image", files.background_image);
  if (files.background_video) form.append("background_video", files.background_video);
  if (files.pdf) form.append("pdf", files.pdf);
  if (files.pdf_cover_image) form.append("pdf_cover_image", files.pdf_cover_image);
  form.append("data", JSON.stringify(input));
  return form;
}

export const guidesRealApi = {
  getGuides: (params: GuideListParams = {}): Promise<Paginated<GuideWithLeadCount>> =>
    httpGet(`${BASE}${toQuery(params)}`),
  getGuideById: (id: number): Promise<Guide> => httpGet(`${BASE}/${id}`),
  createGuide: (input: GuideInput, files: GuideFiles = {}): Promise<Guide> =>
    httpPostForm(BASE, buildFormData(input, files)),
  updateGuide: (id: number, input: Partial<GuideInput>, files: GuideFiles = {}): Promise<Guide> =>
    httpPatchForm(`${BASE}/${id}`, buildFormData(input, files)),
  deleteGuide: (id: number): Promise<void> => httpDelete(`${BASE}/${id}`),
};
