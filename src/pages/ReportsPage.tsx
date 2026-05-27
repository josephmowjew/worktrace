import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ClipboardList,
  CalendarDays,
  Copy,
  Download,
  FileText,
  FolderKanban,
  History,
  X,
  Save,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { DatePicker } from "../components/ui/DatePicker";
import { Panel } from "../components/ui/Panel";
import { Select } from "../components/ui/Select";
import { useToast } from "../components/ui/ToastProvider";
import { getProjectGitFocus, listGitRefs, listGitWorktrees, listProjects } from "../lib/api/projects";
import {
  generateReport,
  analyzeReportReadiness,
  connectReportAiProvider,
  cancelReportAiStream,
  disconnectReportAiProvider,
  getReport,
  getReportAiStatus,
  listReports,
  polishReport,
  saveReport,
  testReportAiProvider,
} from "../lib/api/reports";
import { getSettings } from "../lib/api/settings";
import type { GitRef, GitRefFilter, GitWorktree } from "../types/project";
import type { ReportAiProvider, ReportSummary } from "../types/report";
import { useReportsWorkspace } from "./reportsWorkspace";

export function ReportsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
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
    openRouterKey,
    setOpenRouterKey,
    groqKey,
    setGroqKey,
    nvidiaBuildKey,
    setNvidiaBuildKey,
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
  const gitRefsQuery = useQuery({
    queryKey: ["gitRefs", selectedProjectId],
    queryFn: () => listGitRefs(selectedProjectId),
    enabled: selectedProjectId !== "all",
  });
  const gitWorktreesQuery = useQuery({
    queryKey: ["gitWorktrees", selectedProjectId],
    queryFn: () => listGitWorktrees(selectedProjectId),
    enabled: selectedProjectId !== "all",
  });
  const projectGitFocusQuery = useQuery({
    queryKey: ["projectGitFocus", selectedProjectId],
    queryFn: () => getProjectGitFocus(selectedProjectId),
    enabled: selectedProjectId !== "all",
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
        projectIds: selectedProjectId === "all" ? null : [selectedProjectId],
        classification: selectedClassificationValue,
        gitRefs: reportGitRefs,
        worktreePaths: reportWorktreePaths,
        useProjectGitFocus,
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
      toast.success(
        result.usedFallback ? "AI polish used fallback" : "Report polished",
        result.message,
      );
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
  const connectAiMutation = useMutation({
    mutationFn: ({ provider, apiKey }: { provider: ReportAiProvider; apiKey: string }) =>
      connectReportAiProvider({ provider, apiKey }),
    onSuccess: async (_, variables) => {
      if (variables.provider === "openrouter_free") setOpenRouterKey("");
      if (variables.provider === "groq") setGroqKey("");
      if (variables.provider === "nvidia_build") setNvidiaBuildKey("");
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
    <div className="space-y-3">
      <ReportsHero
        generatedCount={reportsQuery.data?.length ?? 0}
        reportReadyItems={content.trim() ? contentStats.lines : 0}
        lastGenerated={reportsQuery.data?.[0]}
      />

      <div className="grid min-h-0 gap-3 2xl:grid-cols-[360px_minmax(0,1fr)_310px]">
      <Panel className="relative overflow-visible rounded-xl bg-slate-950/62 p-0 shadow-xl shadow-slate-950/20">
        <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/35 to-transparent" />
        <div className="relative p-4">
          <div className="mb-4">
            <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-cyan-300/20 bg-cyan-300/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200">
              <Sparkles className="h-3.5 w-3.5" />
              Markdown builder
            </div>
            <h2 className="text-base font-semibold tracking-tight text-white">Report Builder</h2>
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

            <div className="grid gap-2">
              <Toggle label="Include commits" checked={includeCommits} onChange={setIncludeCommits} />
              <Toggle label="Include manual logs" checked={includeManualLogs} onChange={setIncludeManualLogs} />
              <Toggle label="Include weekly plan" checked={includeWeeklyTasks} onChange={setIncludeWeeklyTasks} />
              <Toggle label="Include hidden items" checked={includeHidden} onChange={setIncludeHidden} />
            </div>

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

            {generateMutation.isError ? (
              <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
                {generateMutation.error instanceof Error
                  ? generateMutation.error.message
                  : "Report could not be generated."}
              </div>
            ) : null}

            <Button
              variant="primary"
              className="w-full rounded-lg bg-blue-600 py-3 shadow-blue-500/20 hover:bg-blue-500 active:bg-blue-700"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
            >
              <FileText className="h-4 w-4" />
              {generateMutation.isPending ? "Generating..." : "Generate Report"}
            </Button>
          </div>
        </div>
      </Panel>

      <Panel className="relative min-h-[680px] overflow-hidden rounded-xl bg-slate-950/68 p-0 shadow-xl shadow-slate-950/20">
        <div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/45 to-transparent" />
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
          <div className="flex flex-wrap items-center justify-end gap-2">
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
            {polishMutation.isPending || activePolishStreamId ? (
              <Button
                onClick={() => cancelPolishMutation.mutate()}
                disabled={!activePolishStreamId || cancelPolishMutation.isPending || polishCancelled}
              >
                <X className="h-4 w-4" />
                {cancelPolishMutation.isPending || polishCancelled ? "Cancelling..." : "Cancel"}
              </Button>
            ) : null}
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
          <PreviewStat label="Sources" value={selectedSourceLabel} />
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
            value={content}
            onChange={(event) => setContent(event.currentTarget.value)}
            className="min-h-[510px] w-full resize-y rounded-xl border border-white/10 bg-[#050b16]/88 p-5 font-mono text-sm leading-7 text-slate-200 shadow-inner shadow-black/25 outline-none transition placeholder:text-slate-600 focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/15"
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

      <Panel className="relative h-fit overflow-hidden rounded-xl bg-slate-950/60 p-0 shadow-xl shadow-slate-950/20">
        <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-teal-300/35 to-transparent" />
        <div className="relative p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white">Saved Reports</h2>
              <p className="mt-1 text-xs text-slate-500">Local report history</p>
            </div>
            <History className="h-4 w-4 text-cyan-300" />
          </div>

          <div className="mb-4 space-y-3 rounded-xl border border-white/10 bg-slate-950/45 p-3">
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
            <ProviderKeyRow
              label="NVIDIA Build"
              provider="nvidia_build"
              value={nvidiaBuildKey}
              status={providerStatus(reportAiStatusQuery.data, "nvidia_build")}
              isPending={connectAiMutation.isPending || testAiMutation.isPending || disconnectAiMutation.isPending}
              onChange={setNvidiaBuildKey}
              onConnect={() =>
                connectAiMutation.mutate({ provider: "nvidia_build", apiKey: nvidiaBuildKey })
              }
              onTest={() => testAiMutation.mutate("nvidia_build")}
              onDisconnect={() => disconnectAiMutation.mutate("nvidia_build")}
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
            <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/35 p-5 text-xs leading-6 text-slate-400">
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
    <Panel className="relative overflow-hidden rounded-xl bg-slate-950/50 p-0 shadow-xl shadow-slate-950/15">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-blue-300/0 via-blue-300/35 to-cyan-300/0" />
      <div className="relative flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-blue-300/20 bg-blue-500/15 text-blue-200">
            <FileText className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-white">Reports</h1>
            <p className="truncate text-xs text-slate-400">
              Weekly Markdown from commits, manual logs, and planned work.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <HeroStat icon={ClipboardList} label="Saved" value={generatedCount.toString()} />
          <HeroStat icon={Check} label="Draft lines" value={reportReadyItems.toString()} />
          <HeroStat
            icon={CalendarDays}
            label="Last"
            value={lastGenerated ? compactDate(lastGenerated.createdAt.slice(0, 10)) : "None"}
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
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/8 bg-white/[0.035] px-2.5">
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-blue-500/12 text-blue-200">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-100">{value}</span>
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
