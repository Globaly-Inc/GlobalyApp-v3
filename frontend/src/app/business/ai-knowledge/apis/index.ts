import { createApi } from "@/lib/api/create-api";
import { aiKnowledgeMockApi } from "./mock-data";
import { aiKnowledgeRealApi } from "./real-api";

export const aiKnowledgeApi = createApi({ mock: aiKnowledgeMockApi, real: aiKnowledgeRealApi });
export type {
  CreateMemoryInput, CreateMemoryOutcome, Memory, MemoryHistoryEntry, MemoryListParams,
  MemorySource, MemorySourceReference, MemoryStatus, MemoryType, PatchMemoryInput,
  BehaviourProfile, CollectableField, CollectionRules, LearningRules, PatchRackProfileInput,
  RackProfile, ReviewInput, ReviewMessage, ReviewSession, ReviewStatus, StoredRackProfile,
  VoiceProfile,
} from "./types";
