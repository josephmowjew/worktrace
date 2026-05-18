import { callCommand } from "./client";
import type { SyncCommitsInput, SyncCommitsResult } from "../../types/gitSync";

export function syncCommits(input: SyncCommitsInput) {
  return callCommand<SyncCommitsResult>("sync_commits", { input });
}
