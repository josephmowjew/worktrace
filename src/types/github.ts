export type GitHubIntegrationStatus = {
  connected: boolean;
  username?: string | null;
  accountId?: string | null;
  connectedAt?: string | null;
  lastValidatedAt?: string | null;
  hasToken: boolean;
  authMethod?: "oauth_device" | "pat" | string | null;
  scopes?: string | null;
  status?: "connected" | "pending" | "error" | "disconnected" | string | null;
  lastSyncedAt?: string | null;
  lastError?: string | null;
};

export type GitHubAccount = {
  id: string;
  host: string;
  githubUserId?: number | null;
  username?: string | null;
  tokenRef?: string | null;
  authMethod: "oauth_device" | "pat" | string;
  scopes?: string | null;
  status: "connected" | "pending" | "error" | "disconnected" | string;
  connectedAt?: string | null;
  lastValidatedAt?: string | null;
  lastSyncedAt?: string | null;
  lastError?: string | null;
  hasToken: boolean;
  createdAt: string;
  updatedAt: string;
};

export type GitHubAccountsStatus = {
  connected: boolean;
  accounts: GitHubAccount[];
};

export type ConnectGitHubPatInput = {
  token: string;
};

export type StartGitHubDeviceAuthOutput = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
  clientId: string;
  scope: string;
};

export type CompleteGitHubDeviceAuthInput = {
  deviceCode: string;
};

export type CompleteGitHubDeviceAuthOutput = {
  status: "pending" | "connected" | "expired" | "denied" | "error" | string;
  message: string;
  retryAfterSeconds?: number | null;
  integration?: GitHubIntegrationStatus | null;
  account?: GitHubAccount | null;
};

export type SyncGitHubProjectActivityInput = {
  projectId?: string | null;
  accountId?: string | null;
};

export type SyncGitHubProjectActivityOutput = {
  syncedProjects: number;
  importedPullRequests: number;
  importedIssues: number;
  updatedPullRequests: number;
  updatedIssues: number;
  message: string;
};

export type CreateGitHubPullRequestInput = {
  accountId?: string | null;
  projectId: string;
  baseBranch: string;
  newBranch: string;
  title: string;
  body: string;
  commitHashes: string[];
  draft?: boolean | null;
};

export type GitHubAccountActionInput = {
  accountId: string;
};

export type DetectProjectGitHubBindingInput = {
  projectId?: string | null;
  repoPath?: string | null;
  githubUrl?: string | null;
};

export type DetectProjectGitHubBindingOutput = {
  githubUrl?: string | null;
  owner?: string | null;
  repo?: string | null;
  accountId?: string | null;
  accountUsername?: string | null;
  status: "bound" | "detected" | "ambiguous" | "unbound" | string;
  message: string;
};

export type CreateGitHubPullRequestOutput = {
  number: number;
  url: string;
  headBranch: string;
  baseBranch: string;
  pushedCommitCount: number;
};
