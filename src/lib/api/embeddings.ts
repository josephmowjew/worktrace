import { callCommand } from "./client";
import type {
  ConnectEmbeddingProviderInput,
  EmbeddingStatus,
  RefreshActivityEmbeddingsInput,
  RefreshActivityEmbeddingsResult,
  SemanticActivitySearchInput,
  SemanticActivitySearchResult,
} from "../../types/embedding";

export function getEmbeddingStatus() {
  return callCommand<EmbeddingStatus>("get_embedding_status");
}

export function testEmbeddingProvider() {
  return callCommand<string>("test_embedding_provider");
}

export function connectEmbeddingProvider(input: ConnectEmbeddingProviderInput) {
  return callCommand<boolean>("connect_embedding_provider", { input });
}

export function disconnectEmbeddingProvider() {
  return callCommand<boolean>("disconnect_embedding_provider");
}

export function refreshActivityEmbeddings(input: RefreshActivityEmbeddingsInput) {
  return callCommand<RefreshActivityEmbeddingsResult>("refresh_activity_embeddings", { input });
}

export function semanticActivitySearch(input: SemanticActivitySearchInput) {
  return callCommand<SemanticActivitySearchResult[]>("semantic_activity_search", { input });
}
