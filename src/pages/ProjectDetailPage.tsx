import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useMemo, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ProjectDetailHeader } from "../components/ui/ProjectDetailHeader";
import { ProjectFormPanel } from "../components/ui/ProjectFormPanel";
import { ProjectDetailTabs, type ProjectDetailTab } from "../components/ui/ProjectDetailTabs";
import { CommitList } from "../components/ui/CommitList";
import { TaskList } from "../components/ui/TaskList";
import { MeetingList } from "../components/ui/MeetingList";
import { ProjectSidebar } from "../components/ui/ProjectSidebar";
import { PrBuilderPanel } from "../components/ui/PrBuilderPanel";
import { Panel } from "../components/ui/Panel";
import { Button } from "../components/ui/Button";
import { useSpeech } from "../components/ui/SpeechProvider";
import { useToast } from "../components/ui/ToastProvider";
import { WeekRangePicker } from "../components/ui/WeekRangePicker";
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
import { syncCommits } from "../lib/api/gitSync";
import { listActivity, getWeekSummary } from "../lib/api/activity";
import { listWeeklyTasks } from "../lib/api/weeklyTasks";
import { listManualLogs } from "../lib/api/manualLogs";
import { syncAnnouncement, syncStartedAnnouncement } from "../lib/announcements";
import { currentWeekRange, shiftWeek } from "../lib/dates";
import type { CreateProjectInput, GitRef, GitRefFilter, GitWorktree, ProjectGitFocus } from "../types/project";

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const speech = useSpeech();
  const [activeTab, setActiveTab] = useState<ProjectDetailTab>("commits");
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [selectedCommitIds, setSelectedCommitIds] = useState<Set<string>>(() => new Set());
  const [isPrBuilderOpen, setIsPrBuilderOpen] = useState(false);
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
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

  const syncMutation = useMutation({
    mutationFn: () => syncCommits({ from: null, to: null, authorEmail: null, projectIds: [projectId!] }),
    onMutate: () => {
      speech.announce(syncStartedAnnouncement(project ? `${project.name} activity` : "project activity"), {
        category: "sync",
      });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["activity"] });
      await queryClient.invalidateQueries({ queryKey: ["projectStats"] });
      await queryClient.invalidateQueries({ queryKey: ["gitRefs", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["gitWorktrees", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["projectGitFocus", projectId] });
      toast.success("Sync complete", `Added ${result.newCommits} commits and updated ${result.updatedCommits}.`);
      speech.announce(syncAnnouncement(result), { category: "sync" });
    },
    onError: (error) => {
      toast.error("Sync failed", error instanceof Error ? error.message : "Repository sync could not be completed.");
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
  const selectedCommits = useMemo(
    () => commits.filter((commit) => selectedCommitIds.has(commit.id)),
    [commits, selectedCommitIds],
  );
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

  const tasks = useMemo(() => {
    return (tasksQuery.data ?? []).filter((task) => task.status !== "completed" && task.status !== "dropped");
  }, [tasksQuery.data]);

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

  function clearCommitSelection() {
    setSelectedCommitIds(new Set());
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
        isSyncing={syncMutation.isPending}
        onSync={() => syncMutation.mutate()}
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
                    Select commits to generate a copy-ready GitHub PR package.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-slate-300">
                    {selectedCommits.length} selected
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={selectedCommits.length === 0}
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
                  onClose={() => setIsPrBuilderOpen(false)}
                  onCopy={copyPrBuilderText}
                />
              ) : null}
              <CommitList
                commits={commits}
                isLoading={activityQuery.isLoading}
                selectedCommitIds={selectedCommitIds}
                onToggleCommit={toggleCommitSelection}
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
            <TaskList tasks={tasks} isLoading={tasksQuery.isLoading} />
          )}
          {activeTab === "meetings" && (
            <MeetingList meetings={meetings} isLoading={activityQuery.isLoading || logsQuery.isLoading} />
          )}
          {activeTab === "all" && (
            <CommitList commits={allActivity} isLoading={activityQuery.isLoading || logsQuery.isLoading} />
          )}
        </div>

        <ProjectSidebar
          contributors={contributorsQuery.data ?? []}
          weekSummary={summaryQuery.data}
          isLoading={contributorsQuery.isLoading}
          onSync={() => syncMutation.mutate()}
          isSyncing={syncMutation.isPending}
        />
      </div>
    </div>
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
