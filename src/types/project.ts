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
  refs: CommitRefSummary[];
  worktree?: CommitWorktreeSummary | null;
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

export type GitRef = {
  projectId: string;
  name: string;
  fullName: string;
  kind: "local" | "remote";
  isCurrent: boolean;
  isHead: boolean;
  lastSeenCommit?: string | null;
  lastScannedAt: string;
};

export type GitRefFilter = {
  projectId?: string | null;
  name: string;
  kind: "local" | "remote";
};

export type GitWorktree = {
  projectId: string;
  path: string;
  branch?: string | null;
  headCommit?: string | null;
  isClean?: boolean | null;
  isPrunable: boolean;
  isLocked: boolean;
  lastScannedAt: string;
};

export type CommitRefSummary = {
  name: string;
  kind: "local" | "remote";
  isCurrent: boolean;
};

export type CommitWorktreeSummary = {
  path: string;
  branch?: string | null;
  headCommit?: string | null;
  isClean?: boolean | null;
};

export type ProjectGitFocus = {
  projectId: string;
  refs: GitRefFilter[];
  worktreePaths: string[];
};

export type SaveProjectGitFocusInput = ProjectGitFocus;
