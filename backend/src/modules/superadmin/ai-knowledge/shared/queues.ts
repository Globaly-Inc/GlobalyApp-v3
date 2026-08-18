// AI Knowledge queue names — single source of truth for publisher and consumer.

export const KNOWLEDGE_QUEUES = {
  /** Admin triggers a source crawl → worker discovers, scrapes and embeds its pages */
  CRAWL: "ai_knowledge_crawl",
  /**
   * A document changed (or the backlog needs draining) → worker chunks it and
   * embeds the chunks. A message naming a `documentId` handles that one document;
   * a message without one is a sweep tick that drains whatever is still unembedded.
   */
  EMBED: "ai_knowledge_embed",
} as const;
