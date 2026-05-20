import { invoke } from "@tauri-apps/api/core";
import type { AppResult } from "../../types/api";

export class WorkTraceCommandError extends Error {
  code: string;
  command: string;
  details?: unknown;

  constructor(command: string, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "WorkTraceCommandError";
    this.command = command;
    this.code = code;
    this.details = details;
  }
}

export async function callCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauriRuntimeAvailable()) {
    throw new WorkTraceCommandError(
      command,
      "TAURI_RUNTIME_UNAVAILABLE",
      "WorkTrace data commands are available only in the Tauri desktop app. Start the app with npm run tauri:dev to use SQLite, Git sync, and native dialogs.",
    );
  }

  const result = await invoke<AppResult<T>>(command, args);

  if (!result.ok) {
    throw new WorkTraceCommandError(
      command,
      result.error?.code ?? "UNKNOWN",
      result.error?.message ?? "WorkTrace command failed",
      result.error?.details,
    );
  }

  return result.data as T;
}

function isTauriRuntimeAvailable() {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}
