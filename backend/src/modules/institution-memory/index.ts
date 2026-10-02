// Institution AI memory — what an institution's counsellor has been told and has learned
// about HOW to counsel, kept per institution and never shared across them.
//
// Public surface for the chat tool and the institution portal. The portal routes
// (routes/memory.routes.ts) are mounted by the ai-counsellor module; the learning signals
// (feedback, review, conversation end) are published from that module's routes too.
//
//   profileBlockFor(institutionId)                          → COUNSELLING STYLE block (per turn)
//   retrieveMemories({ institutionId, query, situation })  → prompt block + ids     (per turn)
//   recordMemoryIds(messageId, ids)                         → feedback learns against these
//   enqueueLearning({ kind, institution_id, ... })          → correction | feedback | conversation
//   createMemory / approve / deprecate / edit / remove      → admin actions

export { retrieveMemories, renderMemoryBlock, rankMemories, clearRetrievalCache } from "./services/retrieval.service.js";
export type { MemoryRetrieval, RetrievedMemory } from "./services/retrieval.service.js";
export {
  createMemory, flagConflict, approve, deprecate, reactivate, unflag, remove, edit, voteOnMemory, runSweep,
  hashActor, hashContent,
} from "./services/memory.service.js";
export { getProfile, patchProfile, parsePatch, profileBlockFor, renderProfileBlock, clearProfileCache } from "./services/profile.service.js";
export { recordConversationSignals, sweepMissingSignals, journeyEndedAt } from "./services/conversation-signals.service.js";
export { topicOf, topicSequence, transitionGuidance, TOPICS } from "./lib/conversation-topics.js";
export type { Topic } from "./lib/conversation-topics.js";
export * from "./schemas/signals.schema.js";
export * from "./schemas/profile.schema.js";
export { isJevConfigured, judgeCandidate, judgeContradictions, judgeFollowed } from "./lib/jev.js";
export type { CandidateJudgement } from "./lib/jev.js";
export type { CreateOutcome, VoteOutcome } from "./services/memory.service.js";
export { enqueueLearning, evaluateCandidate, runLearnJob } from "./services/learning.service.js";
export { recordMemoryIds, recordReview, recordFeedback } from "./repositories/learning.repository.js";
export { list as listMemories, findById as findMemory, clearSchemaCache } from "./repositories/memory.repository.js";
export * from "./schemas/memory.schema.js";
export { MEMORY_QUEUES } from "./shared/queues.js";
export { institutionMemoryRoutes } from "./routes/memory.routes.js";
