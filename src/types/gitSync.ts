export type SyncCommitsInput = {
  from?: string | null;
  to?: string | null;
  authorEmail?: string | null;
  projectIds?: string[] | null;
  mode?: "auto" | "full" | "evidence_repair" | null;
};

export type SyncCommitsResult = {
  scannedProjects: number;
  skippedProjects: number;
  skippedFreshProjects: number;
  incrementalProjects: number;
  fullProjects: number;
  unchangedProjects: number;
  fallbackRescans: number;
  newCommits: number;
  updatedCommits: number;
  evidenceRepaired: number;
  diffSnippetsCollected: number;
  durationMs: number;
  slowProjects: string[];
  errors: string[];
};
