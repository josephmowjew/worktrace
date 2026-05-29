import type { Project } from "./project";

export type WorkspaceStatus = "active" | "archived";
export type WorkspaceClassification = "work" | "personal" | "unclassified";

export type Workspace = {
  id: string;
  name: string;
  rootPath: string;
  classification: WorkspaceClassification;
  status: WorkspaceStatus;
  lastScannedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateWorkspaceInput = {
  name: string;
  rootPath: string;
  classification?: WorkspaceClassification | null;
};

export type UpdateWorkspaceInput = Partial<CreateWorkspaceInput> & {
  status?: WorkspaceStatus;
};

export type WorkspaceRepoDiscoveryStatus = "new" | "imported" | "archived" | "ignored";

export type WorkspaceRepoDiscovery = {
  repoPath: string;
  relativePath: string;
  suggestedName: string;
  githubUrl?: string | null;
  githubOwner?: string | null;
  githubRepo?: string | null;
  githubAccountId?: string | null;
  githubAccountUsername?: string | null;
  githubBindingStatus?: string | null;
  status: WorkspaceRepoDiscoveryStatus;
  projectId?: string | null;
  projectName?: string | null;
};

export type ImportWorkspaceRepositoriesInput = {
  workspaceId: string;
  repositories: Array<{
    repoPath: string;
    name?: string | null;
    projectType?: string | null;
    githubUrl?: string | null;
    githubAccountId?: string | null;
  }>;
};

export type WorkspaceRepositoryActionInput = {
  workspaceId: string;
  repoPath: string;
};

export type ImportedWorkspaceProject = Project;
