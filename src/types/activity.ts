export type ActivityItem = {
  id: string;
  projectId?: string | null;
  projectName?: string | null;
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
};
