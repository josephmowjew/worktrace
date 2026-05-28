import { callCommand } from "./client";
import type {
  DismissPriorityReminderInput,
  ListPriorityRemindersInput,
  PriorityReminder,
  RunPriorityReminderCheckInput,
  SnoozePriorityReminderInput,
} from "../../types/priorityReminder";

export function listPriorityReminders(input: ListPriorityRemindersInput) {
  return callCommand<PriorityReminder[]>("list_priority_reminders", { input });
}

export function runPriorityReminderCheck(input: RunPriorityReminderCheckInput) {
  return callCommand<PriorityReminder[]>("run_priority_reminder_check", { input });
}

export function snoozePriorityReminder(input: SnoozePriorityReminderInput) {
  return callCommand<PriorityReminder[]>("snooze_priority_reminder", { input });
}

export function dismissPriorityReminder(input: DismissPriorityReminderInput) {
  return callCommand<PriorityReminder[]>("dismiss_priority_reminder", { input });
}
