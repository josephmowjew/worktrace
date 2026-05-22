import { callCommand } from "./client";
import type {
  GenerateReportInput,
  GeneratedReport,
  ListReportNotesInput,
  Report,
  ReportNote,
  ReportSummary,
  SaveDailyReviewNoteInput,
  SaveReportInput,
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
