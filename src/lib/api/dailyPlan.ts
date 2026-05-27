import { callCommand } from "./client";
import type {
  DailyPlan,
  DailyPlanItem,
  GetDailyPlanInput,
  ReplaceDailyPlanItemsInput,
  TodayCommandCenter,
  UpdateDailyPlanItemInput,
  UpsertDailyPlanInput,
} from "../../types/dailyPlan";

export function getDailyPlan(input: GetDailyPlanInput) {
  return callCommand<DailyPlan | null>("get_daily_plan", { input });
}

export function upsertDailyPlan(input: UpsertDailyPlanInput) {
  return callCommand<DailyPlan>("upsert_daily_plan", { input });
}

export function replaceDailyPlanItems(input: ReplaceDailyPlanItemsInput) {
  return callCommand<DailyPlanItem[]>("replace_daily_plan_items", { input });
}

export function updateDailyPlanItem(id: string, input: UpdateDailyPlanItemInput) {
  return callCommand<DailyPlanItem>("update_daily_plan_item", { id, input });
}

export function getTodayCommandCenter(input: { date: string }) {
  return callCommand<TodayCommandCenter>("get_today_command_center", { input });
}
