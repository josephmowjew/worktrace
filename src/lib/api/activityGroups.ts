import { callCommand } from "./client";
import type {
  ActivityGroup,
  CreateActivityGroupInput,
  GroupingEvidence,
  ListActivityGroupsInput,
  LockActivityGroupInput,
  MergeActivityGroupsInput,
  MoveActivityGroupItemInput,
  PreviewActivityGroupTitleResponse,
  RecordActivityGroupTitleFeedbackInput,
  RegenerateActivityGroupTitleInput,
  ReplaceActivityGroupItemsInput,
  SelectActivityGroupTitleCandidateInput,
  SplitActivityGroupInput,
  SuggestActivityGroupsInput,
  UpdateActivityGroupInput,
} from "../../types/activityGroup";

export function listActivityGroups(input: ListActivityGroupsInput) {
  return callCommand<ActivityGroup[]>("list_activity_groups", { input });
}

export function suggestActivityGroups(input: SuggestActivityGroupsInput) {
  return callCommand<ActivityGroup[]>("suggest_activity_groups", { input });
}

export function previewActivityGroupSuggestions(input: SuggestActivityGroupsInput) {
  return callCommand<CreateActivityGroupInput[]>("preview_activity_group_suggestions", { input });
}

export function refreshActivityGroupSuggestions(input: SuggestActivityGroupsInput) {
  return callCommand<ActivityGroup[]>("refresh_activity_group_suggestions", { input });
}

export function createActivityGroup(input: CreateActivityGroupInput) {
  return callCommand<ActivityGroup>("create_activity_group", { input });
}

export function updateActivityGroup(id: string, input: UpdateActivityGroupInput) {
  return callCommand<ActivityGroup>("update_activity_group", { id, input });
}

export function deleteActivityGroup(id: string) {
  return callCommand<boolean>("delete_activity_group", { id });
}

export function replaceActivityGroupItems(
  id: string,
  input: ReplaceActivityGroupItemsInput,
) {
  return callCommand<ActivityGroup>("replace_activity_group_items", { id, input });
}

export function listGroupingEvidence(id: string) {
  return callCommand<GroupingEvidence>("list_grouping_evidence", { id });
}

export function mergeActivityGroups(id: string, input: MergeActivityGroupsInput) {
  return callCommand<ActivityGroup>("merge_activity_groups", { id, input });
}

export function splitActivityGroup(id: string, input: SplitActivityGroupInput) {
  return callCommand<ActivityGroup>("split_activity_group", { id, input });
}

export function moveActivityGroupItem(id: string, input: MoveActivityGroupItemInput) {
  return callCommand<ActivityGroup>("move_activity_group_item", { id, input });
}

export function lockActivityGroup(id: string, input: LockActivityGroupInput) {
  return callCommand<ActivityGroup>("lock_activity_group", { id, input });
}

export function resetActivityGroup(id: string) {
  return callCommand<boolean>("reset_activity_group", { id });
}

export function previewActivityGroupTitle(groupId: string) {
  return callCommand<PreviewActivityGroupTitleResponse>("preview_activity_group_title", {
    input: { groupId },
  });
}

export function regenerateActivityGroupTitle(input: RegenerateActivityGroupTitleInput) {
  return callCommand<PreviewActivityGroupTitleResponse>("regenerate_activity_group_title", {
    input,
  });
}

export function selectActivityGroupTitleCandidate(input: SelectActivityGroupTitleCandidateInput) {
  return callCommand<ActivityGroup>("select_activity_group_title_candidate", { input });
}

export function recordActivityGroupTitleFeedback(input: RecordActivityGroupTitleFeedbackInput) {
  return callCommand<boolean>("record_activity_group_title_feedback", { input });
}
