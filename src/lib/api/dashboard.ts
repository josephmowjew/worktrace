import { callCommand } from "./client";
import type {
  DailyActivityHours,
  DashboardStats,
  ProjectBreakdown,
} from "../../types/dashboard";

export type DashboardDateRangeInput = {
  from: string;
  to: string;
};

export function getDashboardStats(input: DashboardDateRangeInput) {
  return callCommand<DashboardStats>("get_dashboard_stats", { input });
}

export function getWeeklyActivityHours(input: DashboardDateRangeInput) {
  return callCommand<DailyActivityHours[]>("get_weekly_activity_hours", { input });
}

export function getProjectBreakdown(input: DashboardDateRangeInput) {
  return callCommand<ProjectBreakdown[]>("get_project_breakdown", { input });
}
