import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Code,
  Eye,
  FlaskConical,
  RefreshCw,
  Rocket,
  Search,
  Users,
  FolderOpen,
  LayoutGrid,
  ListChecks,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Panel } from "../components/ui/Panel";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Select";
import { useSpeech } from "../components/ui/SpeechProvider";
import { useToast } from "../components/ui/ToastProvider";
import { ActivityHeatmap } from "../components/timeline/ActivityHeatmap";
import { WeekSummary } from "../components/timeline/WeekSummary";
import { KeyHighlights } from "../components/timeline/KeyHighlights";
import { TimelineItem } from "../components/timeline/TimelineItem";
import { TimelineGroupItem } from "../components/timeline/TimelineGroupItem";
import { StoryTimeline } from "../components/timeline/StoryTimeline";
import type { MixedTimelineDay as MixedTimelineDayModel, TimelineEntry } from "../components/timeline/storyTimelineModel";
import { TaskDetailModal } from "../components/ui/TaskDetailModal";
import { Badge } from "../components/ui/Badge";
import { ModalShell } from "../components/ui/ModalShell";
import { listActivity, getActivityHeatmap, getWeekSummary, getKeyHighlights } from "../lib/api/activity";
import { listActivityGroups, recordActivityGroupTitleFeedback, refreshActivityGroupSuggestions, selectActivityGroupTitleCandidate, suggestActivityGroups, updateActivityGroup } from "../lib/api/activityGroups";
import { getBackgroundJobStatus, getEmbeddingStatus, queueActivityEmbeddingRefresh, runBackgroundJobsOnce, semanticActivitySearch } from "../lib/api/embeddings";
import { listProjects } from "../lib/api/projects";
import { listWeeklyTasks } from "../lib/api/weeklyTasks";
import { syncAnnouncement, syncStartedAnnouncement } from "../lib/announcements";
import { shiftWeek } from "../lib/dates";
import { useWeekRange } from "../hooks/useWeekRange";
import { isRepositorySyncInProgressError, useRepositorySync } from "../features/repositorySync/RepositorySyncProvider";
import type { ActivityItem } from "../types/activity";
import type { ActivityGroup, TitleCandidate } from "../types/activityGroup";
import type { WeeklyTask } from "../types/weeklyTask";
import { useEscapeKey } from "../hooks/useEscapeKey";

const activityFilters = [
  { label: "All", value: "all", icon: BarChart3 },
  { label: "Commits", value: "commit", icon: Code },
  { label: "Meetings", value: "Meeting", icon: Users },
  { label: "Reviews", value: "Code Review", icon: Eye },
  { label: "Testing", value: "Testing", icon: FlaskConical },
  { label: "Deployments", value: "Deployment", icon: Rocket },
];

type ActivityTimelineLocationState = {
  searchQuery?: string;
  frictionInsightId?: string;
} | null;

export function ActivityTimelinePage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const speech = useSpeech();
  const repositorySync = useRepositorySync();
  const location = useLocation();
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activityType, setActivityType] = useState("all");
  const [projectId, setProjectId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewingTask, setViewingTask] = useState<WeeklyTask | null>(null);
  const [editingGroup, setEditingGroup] = useState<ActivityGroup | null>(null);
  const [syncMenuOpen, setSyncMenuOpen] = useState(false);
  const [organizePhase, setOrganizePhase] = useState<"idle" | "evidence" | "grouping">("idle");
  const [viewMode, setViewMode] = useState<"timeline" | "story">("timeline");

  useEffect(() => {
    const state = location.state as ActivityTimelineLocationState;
    if (!state?.searchQuery) {
      return;
    }
    setSearchQuery(state.searchQuery);
    setActivityType("all");
    setProjectId("all");
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const weekRange = useWeekRange(currentDate);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });
  const activeProjects = (projectsQuery.data ?? []).filter(
    (project) => project.status === "active",
  );

  const projectIds = projectId === "all" ? null : [projectId];

  const activityQuery = useQuery({
    queryKey: ["activity", weekRange.from, weekRange.to, activityType, projectId],
    queryFn: () =>
      listActivity({
        from: weekRange.from,
        to: weekRange.to,
        activityType: activityType === "all" ? null : activityType,
        projectIds,
      }),
  });

  const activityGroupsQuery = useQuery({
    queryKey: ["activityGroups", weekRange.from, weekRange.to, projectId],
    queryFn: () =>
      listActivityGroups({
        from: weekRange.from,
        to: weekRange.to,
        projectIds,
        includeHidden: true,
      }),
  });

  const embeddingStatusQuery = useQuery({
    queryKey: ["embeddingStatus"],
    queryFn: getEmbeddingStatus,
    retry: false,
  });

  const backgroundJobStatusQuery = useQuery({
    queryKey: ["backgroundJobStatus", "embedding_refresh"],
    queryFn: () => getBackgroundJobStatus({ kind: "embedding_refresh" }),
    refetchInterval: (query) => {
      const status = query.state.data;
      return status && (status.queued > 0 || status.running > 0) ? 5000 : false;
    },
    retry: false,
  });

  const smartOrganizeMutation = useMutation({
    mutationFn: async () => {
      const status = embeddingStatusQuery.data ?? await getEmbeddingStatus();
      let evidenceWarning: string | null = null;
      let embeddingWarning: string | null = null;
      let evidenceStatus = "Checking repositories";
      let usedCachedEvidence = false;
      let backgroundJobsQueued = 0;

      setOrganizePhase("evidence");
      try {
        const syncResult = await repositorySync.syncRepositories(
          {
            from: weekRange.from,
            to: weekRange.to,
            projectIds,
            mode: "auto",
          },
          {
            scope: "timeline",
            onAlreadyRunning: () => toast.info("Sync already running", "Repository activity is still being refreshed."),
          },
        );
        if (syncResult.errors.length > 0) {
          evidenceWarning = syncResult.errors.join(" ");
        }
        usedCachedEvidence = syncResult.skippedFreshProjects > 0 || syncResult.unchangedProjects > 0;
        evidenceStatus = syncResult.skippedFreshProjects > 0 && syncResult.scannedProjects === 0
          ? "Using cached Git evidence"
          : syncResult.evidenceRepaired > 0
            ? `Repairing file evidence for ${syncResult.evidenceRepaired} commits`
            : syncResult.newCommits > 0
              ? `Organized from ${syncResult.newCommits} latest local commits`
            : "Checking repositories";
      } catch (error) {
        evidenceWarning = isRepositorySyncInProgressError(error)
          ? "Repository sync is already running."
          : error instanceof Error ? error.message : "Git evidence could not be refreshed.";
      }

      if (status.available) {
        try {
          const queued = await queueActivityEmbeddingRefresh({
            from: weekRange.from,
            to: weekRange.to,
            projectIds,
          });
          backgroundJobsQueued = queued.queued ? 1 : 0;
        } catch (error) {
          embeddingWarning =
            error instanceof Error ? error.message : "Semantic refinement could not be queued.";
        }
      }

      setOrganizePhase("grouping");
      const groups = await refreshActivityGroupSuggestions({
        from: weekRange.from,
        to: weekRange.to,
        projectIds,
        useAi: false,
        useEmbeddings: false,
      });
      const commitCount = countCommitItems(activityQuery.data ?? []);
      const groupedCommitCount = new Set(groups.flatMap((group) => group.items.map((item) => item.sourceId))).size;
      const needsReviewCount = groups.filter((group) => group.reviewStatus === "needs_review" || group.confidenceLabel === "needs_review").length;
      const titleNeedsReviewCount = groups.filter((group) =>
        group.titleConfidenceLabel === "needs_review"
        || group.titleQualityLabel === "needs_user_review"
        || group.titleQualityLabel === "fallback_only"
      ).length;
      const fallbackTitleCount = groups.filter((group) => group.titleQualityLabel === "fallback_only").length;

      return {
        groups,
        commitCount,
        groupedCommitCount,
        ungroupedCount: Math.max(commitCount - groupedCommitCount, 0),
        needsReviewCount,
        titleNeedsReviewCount,
        fallbackTitleCount,
        evidenceWarning,
        evidenceStatus,
        backgroundJobsQueued,
        usedCachedEvidence,
        qualityState: backgroundJobsQueued > 0
          ? "background_refining"
          : usedCachedEvidence
            ? "using_cached_evidence"
            : "ready",
        embeddingWarning,
      };
    },
    onSuccess: async (result) => {
      setOrganizePhase("idle");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
        queryClient.invalidateQueries({ queryKey: ["activityGroups"] }),
        queryClient.invalidateQueries({ queryKey: ["semanticActivitySearch"] }),
        queryClient.invalidateQueries({ queryKey: ["backgroundJobStatus"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
      ]);
      if (result.backgroundJobsQueued > 0) {
        runBackgroundJobsOnce()
          .finally(() => {
            queryClient.invalidateQueries({ queryKey: ["backgroundJobStatus"] });
            queryClient.invalidateQueries({ queryKey: ["semanticActivitySearch"] });
          });
      }
      const suffix = result.qualityState === "background_refining"
        ? " Refining semantic matches in background."
        : result.usedCachedEvidence
          ? " Used cached evidence."
          : " Deterministic grouping used.";
      const organizeMessage =
        result.ungroupedCount > 0
          ? `${result.groups.length} work items found from ${result.commitCount} commits; ${result.ungroupedCount} left ungrouped.${titleReviewSuffix(result.titleNeedsReviewCount, result.fallbackTitleCount)}${suffix}`
          : `${result.groups.length} work items organized from ${result.commitCount} commits.${titleReviewSuffix(result.titleNeedsReviewCount, result.fallbackTitleCount)}${suffix}`;
      toast.success("Work organized", organizeMessage);
      if (result.embeddingWarning) {
        toast.error("Semantic layer skipped", result.embeddingWarning);
      }
      if (result.evidenceWarning) {
        toast.error("Some Git evidence was skipped", result.evidenceWarning);
      }
    },
    onError: (error) => {
      setOrganizePhase("idle");
      toast.error("Grouping failed", error instanceof Error ? error.message : "Activity groups could not be refreshed.");
    },
  });

  const suggestGroupsMutation = useMutation({
    mutationFn: () =>
      suggestActivityGroups({
        from: weekRange.from,
        to: weekRange.to,
        projectIds,
        useAi: false,
        useEmbeddings: embeddingStatusQuery.data?.available ?? false,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activityGroups"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });

  const semanticSearchQuery = useQuery({
    queryKey: ["semanticActivitySearch", weekRange.from, weekRange.to, projectId, searchQuery],
    queryFn: () =>
      semanticActivitySearch({
        query: searchQuery,
        from: weekRange.from,
        to: weekRange.to,
        projectIds,
        limit: 80,
      }),
    enabled: searchQuery.trim().length >= 3,
    retry: false,
  });

  const updateGroupMutation = useMutation({
    mutationFn: ({ id, group }: { id: string; group: { title: string; summary?: string | null; reportSummary?: string | null; includedInReport: boolean; reviewStatus?: string } }) =>
      updateActivityGroup(id, group),
    onSuccess: (_, variables) => {
      const original = editingGroup;
      setEditingGroup(null);
      queryClient.invalidateQueries({ queryKey: ["activityGroups"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      if (original && (original.title !== variables.group.title || original.reportSummary !== variables.group.reportSummary)) {
        recordActivityGroupTitleFeedback({
          groupId: variables.id,
          eventType: original.title !== variables.group.title ? "title_renamed" : "summary_edited",
          previousTitle: original.title,
          newTitle: variables.group.title,
          previousSummary: original.reportSummary,
          newSummary: variables.group.reportSummary,
        }).catch(() => undefined);
      }
      toast.success("Activity group updated", "The polished work item is ready for reports.");
    },
    onError: (error) => {
      toast.error("Group update failed", error instanceof Error ? error.message : "Activity group could not be updated.");
    },
  });

  const selectTitleCandidateMutation = useMutation({
    mutationFn: ({ group, candidate }: { group: ActivityGroup; candidate: TitleCandidate }) =>
      selectActivityGroupTitleCandidate({
        groupId: group.id,
        candidateId: candidate.id,
        candidateTitle: candidate.title,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activityGroups"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      toast.success("Title updated", "The selected title was saved and will improve future naming.");
    },
    onError: (error) => {
      toast.error("Title update failed", error instanceof Error ? error.message : "The title candidate could not be saved.");
    },
  });

  const tasksQuery = useQuery({
    queryKey: ["weeklyTasks", "activityTimeline", weekRange.from, weekRange.to, projectId],
    queryFn: () =>
      listWeeklyTasks({
        weekStartDate: weekRange.from,
        weekEndDate: weekRange.to,
        projectIds,
      }),
  });

  const heatmapQuery = useQuery({
    queryKey: ["heatmap", weekRange.from, weekRange.to, projectId],
    queryFn: () =>
      getActivityHeatmap({
        from: weekRange.from,
        to: weekRange.to,
        projectIds,
      }),
  });

  const summaryQuery = useQuery({
    queryKey: ["weekSummary", weekRange.from, weekRange.to, projectId],
    queryFn: () =>
      getWeekSummary({
        from: weekRange.from,
        to: weekRange.to,
        projectIds,
      }),
  });

  const highlightsQuery = useQuery({
    queryKey: ["keyHighlights", weekRange.from, weekRange.to, projectId],
    queryFn: () =>
      getKeyHighlights({
        from: weekRange.from,
        to: weekRange.to,
        projectIds,
      }),
  });

  useEscapeKey(() => setSyncMenuOpen(false), syncMenuOpen);

  async function handleSyncRepositories(mode: "auto" | "full" = "auto") {
    speech.announce(syncStartedAnnouncement("activity timeline"), { category: "sync" });
    try {
      const result = await repositorySync.syncRepositories(
        {
          from: null,
          to: null,
          authorEmail: null,
          projectIds,
          mode,
        },
        {
          scope: "timeline",
          onAlreadyRunning: () => toast.info("Sync already running", "Repository activity is still being refreshed."),
        },
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
        queryClient.invalidateQueries({ queryKey: ["activityGroups"] }),
        queryClient.invalidateQueries({ queryKey: ["heatmap"] }),
        queryClient.invalidateQueries({ queryKey: ["weekSummary"] }),
        queryClient.invalidateQueries({ queryKey: ["keyHighlights"] }),
      ]);
      toast.success(
        result.fullProjects > 0 ? "Full sync complete" : "Sync complete",
        result.newCommits === 0 && result.updatedCommits === 0
          ? "No new commits."
          : `Added ${result.newCommits} commits and updated ${result.updatedCommits}.`,
      );
      speech.announce(syncAnnouncement(result), { category: "sync" });
      if (result.errors.length) {
        toast.error("Some repositories did not sync", result.errors.join(" "));
      }
      if (result.newCommits > 0 || result.updatedCommits > 0) {
        smartOrganizeMutation.mutate();
      }
    } catch (error) {
      if (isRepositorySyncInProgressError(error)) return;
      toast.error("Sync failed", error instanceof Error ? error.message : "Repository sync could not be completed.");
    }
  }

  const filteredDays = useMemo(() => {
    const currentOrganizedGroupIds = new Set((smartOrganizeMutation.data?.groups ?? []).map((group) => group.id));
    const groupedCommits = activityType === "all" || activityType === "commit"
      ? (activityGroupsQuery.data ?? []).filter((group) => shouldDisplayActivityGroup(group, currentOrganizedGroupIds))
      : [];
    let days = combineTimelineDays(
      activityQuery.data ?? [],
      groupedCommits,
      activityType === "all" ? tasksQuery.data ?? [] : [],
    );

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const semanticIds = new Set((semanticSearchQuery.data ?? []).map((result) => result.sourceId));
      days = days
        .map((day) => ({
          ...day,
          items: day.items.filter(
            (entry) =>
              entryMatchesSearch(entry, query) || entryMatchesSemantic(entry, semanticIds)
          ),
        }))
        .filter((day) => day.items.length > 0);
    }

    return days;
  }, [activityGroupsQuery.data, activityQuery.data, activityType, searchQuery, semanticSearchQuery.data, smartOrganizeMutation.data?.groups, tasksQuery.data]);

  useEffect(() => {
    if (
      !activityGroupsQuery.isLoading &&
      !activityGroupsQuery.isError &&
      (activityGroupsQuery.data ?? []).length === 0 &&
      !suggestGroupsMutation.isPending &&
      !suggestGroupsMutation.data &&
      (activityQuery.data ?? []).some((day) => day.items.some((item) => item.activityType === "commit"))
    ) {
      suggestGroupsMutation.mutate();
    }
  }, [activityGroupsQuery.data, activityGroupsQuery.isError, activityGroupsQuery.isLoading, activityQuery.data, suggestGroupsMutation]);

  const handlePrevWeek = () => setCurrentDate((d) => shiftWeek(d, -1));
  const handleNextWeek = () => setCurrentDate((d) => shiftWeek(d, 1));

  return (
    <div className="min-h-full space-y-4">
      <PageHeader
        icon={BarChart3}
        eyebrow="Activity review"
        title="Activity Timeline"
        description="Track commits, meetings, reviews, testing, and deployments across your projects."
        actions={
          <>
            <div className="flex h-12 items-center rounded-xl border border-blue-200/10 bg-slate-950/42 px-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <button
                onClick={handlePrevWeek}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition-[background-color,color,transform] duration-150 hover:bg-white/10 hover:text-slate-200 active:scale-[0.96]"
                aria-label="Previous week"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex min-w-[168px] items-center justify-center gap-2 px-2">
                <CalendarDays className="h-4 w-4 text-blue-300" />
                <span className="text-sm font-medium text-slate-200">{weekRange.label}</span>
              </div>
              <button
                onClick={handleNextWeek}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition-[background-color,color,transform] duration-150 hover:bg-white/10 hover:text-slate-200 active:scale-[0.96]"
                aria-label="Next week"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="relative min-w-[260px] flex-1 sm:max-w-[420px]">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search projects, tasks, commits..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-12 w-full rounded-xl border border-blue-200/10 bg-slate-950/45 pl-11 pr-14 text-sm text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-slate-500 focus:border-blue-300/45 focus:bg-slate-950/60 focus:ring-2 focus:ring-blue-500/15"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-white/8 bg-white/5 px-2 py-1 text-[10px] font-semibold text-slate-500 sm:block">
                Cmd K
              </span>
            </div>

            <div className="relative flex">
              <Button
                variant="primary"
                onClick={() => void handleSyncRepositories("auto")}
                disabled={repositorySync.isSyncing || smartOrganizeMutation.isPending}
                className="h-12 rounded-r-none px-5 shadow-[0_16px_34px_rgba(37,99,235,0.32)] transition-[background-color,box-shadow,transform] active:scale-[0.96]"
              >
                <RefreshCw
                  className={`h-4 w-4 ${repositorySync.isSyncing ? "animate-spin" : ""}`}
                />
                {repositorySync.isSyncing ? "Syncing..." : "Sync Repositories"}
              </Button>
              <button
                type="button"
                onClick={() => setSyncMenuOpen((open) => !open)}
                disabled={repositorySync.isSyncing || smartOrganizeMutation.isPending}
                className="flex h-12 w-11 items-center justify-center rounded-r-xl border-l border-white/15 bg-blue-600 text-white shadow-[0_16px_34px_rgba(37,99,235,0.32)] transition-[background-color,transform] hover:bg-blue-500 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Sync options"
                aria-expanded={syncMenuOpen}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              {syncMenuOpen ? (
                <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-48 rounded-xl border border-blue-200/12 bg-slate-950/95 p-1.5 text-sm text-slate-200 shadow-[0_18px_48px_rgba(2,6,23,0.45)] backdrop-blur">
                  <button
                    type="button"
                    onClick={() => {
                      setSyncMenuOpen(false);
                      void handleSyncRepositories("full");
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-200 transition-colors hover:bg-white/8"
                  >
                    <RefreshCw className="h-4 w-4 text-blue-300" />
                    Full Sync
                  </button>
                </div>
              ) : null}
            </div>
          </>
        }
      />

      <Panel className="rounded-[18px] border-blue-200/10 bg-slate-950/38 p-3 shadow-[0_16px_52px_rgba(2,6,23,0.28),inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {activityFilters.map((filter) => {
              const Icon = filter.icon;
              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setActivityType(filter.value)}
                  className={[
                    "inline-flex min-h-10 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[0.96]",
                    activityType === filter.value
                      ? "border-blue-300/30 bg-blue-500 text-white shadow-[0_12px_28px_rgba(37,99,235,0.28),inset_0_1px_0_rgba(255,255,255,0.18)]"
                      : "border-white/10 bg-slate-950/35 text-slate-400 hover:border-blue-200/18 hover:bg-white/8 hover:text-slate-200",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4 shrink-0 stroke-[2.25]" />
                  {filter.label}
                </button>
              );
            })}
          </div>

          <Select
            value={projectId}
            onChange={setProjectId}
            options={[
              { value: "all", label: "All Projects", icon: LayoutGrid },
              ...activeProjects.map((project) => ({
                value: project.id,
                label: project.name,
                icon: FolderOpen,
              })),
            ]}
            size="sm"
          />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex h-10 rounded-xl border border-white/10 bg-slate-950/35 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <button
                type="button"
                onClick={() => setViewMode("timeline")}
                className={[
                  "inline-flex items-center gap-2 rounded-lg px-3 text-xs font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.96]",
                  viewMode === "timeline"
                    ? "bg-blue-500 text-white shadow-[0_8px_18px_rgba(37,99,235,0.22)]"
                    : "text-slate-400 hover:bg-white/8 hover:text-slate-200",
                ].join(" ")}
                aria-pressed={viewMode === "timeline"}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Timeline
              </button>
              <button
                type="button"
                onClick={() => setViewMode("story")}
                className={[
                  "inline-flex items-center gap-2 rounded-lg px-3 text-xs font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.96]",
                  viewMode === "story"
                    ? "bg-cyan-500 text-slate-950 shadow-[0_8px_18px_rgba(6,182,212,0.18)]"
                    : "text-slate-400 hover:bg-white/8 hover:text-slate-200",
                ].join(" ")}
                aria-pressed={viewMode === "story"}
              >
                <BookOpen className="h-3.5 w-3.5" />
                Story
              </button>
            </div>
            <Badge tone={embeddingStatusQuery.data?.available ? "green" : "slate"}>
              {embeddingStatusQuery.data?.available ? "Semantic on" : "Rules only"}
            </Badge>
            <Button
              type="button"
              variant="secondary"
              onClick={() => smartOrganizeMutation.mutate()}
              disabled={
                smartOrganizeMutation.isPending ||
                repositorySync.isSyncing ||
                activityQuery.isLoading
              }
              className="h-10 rounded-xl px-4"
            >
              <Sparkles className={`h-4 w-4 ${smartOrganizeMutation.isPending ? "animate-pulse" : ""}`} />
              {smartOrganizeMutation.isPending
                ? organizePhase === "evidence"
                  ? "Checking..."
                  : "Organizing..."
                : "Smart Organize"}
            </Button>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {repositorySync.lastResult ? (
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-xs text-emerald-100">
              Synced {repositorySync.lastResult.scannedProjects} projects. Added{" "}
              {repositorySync.lastResult.newCommits} commits and updated{" "}
              {repositorySync.lastResult.updatedCommits}.
              {repositorySync.lastResult.skippedProjects > 0
                ? ` Skipped ${repositorySync.lastResult.skippedProjects} manual-only projects.`
                : ""}
            </div>
          ) : null}

          {repositorySync.lastResult?.errors.length ? (
            <div className="rounded-xl border border-orange-400/20 bg-orange-500/10 p-3 text-xs text-orange-100">
              {repositorySync.lastResult.errors.join(" ")}
            </div>
          ) : null}

          {repositorySync.lastError ? (
            <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
              {repositorySync.lastError.message || "Sync failed."}
            </div>
          ) : null}

          {smartOrganizeMutation.isPending ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs text-cyan-100">
              <div className="flex min-w-0 items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 shrink-0 animate-pulse" />
                <span className="truncate">
                  {organizePhase === "evidence"
                    ? "Checking repositories and using cached Git evidence when it is fresh."
                    : "Grouping related activity into work items."}
                </span>
              </div>
              <span className="shrink-0 rounded-md border border-cyan-200/15 bg-slate-950/40 px-2 py-1 font-semibold text-cyan-50">
                {organizePhase === "evidence"
                  ? "Evidence"
                  : "Grouping"}
              </span>
            </div>
          ) : smartOrganizeMutation.data ? (
            <div className="flex items-center gap-2 rounded-xl border border-blue-300/20 bg-blue-500/10 p-3 text-xs text-blue-100">
              <Sparkles className="h-3.5 w-3.5" />
              {smartOrganizeMutation.data.groups.length} work items from {smartOrganizeMutation.data.commitCount} commits.
              {smartOrganizeMutation.data.ungroupedCount > 0 ? ` ${smartOrganizeMutation.data.ungroupedCount} commits left ungrouped.` : null}
              {smartOrganizeMutation.data.needsReviewCount > 0 ? ` ${smartOrganizeMutation.data.needsReviewCount} need review.` : null}
              {smartOrganizeMutation.data.evidenceStatus ? ` ${smartOrganizeMutation.data.evidenceStatus}.` : null}
            </div>
          ) : null}

          {backgroundJobStatusQuery.data
            && (backgroundJobStatusQuery.data.queued > 0 || backgroundJobStatusQuery.data.running > 0) ? (
            <div className="flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs text-cyan-100">
              <Sparkles className="h-3.5 w-3.5 animate-pulse" />
              Refining semantic matches in background. You can keep working.
            </div>
          ) : null}

          <Panel className="min-h-[520px] overflow-hidden rounded-[18px] border-blue-200/10 bg-slate-950/36 p-5 shadow-[0_24px_70px_rgba(2,6,23,0.34),inset_0_1px_0_rgba(255,255,255,0.045)]">
            {activityQuery.isLoading || activityGroupsQuery.isLoading || (activityType === "all" && tasksQuery.isLoading) ? (
              <TimelineSkeleton />
            ) : activityQuery.isError || tasksQuery.isError ? (
              <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
                {activityQuery.error instanceof Error
                  ? activityQuery.error.message
                  : tasksQuery.error instanceof Error
                    ? tasksQuery.error.message
                    : "Activity could not be loaded."}
              </div>
            ) : filteredDays.length > 0 && viewMode === "timeline" ? (
              <div className="space-y-7">
                {filteredDays.map((day) => (
                  <MixedTimelineDay
                    key={day.date}
                    day={day}
                    onViewTask={setViewingTask}
                    onEditGroup={setEditingGroup}
                    onSelectTitleCandidate={(group, candidate) =>
                      selectTitleCandidateMutation.mutate({ group, candidate })
                    }
                  />
                ))}
              </div>
            ) : filteredDays.length > 0 ? (
              <StoryTimeline
                days={filteredDays}
                onViewTask={setViewingTask}
                onEditGroup={setEditingGroup}
                onSelectTitleCandidate={(group, candidate) =>
                  selectTitleCandidateMutation.mutate({ group, candidate })
                }
              />
            ) : (
              <div className="flex min-h-[300px] items-center justify-center rounded-xl border border-dashed border-white/8 bg-white/[0.02] px-4 py-10 text-center text-xs text-slate-400">
                No activity found for this week. Sync Git commits or create manual logs.
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel className="rounded-[18px] border-blue-200/10 bg-slate-950/40 shadow-[0_18px_54px_rgba(2,6,23,0.28),inset_0_1px_0_rgba(255,255,255,0.04)]">
            {summaryQuery.isLoading ? (
              <SummarySkeleton />
            ) : summaryQuery.data ? (
              <WeekSummary summary={summaryQuery.data} />
            ) : null}
          </Panel>

          <Panel className="rounded-[18px] border-blue-200/10 bg-slate-950/40 shadow-[0_18px_54px_rgba(2,6,23,0.28),inset_0_1px_0_rgba(255,255,255,0.04)]">
            {heatmapQuery.isLoading ? (
              <HeatmapSkeleton />
            ) : heatmapQuery.data ? (
              <ActivityHeatmap data={heatmapQuery.data} weekLabel={weekRange.label} />
            ) : null}
          </Panel>

          <Panel className="rounded-[18px] border-blue-200/10 bg-slate-950/40 shadow-[0_18px_54px_rgba(2,6,23,0.28),inset_0_1px_0_rgba(255,255,255,0.04)]">
            {highlightsQuery.isLoading ? (
              <HighlightsSkeleton />
            ) : highlightsQuery.data ? (
              <KeyHighlights highlights={highlightsQuery.data} />
            ) : null}
          </Panel>
        </div>
      </div>
      <TaskDetailModal
        isOpen={Boolean(viewingTask)}
        task={viewingTask}
        onClose={() => setViewingTask(null)}
      />
      {editingGroup ? (
        <ActivityGroupEditModal
          group={editingGroup}
          isSaving={updateGroupMutation.isPending}
          onClose={() => setEditingGroup(null)}
          onSave={(values) => updateGroupMutation.mutate({ id: editingGroup.id, group: values })}
        />
      ) : null}
    </div>
  );
}

type MixedTimelineDay = MixedTimelineDayModel;

function MixedTimelineDay({
  day,
  onViewTask,
  onEditGroup,
  onSelectTitleCandidate,
}: {
  day: MixedTimelineDay;
  onViewTask: (task: WeeklyTask) => void;
  onEditGroup: (group: ActivityGroup) => void;
  onSelectTitleCandidate: (group: ActivityGroup, candidate: TitleCandidate) => void;
}) {
  return (
    <section className="relative">
      <div className="mb-5 flex items-center gap-4">
        <div className="h-px flex-1 bg-blue-200/10" />
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-blue-300/20 bg-blue-500/10 text-blue-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <CalendarDays className="h-3.5 w-3.5" />
          </span>
          <span className="text-sm font-semibold text-slate-100">{formatDayLabel(day.date)}</span>
          <span className="text-xs tabular-nums text-slate-500">{day.items.length} items</span>
        </div>
        <div className="h-px flex-1 bg-blue-200/10" />
      </div>

      <div className="relative pl-[104px] max-sm:pl-0">
        <div className="pointer-events-none absolute bottom-0 left-8 top-2 z-0 w-px bg-gradient-to-b from-blue-300/35 via-blue-300/20 to-transparent max-sm:hidden" />

        <div className="space-y-3">
          {day.items.map((entry) => (
            <div key={`${entry.kind}-${entry.id}`} className="relative">
              <div className="pointer-events-none absolute -left-[72px] top-9 z-20 h-4 w-4 -translate-x-1/2 rounded-full border border-blue-100/40 bg-blue-500 shadow-[0_0_0_6px_rgba(15,23,42,0.92),0_0_26px_rgba(59,130,246,0.42)] max-sm:hidden" />
              {entry.kind === "activity" ? (
                <TimelineItem item={entry.item} />
              ) : entry.kind === "group" ? (
                <TimelineGroupItem
                  group={entry.group}
                  onEdit={onEditGroup}
                  onSelectTitleCandidate={onSelectTitleCandidate}
                />
              ) : (
                <TaskTimelineItem task={entry.task} occurredAt={entry.occurredAt} onView={() => onViewTask(entry.task)} />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TaskTimelineItem({
  task,
  occurredAt,
  onView,
}: {
  task: WeeklyTask;
  occurredAt: string;
  onView: () => void;
}) {
  return (
    <article className="group relative z-10 rounded-2xl border border-blue-100/8 bg-slate-950/36 shadow-[0_14px_40px_rgba(2,6,23,0.22),inset_0_1px_0_rgba(255,255,255,0.04)] transition-[background-color,border-color,box-shadow,transform] duration-150 hover:border-blue-200/16 hover:bg-slate-950/48 hover:shadow-[0_18px_48px_rgba(2,6,23,0.3),inset_0_1px_0_rgba(255,255,255,0.055)]">
      <button type="button" onClick={onView} className="flex w-full items-start gap-4 p-4 text-left">
        <span className="absolute left-0 mt-1 w-16 -translate-x-[56px] text-left text-sm tabular-nums text-slate-400 max-sm:static max-sm:w-auto max-sm:translate-x-0 max-sm:text-xs">
          {formatActivityTime(occurredAt)}
        </span>

        <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-500/10 text-cyan-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <ListChecks className="h-5 w-5 shrink-0 stroke-[2.35]" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-cyan-200/10 bg-cyan-400/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-100">
              Task
            </span>
            <Badge tone={task.status === "blocked" ? "orange" : task.status === "completed" ? "green" : "blue"}>
              {task.status.replace("_", " ")}
            </Badge>
            {task.projectName ? (
              <span className="rounded-md border border-white/8 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                {task.projectName}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-[15px] font-semibold leading-6 text-slate-50 [text-wrap:pretty]">{task.title}</p>
          {task.details ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{task.details}</p> : null}
        </div>
      </button>
    </article>
  );
}

function combineTimelineDays(activityDays: Array<{ date: string; items: ActivityItem[] }>, groups: ActivityGroup[], tasks: WeeklyTask[]): MixedTimelineDay[] {
  const grouped = new Map<string, TimelineEntry[]>();
  const groupedCommitIds = new Set(groups.flatMap((group) => group.items.map((item) => item.sourceId)));

  for (const day of activityDays) {
    const entries = grouped.get(day.date) ?? [];
    entries.push(
      ...day.items
        .filter((item) => item.activityType !== "commit" || !groupedCommitIds.has(item.id))
        .map((item) => ({
        kind: "activity" as const,
        id: item.id,
        occurredAt: item.occurredAt,
        item,
      })),
    );
    grouped.set(day.date, entries);
  }

  for (const group of groups) {
    const occurredAt = group.items[0]?.occurredAt ?? `${group.startDate}T00:00:00Z`;
    const date = occurredAt.slice(0, 10);
    const entries = grouped.get(date) ?? [];
    entries.push({ kind: "group", id: group.id, occurredAt, group });
    grouped.set(date, entries);
  }

  for (const task of tasks) {
    const occurredAt = task.completedAt ?? task.targetDate ?? task.weekStartDate;
    const date = occurredAt.slice(0, 10);
    const entries = grouped.get(date) ?? [];
    entries.push({ kind: "task", id: task.id, occurredAt, task });
    grouped.set(date, entries);
  }

  return Array.from(grouped.entries())
    .map(([date, items]) => ({
      date,
      items: items.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)),
    }))
    .sort((left, right) => right.date.localeCompare(left.date));
}

function shouldDisplayActivityGroup(group: ActivityGroup, currentOrganizedGroupIds: Set<string>) {
  if (group.items.length > 1) {
    return true;
  }
  if (currentOrganizedGroupIds.has(group.id) || group.locked || group.userEditedAt || group.reviewStatus === "reviewed") {
    return true;
  }
  const isGeneratedLocalGroup =
    group.source === "local_rule" || group.source === "ai" || Boolean(group.fingerprint) || Boolean(group.algorithmVersion);
  return !isGeneratedLocalGroup || group.confidenceLabel === "strong";
}

function countCommitItems(activityDays: Array<{ date: string; items: ActivityItem[] }>) {
  return activityDays.reduce(
    (total, day) => total + day.items.filter((item) => item.activityType === "commit").length,
    0,
  );
}

function entryMatchesSearch(entry: TimelineEntry, query: string) {
  if (entry.kind === "activity") {
    return (
      entry.item.summary.toLowerCase().includes(query) ||
      Boolean(entry.item.projectName?.toLowerCase().includes(query)) ||
      entry.item.activityType.toLowerCase().includes(query)
    );
  }

  if (entry.kind === "group") {
    return (
      entry.group.title.toLowerCase().includes(query) ||
      Boolean(entry.group.summary?.toLowerCase().includes(query)) ||
      Boolean(entry.group.reportSummary?.toLowerCase().includes(query)) ||
      Boolean(entry.group.projectName?.toLowerCase().includes(query)) ||
      entry.group.items.some((item) => item.summarySnapshot.toLowerCase().includes(query))
    );
  }

  return (
    entry.task.title.toLowerCase().includes(query) ||
    Boolean(entry.task.details?.toLowerCase().includes(query)) ||
    Boolean(entry.task.projectName?.toLowerCase().includes(query)) ||
    entry.task.status.toLowerCase().includes(query) ||
    entry.task.taskType.toLowerCase().includes(query)
  );
}

function entryMatchesSemantic(entry: TimelineEntry, sourceIds: Set<string>) {
  if (entry.kind === "activity") {
    return sourceIds.has(entry.item.id);
  }
  if (entry.kind === "group") {
    return entry.group.items.some((item) => sourceIds.has(item.sourceId));
  }
  return sourceIds.has(entry.task.id);
}

function ActivityGroupEditModal({
  group,
  isSaving,
  onClose,
  onSave,
}: {
  group: ActivityGroup;
  isSaving: boolean;
  onClose: () => void;
  onSave: (values: { title: string; summary?: string | null; reportSummary?: string | null; includedInReport: boolean; reviewStatus?: string }) => void;
}) {
  const [title, setTitle] = useState(group.title);
  const [summary, setSummary] = useState(group.reportSummary ?? group.summary ?? "");
  const [includedInReport, setIncludedInReport] = useState(group.includedInReport);
  const reasons = safeGroupReasons(group.rationaleJson);
  useEscapeKey(onClose, true);

  return (
    <ModalShell title="Edit work item" description="Rename this group into the report language you want WorkTrace to remember." onClose={onClose} size="md">
      <form
        className="space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ title, summary: summary.trim() || null, reportSummary: summary.trim() || null, includedInReport, reviewStatus: "reviewed" });
        }}
      >
        <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Work item title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950/55 px-3 text-sm normal-case tracking-normal text-slate-100 outline-none focus:border-blue-300/45 focus:ring-2 focus:ring-blue-500/15"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Report summary
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            rows={5}
            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/55 px-3 py-3 text-sm normal-case leading-6 tracking-normal text-slate-100 outline-none focus:border-blue-300/45 focus:ring-2 focus:ring-blue-500/15"
          />
        </label>
        <div className="grid gap-2 rounded-xl border border-cyan-300/10 bg-cyan-400/[0.04] p-3 text-xs text-cyan-100/80">
          <p>Renames like this improve future grouping names on this machine.</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-semibold capitalize">{group.confidenceLabel.replace("_", " ")}</span>
            <span>{Math.round(group.confidence * 100)}% confidence</span>
            <span>{group.reviewStatus.replace("_", " ")}</span>
          </div>
          {reasons.length ? <p>{reasons.slice(0, 3).join(" · ")}</p> : null}
        </div>
        <label className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-3 text-sm text-slate-200">
          <input type="checkbox" checked={includedInReport} onChange={(event) => setIncludedInReport(event.target.checked)} />
          Include this work item in generated reports
        </label>
        <div className="rounded-xl border border-white/8 bg-slate-950/35 p-3">
          <p className="text-xs font-semibold text-slate-400">{group.items.length} source commit{group.items.length === 1 ? "" : "s"}</p>
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs leading-5 text-slate-500">
            {group.items.map((item) => (
              <div key={item.id} className="truncate">{item.summarySnapshot}</div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={isSaving || !title.trim()}>
            {isSaving ? "Saving..." : "Save work item"}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

function safeGroupReasons(value?: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function formatDayLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatActivityTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function titleReviewSuffix(needsReview: number, fallback: number) {
  const parts = [];
  if (needsReview > 0) {
    parts.push(`${needsReview} title${needsReview === 1 ? "" : "s"} need review`);
  }
  if (fallback > 0) {
    parts.push(`${fallback} fallback title${fallback === 1 ? "" : "s"}`);
  }
  return parts.length ? ` ${parts.join("; ")}.` : "";
}

function TimelineSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-32 animate-pulse rounded bg-white/5" />
          {[0, 1, 2].map((j) => (
            <div key={j} className="ml-10 h-10 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ))}
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-4 w-32 animate-pulse rounded bg-white/5" />
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-white/5" />
        ))}
      </div>
    </div>
  );
}

function HeatmapSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-4 w-32 animate-pulse rounded bg-white/5" />
      <div className="space-y-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-1">
            <div className="w-10" />
            {[0, 1, 2, 3, 4].map((j) => (
              <div key={j} className="flex-1 animate-pulse rounded-sm bg-white/5" style={{ minHeight: "12px" }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function HighlightsSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-4 w-32 animate-pulse rounded bg-white/5" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-white/5" />
      ))}
    </div>
  );
}
