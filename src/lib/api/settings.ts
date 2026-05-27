import { callCommand } from "./client";
import type {
  BackupLocationValidation,
  Settings,
  SettingsExport,
  SettingsImportResult,
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

export function exportSettings() {
  return callCommand<SettingsExport>("export_settings");
}

export function exportSettingsToFile(path: string) {
  return callCommand<void>("export_settings_to_file", { path });
}

export function importSettings(payload: string) {
  return callCommand<SettingsImportResult>("import_settings", { payload });
}
