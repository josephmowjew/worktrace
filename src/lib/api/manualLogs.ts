import { callCommand } from "./client";
import type {
  CreateManualLogInput,
  ListManualLogsInput,
  ManualLog,
  UpdateManualLogInput,
} from "../../types/manualLog";

export function listManualLogs(input: ListManualLogsInput) {
  return callCommand<ManualLog[]>("list_manual_logs", { input });
}

export function createManualLog(input: CreateManualLogInput) {
  return callCommand<ManualLog>("create_manual_log", { input });
}

export function updateManualLog(id: string, input: UpdateManualLogInput) {
  return callCommand<ManualLog>("update_manual_log", { id, input });
}

export function deleteManualLog(id: string) {
  return callCommand<boolean>("delete_manual_log", { id });
}
