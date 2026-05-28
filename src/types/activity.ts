import type { CommitRefSummary, CommitWorktreeSummary, GitRefFilter } from "./project";

export type ActivityItem = {
  id: string;
  projectId?: string | null;
  projectName?: string | null;
  workspaceId?: string | null;
  workspaceName?: string | null;
  workspaceRelativePath?: string | null;
  activityType: string;
  summary: string;
  occurredAt: string;
  includedInReport: boolean;
  commitHash?: string | null;
  authorName?: string | null;
  authorEmail?: string | null;
  branch?: string | null;
  filesChanged?: number | null;
  insertions?: number | null;
  deletions?: number | null;
  refs: CommitRefSummary[];
  worktree?: CommitWorktreeSummary | null;
};

export type ActivityDay = {
  date: string;
  items: ActivityItem[];
};

export type ListActivityInput = {
  from: string;
  to: string;
  activityType?: string | null;
  projectIds?: string[] | null;
  workspaceIds?: string[] | null;
  gitRefs?: GitRefFilter[] | null;
  worktreePaths?: string[] | null;
};

export type HeatmapInput = {
  from: string;
  to: string;
  projectIds?: string[] | null;
};

export type HeatmapCell = {
  day: number;
  hour: number;
  count: number;
};

export type HeatmapData = {
  cells: HeatmapCell[];
  maxCount: number;
};

export type WeekSummaryInput = {
  from: string;
  to: string;
  projectIds?: string[] | null;
};

export type TopProject = {
  name: string;
  count: number;
};

export type WeekSummary = {
  totalActivities: number;
  totalActivitiesTrend: number;
  codingTimeMinutes: number;
  codingTimeTrend: number;
  meetingCount: number;
  meetingTrend: number;
  deploymentCount: number;
  deploymentTrend: number;
  topProject: TopProject;
  focusTimeMinutes: number;
};

export type KeyHighlight = {
  title: string;
  description: string;
  trend: number;
  icon: string;
};
