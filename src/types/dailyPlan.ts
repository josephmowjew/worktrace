import type { CalendarEvent } from "./calendar";
import type { WeeklyTask } from "./weeklyTask";

export type DailyPlanItemStatus = "todo" | "done" | "dropped";

export type DailyPlan = {
  id: string;
  date: string;
  focusGoalMinutes: number;
  currentTaskId?: string | null;
  suggestedTaskId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DailyPlanItem = {
  id: string;
  dailyPlanId: string;
  rank: number;
  title: string;
  weeklyTaskId?: string | null;
  plannedMinutes?: number | null;
  status: DailyPlanItemStatus;
  createdAt: string;
  updatedAt: string;
};

export type GetDailyPlanInput = {
  date: string;
};

export type UpsertDailyPlanInput = {
  date: string;
  focusGoalMinutes?: number;
  currentTaskId?: string;
  suggestedTaskId?: string;
};

export type ReplaceDailyPlanItemsInput = {
  date: string;
  items: Array<{
    rank: number;
    title: string;
    weeklyTaskId?: string;
    plannedMinutes?: number;
  }>;
};

export type UpdateDailyPlanItemInput = {
  status?: DailyPlanItemStatus;
  title?: string;
  weeklyTaskId?: string;
  plannedMinutes?: number;
};

export type PlannedVsActualItem = {
  itemId: string;
  title: string;
  plannedMinutes: number;
  actualMinutes: number;
  varianceMinutes: number;
  ratio?: number | null;
  status: "met" | "under" | "over" | string;
};

export type DistractionRisk = {
  level: "low" | "medium" | "high" | string;
  score: number;
  reasons: string[];
};

export type EndOfDayProgress = {
  completedPriorities: number;
  totalPriorities: number;
  plannedMinutes: number;
  actualMinutes: number;
  varianceMinutes: number;
};

export type TodayCommandCenter = {
  date: string;
  dailyPlan: DailyPlan;
  topPriorities: DailyPlanItem[];
  meetings: CalendarEvent[];
  focusGoalMinutes: number;
  focusActualMinutes: number;
  currentTask?: WeeklyTask | null;
  suggestedNextTask?: WeeklyTask | null;
  distractionRisk: DistractionRisk;
  endOfDayProgress: EndOfDayProgress;
  plannedVsActual: PlannedVsActualItem[];
};
