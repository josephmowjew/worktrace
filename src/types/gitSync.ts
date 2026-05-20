export type SyncCommitsInput = {
  from?: string | null;
  to?: string | null;
  authorEmail?: string | null;
  projectIds?: string[] | null;
};

export type SyncCommitsResult = {
  scannedProjects: number;
  skippedProjects: number;
  newCommits: number;
  updatedCommits: number;
  errors: string[];
};
