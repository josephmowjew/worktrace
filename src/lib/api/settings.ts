import { callCommand } from "./client";
import type { Settings, UpdateSettingsInput } from "../../types/settings";

export function getSettings() {
  return callCommand<Settings>("get_settings");
}

export function updateSettings(input: UpdateSettingsInput) {
  return callCommand<Settings>("update_settings", { input });
}
