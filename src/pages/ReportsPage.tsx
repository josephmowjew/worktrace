import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ClipboardList,
  Copy,
  Download,
  FileText,
  FolderKanban,
  History,
  X,
  Save,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ActionMenu } from "../components/ui/ActionMenu";
import { Disclosure } from "../components/ui/Disclosure";
import type { ReactNode } from "react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { DatePicker } from "../components/ui/DatePicker";
import { FrictionInsightPanel } from "../components/ui/FrictionInsightPanel";
import { Panel } from "../components/ui/Panel";
import { Select } from "../components/ui/Select";
import { useExperience } from "../features/experience/useExperience";
import { useToast } from "../components/ui/ToastProvider";
import { getProjectGitFocus, listGitRefs, listGitWorktrees, listProjects } from "../lib/api/projects";
import { getFrictionInsights } from "../lib/api/friction";
import {
  generateReport,
  analyzeReportReadiness,
  cancelReportAiStream,
  getReport,
  getReportAiStatus,
  listReports,
  polishReport,
  saveReport,
} from "../lib/api/reports";
import { getSettings } from "../lib/api/settings";
import type { GitRef, GitRefFilter, GitWorktree } from "../types/project";
import type { ReportAiProvider, ReportSummary } from "../types/report";
import { useReportsWorkspace } from "./reportsWorkspace";

export function ReportsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const experience = useExperience();
  const {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    recipientName,
    setRecipientName,
    selectedProjectId,
    setSelectedProjectId,
    selectedClassification,
    setSelectedClassification,
    selectedGitRefs,
    setSelectedGitRefs,
    selectedWorktreePaths,
    setSelectedWorktreePaths,
    useProjectGitFocus,
    setUseProjectGitFocus,
    includeCommits,
    setIncludeCommits,
    includeManualLogs,
    setIncludeManualLogs,
    includeWeeklyTasks,
    setIncludeWeeklyTasks,
    includeHidden,
    setIncludeHidden,
    report,
    setReport,
    content,
    setContent,
    copied,
    setCopied,
    reportAiProvider,
    setReportAiProvider,
    readiness,
    setReadiness,
    polishStreamStatus,
    activePolishStreamId,
    polishCancelled,
    beginPolishStream,
    finishPolishStream,
    markPolishStreamCancelled,
  } = useReportsWorkspace();
  const polishCancelledRef = useRef(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
    enabled: experience.isDeveloper,
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
    enabled: experience.isDeveloper,
  });
  const gitRefsQuery = useQuery({
    queryKey: ["gitRefs", selectedProjectId],
    queryFn: () => listGitRefs(selectedProjectId),
    enabled: experience.isDeveloper && selectedProjectId !== "all",
  });
  const gitWorktreesQuery = useQuery({
    queryKey: ["gitWorktrees", selectedProjectId],
    queryFn: () => listGitWorktrees(selectedProjectId),
    enabled: experience.isDeveloper && selectedProjectId !== "all",
  });
  const projectGitFocusQuery = useQuery({
    queryKey: ["projectGitFocus", selectedProjectId],
    queryFn: () => getProjectGitFocus(selectedProjectId),
    enabled: experience.isDeveloper && selectedProjectId !== "all",
  });
  const frictionInsightsQuery = useQuery({
    enabled: experience.isDeveloper,
    queryKey: ["frictionInsights", startDate, endDate, selectedProjectId, selectedClassification, "reports"],
    queryFn: () =>
      getFrictionInsights({
        from: startDate,
        to: endDate,
        projectIds: selectedProjectId === "all" ? null : [selectedProjectId],
        classification: selectedClassification === "all" ? null : selectedClassification,
        surface: "reports",
      }),
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
  const selectedClassificationValue =
    selectedClassification === "all" ? null : selectedClassification;
  const selectedSourceLabel =
    selectedClassification === "all"
      ? selectedProjectLabel
      : `${selectedProjectLabel} / ${classificationLabel(selectedClassification)}`;
  const contentStats = getContentStats(content);

  useEffect(() => {
    if (selectedProjectId === "all") {
      setSelectedGitRefs([]);
      setSelectedWorktreePaths([]);
      setUseProjectGitFocus(true);
      return;
    }

    if (useProjectGitFocus && projectGitFocusQuery.data) {
      setSelectedGitRefs(projectGitFocusQuery.data.refs);
      setSelectedWorktreePaths(projectGitFocusQuery.data.worktreePaths);
    }
  }, [projectGitFocusQuery.data, selectedProjectId, setSelectedGitRefs, setSelectedWorktreePaths, setUseProjectGitFocus, useProjectGitFocus]);

  const reportGitRefs = useProjectGitFocus ? null : selectedGitRefs;
  const reportWorktreePaths = useProjectGitFocus ? null : selectedWorktreePaths;

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
        projectIds: !experience.isDeveloper || selectedProjectId === "all" ? null : [selectedProjectId],
        classification: experience.isDeveloper ? selectedClassificationValue : null,
        gitRefs: experience.isDeveloper ? reportGitRefs : null,
        worktreePaths: experience.isDeveloper ? reportWorktreePaths : null,
        useProjectGitFocus: experience.isDeveloper && useProjectGitFocus,
        includeCommits: experience.isDeveloper && includeCommits,
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
    mutationFn: () => {
      polishCancelledRef.current = false;
      const streamId = beginPolishStream();
      return polishReport({
        draft: content,
        startDate,
        endDate,
        recipientName:
          recipientName.trim() || settingsQuery.data?.defaultManagerName || null,
        projectIds: selectedProjectId === "all" ? null : [selectedProjectId],
        classification: selectedClassificationValue,
        gitRefs: reportGitRefs,
        worktreePaths: reportWorktreePaths,
        useProjectGitFocus,
        includeHidden,
        provider: reportAiProvider,
        streamId,
      });
    },
    onSuccess: (result) => {
      if (polishCancelledRef.current || polishCancelled) {
        finishPolishStream();
        toast.success("AI polish cancelled", "Kept the current report draft.");
        return;
      }

      finishPolishStream();
      setContent(result.content);
      if (result.usedFallback) {
        toast.warning("AI polish kept draft", result.message);
        return;
      }

      toast.success("Report polished", result.message);
    },
    onError: (error) => {
      finishPolishStream();
      toast.error("AI polish failed", error instanceof Error ? error.message : "The report could not be polished.");
    },
  });
  const cancelPolishMutation = useMutation({
    mutationFn: () => {
      if (!activePolishStreamId) {
        return Promise.resolve();
      }

      polishCancelledRef.current = true;
      markPolishStreamCancelled();
      return cancelReportAiStream({ streamId: activePolishStreamId });
    },
    onSuccess: () => {
      toast.success("Cancellation requested", "Stopping AI polish...");
    },
    onError: (error) => {
      toast.error("Cancel failed", error instanceof Error ? error.message : "The report polish could not be cancelled.");
    },
  });

  useEffect(() => {
    if (!polishMutation.isPending && !activePolishStreamId) {
      polishCancelledRef.current = false;
      finishPolishStream();
    }
  }, [activePolishStreamId, finishPolishStream, polishMutation.isPending]);
  const readinessMutation = useMutation({
    mutationFn: () =>
      analyzeReportReadiness({
        startDate,
        endDate,
        projectIds: selectedProjectId === "all" ? null : [selectedProjectId],
        classification: selectedClassificationValue,
        gitRefs: reportGitRefs,
        worktreePaths: reportWorktreePaths,
        useProjectGitFocus,
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
      setHistoryOpen(false);
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
    <div className="space-y-3">
      <ReportsHero
        isDeveloper={experience.isDeveloper}
      />

      {experience.isDeveloper && (frictionInsightsQuery.data ?? []).some((insight) => ["late_report", "stale_task", "repeated_issue", "support_mode"].includes(insight.kind)) ? (
      <Disclosure title="Report suggestions"><FrictionInsightPanel
        title="Report Friction"
        insights={(frictionInsightsQuery.data ?? []).filter((insight) =>
          ["late_report", "stale_task", "repeated_issue", "support_mode"].includes(insight.kind),
        )}
        isLoading={frictionInsightsQuery.isLoading}
        emptyText="No report-specific friction patterns detected."
        limit={3}
        compact
      /></Disclosure>
      ) : null}

      <Disclosure title="Saved reports" summary={String(reportsQuery.data?.length ?? 0)} open={historyOpen} onOpenChange={setHistoryOpen}>      <Panel className="relative h-fit overflow-hidden rounded-xl bg-slate-950/60 p-0 ">
        <div className="relative p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white">Saved reports</h2>
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
          ) : reportsQuery.isError ? <div role="alert"><p className="text-xs text-[var(--wt-danger)]">Saved reports could not be loaded.</p><Button className="mt-2" size="sm" onClick={() => void reportsQuery.refetch()}>Try again</Button></div> : reportsQuery.data && reportsQuery.data.length > 0 ? (
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
            <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/35 p-5 text-xs leading-6 text-slate-400">
              Saved reports will appear here after you save your first update.
            </div>
          )}
        </div>
      </Panel></Disclosure>
      <div className="space-y-5">
      <Panel className="relative overflow-visible rounded-xl bg-slate-950/62 p-0 shadow-xl shadow-slate-950/20">
        <div className="relative p-4">

          <div className="space-y-4">
            <div className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto]">
            <Field label="Start date">
              <DatePicker value={startDate} onChange={setStartDate} />
            </Field>
            <Field label="End date">
              <DatePicker value={endDate} onChange={setEndDate} />
            </Field>
            <Field label="Prepared for (optional)">
              <input
                value={recipientName}
                onChange={(event) => setRecipientName(event.currentTarget.value)}
                className={inputClass}
                placeholder={settingsQuery.data?.defaultManagerName || (experience.isDeveloper ? "Manager" : "Name, if needed")}
              />
            </Field>
            <Button
              variant={content.trim() ? "secondary" : "primary"}
              className="px-5"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending || polishMutation.isPending || Boolean(activePolishStreamId)}
            >
              <FileText className="h-4 w-4" />
              {generateMutation.isPending ? "Generating..." : "Generate Report"}
            </Button>
            </div>
            <Disclosure title="Report options" summary={experience.isDeveloper ? selectedSourceLabel : "Tasks and journal"}>
            <div className="grid gap-4 lg:grid-cols-2">
            {experience.isDeveloper ? <>
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
            <Field label="Classification">
              <Select
                value={selectedClassification}
                onChange={(value) =>
                  setSelectedClassification(value as typeof selectedClassification)
                }
                options={[
                  { value: "all", label: "All classifications", icon: FolderKanban },
                  { value: "work", label: "Work", icon: FolderKanban },
                  { value: "personal", label: "Personal", icon: FolderKanban },
                  { value: "unclassified", label: "Unclassified", icon: FolderKanban },
                ]}
                size="md"
              />
            </Field>

            <ReportGitFocusPanel
              selectedProjectId={selectedProjectId}
              refs={gitRefsQuery.data ?? []}
              worktrees={gitWorktreesQuery.data ?? []}
              selectedRefs={selectedGitRefs}
              selectedWorktreePaths={selectedWorktreePaths}
              useProjectGitFocus={useProjectGitFocus}
              isLoading={
                gitRefsQuery.isLoading ||
                gitWorktreesQuery.isLoading ||
                projectGitFocusQuery.isLoading
              }
              onUseProjectFocusChange={setUseProjectGitFocus}
              onToggleRef={(ref) => {
                setUseProjectGitFocus(false);
                setSelectedGitRefs((current) => toggleRefFilter(current, ref));
              }}
              onToggleWorktree={(path) => {
                setUseProjectGitFocus(false);
                setSelectedWorktreePaths((current) => toggleString(current, path));
              }}
              onResetToProjectFocus={() => {
                setUseProjectGitFocus(true);
                setSelectedGitRefs(projectGitFocusQuery.data?.refs ?? []);
                setSelectedWorktreePaths(projectGitFocusQuery.data?.worktreePaths ?? []);
              }}
            />

            </> : null}

            <div className="grid gap-2">
              {experience.isDeveloper ? <Toggle label="Include commits" checked={includeCommits} onChange={setIncludeCommits} /> : null}
              <Toggle label={experience.isDeveloper ? "Include manual logs" : "Include work journal"} checked={includeManualLogs} onChange={setIncludeManualLogs} />
              <Toggle label={experience.isDeveloper ? "Include weekly plan" : "Include tasks"} checked={includeWeeklyTasks} onChange={setIncludeWeeklyTasks} />
              <Toggle label={experience.isDeveloper ? "Include hidden items" : "Include previously excluded items"} checked={includeHidden} onChange={setIncludeHidden} />
            </div>

            {experience.isDeveloper ? (
            <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.045] p-3">
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
                  { value: "nvidia_build", label: "NVIDIA Build", icon: Sparkles },
                ]}
                size="sm"
              />
              <p className="mt-2 text-[11px] leading-5 text-slate-500">
                {providerStatus(reportAiStatusQuery.data, reportAiProvider)}
              </p>
            </div>

            ) : <p className="text-[11px] leading-5 text-[var(--wt-text-muted)]">Reports use items marked for reporting. Enable previously excluded items to also use tasks you captured before turning reports on.</p>}

            {experience.isDeveloper ? <Link to="/settings" state={{ openSettingsTab: "integrations" }} className="wt-text-link">Manage AI connections in Settings</Link> : null}
            </div></Disclosure>
            {generateMutation.isError ? (
              <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
                {generateMutation.error instanceof Error
                  ? generateMutation.error.message
                  : "Report could not be generated."}
              </div>
            ) : null}


          </div>
        </div>
      </Panel>

      <Panel className="relative min-h-[680px] overflow-hidden rounded-xl bg-slate-950/68 p-0 shadow-xl shadow-slate-950/20">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-white">Report draft</h2>
              <Badge tone={content.trim() ? "green" : "slate"}>
                {content.trim() ? "Editable" : "Draft"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-slate-500">{title}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ActionMenu label="Report actions">
              <Button variant="ghost" onClick={exportMarkdown} disabled={!content.trim()}><Download size={14} />Export Markdown</Button>
              {experience.isDeveloper ? <>
                <Button variant="ghost" onClick={() => readinessMutation.mutate()} disabled={readinessMutation.isPending}>{readinessMutation.isPending ? "Analyzing..." : reportAiProvider === "local_llama_cpp" ? "Analyze readiness locally" : `Analyze online (${reportAiProvider})`}</Button>
                <Button variant="ghost" onClick={() => polishMutation.mutate()} disabled={!content.trim() || polishMutation.isPending || Boolean(activePolishStreamId)}>{reportAiProvider === "local_llama_cpp" ? "Polish locally" : `Polish online (${reportAiProvider})`}</Button>
              </> : null}
            </ActionMenu>
            {polishMutation.isPending || activePolishStreamId ? <Button onClick={() => cancelPolishMutation.mutate()} disabled={!activePolishStreamId || cancelPolishMutation.isPending || polishCancelled}><X size={14} />{cancelPolishMutation.isPending || polishCancelled ? "Cancelling..." : "Cancel polish"}</Button> : null}
            <Button onClick={copyReport} disabled={!content.trim()}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button
              variant={content.trim() ? "primary" : "secondary"}
              onClick={() => saveMutation.mutate()}
              disabled={!content.trim() || saveMutation.isPending}
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-white/8 px-5 py-3">
          <PreviewStat label="Range" value={`${compactDate(startDate)} - ${compactDate(endDate)}`} />
          <PreviewStat label="Audience" value={recipientName.trim() || settingsQuery.data?.defaultManagerName || (experience.isDeveloper ? "Manager" : "Personal")} />
          <PreviewStat label="Sources" value={experience.isDeveloper ? selectedSourceLabel : "Tasks & journal"} />
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
          {polishMutation.isPending && polishStreamStatus ? (
            <div className="mb-3 rounded-xl border border-blue-300/20 bg-blue-500/10 p-3 text-xs text-blue-100">
              {polishStreamStatus}
            </div>
          ) : null}

          <textarea
            aria-label="Report draft"
            value={content}
            onChange={(event) => setContent(event.currentTarget.value)}
            className="min-h-[510px] w-full resize-y rounded-xl border border-white/10 bg-[var(--wt-input)] p-5 font-mono text-sm leading-7 text-slate-200 shadow-inner shadow-black/25 outline-none transition placeholder:text-slate-600 focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/15"
            placeholder="Generate a report, then edit the Markdown here."
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


      </div>
    </div>
  );
}

function ReportsHero({ isDeveloper }: { isDeveloper: boolean }) {
  return <header className="wt-page-header"><h1>Reports</h1><p className="mt-2 text-sm text-[var(--wt-text-muted)]">{isDeveloper ? "Turn captured work into a clear weekly update." : "Weekly updates from your tasks and work journal."}</p></header>;
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

function ReportGitFocusPanel({
  selectedProjectId,
  refs,
  worktrees,
  selectedRefs,
  selectedWorktreePaths,
  useProjectGitFocus,
  isLoading,
  onUseProjectFocusChange,
  onToggleRef,
  onToggleWorktree,
  onResetToProjectFocus,
}: {
  selectedProjectId: string;
  refs: GitRef[];
  worktrees: GitWorktree[];
  selectedRefs: GitRefFilter[];
  selectedWorktreePaths: string[];
  useProjectGitFocus: boolean;
  isLoading: boolean;
  onUseProjectFocusChange: (value: boolean) => void;
  onToggleRef: (ref: GitRef) => void;
  onToggleWorktree: (path: string) => void;
  onResetToProjectFocus: () => void;
}) {
  const selectedRefKeys = new Set(selectedRefs.map((ref) => gitRefKey(ref)));

  if (selectedProjectId === "all") {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-950/45 p-3 text-xs leading-5 text-slate-400">
        Project focus defaults are applied per project when all projects are included.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/45 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Git focus</p>
          <p className="mt-1 text-xs text-slate-500">
            Narrow commit evidence by branch or worktree for this report.
          </p>
        </div>
        <button
          type="button"
          onClick={onResetToProjectFocus}
          className="rounded-lg border border-white/10 px-2 py-1 text-[11px] font-semibold text-slate-300 transition hover:border-cyan-300/30 hover:text-cyan-100"
        >
          Defaults
        </button>
      </div>
      <Toggle
        label="Use project focus"
        checked={useProjectGitFocus}
        onChange={onUseProjectFocusChange}
      />
      {isLoading ? (
        <div className="mt-3 h-16 animate-pulse rounded-lg bg-white/[0.03]" />
      ) : (
        <div className="mt-3 space-y-3">
          <FocusOptionGroup
            label="Branches"
            emptyLabel="No branches synced yet."
            items={refs.map((ref) => ({
              key: gitRefKey(ref),
              label: ref.name,
              meta: ref.kind,
              selected: selectedRefKeys.has(gitRefKey(ref)),
              onToggle: () => onToggleRef(ref),
            }))}
          />
          <FocusOptionGroup
            label="Worktrees"
            emptyLabel="No worktrees synced yet."
            items={worktrees.map((worktree) => ({
              key: worktree.path,
              label: worktree.branch || "detached HEAD",
              meta: worktree.path,
              selected: selectedWorktreePaths.includes(worktree.path),
              onToggle: () => onToggleWorktree(worktree.path),
            }))}
          />
        </div>
      )}
    </div>
  );
}

function FocusOptionGroup({
  label,
  emptyLabel,
  items,
}: {
  label: string;
  emptyLabel: string;
  items: Array<{
    key: string;
    label: string;
    meta: string;
    selected: boolean;
    onToggle: () => void;
  }>;
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-slate-500">{emptyLabel}</p>
      ) : (
        <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
          {items.map((item) => (
            <label
              key={item.key}
              className="flex min-w-0 items-center gap-2 rounded-lg border border-white/8 bg-white/[0.025] px-2 py-1.5 text-xs text-slate-300"
            >
              <input
                type="checkbox"
                checked={item.selected}
                onChange={item.onToggle}
                className="h-4 w-4 rounded border-white/15 bg-slate-950 text-cyan-400"
              />
              <span className="min-w-0 flex-1 truncate font-mono">{item.label}</span>
              <span className="truncate text-[10px] text-slate-500">{item.meta}</span>
            </label>
          ))}
        </div>
      )}
    </div>
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
    <div className="flex min-w-0 items-baseline gap-2 text-xs">
      <span className="text-[var(--wt-text-muted)]">{label}</span>
      <span className="break-words text-[var(--wt-text-secondary)]">{value}</span>
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

function classificationLabel(value: "work" | "personal" | "unclassified") {
  return value === "work" ? "Work" : value === "personal" ? "Personal" : "Unclassified";
}

function isReportAiProvider(value: string): value is ReportAiProvider {
  return ["local_llama_cpp", "openrouter_free", "groq", "nvidia_build"].includes(value);
}

function gitRefKey(ref: Pick<GitRefFilter, "kind" | "name">) {
  return `${ref.kind}:${ref.name}`;
}

function toggleRefFilter(current: GitRefFilter[], ref: GitRef) {
  const key = gitRefKey(ref);
  if (current.some((item) => gitRefKey(item) === key)) {
    return current.filter((item) => gitRefKey(item) !== key);
  }

  return [...current, { projectId: ref.projectId, name: ref.name, kind: ref.kind }];
}

function toggleString(current: string[], value: string) {
  if (current.includes(value)) {
    return current.filter((item) => item !== value);
  }

  return [...current, value];
}

const inputClass =
  "h-10 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/15";
