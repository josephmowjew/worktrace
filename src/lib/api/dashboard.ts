import { callCommand } from "./client";
import type {
  DailyActivityHours,
  DashboardStats,
  ProjectBreakdown,
} from "../../types/dashboard";

export function getDashboardStats() {
  return callCommand<DashboardStats>("get_dashboard_stats");
}

export function getWeeklyActivityHours() {
  return callCommand<DailyActivityHours[]>("get_weekly_activity_hours");
}

export function getProjectBreakdown() {
  return callCommand<ProjectBreakdown[]>("get_project_breakdown");
}
