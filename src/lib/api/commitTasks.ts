import { callCommand } from "./client";
import type {
  CommitTaskDraftResponse,
  CreateWeeklyTaskFromCommitInput,
  CreateWeeklyTaskFromCommitOutcome,
  PreviewCommitTaskDraftInput,
} from "../../types/commitTask";

export function previewCommitTaskDraft(input: PreviewCommitTaskDraftInput) {
  return callCommand<CommitTaskDraftResponse>("preview_commit_task_draft", { input });
}

export function createWeeklyTaskFromCommit(input: CreateWeeklyTaskFromCommitInput) {
  return callCommand<CreateWeeklyTaskFromCommitOutcome>("create_weekly_task_from_commit", { input });
}
