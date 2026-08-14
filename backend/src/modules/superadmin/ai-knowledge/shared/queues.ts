// AI Knowledge queue names — single source of truth for publisher and consumer.

export const KNOWLEDGE_QUEUES = {
  /** Admin triggers a source crawl → worker discovers, scrapes and embeds its pages */
  CRAWL: "ai_knowledge_crawl",
} as const;
