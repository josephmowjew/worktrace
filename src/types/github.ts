export type GitHubIntegrationStatus = {
  connected: boolean;
  username?: string | null;
  connectedAt?: string | null;
  lastValidatedAt?: string | null;
  hasToken: boolean;
};

export type ConnectGitHubPatInput = {
  token: string;
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
