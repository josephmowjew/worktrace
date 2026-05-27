import { callCommand } from "./client";
import type {
  ConnectSparcForceInput,
  ImportSparcForceTaskInput,
  ImportSparcForceTaskOutcome,
  ListSparcForceRecordsInput,
  SparcForceImportedData,
  SparcForceImportedItem,
  SparcForceIntegrationStatus,
  SparcForceLoginOutcome,
  SparcForceRecordQueryResult,
  SparcForceSyncResult,
  VerifySparcForceOtpInput,
} from "../../types/sparcForce";

export function getSparcForceIntegrationStatus() {
  return callCommand<SparcForceIntegrationStatus>("get_sparc_force_integration_status");
}

export function connectSparcForce(input: ConnectSparcForceInput) {
  return callCommand<SparcForceLoginOutcome>("connect_sparc_force", { input });
}

export function verifySparcForceLoginOtp(input: VerifySparcForceOtpInput) {
  return callCommand<SparcForceIntegrationStatus>("verify_sparc_force_login_otp", { input });
}

export function testSparcForceConnection() {
  return callCommand<SparcForceIntegrationStatus>("test_sparc_force_connection");
}

export function syncSparcForce() {
  return callCommand<SparcForceSyncResult>("sync_sparc_force");
}

export function listSparcForceImportedData() {
  return callCommand<SparcForceImportedData>("list_sparc_force_imported_data");
}

export function listSparcForceRecords(input: ListSparcForceRecordsInput) {
  return callCommand<SparcForceRecordQueryResult>("list_sparc_force_records", { input });
}

export function getSparcForceCaseDetail(externalId: string) {
  return callCommand<SparcForceImportedItem>("get_sparc_force_case_detail", {
    externalId,
  });
}

export function importSparcForceTaskToWeeklyTask(input: ImportSparcForceTaskInput) {
  return callCommand<ImportSparcForceTaskOutcome>("import_sparc_force_task_to_weekly_task", {
    input,
  });
}

export function disconnectSparcForce() {
  return callCommand<SparcForceIntegrationStatus>("disconnect_sparc_force");
}
