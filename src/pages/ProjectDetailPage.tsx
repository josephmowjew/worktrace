import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { useState, useMemo } from "react";
import { ProjectDetailHeader } from "../components/ui/ProjectDetailHeader";
import { ProjectDetailTabs, type ProjectDetailTab } from "../components/ui/ProjectDetailTabs";
import { CommitList } from "../components/ui/CommitList";
import { TaskList } from "../components/ui/TaskList";
import { MeetingList } from "../components/ui/MeetingList";
import { ProjectSidebar } from "../components/ui/ProjectSidebar";
import { PrBuilderPanel } from "../components/ui/PrBuilderPanel";
import { Panel } from "../components/ui/Panel";
import { Button } from "../components/ui/Button";
import { useToast } from "../components/ui/ToastProvider";
import { WeekRangePicker } from "../components/ui/WeekRangePicker";
import { getProjectById, getProjectStats, getTopContributors, archiveProject } from "../lib/api/projects";
import { syncCommits } from "../lib/api/gitSync";
import { listActivity, getWeekSummary } from "../lib/api/activity";
import { listWeeklyTasks } from "../lib/api/weeklyTasks";
import { listManualLogs } from "../lib/api/manualLogs";
import { currentWeekRange, shiftWeek } from "../lib/dates";

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<ProjectDetailTab>("commits");
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [selectedCommitIds, setSelectedCommitIds] = useState<Set<string>>(() => new Set());
  const [isPrBuilderOpen, setIsPrBuilderOpen] = useState(false);

  const weekRange = useMemo(() => currentWeekRange(weekAnchor), [weekAnchor]);

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

  const syncMutation = useMutation({
    mutationFn: () => syncCommits({ from: null, to: null, authorEmail: null, projectIds: [projectId!] }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["activity"] });
      await queryClient.invalidateQueries({ queryKey: ["projectStats"] });
      toast.success("Sync complete", `Added ${result.newCommits} commits and updated ${result.updatedCommits}.`);
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
        onEdit={() => navigate("/projects")}
        onArchive={() => archiveMutation.mutate()}
      />

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
