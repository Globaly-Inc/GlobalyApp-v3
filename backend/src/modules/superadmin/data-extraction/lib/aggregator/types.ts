// Aggregator provider types for course listing extraction.

export type ScrapeFn = (url: string) => Promise<{ markdown: string; links: string[] }>;

export interface AggregatorResult {
  institution: {
    name?: string;
    description?: string;
    website?: string;
    city?: string;
    state?: string;
    country?: string;
  };
  courseUrls: string[];
}

export interface AggregatorProvider {
  id: string;
  name: string;
  detect(url: string): boolean;
  extractListing(url: string, scrape: ScrapeFn): Promise<AggregatorResult>;
}
