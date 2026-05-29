import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Calendar,
  ListChecks,
  RotateCcw,
  Sparkles,
  ListTodo,
  CheckCircle2,
  FolderKanban,
  Repeat,
} from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FastFindSearch, type FastFindPreviewItem } from "../components/ui/FastFindSearch";
import { FrictionInsightPanel } from "../components/ui/FrictionInsightPanel";
import { KanbanColumn } from "../components/ui/KanbanColumn";
import { Panel } from "../components/ui/Panel";
import { ProgressDonut } from "../components/ui/ProgressDonut";
import { QuickAddBar } from "../components/ui/QuickAddBar";
import { RecentlyCompletedList } from "../components/ui/RecentlyCompletedList";
import { AddItemBar } from "../components/ui/AddItemBar";
import { AddTaskModal } from "../components/ui/AddTaskModal";
import { Select } from "../components/ui/Select";
import { TaskDetailModal } from "../components/ui/TaskDetailModal";
import { useSpeech } from "../components/ui/SpeechProvider";
import { useToast } from "../components/ui/ToastProvider";
import { getWeekCapacity } from "../lib/api/calendar";
import { getFrictionInsights } from "../lib/api/friction";
import { listProjects } from "../lib/api/projects";
import {
  createWeeklyTask,
  deleteWeeklyTask,
  listWeeklyTasks,
  updateWeeklyTask,
} from "../lib/api/weeklyTasks";
import { weeklyTaskQueryRoots } from "../lib/api/queryKeys";
import { taskAnnouncement, taskUpdateAnnouncement } from "../lib/announcements";
import { currentWeekRange } from "../lib/dates";
import type {
  WeeklyTask,
  WeeklyTaskPriority,
  WeeklyTaskStatus,
  WeeklyTaskType,
} from "../types/weeklyTask";

const taskTypes: Array<{ value: WeeklyTaskType; label: string }> = [
  { value: "planned_work", label: "Planned Work" },
  { value: "blocker", label: "Blocker" },
  { value: "carryover", label: "Carryover" },
  { value: "completed_checklist", label: "Completed Checklist" },
  { value: "follow_up", label: "Follow-up" },
];

const statuses: Array<{ value: WeeklyTaskStatus; label: string }> = [
  { value: "todo", label: "Todo" },
  { value: "in_progress", label: "In Progress" },
  { value: "blocked", label: "Blocked" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
];

const taskTypeLabels: Record<WeeklyTaskType, string> = {
  planned_work: "Planned Work",
  blocker: "Blocker",
  carryover: "Carryover",
  completed_checklist: "Completed Checklist",
  follow_up: "Follow-up",
};

const statusLabels: Record<WeeklyTaskStatus, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  blocked: "Blocked",
  completed: "Completed",
  dropped: "Dropped",
};

const priorityLabels: Record<WeeklyTaskPriority, string> = {
  low: "Low priority",
  normal: "Normal priority",
  high: "High priority",
};

type WeeklyPlanLocationState = {
  openTaskId?: string;
  highlightTaskIds?: string[];
  frictionInsightId?: string;
  frictionSearch?: string | null;
} | null;

export function WeeklyPlanPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const speech = useSpeech();
  const location = useLocation();
  const navigate = useNavigate();
  const weekRange = currentWeekRange();
  const [typeFilter, setTypeFilter] = useState<WeeklyTaskType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<WeeklyTaskStatus | "all">("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<WeeklyTask | null>(null);
  const [viewingTask, setViewingTask] = useState<WeeklyTask | null>(null);
  const [highlightedTaskIds, setHighlightedTaskIds] = useState<Set<string>>(new Set());
  const [prefillData, setPrefillData] = useState<{
    title: string;
    priority: WeeklyTaskPriority;
    projectId?: string;
  } | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const dragOverColumnRef = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  async function invalidateWeeklyTaskViews() {
    await Promise.all([
      ...weeklyTaskQueryRoots.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
      queryClient.invalidateQueries({ queryKey: ["reports"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
      queryClient.invalidateQueries({ queryKey: ["weekCapacity"] }),
      queryClient.invalidateQueries({ queryKey: ["frictionInsights"] }),
    ]);
  }

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  const tasksQuery = useQuery({
    queryKey: [
      "weeklyTasks",
      weekRange.from,
      weekRange.to,
      typeFilter,
      statusFilter,
      projectFilter,
    ],
    queryFn: () =>
      listWeeklyTasks({
        weekStartDate: weekRange.from,
        weekEndDate: weekRange.to,
        taskType: typeFilter === "all" ? null : typeFilter,
        status: statusFilter === "all" ? null : statusFilter,
        projectIds: projectFilter === "all" ? null : [projectFilter],
      }),
  });
  const capacityQuery = useQuery({
    queryKey: ["weekCapacity", weekRange.from, weekRange.to],
    queryFn: () =>
      getWeekCapacity({
        weekStartDate: weekRange.from,
        weekEndDate: weekRange.to,
      }),
  });
  const frictionInsightsQuery = useQuery({
    queryKey: ["frictionInsights", weekRange.from, weekRange.to, "weekly_plan"],
    queryFn: () =>
      getFrictionInsights({
        from: weekRange.from,
        to: weekRange.to,
        surface: "weekly_plan",
      }),
  });

  const tasks = tasksQuery.data ?? [];
  const projects = (projectsQuery.data ?? []).filter(
    (project) => project.status === "active",
  );
  const searchIndex = useMemo(
    () =>
      tasks.map((task) => ({
        task,
        haystack: buildTaskSearchText(task),
      })),
    [tasks],
  );
  const searchTokens = useMemo(
    () =>
      normalizeSearchText(deferredSearchQuery)
        .split(" ")
        .filter(Boolean),
    [deferredSearchQuery],
  );
  const visibleTasks = useMemo(() => {
    if (!searchTokens.length) {
      return tasks;
    }

    return searchIndex
      .filter((entry) => searchTokens.every((token) => entry.haystack.includes(token)))
      .map((entry) => entry.task);
  }, [searchIndex, searchTokens, tasks]);
  const isSearching = searchQuery.trim().length > 0;
  const searchPreviewTasks = useMemo(
    () => (isSearching ? visibleTasks.slice(0, 5) : []),
    [isSearching, visibleTasks],
  );

  useEffect(() => {
    function handleSearchShortcut(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isTextField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (isTextField) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      searchInputRef.current?.focus();
    }

    window.addEventListener("keydown", handleSearchShortcut, true);
    return () => window.removeEventListener("keydown", handleSearchShortcut, true);
  }, []);

  useEffect(() => {
    const state = location.state as WeeklyPlanLocationState;
    if (!state || tasksQuery.isLoading) {
      return;
    }

    const taskIds = [
      ...(state.openTaskId ? [state.openTaskId] : []),
      ...(state.highlightTaskIds ?? []),
    ];
    const hasTaskDrilldown = taskIds.length > 0;
    const hasConflictingFilters =
      typeFilter !== "all" || statusFilter !== "all" || projectFilter !== "all";

    if (state.frictionSearch) {
      setSearchQuery(state.frictionSearch);
    }

    if (hasTaskDrilldown && hasConflictingFilters) {
      setTypeFilter("all");
      setStatusFilter("all");
      setProjectFilter("all");
      return;
    }

    if (state.openTaskId) {
      const task = tasks.find((candidate) => candidate.id === state.openTaskId);
      if (task) {
        setHighlightedTaskIds(new Set([task.id]));
        setViewingTask(task);
      }
    } else if (state.highlightTaskIds?.length) {
      setHighlightedTaskIds(new Set(state.highlightTaskIds));
    }

    navigate(location.pathname, { replace: true, state: null });
  }, [
    location.pathname,
    location.state,
    navigate,
    projectFilter,
    statusFilter,
    tasks,
    tasksQuery.isLoading,
    typeFilter,
  ]);

  const planned = useMemo(
    () => visibleTasks.filter((t) => t.status === "todo" && t.taskType !== "carryover"),
    [visibleTasks]
  );
  const inProgress = useMemo(
    () => visibleTasks.filter((t) => t.status === "in_progress" && t.taskType !== "carryover"),
    [visibleTasks]
  );
  const done = useMemo(
    () => visibleTasks.filter((t) => t.status === "completed"),
    [visibleTasks]
  );
  const carryForward = useMemo(
    () => visibleTasks.filter((t) => t.taskType === "carryover" && t.status !== "completed"),
    [visibleTasks]
  );

  const recentlyCompleted = useMemo(
    () =>
      done
        .filter((t) => t.completedAt)
        .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""))
        .slice(0, 5)
        .map((t) => ({ id: t.id, title: t.title, completedAt: t.completedAt! })),
    [done]
  );
  const weekProgressPercent = useMemo(() => {
    const visibleWork = [...planned, ...inProgress, ...done, ...carryForward];

    if (!visibleWork.length) {
      return 0;
    }

    const totalProgress = visibleWork.reduce((sum, task) => {
      if (task.status === "completed") {
        return sum + 100;
      }

      return sum + (task.progressPercent ?? 0);
    }, 0);

    return totalProgress / visibleWork.length;
  }, [planned, inProgress, done, carryForward]);

  const saveMutation = useMutation({
    mutationFn: (values: {
      title: string;
      taskType?: WeeklyTaskType;
      status?: WeeklyTaskStatus;
      projectId?: string;
      priority: WeeklyTaskPriority;
      details?: string;
      weekStartDate: string;
      targetDate?: string;
      completedAt?: string;
      includedInReport?: boolean;
      progressPercent?: number;
      estimatedMinutes?: number;
    }) => {
      if (editingTask) {
        return updateWeeklyTask(editingTask.id, {
          title: values.title,
          taskType: values.taskType,
          status: values.status,
          projectId: values.projectId || null,
          priority: values.priority,
          details: values.details || null,
          weekStartDate: values.weekStartDate,
          targetDate: values.targetDate || null,
          completedAt: values.completedAt || null,
          includedInReport: values.includedInReport,
          progressPercent: values.progressPercent,
          estimatedMinutes: values.estimatedMinutes,
        });
      }
      return createWeeklyTask({
        title: values.title,
        taskType: values.taskType || "planned_work",
        status: values.status || "todo",
        projectId: values.projectId || null,
        priority: values.priority,
        details: values.details || null,
        weekStartDate: values.weekStartDate,
        targetDate: values.targetDate || null,
        completedAt: values.completedAt || null,
        includedInReport: values.includedInReport ?? false,
        progressPercent: values.progressPercent,
        estimatedMinutes: values.estimatedMinutes,
      });
    },
    onSuccess: async (task) => {
      await invalidateWeeklyTaskViews();
      toast.success(editingTask ? "Task updated" : "Task added");
      speech.announce(
        taskAnnouncement(editingTask ? "Task updated" : "Task added", task, {
          projectName: task.projectName,
        }),
        { category: "task" },
      );
      setModalOpen(false);
      setEditingTask(null);
      setPrefillData(null);
    },
    onError: (error) => {
      toast.error("Task save failed", error instanceof Error ? error.message : "The task could not be saved.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: WeeklyTaskStatus }) =>
      updateWeeklyTask(id, {
        status,
        completedAt: status === "completed" || status === "dropped" ? today() : null,
      }),
    onSuccess: async (task, variables) => {
      await invalidateWeeklyTaskViews();
      toast.success("Task updated");
      speech.announce(taskUpdateAnnouncement(task, { status: variables.status }, { projectName: task.projectName }), {
        category: "task",
      });
    },
    onError: (error) => {
      toast.error("Task update failed", error instanceof Error ? error.message : "The task could not be updated.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWeeklyTask,
    onSuccess: async (_result, taskId) => {
      await invalidateWeeklyTaskViews();
      toast.success("Task deleted");
      const deletedTask = tasks.find((task) => task.id === taskId);
      if (deletedTask) {
        speech.announce(taskAnnouncement("Task deleted", deletedTask, { projectName: deletedTask.projectName }), {
          category: "task",
        });
      }
    },
    onError: (error) => {
      toast.error("Task delete failed", error instanceof Error ? error.message : "The task could not be deleted.");
    },
  });

  const moveTaskMutation = useMutation({
    mutationFn: ({ id, status, taskType }: { id: string; status: WeeklyTaskStatus; taskType?: WeeklyTaskType }) =>
      updateWeeklyTask(id, {
        status,
        taskType,
        completedAt: status === "completed" || status === "dropped" ? today() : null,
      }),
    onSuccess: async (task, variables) => {
      await invalidateWeeklyTaskViews();
      toast.success("Task moved");
      speech.announce(
        taskAnnouncement("Task moved", task, {
          projectName: task.projectName,
          statusOverride: variables.status,
          taskTypeOverride: variables.taskType,
        }),
        { category: "task" },
      );
    },
    onError: (error) => {
      toast.error("Task move failed", error instanceof Error ? error.message : "The task could not be moved.");
    },
  });

  const handleDragOverColumn = useCallback((columnId: string | null) => {
    dragOverColumnRef.current = columnId;
    setActiveColumnId(columnId);
  }, []);

  const handleDrop = useCallback(() => {
    const targetColumn = dragOverColumnRef.current;
    if (!draggedTaskId || !targetColumn) {
      setDraggedTaskId(null);
      setActiveColumnId(null);
      dragOverColumnRef.current = null;
      return;
    }

    const task = tasks.find((t) => t.id === draggedTaskId);
    if (!task) {
      setDraggedTaskId(null);
      setActiveColumnId(null);
      dragOverColumnRef.current = null;
      return;
    }

    let newStatus: WeeklyTaskStatus = task.status;
    let newTaskType: WeeklyTaskType | undefined;

    switch (targetColumn) {
      case "planned":
        newStatus = "todo";
        newTaskType = task.taskType === "carryover" ? "planned_work" : task.taskType;
        break;
      case "in-progress":
        newStatus = "in_progress";
        newTaskType = task.taskType === "carryover" ? "planned_work" : task.taskType;
        break;
      case "done":
        newStatus = "completed";
        break;
      case "carry-forward":
        newTaskType = "carryover";
        newStatus = task.status === "completed" ? "todo" : task.status;
        break;
    }

    moveTaskMutation.mutate({ id: draggedTaskId, status: newStatus, taskType: newTaskType });
    setDraggedTaskId(null);
    setActiveColumnId(null);
    dragOverColumnRef.current = null;
  }, [draggedTaskId, tasks, moveTaskMutation]);

  function handleAddItem(title: string, priority: WeeklyTaskPriority, projectId?: string) {
    setPrefillData({ title, priority, projectId });
    setEditingTask(null);
    setModalOpen(true);
  }

  function handleOpenFullForm(title: string, priority: WeeklyTaskPriority, projectId?: string) {
    setPrefillData({ title, priority, projectId });
    setEditingTask(null);
    setModalOpen(true);
  }

  const handleEditTask = useCallback((task: WeeklyTask) => {
    setViewingTask(null);
    setEditingTask(task);
    setModalOpen(true);
  }, []);

  const handleViewTask = useCallback((task: WeeklyTask) => {
    setViewingTask(task);
  }, []);

  const searchPreviewItems = useMemo<FastFindPreviewItem[]>(
    () =>
      searchPreviewTasks.map((task) => ({
        id: task.id,
        title: task.title,
        detail: `${taskTypeLabels[task.taskType]} / ${statusLabels[task.status]}${
          task.projectName ? ` / ${task.projectName}` : ""
        }`,
        badge: task.targetDate ? task.targetDate.slice(5) : undefined,
        icon: CheckCircle2,
        onSelect: () => handleViewTask(task),
      })),
    [handleViewTask, searchPreviewTasks],
  );

  const handleToggleComplete = useCallback((task: WeeklyTask) => {
    const newStatus = task.status === "completed" ? "todo" : "completed";
    updateMutation.mutate({ id: task.id, status: newStatus });
  }, [updateMutation]);

  const handleDeleteTask = useCallback((task: WeeklyTask) => {
    deleteMutation.mutate(task.id);
  }, [deleteMutation]);

  function handleClearFilters() {
    setTypeFilter("all");
    setStatusFilter("all");
    setProjectFilter("all");
    setSearchQuery("");
    setHighlightedTaskIds(new Set());
  }

  const hasActiveFilters = typeFilter !== "all" || statusFilter !== "all" || projectFilter !== "all";
  const visibleTaskCount = visibleTasks.length;

  return (
    <div className="space-y-4">
      <Panel className="relative overflow-hidden p-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_28%,rgba(56,189,248,0.18),transparent_26%),radial-gradient(circle_at_72%_12%,rgba(37,99,235,0.18),transparent_24%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
              <ListChecks className="h-3.5 w-3.5" />
              Weekly Plan
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Weekly Plan
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Plan work, track blockers, carry unfinished items forward, and choose
              what lands in the weekly report.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Open" value={planned.length.toString()} dotColor="bg-blue-400" />
            <MiniStat label="In Progress" value={inProgress.length.toString()} dotColor="bg-violet-400" />
            <MiniStat label="Done" value={done.length.toString()} dotColor="bg-emerald-400" />
            <MiniStat label="Carry Forward" value={carryForward.length.toString()} dotColor="bg-orange-400" />
          </div>
        </div>
      </Panel>

      <Panel className="relative overflow-visible p-3">
        <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/45 to-transparent" />
        <div className="grid gap-3 xl:grid-cols-[minmax(320px,1fr)_auto] xl:items-end">
          <WeeklyPlanSearch
            inputRef={searchInputRef}
            value={searchQuery}
            onChange={setSearchQuery}
            typeFilter={typeFilter}
            statusFilter={statusFilter}
            onTypeFilterChange={(value) => {
              setTypeFilter(value);
              setStatusFilter("all");
            }}
            onStatusFilterChange={(value) => {
              setStatusFilter(value);
              setTypeFilter("all");
            }}
            onClearFilters={handleClearFilters}
            visibleCount={visibleTaskCount}
            totalCount={tasks.length}
            isSearching={isSearching}
            previewItems={searchPreviewItems}
          />

          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Type</span>
              <Select
                value={typeFilter}
                onChange={setTypeFilter}
                options={[
                  { value: "all", label: "All Types", icon: ListTodo },
                  ...taskTypes.map((type) => ({
                    value: type.value,
                    label: type.label,
                    icon: ListTodo,
                  })),
                ]}
                size="sm"
              />
            </div>
            <div className="grid gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Status</span>
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: "all", label: "All Statuses", icon: CheckCircle2 },
                  ...statuses.map((status) => ({
                    value: status.value,
                    label: status.label,
                    icon: status.value === "completed" ? CheckCircle2 : ListTodo,
                  })),
                ]}
                size="sm"
              />
            </div>
            <div className="grid gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Project</span>
              <Select
                value={projectFilter}
                onChange={setProjectFilter}
                options={[
                  { value: "all", label: "All Projects", icon: FolderKanban },
                  ...projects.map((project) => ({
                    value: project.id,
                    label: project.name,
                    icon: FolderKanban,
                  })),
                ]}
                size="sm"
              />
            </div>
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="flex h-9 items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
              >
                <RotateCcw className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>
        </div>
      </Panel>

      <AddItemBar
        onAdd={handleAddItem}
        projects={projects}
        weekRange={weekRange}
      />

      <WeekCapacityStrip
        capacity={capacityQuery.data}
        isLoading={capacityQuery.isLoading}
      />

      <FrictionInsightPanel
        title="Task Friction"
        insights={(frictionInsightsQuery.data ?? []).filter((insight) =>
          ["stale_task", "repeated_issue"].includes(insight.kind),
        )}
        isLoading={frictionInsightsQuery.isLoading}
        emptyText="No stale tasks or repeated work patterns detected."
        limit={3}
        compact
      />

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <KanbanColumn
            title="Planned"
            color="bg-blue-400"
            tasks={planned}
            count={planned.length}
            columnId="planned"
            onAdd={() => handleAddItem("", "normal")}
            onToggleComplete={handleToggleComplete}
            onView={handleViewTask}
            onEdit={handleEditTask}
            onDelete={handleDeleteTask}
            onDragOverColumn={handleDragOverColumn}
            onDrop={handleDrop}
            onDragStart={setDraggedTaskId}
            activeColumnId={activeColumnId}
            highlightedTaskIds={highlightedTaskIds}
          />
          <KanbanColumn
            title="In Progress"
            color="bg-violet-400"
            tasks={inProgress}
            count={inProgress.length}
            columnId="in-progress"
            onAdd={() => handleAddItem("", "normal")}
            onToggleComplete={handleToggleComplete}
            onView={handleViewTask}
            onEdit={handleEditTask}
            onDelete={handleDeleteTask}
            onDragOverColumn={handleDragOverColumn}
            onDrop={handleDrop}
            onDragStart={setDraggedTaskId}
            activeColumnId={activeColumnId}
            highlightedTaskIds={highlightedTaskIds}
          />
          <KanbanColumn
            title="Done"
            color="bg-emerald-400"
            tasks={done}
            count={done.length}
            columnId="done"
            onAdd={() => handleAddItem("", "normal")}
            onToggleComplete={handleToggleComplete}
            onView={handleViewTask}
            onEdit={handleEditTask}
            onDelete={handleDeleteTask}
            onDragOverColumn={handleDragOverColumn}
            onDrop={handleDrop}
            onDragStart={setDraggedTaskId}
            activeColumnId={activeColumnId}
            highlightedTaskIds={highlightedTaskIds}
          />
          <KanbanColumn
            title="Carry Forward"
            color="bg-orange-400"
            tasks={carryForward}
            count={carryForward.length}
            columnId="carry-forward"
            onAdd={() => handleAddItem("", "normal")}
            onToggleComplete={handleToggleComplete}
            onView={handleViewTask}
            onEdit={handleEditTask}
            onDelete={handleDeleteTask}
            onDragOverColumn={handleDragOverColumn}
            onDrop={handleDrop}
            onDragStart={setDraggedTaskId}
            activeColumnId={activeColumnId}
            highlightedTaskIds={highlightedTaskIds}
          />
        </div>

        <div className="flex flex-col gap-4">
          <Panel>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">
                Week of {weekRange.label}
              </h2>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-slate-400">
                <Calendar className="h-3.5 w-3.5" />
              </div>
            </div>
            <ProgressDonut
              done={done.length}
              inProgress={inProgress.length}
              planned={planned.length}
              carryForward={carryForward.length}
              progressPercent={weekProgressPercent}
            />
          </Panel>

          <Panel className={capacityQuery.data && capacityQuery.data.remainingMinutes < 0 ? "border-red-300/20 bg-red-500/10" : ""}>
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className={`h-3.5 w-3.5 ${capacityQuery.data && capacityQuery.data.remainingMinutes < 0 ? "text-red-300" : "text-cyan-200"}`} />
              <h2 className="text-sm font-semibold text-white">Capacity</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <CapacityMetric label="Gross" minutes={capacityQuery.data?.grossCapacityMinutes ?? 0} />
              <CapacityMetric label="Meetings" minutes={capacityQuery.data?.meetingMinutes ?? 0} />
              <CapacityMetric label="Planned" minutes={capacityQuery.data?.plannedTaskMinutes ?? 0} />
              <CapacityMetric
                label="Remaining"
                minutes={capacityQuery.data?.remainingMinutes ?? 0}
                emphasize={Boolean(capacityQuery.data && capacityQuery.data.remainingMinutes < 0)}
              />
            </div>
          </Panel>

          <Panel>
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              <h2 className="text-sm font-semibold text-white">Focus</h2>
            </div>
            <p className="text-xs leading-5 text-slate-400">
              {done.length > 0
                ? `Keep going! You've completed ${done.length} item${done.length > 1 ? "s" : ""} this week.`
                : "Start by planning your top priorities for the week."}
            </p>
          </Panel>

          <Panel>
            <h2 className="mb-3 text-sm font-semibold text-white">
              Recently Completed
            </h2>
            <RecentlyCompletedList tasks={recentlyCompleted} />
          </Panel>

          <Panel>
            <h2 className="mb-3 text-sm font-semibold text-white">Quick Add</h2>
            <QuickAddBar
              onAdd={handleAddItem}
              projects={projects}
              onOpenFullForm={handleOpenFullForm}
            />
          </Panel>
        </div>
      </div>

      <AddTaskModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingTask(null);
          setPrefillData(null);
        }}
        onSubmit={(values) => {
          const data = prefillData;
          saveMutation.mutate({
            title: data?.title || values.title,
            taskType: values.taskType,
            status: values.status,
            projectId: data?.projectId || values.projectId || undefined,
            priority: data?.priority || values.priority,
            details: values.details,
            weekStartDate: values.weekStartDate,
            targetDate: values.targetDate,
            completedAt: values.completedAt,
            includedInReport: values.includedInReport,
            progressPercent: values.progressPercent,
            estimatedMinutes: values.estimatedMinutes,
          });
        }}
        projects={projects}
        weekStartDate={weekRange.from}
        editingTask={editingTask}
        isPending={saveMutation.isPending}
        error={saveMutation.error instanceof Error ? saveMutation.error.message : undefined}
      />
      <TaskDetailModal
        isOpen={Boolean(viewingTask)}
        task={viewingTask}
        onClose={() => setViewingTask(null)}
        onEdit={handleEditTask}
      />
    </div>
  );
}

function MiniStat({
  label,
  value,
  dotColor,
}: {
  label: string;
  value: string;
  dotColor: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-center shadow-xl shadow-black/10">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <div className="mt-1 flex items-center justify-center gap-1.5">
        <div className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
        <p className="text-2xl font-semibold text-white">{value}</p>
      </div>
    </div>
  );
}

function WeeklyPlanSearch({
  inputRef,
  value,
  onChange,
  typeFilter,
  statusFilter,
  onTypeFilterChange,
  onStatusFilterChange,
  onClearFilters,
  visibleCount,
  totalCount,
  isSearching,
  previewItems,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  typeFilter: WeeklyTaskType | "all";
  statusFilter: WeeklyTaskStatus | "all";
  onTypeFilterChange: (value: WeeklyTaskType | "all") => void;
  onStatusFilterChange: (value: WeeklyTaskStatus | "all") => void;
  onClearFilters: () => void;
  visibleCount: number;
  totalCount: number;
  isSearching: boolean;
  previewItems: FastFindPreviewItem[];
}) {
  return (
    <FastFindSearch
      inputRef={inputRef}
      value={value}
      onChange={onChange}
      visibleCount={visibleCount}
      totalCount={totalCount}
      isSearching={isSearching}
      placeholder="Search tasks, projects, status, priority, or dates..."
      chips={[
        { label: "All", icon: ListChecks, active: typeFilter === "all" && statusFilter === "all", onClick: onClearFilters },
        {
          label: "Planned",
          icon: ListTodo,
          active: typeFilter === "planned_work",
          onClick: () => onTypeFilterChange("planned_work"),
        },
        {
          label: "Blockers",
          icon: AlertTriangle,
          active: typeFilter === "blocker",
          onClick: () => onTypeFilterChange("blocker"),
        },
        {
          label: "Carryover",
          icon: Repeat,
          active: typeFilter === "carryover",
          onClick: () => onTypeFilterChange("carryover"),
        },
        {
          label: "Completed",
          icon: CheckCircle2,
          active: statusFilter === "completed",
          onClick: () => onStatusFilterChange("completed"),
        },
        {
          label: "Follow-up",
          icon: Calendar,
          active: typeFilter === "follow_up",
          onClick: () => onTypeFilterChange("follow_up"),
        },
      ]}
      previewItems={previewItems}
      emptyMessage={`Nothing matched "${value.trim()}". Try a project, status, priority, or task phrase.`}
      moreLabel={`Showing ${previewItems.length} of ${visibleCount} matches on the board.`}
    />
  );
}

function WeekCapacityStrip({
  capacity,
  isLoading,
}: {
  capacity?: {
    days: Array<{
      date: string;
      dayName: string;
      isWorkingDay: boolean;
      meetingMinutes: number;
      plannedTaskMinutes: number;
      availableMinutes: number;
      remainingMinutes: number;
    }>;
  };
  isLoading: boolean;
}) {
  return (
    <Panel>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-white">Calendar Capacity</h2>
        <span className="text-xs text-slate-500">
          {isLoading ? "Loading..." : "Meetings vs planned task estimates"}
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-5">
        {(capacity?.days ?? []).map((day) => {
          const overloaded = day.remainingMinutes < 0;
          return (
            <div
              key={day.date}
              className={`rounded-xl border p-3 ${
                overloaded
                  ? "border-red-300/20 bg-red-500/10"
                  : day.isWorkingDay
                    ? "border-white/10 bg-slate-950/45"
                    : "border-white/5 bg-white/[0.02] opacity-70"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase text-slate-300">
                  {day.dayName.slice(0, 3)}
                </p>
                <p className="text-[10px] text-slate-500">{day.date.slice(5)}</p>
              </div>
              <div className="mt-3 space-y-1.5 text-[11px] text-slate-400">
                <CapacityLine label="Meetings" value={day.meetingMinutes} />
                <CapacityLine label="Planned" value={day.plannedTaskMinutes} />
                <CapacityLine
                  label="Remaining"
                  value={day.remainingMinutes}
                  danger={overloaded}
                />
              </div>
            </div>
          );
        })}
        {!isLoading && !capacity?.days?.length ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-xs text-slate-400 md:col-span-5">
            Capacity appears after the desktop data command is available.
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function CapacityMetric({
  label,
  minutes,
  emphasize,
}: {
  label: string;
  minutes: number;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/8 bg-slate-950/45 p-2">
      <p className="text-[10px] uppercase text-slate-500">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${emphasize ? "text-red-200" : "text-white"}`}>
        {formatMinutes(minutes)}
      </p>
    </div>
  );
}

function CapacityLine({
  label,
  value,
  danger,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <span className={danger ? "font-semibold text-red-200" : "text-slate-200"}>
        {formatMinutes(value)}
      </span>
    </div>
  );
}

function formatMinutes(minutes: number) {
  const sign = minutes < 0 ? "-" : "";
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const remaining = absolute % 60;
  if (!hours) return `${sign}${remaining}m`;
  if (!remaining) return `${sign}${hours}h`;
  return `${sign}${hours}h ${remaining}m`;
}

function today() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildTaskSearchText(task: WeeklyTask) {
  return normalizeSearchText(
    [
      task.title,
      task.details,
      task.projectName,
      taskTypeLabels[task.taskType],
      statusLabels[task.status],
      priorityLabels[task.priority],
      task.weekStartDate,
      task.targetDate,
      task.completedAt,
      task.includedInReport ? "included report" : "not included report",
      task.estimatedMinutes ? `${task.estimatedMinutes} minutes ${formatMinutes(task.estimatedMinutes)}` : null,
      task.progressPercent !== undefined && task.progressPercent !== null
        ? `${task.progressPercent} percent progress`
        : null,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
