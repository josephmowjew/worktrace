import { callCommand } from "./client";
import type {
  CreateFocusSessionInput,
  FocusSession,
  ListFocusSessionsInput,
  StopFocusSessionInput,
} from "../../types/focusSession";

export function getActiveFocusSession() {
  return callCommand<FocusSession | null>("get_active_focus_session");
}

export function listFocusSessions(input: ListFocusSessionsInput) {
  return callCommand<FocusSession[]>("list_focus_sessions", { input });
}

export function startFocusSession(input: CreateFocusSessionInput) {
  return callCommand<FocusSession>("start_focus_session", { input });
}

export function stopFocusSession(id: string, input: StopFocusSessionInput) {
  return callCommand<FocusSession>("stop_focus_session", { id, input });
}

export function cancelFocusSession(id: string) {
  return callCommand<FocusSession>("cancel_focus_session", { id });
}
