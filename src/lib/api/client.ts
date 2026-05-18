import { invoke } from "@tauri-apps/api/core";
import type { AppResult } from "../../types/api";

export async function callCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const result = await invoke<AppResult<T>>(command, args);

  if (!result.ok) {
    throw new Error(result.error?.message ?? "WorkTrace command failed");
  }

  return result.data as T;
}
