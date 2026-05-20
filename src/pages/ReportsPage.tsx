import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Download,
  FileText,
  History,
  Save,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { listProjects } from "../lib/api/projects";
import {
  generateReport,
  getReport,
  listReports,
  saveReport,
} from "../lib/api/reports";
import { getSettings } from "../lib/api/settings";
import { currentWeekRange } from "../lib/dates";
import type { GeneratedReport, ReportSummary } from "../types/report";

export function ReportsPage() {
  const queryClient = useQueryClient();
  const weekRange = currentWeekRange();
  const [startDate, setStartDate] = useState(weekRange.from);
  const [endDate, setEndDate] = useState(weekRange.to);
  const [recipientName, setRecipientName] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("all");
  const [includeCommits, setIncludeCommits] = useState(true);
  const [includeManualLogs, setIncludeManualLogs] = useState(true);
  const [includeWeeklyTasks, setIncludeWeeklyTasks] = useState(true);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [report, setReport] = useState<GeneratedReport | null>(null);
  const [content, setContent] = useState("");
  const [copied, setCopied] = useState(false);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });
  const reportsQuery = useQuery({
    queryKey: ["reports"],
    queryFn: listReports,
  });

  const title = useMemo(
    () => report?.title ?? `Weekly Report ${startDate} to ${endDate}`,
    [endDate, report?.title, startDate],
  );

  const generateMutation = useMutation({
    mutationFn: () =>
      generateReport({
        startDate,
        endDate,
        recipientName:
          recipientName.trim() || settingsQuery.data?.defaultManagerName || null,
        projectIds: selectedProjectId === "all" ? null : [selectedProjectId],
        includeCommits,
        includeManualLogs,
        includeWeeklyTasks,
        includeHidden,
      }),
    onSuccess: (generatedReport) => {
      setReport(generatedReport);
      setContent(generatedReport.content);
      setCopied(false);
    },
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      saveReport({
        title,
        startDate,
        endDate,
        recipientName:
          recipientName.trim() || settingsQuery.data?.defaultManagerName || null,
        content,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });

  const loadMutation = useMutation({
    mutationFn: getReport,
    onSuccess: (savedReport) => {
      setReport(savedReport);
      setStartDate(savedReport.startDate);
      setEndDate(savedReport.endDate);
      setRecipientName(savedReport.recipientName ?? "");
      setContent(savedReport.content);
      setCopied(false);
    },
  });

  async function copyReport() {
    if (!content.trim()) {
      return;
    }

    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function exportMarkdown() {
    if (!content.trim()) {
      return;
    }

    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_300px]">
      <Panel className="h-fit">
        <div className="mb-5">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
            <Sparkles className="h-3.5 w-3.5" />
            Markdown builder
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Reports</h1>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Generate editable weekly updates from synced commits and manual logs.
          </p>
        </div>

        <div className="space-y-3">
          <Field label="Start Date">
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.currentTarget.value)}
              className={inputClass}
            />
          </Field>
          <Field label="End Date">
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.currentTarget.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Recipient / Manager">
            <input
              value={recipientName}
              onChange={(event) => setRecipientName(event.currentTarget.value)}
              className={inputClass}
              placeholder={settingsQuery.data?.defaultManagerName || "Manager"}
            />
          </Field>
          <Field label="Included Projects">
            <select
              value={selectedProjectId}
              onChange={(event) => setSelectedProjectId(event.currentTarget.value)}
              className={inputClass}
            >
              <option value="all">All projects</option>
              {(projectsQuery.data ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </Field>

          <Toggle
            label="Include commits"
            checked={includeCommits}
            onChange={setIncludeCommits}
          />
          <Toggle
            label="Include manual logs"
            checked={includeManualLogs}
            onChange={setIncludeManualLogs}
          />
          <Toggle
            label="Include weekly plan"
            checked={includeWeeklyTasks}
            onChange={setIncludeWeeklyTasks}
          />
          <Toggle
            label="Include hidden items"
            checked={includeHidden}
            onChange={setIncludeHidden}
          />

          {generateMutation.isError ? (
            <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
              {generateMutation.error instanceof Error
                ? generateMutation.error.message
                : "Report could not be generated."}
            </div>
          ) : null}

          <Button
            variant="primary"
            className="w-full"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
          >
            <FileText className="h-4 w-4" />
            {generateMutation.isPending ? "Generating..." : "Generate Report"}
          </Button>
        </div>
      </Panel>

      <Panel className="min-h-[640px]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Live Preview</h2>
            <p className="mt-1 text-xs text-slate-500">{title}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={copyReport} disabled={!content.trim()}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button onClick={exportMarkdown} disabled={!content.trim()}>
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button
              variant="primary"
              onClick={() => saveMutation.mutate()}
              disabled={!content.trim() || saveMutation.isPending}
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        {saveMutation.isSuccess ? (
          <div className="mb-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-xs text-emerald-100">
            Report saved to history.
          </div>
        ) : null}
        {saveMutation.isError ? (
          <div className="mb-3 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
            {saveMutation.error instanceof Error
              ? saveMutation.error.message
              : "Report could not be saved."}
          </div>
        ) : null}

        <textarea
          value={content}
          onChange={(event) => setContent(event.currentTarget.value)}
          className="min-h-[520px] w-full resize-y rounded-xl border border-white/8 bg-slate-950/55 p-4 font-mono text-xs leading-6 text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/15"
          placeholder="Generate a report to preview and edit Markdown here."
        />
      </Panel>

      <Panel className="h-fit">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Saved Reports</h2>
            <p className="mt-1 text-xs text-slate-500">Local report history</p>
          </div>
          <History className="h-4 w-4 text-cyan-300" />
        </div>

        {reportsQuery.isLoading ? (
          <div className="grid gap-2">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-16 animate-pulse rounded-xl border border-white/8 bg-white/[0.03]"
              />
            ))}
          </div>
        ) : reportsQuery.data && reportsQuery.data.length > 0 ? (
          <div className="grid gap-2">
            {reportsQuery.data.map((savedReport) => (
              <SavedReportRow
                key={savedReport.id}
                report={savedReport}
                onLoad={() => loadMutation.mutate(savedReport.id)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/8 bg-white/[0.02] p-4 text-xs leading-5 text-slate-400">
            Saved report history will appear here after you save generated Markdown.
          </div>
        )}
      </Panel>
    </div>
  );
}

function SavedReportRow({
  report,
  onLoad,
}: {
  report: ReportSummary;
  onLoad: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onLoad}
      className="rounded-xl border border-white/8 bg-slate-950/45 p-3 text-left transition hover:border-blue-300/25 hover:bg-slate-900/60"
    >
      <p className="truncate text-sm font-semibold text-white">{report.title}</p>
      <p className="mt-1 text-[11px] text-slate-500">
        {report.startDate} to {report.endDate}
      </p>
      {report.recipientName ? (
        <Badge tone="slate">{report.recipientName}</Badge>
      ) : null}
    </button>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/45 px-3 py-2 text-sm text-slate-300">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="h-4 w-4 accent-blue-500"
      />
    </label>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-xs font-semibold text-slate-300">
      {label}
      {children}
    </label>
  );
}

const inputClass =
  "h-10 w-full rounded-xl border border-white/10 bg-slate-950/75 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/15";
