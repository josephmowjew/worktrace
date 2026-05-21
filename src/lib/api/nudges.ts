import { callCommand } from "./client";
import type {
  DismissNudgeInput,
  ListNudgeDismissalsInput,
  NudgeDismissal,
} from "../../types/nudge";

export function listNudgeDismissals(input: ListNudgeDismissalsInput) {
  return callCommand<NudgeDismissal[]>("list_nudge_dismissals", { input });
}

export function dismissNudge(input: DismissNudgeInput) {
  return callCommand<NudgeDismissal>("dismiss_nudge", { input });
}
