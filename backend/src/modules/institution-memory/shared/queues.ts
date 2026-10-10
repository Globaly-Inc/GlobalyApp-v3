// Institution memory queue names — single source of truth for publisher and consumer.

export const MEMORY_QUEUES = {
  /** A correction, a thumbs vote, or a finished conversation to learn from. Payload: LearnJob. */
  LEARN: "institution_memory_learn",
} as const;
