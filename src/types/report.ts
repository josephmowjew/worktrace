import type { GitRefFilter } from "./project";
import type { ProjectClassification } from "./project";

export type GeneratedReport = {
  title: string;
  startDate: string;
  endDate: string;
  recipientName?: string | null;
  content: string;
};

export type Report = GeneratedReport & {
  id: string;
  createdAt: string;
};

export type ReportSummary = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  recipientName?: string | null;
  createdAt: string;
};

export type GenerateReportInput = {
  startDate: string;
  endDate: string;
  recipientName?: string | null;
  projectIds?: string[] | null;
  classification?: ProjectClassification | null;
  gitRefs?: GitRefFilter[] | null;
  worktreePaths?: string[] | null;
  useProjectGitFocus?: boolean | null;
  includeCommits?: boolean | null;
  includeManualLogs?: boolean | null;
  includeWeeklyTasks?: boolean | null;
  includeHidden?: boolean | null;
};

export type SaveReportInput = {
  title: string;
  startDate: string;
  endDate: string;
  recipientName?: string | null;
  content: string;
};

export type ReportNote = {
  id: string;
  projectId?: string | null;
  noteType: string;
  date: string;
  content: string;
  includedInReport: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ListReportNotesInput = {
  from: string;
  to: string;
};

export type SaveDailyReviewNoteInput = {
  date: string;
  finished: string;
  blocked: string;
  carryIntoTomorrow: string;
  includedInReport?: boolean | null;
};

export type ReportAiProvider =
  | "local_llama_cpp"
  | "openrouter_free"
  | "groq"
  | "nvidia_build";

export type ReportPolishInput = {
  draft: string;
  startDate: string;
  endDate: string;
  recipientName?: string | null;
  projectIds?: string[] | null;
  classification?: ProjectClassification | null;
  gitRefs?: GitRefFilter[] | null;
  worktreePaths?: string[] | null;
  useProjectGitFocus?: boolean | null;
  includeHidden?: boolean | null;
  provider?: ReportAiProvider | null;
  streamId?: string | null;
};

export type ReportPolishResult = {
  content: string;
  provider: string;
  model: string;
  usedFallback: boolean;
  fallbackReason:
    | "none"
    | "provider_unavailable"
    | "provider_error"
    | "empty_output"
    | "length_limit"
    | "cancelled";
  message: string;
  diagnostics?: string | null;
};

export type ReportAiStreamPayload = {
  streamId: string;
  eventType: "start" | "delta" | "reasoning" | "done" | "error" | "cancelled";
  content: string;
  message?: string | null;
};

export type CancelReportAiStreamInput = {
  streamId: string;
};

export type ReportReadinessInput = {
  startDate: string;
  endDate: string;
  projectIds?: string[] | null;
  classification?: ProjectClassification | null;
  gitRefs?: GitRefFilter[] | null;
  worktreePaths?: string[] | null;
  useProjectGitFocus?: boolean | null;
  includeHidden?: boolean | null;
  provider?: ReportAiProvider | null;
};

export type ReportReadinessFinding = {
  severity: string;
  title: string;
  detail: string;
};

export type ReportReadinessAnalysis = {
  provider: string;
  model: string;
  score: number;
  summary: string;
  findings: ReportReadinessFinding[];
  usedFallback: boolean;
};

export type ReportAiProviderStatus = {
  provider: string;
  available: boolean;
  configured: boolean;
  online: boolean;
  model: string;
  message: string;
};

export type ReportAiStatus = {
  enabled: boolean;
  preferredProvider: string;
  providers: ReportAiProviderStatus[];
};

export type ReportAiModel = {
  id: string;
  name: string;
  provider: string;
  contextLength?: number | null;
  description?: string | null;
  inputPrice?: string | null;
  outputPrice?: string | null;
};

export type ReportAiModelList = {
  provider: string;
  models: ReportAiModel[];
};

export type ConnectReportAiProviderInput = {
  provider: ReportAiProvider;
  apiKey: string;
};

export type TestReportAiProviderInput = {
  provider: ReportAiProvider;
};
