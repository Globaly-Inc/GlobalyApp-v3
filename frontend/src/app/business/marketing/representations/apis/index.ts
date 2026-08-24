import { createApi } from "@/lib/api/create-api";
import { representationsMockApi } from "./mock-data";
import { representationsRealApi } from "./real-api";

export const representationsApi = createApi({ mock: representationsMockApi, real: representationsRealApi });
export type { Representation, RepresentationInviteInput, RepresentationStatus, RepresentationTarget } from "./types";
