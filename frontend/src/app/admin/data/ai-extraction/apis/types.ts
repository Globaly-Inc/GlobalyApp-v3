import type { ExtractionJob, ExtractionStatus } from "../../all-extractions/apis/types";

export type { ExtractionStatus };

export type PipelineStage = {
  status: string;
  total?: number;
  done?: number;
};

export type PipelineProgress = {
  mapping?: PipelineStage;
  intelligence?: PipelineStage;
  scraping?: PipelineStage;
  extracting?: PipelineStage;
  verifying?: PipelineStage;
};

// ExtractionJob + the extra fields the filtered endpoint returns
export type AiExtractionJob = ExtractionJob & {
  source_type?: string | null;
  pipeline_progress?: PipelineProgress | null;
};
