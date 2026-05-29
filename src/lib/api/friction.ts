import { callCommand } from "./client";
import type { FrictionInsight, GetFrictionInsightsInput } from "../../types/friction";

export function getFrictionInsights(input: GetFrictionInsightsInput) {
  return callCommand<FrictionInsight[]>("get_friction_insights", { input });
}
