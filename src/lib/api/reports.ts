import { callCommand } from "./client";
import type {
  GenerateReportInput,
  GeneratedReport,
  CancelReportAiStreamInput,
  ConnectReportAiProviderInput,
  ListReportNotesInput,
  Report,
  ReportAiModelList,
  ReportAiStatus,
  ReportNote,
  ReportPolishInput,
  ReportPolishResult,
  ReportReadinessAnalysis,
  ReportReadinessInput,
  ReportSummary,
  SaveDailyReviewNoteInput,
  SaveReportInput,
  TestReportAiProviderInput,
} from "../../types/report";

export function generateReport(input: GenerateReportInput) {
  return callCommand<GeneratedReport>("generate_report", { input });
}

export function saveReport(input: SaveReportInput) {
  return callCommand<Report>("save_report", { input });
}

export function listReports() {
  return callCommand<ReportSummary[]>("list_reports");
}

export function getReport(id: string) {
  return callCommand<Report>("get_report", { id });
}

export function listReportNotes(input: ListReportNotesInput) {
  return callCommand<ReportNote[]>("list_report_notes", { input });
}

export function saveDailyReviewNote(input: SaveDailyReviewNoteInput) {
  return callCommand<ReportNote>("save_daily_review_note", { input });
}

export function getReportAiStatus() {
  return callCommand<ReportAiStatus>("get_report_ai_status");
}

export function connectReportAiProvider(input: ConnectReportAiProviderInput) {
  return callCommand<void>("connect_report_ai_provider", { input });
}

export function testReportAiProvider(input: TestReportAiProviderInput) {
  return callCommand<string>("test_report_ai_provider", { input });
}

export function disconnectReportAiProvider(input: TestReportAiProviderInput) {
  return callCommand<void>("disconnect_report_ai_provider", { input });
}

export function listReportAiProviderModels(input: TestReportAiProviderInput) {
  return callCommand<ReportAiModelList>("list_report_ai_provider_models", { input });
}

export function polishReport(input: ReportPolishInput) {
  return callCommand<ReportPolishResult>("polish_report", { input });
}

export function cancelReportAiStream(input: CancelReportAiStreamInput) {
  return callCommand<void>("cancel_report_ai_stream", { input });
}

export function analyzeReportReadiness(input: ReportReadinessInput) {
  return callCommand<ReportReadinessAnalysis>("analyze_report_readiness", { input });
}
