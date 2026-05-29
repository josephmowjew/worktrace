export type GitHubIntegrationStatus = {
  connected: boolean;
  username?: string | null;
  connectedAt?: string | null;
  lastValidatedAt?: string | null;
  hasToken: boolean;
  authMethod?: "oauth_device" | "pat" | string | null;
  scopes?: string | null;
  status?: "connected" | "pending" | "error" | "disconnected" | string | null;
  lastSyncedAt?: string | null;
  lastError?: string | null;
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
};

export type SyncGitHubProjectActivityInput = {
  projectId?: string | null;
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
  projectId: string;
  baseBranch: string;
  newBranch: string;
  title: string;
  body: string;
  commitHashes: string[];
  draft?: boolean | null;
};

export type CreateGitHubPullRequestOutput = {
  number: number;
  url: string;
  headBranch: string;
  baseBranch: string;
  pushedCommitCount: number;
};
