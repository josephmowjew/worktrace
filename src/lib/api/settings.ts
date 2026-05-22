import { callCommand } from "./client";
import type {
  BackupLocationValidation,
  Settings,
  UpdateSettingsInput,
} from "../../types/settings";

export function getSettings() {
  return callCommand<Settings>("get_settings");
}

export function updateSettings(input: UpdateSettingsInput) {
  return callCommand<Settings>("update_settings", { input });
}

export function validateBackupLocation(location: string) {
  return callCommand<BackupLocationValidation>("validate_backup_location", { location });
}
