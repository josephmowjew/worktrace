import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ClipboardList,
  Copy,
  Download,
  FileText,
  FolderKanban,
  History,
  Save,
  Sparkles,
  Clock3,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { DatePicker } from "../components/ui/DatePicker";
import { Panel } from "../components/ui/Panel";
import { Select } from "../components/ui/Select";
import { useToast } from "../components/ui/ToastProvider";
import { listProjects } from "../lib/api/projects";
import {
  generateReport,
  analyzeReportReadiness,
  connectReportAiProvider,
  disconnectReportAiProvider,
  getReport,
  getReportAiStatus,
  listReports,
  polishReport,
  saveReport,
  testReportAiProvider,
} from "../lib/api/reports";
import { getSettings } from "../lib/api/settings";
import { currentWeekRange } from "../lib/dates";
import type { GeneratedReport, ReportAiProvider, ReportReadinessAnalysis, ReportSummary } from "../types/report";

export function ReportsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
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
  const [reportAiProvider, setReportAiProvider] = useState<ReportAiProvider>("local_llama_cpp");
  const [openRouterKey, setOpenRouterKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [readiness, setReadiness] = useState<ReportReadinessAnalysis | null>(null);

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
  const reportAiStatusQuery = useQuery({
    queryKey: ["reportAiStatus"],
    queryFn: getReportAiStatus,
  });

  const activeProjects = (projectsQuery.data ?? []).filter(
    (project) => project.status === "active",
  );
  const title = useMemo(
    () => report?.title ?? `Weekly Report ${startDate} to ${endDate}`,
    [endDate, report?.title, startDate],
  );
  const selectedProjectLabel =
    selectedProjectId === "all"
      ? "All projects"
      : activeProjects.find((project) => project.id === selectedProjectId)?.name ??
        "Selected project";
  const contentStats = getContentStats(content);

  useEffect(() => {
    if (isReportAiProvider(settingsQuery.data?.reportAiProvider ?? "")) {
      setReportAiProvider(settingsQuery.data!.reportAiProvider as ReportAiProvider);
    }
  }, [settingsQuery.data]);

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
      setReadiness(null);
      toast.success("Report generated", "Review and edit the Markdown before saving.");
    },
    onError: (error) => {
      toast.error("Report generation failed", error instanceof Error ? error.message : "The report could not be generated.");
    },
  });
  const polishMutation = useMutation({
    mutationFn: () =>
      polishReport({
        draft: content,
        startDate,
        endDate,
        recipientName:
          recipientName.trim() || settingsQuery.data?.defaultManagerName || null,
        projectIds: selectedProjectId === "all" ? null : [selectedProjectId],
        includeHidden,
        provider: reportAiProvider,
      }),
    onSuccess: (result) => {
      setContent(result.content);
      toast.success(
        result.usedFallback ? "AI polish used fallback" : "Report polished",
        result.message,
      );
    },
    onError: (error) => {
      toast.error("AI polish failed", error instanceof Error ? error.message : "The report could not be polished.");
    },
  });
  const readinessMutation = useMutation({
    mutationFn: () =>
      analyzeReportReadiness({
        startDate,
        endDate,
        projectIds: selectedProjectId === "all" ? null : [selectedProjectId],
        includeHidden,
        provider: reportAiProvider,
      }),
    onSuccess: (result) => {
      setReadiness(result);
      toast.success("Readiness analyzed", `${result.score}/100 readiness score.`);
    },
    onError: (error) => {
      toast.error("Readiness failed", error instanceof Error ? error.message : "The report could not be analyzed.");
    },
  });
  const connectAiMutation = useMutation({
    mutationFn: ({ provider, apiKey }: { provider: ReportAiProvider; apiKey: string }) =>
      connectReportAiProvider({ provider, apiKey }),
    onSuccess: async (_, variables) => {
      if (variables.provider === "openrouter_free") setOpenRouterKey("");
      if (variables.provider === "groq") setGroqKey("");
      await reportAiStatusQuery.refetch();
      toast.success("AI provider connected");
    },
    onError: (error) => {
      toast.error("Provider connect failed", error instanceof Error ? error.message : "The provider key could not be stored.");
    },
  });
  const testAiMutation = useMutation({
    mutationFn: (provider: ReportAiProvider) => testReportAiProvider({ provider }),
    onSuccess: (message) => {
      toast.success("Provider ready", message);
    },
    onError: (error) => {
      toast.error("Provider test failed", error instanceof Error ? error.message : "The provider could not be tested.");
    },
  });
  const disconnectAiMutation = useMutation({
    mutationFn: (provider: ReportAiProvider) => disconnectReportAiProvider({ provider }),
    onSuccess: async () => {
      await reportAiStatusQuery.refetch();
      toast.success("AI provider disconnected");
    },
    onError: (error) => {
      toast.error("Provider disconnect failed", error instanceof Error ? error.message : "The provider could not be disconnected.");
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
      toast.success("Report saved", "The report is now available in history.");
    },
    onError: (error) => {
      toast.error("Save failed", error instanceof Error ? error.message : "The report could not be saved.");
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
      toast.success("Report loaded", savedReport.title);
    },
    onError: (error) => {
      toast.error("Load failed", error instanceof Error ? error.message : "The saved report could not be loaded.");
    },
  });

  async function copyReport() {
    if (!content.trim()) {
      return;
    }

    await navigator.clipboard.writeText(content);
    setCopied(true);
    toast.success("Copied to clipboard");
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
    toast.success("Markdown exported", anchor.download);
  }

  return (
    <div className="space-y-4">
      <ReportsHero
        generatedCount={reportsQuery.data?.length ?? 0}
        reportReadyItems={content.trim() ? contentStats.lines : 0}
        lastGenerated={reportsQuery.data?.[0]}
      />

      <div className="grid min-h-0 gap-4 2xl:grid-cols-[390px_minmax(0,1fr)_330px]">
      <Panel className="relative overflow-visible p-0">
        <div className="absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_12%_0%,rgba(59,130,246,0.20),transparent_32%),radial-gradient(circle_at_100%_28%,rgba(20,184,166,0.12),transparent_30%)]" />
        <div className="relative p-5">
          <div className="mb-5">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
              <Sparkles className="h-3.5 w-3.5" />
              Markdown builder
            </div>
            <h2 className="text-lg font-semibold tracking-tight text-white">Report Builder</h2>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Configure your reporting range and choose what to include.
            </p>
          </div>

          <div className="space-y-4">
            <Field label="Start Date">
              <DatePicker value={startDate} onChange={setStartDate} />
            </Field>
            <Field label="End Date">
              <DatePicker value={endDate} onChange={setEndDate} />
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
              <Select
                value={selectedProjectId}
                onChange={setSelectedProjectId}
                options={[
                  { value: "all", label: "All projects", icon: FolderKanban },
                  ...activeProjects.map((project) => ({
                    value: project.id,
                    label: project.name,
                    icon: FolderKanban,
                  })),
                ]}
                size="md"
              />
            </Field>

            <div className="grid gap-2">
              <Toggle label="Include commits" checked={includeCommits} onChange={setIncludeCommits} />
              <Toggle label="Include manual logs" checked={includeManualLogs} onChange={setIncludeManualLogs} />
              <Toggle label="Include weekly plan" checked={includeWeeklyTasks} onChange={setIncludeWeeklyTasks} />
              <Toggle label="Include hidden items" checked={includeHidden} onChange={setIncludeHidden} />
            </div>

            <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/5 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Report AI</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {reportAiProvider === "local_llama_cpp"
                      ? "Local/offline"
                      : "Online provider - selected report context is sent out"}
                  </p>
                </div>
                <Badge tone={reportAiProvider === "local_llama_cpp" ? "green" : "blue"}>
                  {reportAiProvider === "local_llama_cpp" ? "Local" : "Online"}
                </Badge>
              </div>
              <Select
                value={reportAiProvider}
                onChange={(value) => setReportAiProvider(value as ReportAiProvider)}
                options={[
                  { value: "local_llama_cpp", label: "Local llama.cpp", icon: FileText },
                  { value: "openrouter_free", label: "OpenRouter free", icon: Sparkles },
                  { value: "groq", label: "Groq", icon: Sparkles },
                ]}
                size="sm"
              />
              <p className="mt-2 text-[11px] leading-5 text-slate-500">
                {providerStatus(reportAiStatusQuery.data, reportAiProvider)}
              </p>
            </div>

            {generateMutation.isError ? (
              <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
                {generateMutation.error instanceof Error
                  ? generateMutation.error.message
                  : "Report could not be generated."}
              </div>
            ) : null}

            <Button
              variant="primary"
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-500 py-3 shadow-blue-500/30 hover:from-blue-500 hover:to-indigo-400"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
            >
              <FileText className="h-4 w-4" />
              {generateMutation.isPending ? "Generating..." : "Generate Report"}
            </Button>
          </div>
        </div>
      </Panel>

      <Panel className="relative min-h-[680px] overflow-hidden p-0">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/50 to-transparent" />
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-white">Live Preview</h2>
              <Badge tone={content.trim() ? "green" : "slate"}>
                {content.trim() ? "Editable" : "Draft"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-slate-500">{title}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => readinessMutation.mutate()} disabled={readinessMutation.isPending}>
              <Sparkles className="h-4 w-4" />
              {readinessMutation.isPending ? "Analyzing..." : "Analyze"}
            </Button>
            <Button
              onClick={() => polishMutation.mutate()}
              disabled={!content.trim() || polishMutation.isPending}
            >
              <Sparkles className="h-4 w-4" />
              {polishMutation.isPending ? "Polishing..." : "Polish"}
            </Button>
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

        <div className="grid gap-3 border-b border-white/8 px-5 py-3 sm:grid-cols-3">
          <PreviewStat label="Range" value={`${compactDate(startDate)} - ${compactDate(endDate)}`} />
          <PreviewStat label="Audience" value={recipientName.trim() || settingsQuery.data?.defaultManagerName || "Manager"} />
          <PreviewStat label="Sources" value={selectedProjectLabel} />
        </div>

        <div className="p-5">
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
          {readiness ? (
            <div className="mb-3 rounded-2xl border border-cyan-300/15 bg-cyan-300/5 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-cyan-100">
                    Readiness score: {readiness.score}/100
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{readiness.summary}</p>
                </div>
                <Badge tone={readiness.usedFallback ? "slate" : "green"}>
                  {readiness.usedFallback ? "Deterministic" : readiness.provider}
                </Badge>
              </div>
              {readiness.findings.length > 0 ? (
                <div className="grid gap-2 md:grid-cols-2">
                  {readiness.findings.map((finding) => (
                    <div key={`${finding.severity}-${finding.title}`} className="rounded-xl border border-white/10 bg-slate-950/45 p-3">
                      <p className="text-xs font-semibold text-slate-100">{finding.title}</p>
                      <p className="mt-1 text-[11px] leading-5 text-slate-400">{finding.detail}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <textarea
            value={content}
            onChange={(event) => setContent(event.currentTarget.value)}
            className="min-h-[510px] w-full resize-y rounded-2xl border border-white/10 bg-slate-950/60 p-5 font-mono text-sm leading-7 text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/15"
            placeholder="Generate a report to preview and edit Markdown here."
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-2 py-1">
              Markdown
            </span>
            <span>
              {contentStats.words} words • {contentStats.characters} characters •{" "}
              {contentStats.lines} lines
            </span>
          </div>
        </div>
      </Panel>

      <Panel className="relative h-fit overflow-hidden p-0">
        <div className="absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_100%_0%,rgba(20,184,166,0.18),transparent_30%)]" />
        <div className="relative p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white">Saved Reports</h2>
              <p className="mt-1 text-xs text-slate-500">Local report history</p>
            </div>
            <History className="h-4 w-4 text-cyan-300" />
          </div>

          <div className="mb-4 space-y-3 rounded-2xl border border-white/10 bg-slate-950/45 p-3">
            <h3 className="text-sm font-semibold text-white">Online AI Keys</h3>
            <ProviderKeyRow
              label="OpenRouter"
              provider="openrouter_free"
              value={openRouterKey}
              status={providerStatus(reportAiStatusQuery.data, "openrouter_free")}
              isPending={connectAiMutation.isPending || testAiMutation.isPending || disconnectAiMutation.isPending}
              onChange={setOpenRouterKey}
              onConnect={() =>
                connectAiMutation.mutate({ provider: "openrouter_free", apiKey: openRouterKey })
              }
              onTest={() => testAiMutation.mutate("openrouter_free")}
              onDisconnect={() => disconnectAiMutation.mutate("openrouter_free")}
            />
            <ProviderKeyRow
              label="Groq"
              provider="groq"
              value={groqKey}
              status={providerStatus(reportAiStatusQuery.data, "groq")}
              isPending={connectAiMutation.isPending || testAiMutation.isPending || disconnectAiMutation.isPending}
              onChange={setGroqKey}
              onConnect={() => connectAiMutation.mutate({ provider: "groq", apiKey: groqKey })}
              onTest={() => testAiMutation.mutate("groq")}
              onDisconnect={() => disconnectAiMutation.mutate("groq")}
            />
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
            <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
              {reportsQuery.data.map((savedReport) => (
                <SavedReportRow
                  key={savedReport.id}
                  report={savedReport}
                  isLoading={loadMutation.isPending}
                  onLoad={() => loadMutation.mutate(savedReport.id)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/35 p-5 text-xs leading-6 text-slate-400">
              Saved report history will appear here after you save generated Markdown.
            </div>
          )}
        </div>
      </Panel>
      </div>
    </div>
  );
}

function ReportsHero({
  generatedCount,
  reportReadyItems,
  lastGenerated,
}: {
  generatedCount: number;
  reportReadyItems: number;
  lastGenerated?: ReportSummary;
}) {
  return (
    <Panel className="relative overflow-hidden p-0">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(37,99,235,0.28),transparent_30%),radial-gradient(circle_at_86%_16%,rgba(20,184,166,0.16),transparent_26%),linear-gradient(135deg,rgba(15,23,42,0.2),rgba(15,23,42,0.82))]" />
      <div className="absolute inset-y-0 right-0 hidden w-[38%] opacity-70 lg:block">
        <div className="absolute right-16 top-10 h-28 w-20 rotate-6 rounded-2xl border border-blue-300/25 bg-blue-500/15 shadow-2xl shadow-blue-500/20" />
        <div className="absolute right-40 top-20 h-24 w-32 -rotate-6 rounded-2xl border border-cyan-300/20 bg-cyan-500/10" />
        <div className="absolute right-4 top-20 h-px w-72 rotate-[-18deg] bg-gradient-to-r from-transparent via-blue-300/60 to-transparent" />
      </div>
      <div className="relative grid gap-6 px-5 py-6 lg:grid-cols-[minmax(0,0.72fr)_minmax(480px,1fr)] lg:items-end">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Reports</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Generate beautiful, shareable weekly reports from synced commits, manual logs, and planned work.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <HeroStat icon={FileText} label="Saved Reports" value={generatedCount.toString()} detail="Local history" />
          <HeroStat icon={Check} label="Report-Ready Items" value={reportReadyItems.toString()} detail="Current draft" />
          <HeroStat
            icon={Clock3}
            label="Last Generated"
            value={lastGenerated ? compactDate(lastGenerated.createdAt.slice(0, 10)) : "None"}
            detail={lastGenerated?.title ?? "No saved report"}
          />
        </div>
      </div>
    </Panel>
  );
}

function HeroStat({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/35 p-4 shadow-xl shadow-black/10">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-blue-300/20 bg-blue-500/15 text-blue-200">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {label}
        </span>
        <span className="mt-1 block text-2xl font-semibold text-white">{value}</span>
        <span className="block truncate text-xs text-slate-400">{detail}</span>
      </span>
    </div>
  );
}

function SavedReportRow({
  report,
  isLoading,
  onLoad,
}: {
  report: ReportSummary;
  isLoading: boolean;
  onLoad: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onLoad}
      disabled={isLoading}
      className="group w-full rounded-2xl border border-white/8 bg-slate-950/45 p-3 text-left transition hover:border-blue-300/25 hover:bg-slate-900/60 disabled:opacity-60"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-blue-300/20 bg-blue-500/10 text-blue-200">
          <ClipboardList className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">
            {report.title}
          </span>
          <span className="mt-1 block text-[11px] text-slate-500">
            {compactDate(report.startDate)} - {compactDate(report.endDate)}
          </span>
          {report.recipientName ? (
            <span className="mt-2 inline-flex">
              <Badge tone="slate">{report.recipientName}</Badge>
            </span>
          ) : null}
        </span>
      </div>
    </button>
  );
}

function ProviderKeyRow({
  label,
  value,
  status,
  isPending,
  onChange,
  onConnect,
  onTest,
  onDisconnect,
}: {
  label: string;
  provider: ReportAiProvider;
  value: string;
  status: string;
  isPending: boolean;
  onChange: (value: string) => void;
  onConnect: () => void;
  onTest: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-200">{label}</p>
        <p className="truncate text-[10px] text-slate-500">{status}</p>
      </div>
      <input
        type="password"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className={inputClass}
        placeholder={`${label} API key`}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="primary" disabled={!value.trim() || isPending} onClick={onConnect} className="h-8 px-2 text-xs">
          Connect
        </Button>
        <Button type="button" disabled={isPending} onClick={onTest} className="h-8 px-2 text-xs">
          Test
        </Button>
        <Button type="button" variant="ghost" disabled={isPending} onClick={onDisconnect} className="h-8 px-2 text-xs">
          Disconnect
        </Button>
      </div>
    </div>
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
    <label className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/45 px-3 py-2.5 text-sm text-slate-300">
      {label}
      <span className="relative inline-flex cursor-pointer items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.currentTarget.checked)}
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full border border-white/10 bg-slate-800 transition peer-checked:border-blue-300/40 peer-checked:bg-blue-600" />
        <span className="absolute left-1 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
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

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-slate-950/35 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function compactDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function getContentStats(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return { words: 0, characters: 0, lines: 0 };
  }

  return {
    words: trimmed.split(/\s+/).length,
    characters: value.length,
    lines: value.split(/\r?\n/).length,
  };
}

function providerStatus(
  status: { providers: { provider: string; message: string }[] } | undefined,
  provider: ReportAiProvider,
) {
  return status?.providers.find((item) => item.provider === provider)?.message ?? "Status unavailable.";
}

function isReportAiProvider(value: string): value is ReportAiProvider {
  return ["local_llama_cpp", "openrouter_free", "groq"].includes(value);
}

const inputClass =
  "h-10 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/15";
