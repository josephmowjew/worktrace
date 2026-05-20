import { callCommand } from "./client";
import type {
  GenerateReportInput,
  GeneratedReport,
  Report,
  ReportSummary,
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
