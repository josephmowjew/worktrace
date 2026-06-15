import type { CreateWeeklyTaskInput, WeeklyTask } from "./weeklyTask";

export type PreviewCommitTaskDraftInput = {
  activityId: string;
  weekStartDate: string;
};

export type CreateWeeklyTaskFromCommitInput = {
  activityId: string;
  task: CreateWeeklyTaskInput;
  confidence?: number | null;
  confidenceLabel?: string | null;
  rationale?: string[] | null;
};

export type CommitTaskEvidenceSummary = {
  activityId: string;
  projectId: string;
  projectName?: string | null;
  commitHash: string;
  subject: string;
  branch?: string | null;
  modules: string[];
  changeTypes: string[];
  occurredAt: string;
};

export type CommitTaskTitleCandidate = {
  id: string;
  title: string;
  strategy: string;
  score: number;
  rationale: string[];
};

export type CommitTaskDescriptionSection = {
  label: string;
  body: string;
};

export type CommitTaskGroupContext = {
  groupId: string;
  title: string;
  summary?: string | null;
  reportSummary?: string | null;
  confidenceLabel?: string | null;
};

export type CommitTaskDraftResponse = {
  draft: CreateWeeklyTaskInput;
  confidence: number;
  confidenceLabel: "strong" | "likely" | "needs_review" | string;
  rationale: string[];
  evidence: CommitTaskEvidenceSummary;
  titleCandidates: CommitTaskTitleCandidate[];
  selectedTitleStrategy: string;
  descriptionSections: CommitTaskDescriptionSection[];
  qualityWarnings: string[];
  groupContext?: CommitTaskGroupContext | null;
  existingTask?: WeeklyTask | null;
};

export type CreateWeeklyTaskFromCommitOutcome = {
  task: WeeklyTask;
  alreadyCreated: boolean;
};
