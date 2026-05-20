import { callCommand } from "./client";
import type { ActivityDay, ListActivityInput } from "../../types/activity";

export function listActivity(input: ListActivityInput) {
  return callCommand<ActivityDay[]>("list_activity", { input });
}
