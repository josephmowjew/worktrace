export type PriorityReminder = {
  id: string;
  reminderKey: string;
  date: string;
  dailyPlanItemId: string;
  checkpointTime: string;
  title: string;
  plannedMinutes?: number | null;
  weeklyTaskId?: string | null;
  projectName?: string | null;
  status: string;
  snoozedUntil?: string | null;
  shownAt?: string | null;
  dismissedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ListPriorityRemindersInput = {
  date: string;
};

export type RunPriorityReminderCheckInput = {
  date: string;
  nowTime?: string;
};

export type SnoozePriorityReminderInput = {
  reminderKey: string;
  date: string;
  snoozeMinutes?: number;
};

export type DismissPriorityReminderInput = {
  reminderKey: string;
  date: string;
};
