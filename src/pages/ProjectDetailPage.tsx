import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useMemo, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Edit3, GitCommit, GitCommitVertical, Sparkles } from "lucide-react";
import { ProjectDetailHeader } from "../components/ui/ProjectDetailHeader";
import { ProjectFormPanel } from "../components/ui/ProjectFormPanel";
import { ProjectDetailTabs, type ProjectDetailTab } from "../components/ui/ProjectDetailTabs";
import { CommitList } from "../components/ui/CommitList";
import { TaskList } from "../components/ui/TaskList";
import { TaskDetailModal } from "../components/ui/TaskDetailModal";
import { MeetingList } from "../components/ui/MeetingList";
import { ManualLogDetailModal } from "../components/ui/ManualLogDetailModal";
import { ProjectSidebar } from "../components/ui/ProjectSidebar";
import { PrBuilderPanel } from "../components/ui/PrBuilderPanel";
import { Panel } from "../components/ui/Panel";
import { Button } from "../components/ui/Button";
import { useSpeech } from "../components/ui/SpeechProvider";
import { useToast } from "../components/ui/ToastProvider";
import { WeekRangePicker } from "../components/ui/WeekRangePicker";
import { Badge } from "../components/ui/Badge";
import { ModalShell } from "../components/ui/ModalShell";
import { useEscapeKey } from "../hooks/useEscapeKey";
import {
  getProjectById,
  getProjectStats,
  getTopContributors,
  archiveProject,
  listGitRefs,
  listGitWorktrees,
  getProjectGitFocus,
  saveProjectGitFocus,
  updateProject,
} from "../lib/api/projects";
import { syncGitHubProjectActivity } from "../lib/api/github";
import { listActivity, getWeekSummary } from "../lib/api/activity";
import { listActivityGroups, recordActivityGroupTitleFeedback, updateActivityGroup } from "../lib/api/activityGroups";
import { listWeeklyTasks } from "../lib/api/weeklyTasks";
import { listManualLogs } from "../lib/api/manualLogs";
import { syncAnnouncement, syncStartedAnnouncement } from "../lib/announcements";
import { currentWeekRange, shiftWeek } from "../lib/dates";
import type { CreateProjectInput, GitRef, GitRefFilter, GitWorktree, ProjectGitFocus } from "../types/project";
import type { ActivityItem } from "../types/activity";
import type { ActivityGroup } from "../types/activityGroup";
import type { WeeklyTask } from "../types/weeklyTask";
import type { ManualLog } from "../types/manualLog";
import type { PrPackageGroupContext } from "../lib/prBuilder";
import { isRepositorySyncInProgressError, useRepositorySync } from "../features/repositorySync/RepositorySyncProvider";

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const speech = useSpeech();
  const repositorySync = useRepositorySync();
  const [activeTab, setActiveTab] = useState<ProjectDetailTab>("commits");
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [selectedCommitIds, setSelectedCommitIds] = useState<Set<string>>(() => new Set());
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(() => new Set());
  const [isPrBuilderOpen, setIsPrBuilderOpen] = useState(false);
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ActivityGroup | null>(null);
  const [viewingTask, setViewingTask] = useState<WeeklyTask | null>(null);
  const [viewingMeeting, setViewingMeeting] = useState<ManualLog | null>(null);
  const [organizeStatus, setOrganizeStatus] = useState<string | null>(null);
  const [currentOrganizedGroupIds, setCurrentOrganizedGroupIds] = useState<Set<string>>(() => new Set());
  const editFormRef = useRef<HTMLDivElement>(null);

  const weekRange = useMemo(() => currentWeekRange(weekAnchor), [weekAnchor]);

  useEffect(() => {
    if (isEditFormOpen && editFormRef.current) {
      setTimeout(() => {
        editFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [isEditFormOpen]);

  useEscapeKey(() => {
    saveProjectMutation.reset();
    setIsEditFormOpen(false);
  }, isEditFormOpen);

  useEffect(() => {
    setSelectedCommitIds(new Set());
    setSelectedGroupIds(new Set());
    setIsPrBuilderOpen(false);
    setViewingTask(null);
    setViewingMeeting(null);
    setCurrentOrganizedGroupIds(new Set());
    setOrganizeStatus(null);
  }, [projectId, weekRange.from, weekRange.to]);

  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProjectById(projectId!),
    enabled: !!projectId,
  });

  const project = projectQuery.data;

  const statsQuery = useQuery({
    queryKey: ["projectStats"],
    queryFn: getProjectStats,
  });

  const projectStats = useMemo(() => {
    return statsQuery.data?.find((s) => s.projectId === projectId);
  }, [statsQuery.data, projectId]);

  const activityQuery = useQuery({
    queryKey: ["activity", weekRange.from, weekRange.to, projectId],
    queryFn: () => listActivity({ from: weekRange.from, to: weekRange.to, projectIds: [projectId!] }),
    enabled: !!projectId,
  });

  const activityGroupsQuery = useQuery({
    queryKey: ["activityGroups", weekRange.from, weekRange.to, projectId],
    queryFn: () =>
      listActivityGroups({
        from: weekRange.from,
        to: weekRange.to,
        projectIds: [projectId!],
        includeHidden: true,
      }),
    enabled: !!projectId,
  });

  const tasksQuery = useQuery({
    queryKey: ["weeklyTasks", weekRange.from, weekRange.to, projectId],
    queryFn: () => listWeeklyTasks({ weekStartDate: weekRange.from, weekEndDate: weekRange.to, projectIds: [projectId!] }),
    enabled: !!projectId,
  });

  const logsQuery = useQuery({
    queryKey: ["manualLogs", weekRange.from, weekRange.to, projectId],
    queryFn: () => listManualLogs({ from: weekRange.from, to: weekRange.to, projectIds: [projectId!] }),
    enabled: !!projectId,
  });

  const summaryQuery = useQuery({
    queryKey: ["weekSummary", weekRange.from, weekRange.to, projectId],
    queryFn: () => getWeekSummary({ from: weekRange.from, to: weekRange.to, projectIds: [projectId!] }),
    enabled: !!projectId,
  });

  const contributorsQuery = useQuery({
    queryKey: ["topContributors"],
    queryFn: () => getTopContributors(5),
  });

  const gitRefsQuery = useQuery({
    queryKey: ["gitRefs", projectId],
    queryFn: () => listGitRefs(projectId!),
    enabled: !!projectId,
  });

  const gitWorktreesQuery = useQuery({
    queryKey: ["gitWorktrees", projectId],
    queryFn: () => listGitWorktrees(projectId!),
    enabled: !!projectId,
  });

  const gitFocusQuery = useQuery({
    queryKey: ["projectGitFocus", projectId],
    queryFn: () => getProjectGitFocus(projectId!),
    enabled: !!projectId,
  });

  async function handleSyncRepositories() {
    speech.announce(syncStartedAnnouncement(project ? `${project.name} activity` : "project activity"), {
      category: "sync",
    });
    try {
      const result = await repositorySync.syncRepositories(
        { from: null, to: null, authorEmail: null, projectIds: [projectId!], mode: "auto" },
        {
          scope: "project",
          onAlreadyRunning: () => toast.info("Sync already running", "Repository activity is still being refreshed."),
        },
      );
      await queryClient.invalidateQueries({ queryKey: ["activity"] });
      await queryClient.invalidateQueries({ queryKey: ["activityGroups"] });
      await queryClient.invalidateQueries({ queryKey: ["projectStats"] });
      await queryClient.invalidateQueries({ queryKey: ["gitRefs", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["gitWorktrees", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["projectGitFocus", projectId] });
      toast.success("Sync complete", `Added ${result.newCommits} commits and updated ${result.updatedCommits}.`);
      speech.announce(syncAnnouncement(result), { category: "sync" });
    } catch (error) {
      if (isRepositorySyncInProgressError(error)) return;
      toast.error("Sync failed", error instanceof Error ? error.message : "Repository sync could not be completed.");
    }
  }

  const githubSyncMutation = useMutation({
    mutationFn: () => syncGitHubProjectActivity({ projectId }),
    onSuccess: async (result) => {
      await invalidateProjectViews(queryClient, projectId);
      toast.success("GitHub activity synced", result.message);
    },
    onError: (error) => {
      toast.error("GitHub sync failed", error instanceof Error ? error.message : "GitHub activity could not be synced.");
    },
  });

  const smartOrganizeMutation = useMutation({
    mutationFn: async () => {
      setOrganizeStatus("Checking repositories");
      const syncResult = await repositorySync.syncRepositories(
        {
          from: weekRange.from,
          to: weekRange.to,
          authorEmail: null,
          projectIds: [projectId!],
          mode: "auto",
        },
        {
          scope: "project",
          onAlreadyRunning: () => toast.info("Sync already running", "Repository activity is still being refreshed."),
        },
      );
      const evidenceStatus =
        syncResult.skippedFreshProjects > 0 || syncResult.unchangedProjects > 0
          ? "Using timeline work items from cached evidence"
          : syncResult.newCommits > 0
            ? `Synced ${syncResult.newCommits} latest local commits`
            : "Using timeline work items";

      return { evidenceStatus };
    },
    onSuccess: async (result) => {
      setOrganizeStatus(result.evidenceStatus);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
        queryClient.invalidateQueries({ queryKey: ["activityGroups"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
      ]);
      toast.success(
        "Timeline groups refreshed",
        "Project Details is using the same work items generated in Activity Timeline.",
      );
    },
    onError: (error) => {
      if (isRepositorySyncInProgressError(error)) {
        setOrganizeStatus("Repository sync is already running");
        return;
      }
      setOrganizeStatus(null);
      toast.error("Group refresh failed", error instanceof Error ? error.message : "Timeline work items could not be refreshed.");
    },
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
      toast.success("Work item updated", "Project detail and reports will use the new narrative.");
    },
    onError: (error) => {
      toast.error("Update failed", error instanceof Error ? error.message : "Work item could not be updated.");
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveProject(projectId!),
    onSuccess: (archivedProject) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["projectStats"] });
      toast.success("Project archived", `${archivedProject.name} is hidden from active workflows.`);
      navigate("/projects");
    },
    onError: (error) => {
      toast.error("Archive failed", error instanceof Error ? error.message : "Could not archive project.");
    },
  });

  const saveProjectMutation = useMutation({
    mutationFn: (input: CreateProjectInput) => updateProject(projectId!, input),
    onSuccess: async (updatedProject) => {
      await invalidateProjectViews(queryClient, projectId);
      toast.success("Project updated", `${updatedProject.name} is saved.`);
      setIsEditFormOpen(false);
    },
    onError: (error) => {
      toast.error("Update failed", error instanceof Error ? error.message : "Could not update project.");
    },
  });

  const saveFocusMutation = useMutation({
    mutationFn: (focus: ProjectGitFocus) => saveProjectGitFocus(focus),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projectGitFocus", projectId] });
      toast.success("Git focus saved", "Reports will use this branch and worktree focus by default.");
    },
    onError: (error) => {
      toast.error("Focus save failed", error instanceof Error ? error.message : "Git focus could not be saved.");
    },
  });

  const activityItems = useMemo(() => {
    const days = activityQuery.data ?? [];
    return days.flatMap((day) => day.items);
  }, [activityQuery.data]);

  const commits = useMemo(() => activityItems.filter((item) => item.activityType === "commit"), [activityItems]);
  const commitsById = useMemo(
    () => new Map(commits.map((commit) => [commit.id, commit])),
    [commits],
  );
  const visibleGroups = useMemo(
    () => (activityGroupsQuery.data ?? [])
      .filter((group) => shouldDisplayActivityGroup(group, currentOrganizedGroupIds))
      .filter((group) => groupHasProjectCommit(group, projectId, commitsById)),
    [activityGroupsQuery.data, commitsById, currentOrganizedGroupIds, projectId],
  );
  const groupedCommitIds = useMemo(
    () => new Set(visibleGroups.flatMap((group) => commitsForGroup(group, projectId, commitsById).map((commit) => commit.id))),
    [commitsById, projectId, visibleGroups],
  );
  const visibleRawCommits = useMemo(
    () => commits.filter((commit) => !groupedCommitIds.has(commit.id)),
    [commits, groupedCommitIds],
  );
  const selectedGroups = useMemo(
    () => visibleGroups.filter((group) => selectedGroupIds.has(group.id)),
    [selectedGroupIds, visibleGroups],
  );
  const selectedCommits = useMemo(
    () => dedupeCommitsByHash([
      ...selectedGroups.flatMap((group) => commitsForGroup(group, projectId, commitsById)),
      ...commits.filter((commit) => selectedCommitIds.has(commit.id)),
    ]),
    [commits, commitsById, projectId, selectedCommitIds, selectedGroups],
  );
  const selectedPrGroups = useMemo(
    () => selectedGroups.map((group) => groupToPrContext(group, projectId, commitsById)),
    [commitsById, projectId, selectedGroups],
  );
  const selectedUnitCount = selectedGroupIds.size + selectedCommitIds.size;
  const meetings = useMemo(() => {
    return (logsQuery.data ?? []).filter((log) => log.activityType === "Meeting");
  }, [logsQuery.data]);

  const allActivity = useMemo(() => {
    const logs = (logsQuery.data ?? []).map((log) => ({
      id: log.id,
      projectId: log.projectId,
      projectName: project?.name ?? null,
      activityType: log.activityType,
      summary: log.summary,
      occurredAt: log.date,
      includedInReport: log.includedInReport,
      refs: [],
      worktree: null,
    }));
    return [...activityItems, ...logs].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  }, [activityItems, logsQuery.data, project?.name]);

  const tasks = tasksQuery.data ?? [];

  function toggleCommitSelection(commitId: string) {
    setSelectedCommitIds((current) => {
      const next = new Set(current);
      if (next.has(commitId)) {
        next.delete(commitId);
      } else {
        next.add(commitId);
      }
      return next;
    });
  }

  function toggleGroupSelection(groupId: string) {
    setSelectedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  function buildPrFromGroup(group: ActivityGroup) {
    setSelectedGroupIds(new Set([group.id]));
    setSelectedCommitIds(new Set());
    setIsPrBuilderOpen(true);
  }

  function clearCommitSelection() {
    setSelectedCommitIds(new Set());
    setSelectedGroupIds(new Set());
    setIsPrBuilderOpen(false);
  }

  async function copyPrBuilderText(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    toast.success(label);
  }

  if (!projectId) {
    return (
      <div className="flex items-center justify-center py-20">
        <Panel>
          <p className="text-sm text-slate-400">No project selected.</p>
          <Button variant="primary" onClick={() => navigate("/projects")} className="mt-3">
            Back to Projects
          </Button>
        </Panel>
      </div>
    );
  }

  if (projectQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-48 animate-pulse rounded-2xl border border-white/8 bg-white/[0.03]" />
        <div className="h-12 animate-pulse rounded-2xl border border-white/8 bg-white/[0.03]" />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="h-96 animate-pulse rounded-2xl border border-white/8 bg-white/[0.03]" />
          <div className="space-y-4">
            <div className="h-24 animate-pulse rounded-2xl border border-white/8 bg-white/[0.03]" />
            <div className="h-48 animate-pulse rounded-2xl border border-white/8 bg-white/[0.03]" />
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center py-20">
        <Panel>
          <div className="flex flex-col items-center text-center">
            <p className="text-lg font-semibold text-white">Project not found</p>
            <p className="mt-1 text-sm text-slate-400">The project you're looking for doesn't exist or has been removed.</p>
            <Button variant="primary" onClick={() => navigate("/projects")} className="mt-4">
              Back to Projects
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ProjectDetailHeader
        project={project}
        stats={projectStats}
        isSyncing={repositorySync.isSyncing}
        onSync={() => void handleSyncRepositories()}
        isGitHubSyncing={githubSyncMutation.isPending}
        onGitHubSync={() => githubSyncMutation.mutate()}
        onEdit={() => {
          saveProjectMutation.reset();
          setIsEditFormOpen(true);
        }}
        onArchive={() => archiveMutation.mutate()}
      />

      <div
        ref={editFormRef}
        className={`transition-all duration-300 ease-out overflow-hidden ${
          isEditFormOpen
            ? "max-h-[1200px] opacity-100 translate-y-0"
            : "max-h-0 opacity-0 -translate-y-4 pointer-events-none"
        }`}
      >
        <ProjectFormPanel
          mode="edit"
          project={project}
          isSaving={saveProjectMutation.isPending}
          error={saveProjectMutation.error}
          onSubmit={(input) => saveProjectMutation.mutate(input)}
          onCancel={() => {
            saveProjectMutation.reset();
            setIsEditFormOpen(false);
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <WeekRangePicker
          label={weekRange.label}
          onPrev={() => setWeekAnchor((prev) => shiftWeek(prev, -1))}
          onNext={() => setWeekAnchor((prev) => shiftWeek(prev, 1))}
        />
        <ProjectDetailTabs activeTab={activeTab} onChange={setActiveTab} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {activeTab === "commits" && (
            <>
              <Panel className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-white">PR Builder</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Select work items or raw commits to generate a copy-ready GitHub PR package.
                  </p>
                  {organizeStatus ? (
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/15 bg-cyan-300/10 px-2 py-1 text-[11px] font-semibold text-cyan-100">
                      <Sparkles className="h-3 w-3" />
                      {organizeStatus}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-slate-300">
                    {selectedUnitCount} selected
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={smartOrganizeMutation.isPending || repositorySync.isSyncing || activityQuery.isLoading}
                    onClick={() => smartOrganizeMutation.mutate()}
                  >
                    <Sparkles className={`h-4 w-4 ${smartOrganizeMutation.isPending ? "animate-pulse" : ""}`} />
                    {smartOrganizeMutation.isPending ? "Refreshing..." : "Refresh Groups"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={selectedUnitCount === 0}
                    onClick={clearCommitSelection}
                  >
                    Clear
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={selectedCommits.length === 0}
                    onClick={() => setIsPrBuilderOpen(true)}
                  >
                    Build PR Package
                  </Button>
                </div>
              </Panel>
              {isPrBuilderOpen && selectedCommits.length > 0 ? (
                <PrBuilderPanel
                  project={project}
                  commits={selectedCommits}
                  groups={selectedPrGroups}
                  onClose={() => setIsPrBuilderOpen(false)}
                  onCopy={copyPrBuilderText}
                />
              ) : null}
              <ProjectWorkStream
                groups={visibleGroups}
                rawCommits={visibleRawCommits}
                isLoading={activityQuery.isLoading || activityGroupsQuery.isLoading}
                projectId={projectId}
                commitsById={commitsById}
                selectedGroupIds={selectedGroupIds}
                selectedCommitIds={selectedCommitIds}
                onToggleGroup={toggleGroupSelection}
                onToggleCommit={toggleCommitSelection}
                onEditGroup={setEditingGroup}
                onBuildGroupPr={buildPrFromGroup}
              />
            </>
          )}
          {activeTab === "branches" && (
            <GitRepositoryContextPanel
              refs={gitRefsQuery.data ?? []}
              worktrees={gitWorktreesQuery.data ?? []}
              focus={gitFocusQuery.data}
              isLoading={gitRefsQuery.isLoading || gitWorktreesQuery.isLoading || gitFocusQuery.isLoading}
              isSaving={saveFocusMutation.isPending}
              onSaveFocus={(refs, worktreePaths) =>
                saveFocusMutation.mutate({
                  projectId: projectId!,
                  refs,
                  worktreePaths,
                })
              }
            />
          )}
          {activeTab === "tasks" && (
            <TaskList tasks={tasks} isLoading={tasksQuery.isLoading} onTaskClick={setViewingTask} />
          )}
          {activeTab === "meetings" && (
            <MeetingList meetings={meetings} isLoading={logsQuery.isLoading} onMeetingClick={setViewingMeeting} />
          )}
      {activeTab === "all" && (
            <CommitList commits={allActivity} isLoading={activityQuery.isLoading || logsQuery.isLoading} />
          )}
        </div>

        <ProjectSidebar
          contributors={contributorsQuery.data ?? []}
          weekSummary={summaryQuery.data}
          isLoading={contributorsQuery.isLoading}
          onSync={() => void handleSyncRepositories()}
          isSyncing={repositorySync.isSyncing}
        />
      </div>
      {editingGroup ? (
        <ProjectGroupEditModal
          group={editingGroup}
          isSaving={updateGroupMutation.isPending}
          onClose={() => setEditingGroup(null)}
          onSave={(values) => updateGroupMutation.mutate({ id: editingGroup.id, group: values })}
        />
      ) : null}
      <TaskDetailModal
        isOpen={Boolean(viewingTask)}
        task={viewingTask}
        onClose={() => setViewingTask(null)}
      />
      <ManualLogDetailModal
        isOpen={Boolean(viewingMeeting)}
        log={viewingMeeting}
        onClose={() => setViewingMeeting(null)}
      />
    </div>
  );
}

function ProjectWorkStream({
  groups,
  rawCommits,
  isLoading,
  projectId,
  commitsById,
  selectedGroupIds,
  selectedCommitIds,
  onToggleGroup,
  onToggleCommit,
  onEditGroup,
  onBuildGroupPr,
}: {
  groups: ActivityGroup[];
  rawCommits: ActivityItem[];
  isLoading: boolean;
  projectId?: string;
  commitsById: Map<string, ActivityItem>;
  selectedGroupIds: Set<string>;
  selectedCommitIds: Set<string>;
  onToggleGroup: (groupId: string) => void;
  onToggleCommit: (commitId: string) => void;
  onEditGroup: (group: ActivityGroup) => void;
  onBuildGroupPr: (group: ActivityGroup) => void;
}) {
  if (isLoading) {
    return (
      <Panel>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-xl bg-white/[0.03]" />
          ))}
        </div>
      </Panel>
    );
  }

  if (groups.length === 0 && rawCommits.length === 0) {
    return (
      <Panel>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-300/20 bg-blue-500/10 text-blue-200">
            <GitCommit className="h-5 w-5" />
          </div>
          <p className="text-sm font-semibold text-slate-200">No commits this week</p>
          <p className="mt-1 text-xs text-slate-500">Sync your repository to see commits here.</p>
        </div>
      </Panel>
    );
  }

  const rows = [
    ...groups.map((group) => ({
      kind: "group" as const,
      id: group.id,
      occurredAt: latestGroupOccurredAt(group),
      group,
    })),
    ...rawCommits.map((commit) => ({
      kind: "commit" as const,
      id: commit.id,
      occurredAt: commit.occurredAt,
      commit,
    })),
  ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));

  return (
    <div className="space-y-3">
      {rows.map((row) =>
        row.kind === "group" ? (
          <ProjectWorkItemRow
            key={row.id}
            group={row.group}
            isSelected={selectedGroupIds.has(row.group.id)}
            onToggle={() => onToggleGroup(row.group.id)}
            onEdit={() => onEditGroup(row.group)}
            onBuildPr={() => onBuildGroupPr(row.group)}
            commits={commitsForGroup(row.group, projectId, commitsById)}
            totalCommitCount={commitEvidenceCount(row.group)}
          />
        ) : (
          <CommitList
            key={row.id}
            commits={[row.commit]}
            isLoading={false}
            selectedCommitIds={selectedCommitIds}
            onToggleCommit={onToggleCommit}
          />
        ),
      )}
    </div>
  );
}

function ProjectWorkItemRow({
  group,
  commits,
  totalCommitCount,
  isSelected,
  onToggle,
  onEdit,
  onBuildPr,
}: {
  group: ActivityGroup;
  commits: ActivityItem[];
  totalCommitCount: number;
  isSelected: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onBuildPr: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const summary = group.reportSummary || group.summary;

  return (
    <article
      className={[
        "rounded-2xl border bg-slate-950/45 shadow-[0_14px_42px_rgba(2,6,23,0.24),inset_0_1px_0_rgba(255,255,255,0.045)] transition-[background-color,border-color,box-shadow,transform] duration-150",
        isSelected ? "border-cyan-300/35 ring-1 ring-cyan-300/20" : "border-cyan-200/12 hover:border-cyan-200/22 hover:bg-slate-950/52",
      ].join(" ")}
    >
      <div className="flex items-start gap-3 p-3">
        <label className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]">
          <input
            type="checkbox"
            className="h-4 w-4 accent-cyan-400"
            checked={isSelected}
            onChange={onToggle}
            aria-label={`Select work item ${group.title}`}
          />
        </label>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-500/10 text-cyan-100">
          <GitCommitVertical className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-cyan-200/10 bg-cyan-400/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-100">
              Work item
            </span>
            <span className="rounded-md border border-white/8 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
              {commits.length === group.items.length
                ? `${commits.length} commit${commits.length === 1 ? "" : "s"}`
                : `${commits.length} of ${totalCommitCount} commits here`}
            </span>
            {group.projectCount > 1 ? (
              <span className="rounded-md border border-violet-300/15 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-100">
                Workspace item · {group.projectCount} projects
              </span>
            ) : group.workspaceName ? (
              <span className="rounded-md border border-white/8 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                {group.workspaceName}
              </span>
            ) : null}
            <span className={confidenceBadgeClass(group.confidenceLabel)}>
              {group.confidenceLabel.replace("_", " ")}
            </span>
            {group.titleQualityLabel && group.titleQualityLabel !== "report_ready" ? (
              <span className={titleQualityBadgeClass(group.titleQualityLabel)}>
                {titleQualityLabel(group.titleQualityLabel)}
              </span>
            ) : null}
            {group.includedInReport ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300/15 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                <CheckCircle2 className="h-3 w-3" />
                Report
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-50 [text-wrap:pretty]">
            {group.title}
          </p>
          {summary ? (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
              {summary.replace(/\n/g, " ")}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onBuildPr}
            className="hidden min-h-10 rounded-xl border border-blue-300/20 bg-blue-500/10 px-3 text-xs font-semibold text-blue-100 transition-[background-color,border-color,transform] duration-150 hover:border-blue-200/35 hover:bg-blue-500/15 active:scale-[0.96] sm:inline-flex sm:items-center"
          >
            {group.projectCount > 1 ? "Build PR for this repo" : "Build PR"}
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-950/42 text-slate-400 transition-[background-color,color,transform] duration-150 hover:bg-white/8 hover:text-slate-200 active:scale-[0.96]"
            aria-label="Edit work item"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-950/42 text-slate-400 transition-[background-color,color,transform] duration-150 hover:bg-white/8 hover:text-slate-200 active:scale-[0.96]"
            aria-label={expanded ? "Collapse work item commits" : "Expand work item commits"}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {expanded ? (
        <div className="mx-3 mb-3 space-y-2 rounded-xl border border-blue-100/8 bg-slate-950/50 p-3">
          {commits.length ? (
            commits.map((commit) => (
              <div key={commit.id} className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="slate">Commit</Badge>
                  <span className="font-mono text-[10px] text-slate-500">
                    {commit.commitHash?.slice(0, 8) ?? "no hash"}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-slate-100">{commit.summary.split("\n")[0]}</p>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3 text-xs text-slate-400">
              Source commits are no longer available.
            </div>
          )}
        </div>
      ) : null}
    </article>
  );
}

function ProjectGroupEditModal({
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
  const [reportSummary, setReportSummary] = useState(group.reportSummary ?? group.summary ?? "");
  const [includedInReport, setIncludedInReport] = useState(group.includedInReport);

  useEscapeKey(onClose, true);

  return (
    <ModalShell title="Edit work item" onClose={onClose}>
      <div className="space-y-4 p-5">
        <label className="grid gap-2 text-xs font-semibold text-slate-300">
          Work item title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="h-11 rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none transition-[border-color,box-shadow] focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-400/15"
          />
        </label>
        <label className="grid gap-2 text-xs font-semibold text-slate-300">
          Report summary
          <textarea
            value={reportSummary}
            onChange={(event) => setReportSummary(event.target.value)}
            className="min-h-24 resize-none rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none transition-[border-color,box-shadow] focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-400/15"
          />
        </label>
        <p className="text-xs leading-5 text-slate-500">
          Renames like this improve future grouping names on this machine.
        </p>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <input
            type="checkbox"
            checked={includedInReport}
            onChange={(event) => setIncludedInReport(event.target.checked)}
            className="h-4 w-4 accent-cyan-400"
          />
          Include in reports
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!title.trim() || isSaving}
            onClick={() =>
              onSave({
                title: title.trim(),
                summary: reportSummary.trim() || null,
                reportSummary: reportSummary.trim() || null,
                includedInReport,
                reviewStatus: "reviewed",
              })
            }
          >
            {isSaving ? "Saving..." : "Save work item"}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

function GitRepositoryContextPanel({
  refs,
  worktrees,
  focus,
  isLoading,
  isSaving,
  onSaveFocus,
}: {
  refs: GitRef[];
  worktrees: GitWorktree[];
  focus?: ProjectGitFocus;
  isLoading: boolean;
  isSaving: boolean;
  onSaveFocus: (refs: GitRefFilter[], worktreePaths: string[]) => void;
}) {
  const [selectedRefs, setSelectedRefs] = useState<Set<string>>(() => new Set());
  const [selectedWorktrees, setSelectedWorktrees] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setSelectedRefs(new Set((focus?.refs ?? []).map((ref) => gitRefKey(ref))));
    setSelectedWorktrees(new Set(focus?.worktreePaths ?? []));
  }, [focus]);

  if (isLoading) {
    return (
      <Panel>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-xl bg-white/[0.03]" />
          ))}
        </div>
      </Panel>
    );
  }

  const selectedRefFilters = refs
    .filter((ref) => selectedRefs.has(gitRefKey(ref)))
    .map((ref) => ({ projectId: ref.projectId, name: ref.name, kind: ref.kind }));
  const selectedWorktreePaths = worktrees
    .filter((worktree) => selectedWorktrees.has(worktree.path))
    .map((worktree) => worktree.path);

  return (
    <div className="space-y-4">
      <Panel className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Report Focus</h2>
          <p className="mt-1 text-xs text-slate-500">
            Saved selections become the default Git scope for this project in weekly reports.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-300">
            {selectedRefs.size + selectedWorktrees.size} focused
          </span>
          <Button
            type="button"
            variant="primary"
            disabled={isSaving}
            onClick={() => onSaveFocus(selectedRefFilters, selectedWorktreePaths)}
          >
            {isSaving ? "Saving..." : "Save Focus"}
          </Button>
        </div>
      </Panel>
      <Panel>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Branches</h2>
            <p className="mt-1 text-xs text-slate-500">Local and remote refs captured during the latest sync.</p>
          </div>
          <span className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-300">
            {refs.length} refs
          </span>
        </div>
        <div className="mt-4 divide-y divide-white/6 overflow-hidden rounded-xl border border-white/8">
          {refs.length === 0 ? (
            <div className="p-4 text-xs text-slate-500">Sync this project to discover branch metadata.</div>
          ) : (
            refs.map((ref) => (
              <div key={`${ref.kind}-${ref.name}`} className="grid gap-2 px-3 py-2.5 md:grid-cols-[minmax(0,1fr)_110px_110px] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedRefs.has(gitRefKey(ref))}
                      onChange={() => toggleSetValue(setSelectedRefs, gitRefKey(ref))}
                      className="h-4 w-4 rounded border-white/15 bg-slate-950 text-cyan-400"
                    />
                    <span className="truncate font-mono text-xs font-semibold text-slate-200">{ref.name}</span>
                    {ref.isCurrent ? (
                      <span className="rounded-md border border-cyan-300/15 bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-100">
                        current
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-[11px] text-slate-500">{ref.lastSeenCommit?.slice(0, 12) || "No head commit"}</p>
                </div>
                <span className="text-xs capitalize text-slate-400">{ref.kind}</span>
                <span className="text-xs text-slate-500">{formatContextDate(ref.lastScannedAt)}</span>
              </div>
            ))
          )}
        </div>
      </Panel>

      <Panel>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Worktrees</h2>
            <p className="mt-1 text-xs text-slate-500">Checkout variants tracked under this repository.</p>
          </div>
          <span className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-300">
            {worktrees.length} paths
          </span>
        </div>
        <div className="mt-4 divide-y divide-white/6 overflow-hidden rounded-xl border border-white/8">
          {worktrees.length === 0 ? (
            <div className="p-4 text-xs text-slate-500">No worktrees were captured on the latest sync.</div>
          ) : (
            worktrees.map((worktree) => (
              <div key={worktree.path} className="grid gap-2 px-3 py-2.5 md:grid-cols-[minmax(0,1fr)_120px_110px] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedWorktrees.has(worktree.path)}
                      onChange={() => toggleSetValue(setSelectedWorktrees, worktree.path)}
                      className="h-4 w-4 rounded border-white/15 bg-slate-950 text-cyan-400"
                    />
                    <span className="truncate font-mono text-xs font-semibold text-slate-200">{worktree.branch || "detached HEAD"}</span>
                    <span
                      className={[
                        "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
                        worktree.isClean === false
                          ? "border-orange-300/15 bg-orange-500/15 text-orange-200"
                          : "border-emerald-300/15 bg-emerald-500/15 text-emerald-200",
                      ].join(" ")}
                    >
                      {worktree.isClean === false ? "dirty" : "clean"}
                    </span>
                    {worktree.isLocked ? (
                      <span className="rounded-md border border-white/8 bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
                        locked
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-[11px] text-slate-500">{worktree.path}</p>
                </div>
                <span className="font-mono text-xs text-slate-400">{worktree.headCommit?.slice(0, 12) || "No HEAD"}</span>
                <span className="text-xs text-slate-500">{formatContextDate(worktree.lastScannedAt)}</span>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}

function gitRefKey(ref: Pick<GitRefFilter, "kind" | "name">) {
  return `${ref.kind}:${ref.name}`;
}

function toggleSetValue(setter: Dispatch<SetStateAction<Set<string>>>, value: string) {
  setter((current) => {
    const next = new Set(current);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    return next;
  });
}

function formatContextDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

function isCommitActivity(item: ActivityItem | null | undefined): item is ActivityItem {
  return Boolean(item && item.activityType === "commit");
}

function commitsForGroup(group: ActivityGroup, projectId: string | undefined, commitsById: Map<string, ActivityItem>) {
  return group.items
    .map((item) => item.activity && isCommitActivity(item.activity) ? item.activity : commitsById.get(item.sourceId))
    .filter(isCommitActivity)
    .filter((commit) => !projectId || commit.projectId === projectId);
}

function commitEvidenceCount(group: ActivityGroup) {
  return group.items.filter((item) => item.sourceType === "commit").length;
}

function latestGroupOccurredAt(group: ActivityGroup) {
  const timestamps = group.items
    .map((item) => item.occurredAt)
    .filter(Boolean)
    .sort();
  return timestamps[timestamps.length - 1] ?? group.endDate;
}

function groupHasProjectCommit(
  group: ActivityGroup,
  projectId?: string,
  commitsById?: Map<string, ActivityItem>,
) {
  if (!projectId) {
    return false;
  }
  if (group.projectId === projectId) {
    return true;
  }
  if (group.projects.some((project) => project.projectId === projectId)) {
    return true;
  }
  return group.items.some((item) => {
    if (item.activity?.projectId === projectId) {
      return true;
    }
    return commitsById?.get(item.sourceId)?.projectId === projectId;
  });
}

function dedupeCommitsByHash(commits: ActivityItem[]) {
  const seen = new Set<string>();
  const deduped: ActivityItem[] = [];
  for (const commit of commits) {
    const key = commit.commitHash || commit.id;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(commit);
  }
  return deduped.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
}

function groupToPrContext(
  group: ActivityGroup,
  projectId: string | undefined,
  commitsById: Map<string, ActivityItem>,
): PrPackageGroupContext {
  return {
    id: group.id,
    title: group.title,
    summary: group.summary,
    reportSummary: group.reportSummary,
    workspaceName: group.workspaceName,
    projectCount: group.projectCount,
    commitIds: commitsForGroup(group, projectId, commitsById).map((commit) => commit.id),
  };
}

function confidenceBadgeClass(label: string) {
  if (label === "strong") {
    return "rounded-md border border-emerald-300/15 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold capitalize text-emerald-200";
  }
  if (label === "needs_review") {
    return "rounded-md border border-amber-300/15 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold capitalize text-amber-200";
  }
  return "rounded-md border border-blue-300/15 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold capitalize text-blue-200";
}

function titleQualityBadgeClass(label: string) {
  if (label === "report_ready" || label === "acceptable") {
    return "rounded-md border border-emerald-300/15 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200";
  }
  if (label === "technically_correct_but_weak") {
    return "rounded-md border border-blue-300/15 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-200";
  }
  return "rounded-md border border-amber-300/15 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200";
}

function titleQualityLabel(label: string) {
  if (label === "acceptable") return "Acceptable title";
  if (label === "technically_correct_but_weak") return "Weak title";
  if (label === "fallback_only") return "Fallback title";
  if (label === "rejected") return "Rejected title";
  return "Needs review";
}

async function invalidateProjectViews(queryClient: QueryClient, projectId?: string) {
  await queryClient.invalidateQueries({ queryKey: ["projects"] });
  await queryClient.invalidateQueries({ queryKey: ["project", projectId] });
  await queryClient.invalidateQueries({ queryKey: ["projectStats"] });
  await queryClient.invalidateQueries({ queryKey: ["categoryDistribution"] });
  await queryClient.invalidateQueries({ queryKey: ["recentCommits"] });
  await queryClient.invalidateQueries({ queryKey: ["topContributors"] });
  await queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
  await queryClient.invalidateQueries({ queryKey: ["dashboard-activity-hours"] });
  await queryClient.invalidateQueries({ queryKey: ["dashboard-breakdown"] });
  await queryClient.invalidateQueries({ queryKey: ["activity"] });
  await queryClient.invalidateQueries({ queryKey: ["reports"] });
}
