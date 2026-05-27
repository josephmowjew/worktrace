import type {
  AppVersionInfo,
  ReleaseNotesPayload,
  UpdateCheckResult,
} from "../../types/appUpdates";
import { callCommand } from "./client";

export function getAppVersion() {
  return callCommand<AppVersionInfo>("get_app_version");
}

export function getReleaseNotes() {
  return callCommand<ReleaseNotesPayload>("get_release_notes");
}

export function checkForAppUpdate() {
  return callCommand<UpdateCheckResult>("check_for_app_update");
}

export function installAppUpdate() {
  return callCommand<boolean>("install_app_update");
}
