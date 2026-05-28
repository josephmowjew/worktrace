export type EmbeddingProvider = "native_local" | "local_endpoint" | "openai_compatible";

export type EmbeddingStatus = {
  enabled: boolean;
  provider: EmbeddingProvider | string;
  configured: boolean;
  available: boolean;
  online: boolean;
  model: string;
  message: string;
};

export type ConnectEmbeddingProviderInput = {
  apiKey: string;
};

export type RefreshActivityEmbeddingsInput = {
  from: string;
  to: string;
  projectIds?: string[] | null;
  classification?: string | null;
};

export type QueueActivityEmbeddingRefreshInput = RefreshActivityEmbeddingsInput;

export type RefreshActivityEmbeddingsResult = {
  indexed: number;
  skipped: number;
  provider: string;
  model: string;
};

export type BackgroundJobStatusInput = {
  kind?: string | null;
};

export type BackgroundJobStatus = {
  queued: number;
  running: number;
  failed: number;
  completed: number;
};

export type QueueBackgroundJobResult = {
  queued: boolean;
  jobId?: string | null;
};

export type RunBackgroundJobsResult = {
  processed: number;
  succeeded: number;
  failed: number;
};

export type SemanticActivitySearchInput = RefreshActivityEmbeddingsInput & {
  query: string;
  limit?: number | null;
};

export type SemanticActivitySearchResult = {
  sourceType: string;
  sourceId: string;
  score: number;
  semanticMatch: boolean;
};
