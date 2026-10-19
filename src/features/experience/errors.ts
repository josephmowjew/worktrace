import { WorkTraceCommandError } from "../../lib/api/client";

export function localWorkError(error: unknown, fallback = "Could not save. Please try again.") {
  if (error instanceof WorkTraceCommandError && error.code === "TAURI_RUNTIME_UNAVAILABLE") {
    return "Open WorkTrace on your desktop to view and save your work.";
  }
  return error instanceof Error ? error.message : fallback;
}
