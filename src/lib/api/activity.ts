import { callCommand } from "./client";
import type {
  ActivityDay,
  HeatmapData,
  HeatmapInput,
  KeyHighlight,
  ListActivityInput,
  WeekSummary,
  WeekSummaryInput,
} from "../../types/activity";

export function listActivity(input: ListActivityInput) {
  return callCommand<ActivityDay[]>("list_activity", { input });
}

export function getActivityHeatmap(input: HeatmapInput) {
  return callCommand<HeatmapData>("get_activity_heatmap", { input });
}

export function getWeekSummary(input: WeekSummaryInput) {
  return callCommand<WeekSummary>("get_week_summary", { input });
}

export function getKeyHighlights(input: WeekSummaryInput) {
  return callCommand<KeyHighlight[]>("get_key_highlights", { input });
}
