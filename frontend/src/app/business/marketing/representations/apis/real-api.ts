import { httpGet, httpPatch, httpPost } from "@/lib/api/http";
import type { Representation, RepresentationInviteInput, RepresentationTarget } from "./types";

const BASE = "/businesses/representations";

export const representationsRealApi = {
  list: (): Promise<Representation[]> => httpGet(BASE),
  search: (search?: string): Promise<RepresentationTarget[]> =>
    httpGet(`${BASE}/search${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  invite: (input: RepresentationInviteInput): Promise<Representation> => httpPost(BASE, input),
  respond: (id: string, status: "active" | "rejected"): Promise<Representation> =>
    httpPatch(`${BASE}/${id}`, { status }),
};
