import { callCommand } from "./client";
import type {
  CreateWeeklyTaskInput,
  ListWeeklyTasksInput,
  UpdateWeeklyTaskInput,
  WeeklyTask,
} from "../../types/weeklyTask";

export function listWeeklyTasks(input: ListWeeklyTasksInput) {
  return callCommand<WeeklyTask[]>("list_weekly_tasks", { input });
}

export function createWeeklyTask(input: CreateWeeklyTaskInput) {
  return callCommand<WeeklyTask>("create_weekly_task", { input });
}

export function updateWeeklyTask(id: string, input: UpdateWeeklyTaskInput) {
  return callCommand<WeeklyTask>("update_weekly_task", { id, input });
}

export function deleteWeeklyTask(id: string) {
  return callCommand<boolean>("delete_weekly_task", { id });
}
