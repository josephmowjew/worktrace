export type ProjectStatus = "active" | "archived";

export type Project = {
  id: string;
  name: string;
  description?: string | null;
  repoPath?: string | null;
  githubUrl?: string | null;
  projectType?: string | null;
  workspaceId?: string | null;
  workspaceRelativePath?: string | null;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateProjectInput = {
  name: string;
  description?: string | null;
  repoPath?: string | null;
  githubUrl?: string | null;
  projectType?: string | null;
};

export type UpdateProjectInput = Partial<CreateProjectInput> & {
  status?: ProjectStatus;
};

export type ProjectStats = {
  projectId: string;
  projectName: string;
  commitsThisWeek: number;
  lastSync?: string | null;
  hoursTracked: number;
};

export type CategoryDistribution = {
  category: string;
  count: number;
  percentage: number;
};

export type RecentCommit = {
  projectId: string;
  projectName: string;
  repoPath?: string | null;
  commitHash: string;
  message: string;
  authorName?: string | null;
  branch?: string | null;
  committedAt: string;
  status: string;
};

export type TopContributor = {
  authorName: string;
  authorEmail?: string | null;
  commitCount: number;
};

export type GitBranch = {
  name: string;
  kind: "local" | "remote";
  isCurrent: boolean;
};
