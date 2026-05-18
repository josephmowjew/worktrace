export type ProjectStatus = "active" | "archived";

export type Project = {
  id: string;
  name: string;
  repoPath?: string | null;
  githubUrl?: string | null;
  projectType?: string | null;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateProjectInput = {
  name: string;
  repoPath?: string | null;
  githubUrl?: string | null;
  projectType?: string | null;
};

export type UpdateProjectInput = Partial<CreateProjectInput> & {
  status?: ProjectStatus;
};
