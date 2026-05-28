import type { ActivityItem } from "./activity";
import type { GitRefFilter } from "./project";

export type ActivityGroupItemInput = {
  sourceType: string;
  sourceId: string;
  occurredAt: string;
  summarySnapshot: string;
};

export type ActivityGroupItem = ActivityGroupItemInput & {
  id: string;
  groupId: string;
  activity?: ActivityItem | null;
  createdAt: string;
};

export type ActivityGroup = {
  id: string;
  projectId?: string | null;
  projectName?: string | null;
  workspaceId?: string | null;
  workspaceName?: string | null;
  projectCount: number;
  projects: Array<{
    projectId: string;
    projectName: string;
  }>;
  title: string;
  summary?: string | null;
  startDate: string;
  endDate: string;
  source: "ai" | "local_rule" | string;
  confidence: number;
  includedInReport: boolean;
  fingerprint?: string | null;
  algorithmVersion?: string | null;
  confidenceLabel: "strong" | "likely" | "needs_review" | string;
  rationaleJson?: string | null;
  reportSummary?: string | null;
  locked: boolean;
  userEditedAt?: string | null;
  reviewStatus: "draft" | "needs_review" | "reviewed" | string;
  titleConfidence?: number | null;
  titleConfidenceLabel?: "strong" | "likely" | "needs_review" | string | null;
  titleQualityLabel?:
    | "report_ready"
    | "acceptable"
    | "technically_correct_but_weak"
    | "needs_user_review"
    | "fallback_only"
    | "rejected"
    | string
    | null;
  titleStrategy?: string | null;
  titleRationaleJson?: string | null;
  titleCandidatesJson?: string | null;
  createdAt: string;
  updatedAt: string;
  items: ActivityGroupItem[];
};

export type ListActivityGroupsInput = {
  from: string;
  to: string;
  projectIds?: string[] | null;
  workspaceIds?: string[] | null;
  classification?: string | null;
  gitRefs?: GitRefFilter[] | null;
  worktreePaths?: string[] | null;
  includeHidden?: boolean | null;
};

export type SuggestActivityGroupsInput = Omit<ListActivityGroupsInput, "includeHidden"> & {
  useAi?: boolean | null;
  useEmbeddings?: boolean | null;
};

export type CreateActivityGroupInput = {
  projectId?: string | null;
  workspaceId?: string | null;
  title: string;
  summary?: string | null;
  startDate: string;
  endDate: string;
  source?: string | null;
  confidence?: number | null;
  includedInReport?: boolean | null;
  fingerprint?: string | null;
  algorithmVersion?: string | null;
  confidenceLabel?: string | null;
  rationaleJson?: string | null;
  reportSummary?: string | null;
  locked?: boolean | null;
  reviewStatus?: string | null;
  titleConfidence?: number | null;
  titleConfidenceLabel?: string | null;
  titleQualityLabel?: string | null;
  titleStrategy?: string | null;
  titleClassificationJson?: string | null;
  titleCandidatesJson?: string | null;
  titleRationaleJson?: string | null;
  titleRejectedTermsJson?: string | null;
  items: ActivityGroupItemInput[];
};

export type UpdateActivityGroupInput = Partial<
  Omit<CreateActivityGroupInput, "projectId" | "workspaceId" | "items">
>;

export type ReplaceActivityGroupItemsInput = {
  items: ActivityGroupItemInput[];
};

export type GroupingDiffSnippet = {
  commitHash: string;
  path: string;
  snippet: string;
};

export type GroupingEvidence = {
  group: ActivityGroup;
  reasons: string[];
  changedPaths: string[];
  diffSnippets: GroupingDiffSnippet[];
};

export type MergeActivityGroupsInput = {
  sourceGroupIds: string[];
  title?: string | null;
};

export type SplitActivityGroupInput = {
  itemIds: string[];
  title?: string | null;
};

export type MoveActivityGroupItemInput = {
  itemId: string;
  targetGroupId: string;
};

export type LockActivityGroupInput = {
  locked: boolean;
};

export type TitleCandidate = {
  id: string;
  title: string;
  summary: string;
  reportSummary: string;
  action: string;
  domains: string[];
  strategy: string;
  score: number;
  qualityLabel: string;
  rationale: string[];
};

export type TitleRationale = {
  selectedTitle: string;
  selectedAction: string;
  selectedDomains: string[];
  namingStrategy: string;
  titleConfidence: number;
  titleConfidenceLabel: string;
  titleQualityLabel: string;
  positiveEvidence: string[];
  rejectedTerms: string[];
  rejectedCandidates: string[];
  warnings: string[];
};

export type PreviewActivityGroupTitleResponse = {
  selectedTitle: string;
  selectedSummary: string;
  selectedReportSummary: string;
  titleConfidence: number;
  titleConfidenceLabel: string;
  titleQualityLabel: string;
  namingStrategy: string;
  candidates: TitleCandidate[];
  rationale: TitleRationale;
};

export type RegenerateActivityGroupTitleInput = {
  groupId: string;
  persist: boolean;
  respectUserEdited: boolean;
};

export type SelectActivityGroupTitleCandidateInput = {
  groupId: string;
  candidateTitle: string;
  candidateId?: string | null;
};

export type RecordActivityGroupTitleFeedbackInput = {
  groupId: string;
  eventType: string;
  previousTitle?: string | null;
  newTitle?: string | null;
  previousSummary?: string | null;
  newSummary?: string | null;
  metadataJson?: string | null;
};
