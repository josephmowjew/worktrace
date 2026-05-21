import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  ListChecks,
  RotateCcw,
  Sparkles,
  ListTodo,
  CheckCircle2,
  FolderKanban,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { KanbanColumn } from "../components/ui/KanbanColumn";
import { Panel } from "../components/ui/Panel";
import { ProgressDonut } from "../components/ui/ProgressDonut";
import { QuickAddBar } from "../components/ui/QuickAddBar";
import { RecentlyCompletedList } from "../components/ui/RecentlyCompletedList";
import { AddItemBar } from "../components/ui/AddItemBar";
import { AddTaskModal } from "../components/ui/AddTaskModal";
import { Select } from "../components/ui/Select";
import { useToast } from "../components/ui/ToastProvider";
import { listProjects } from "../lib/api/projects";
import {
  createWeeklyTask,
  deleteWeeklyTask,
  listWeeklyTasks,
  updateWeeklyTask,
} from "../lib/api/weeklyTasks";
import { weeklyTaskQueryRoots } from "../lib/api/queryKeys";
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

export function WeeklyPlanPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const weekRange = currentWeekRange();
  const [typeFilter, setTypeFilter] = useState<WeeklyTaskType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<WeeklyTaskStatus | "all">("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<WeeklyTask | null>(null);
  const [prefillData, setPrefillData] = useState<{
    title: string;
    priority: WeeklyTaskPriority;
    projectId?: string;
  } | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const dragOverColumnRef = useRef<string | null>(null);

  async function invalidateWeeklyTaskViews() {
    await Promise.all([
      ...weeklyTaskQueryRoots.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
      queryClient.invalidateQueries({ queryKey: ["reports"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
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

  const tasks = tasksQuery.data ?? [];
  const projects = (projectsQuery.data ?? []).filter(
    (project) => project.status === "active",
  );

  const planned = useMemo(
    () => tasks.filter((t) => t.status === "todo" && t.taskType !== "carryover"),
    [tasks]
  );
  const inProgress = useMemo(
    () => tasks.filter((t) => t.status === "in_progress" && t.taskType !== "carryover"),
    [tasks]
  );
  const done = useMemo(
    () => tasks.filter((t) => t.status === "completed"),
    [tasks]
  );
  const carryForward = useMemo(
    () => tasks.filter((t) => t.taskType === "carryover" && t.status !== "completed"),
    [tasks]
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
      });
    },
    onSuccess: async () => {
      await invalidateWeeklyTaskViews();
      toast.success(editingTask ? "Task updated" : "Task added");
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
    onSuccess: async () => {
      await invalidateWeeklyTaskViews();
      toast.success("Task updated");
    },
    onError: (error) => {
      toast.error("Task update failed", error instanceof Error ? error.message : "The task could not be updated.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWeeklyTask,
    onSuccess: async () => {
      await invalidateWeeklyTaskViews();
      toast.success("Task deleted");
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
    onSuccess: async () => {
      await invalidateWeeklyTaskViews();
      toast.success("Task moved");
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
    setEditingTask(task);
    setModalOpen(true);
  }, []);

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
  }

  const hasActiveFilters = typeFilter !== "all" || statusFilter !== "all" || projectFilter !== "all";

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

      <div className="flex flex-wrap items-center gap-2">
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
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
          >
            <RotateCcw className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      <AddItemBar
        onAdd={handleAddItem}
        projects={projects}
        weekRange={weekRange}
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KanbanColumn
            title="Planned"
            color="bg-blue-400"
            tasks={planned}
            count={planned.length}
            columnId="planned"
            onAdd={() => handleAddItem("", "normal")}
            onToggleComplete={handleToggleComplete}
            onEdit={handleEditTask}
            onDelete={handleDeleteTask}
            onDragOverColumn={handleDragOverColumn}
            onDrop={handleDrop}
            onDragStart={setDraggedTaskId}
            activeColumnId={activeColumnId}
          />
          <KanbanColumn
            title="In Progress"
            color="bg-violet-400"
            tasks={inProgress}
            count={inProgress.length}
            columnId="in-progress"
            onAdd={() => handleAddItem("", "normal")}
            onToggleComplete={handleToggleComplete}
            onEdit={handleEditTask}
            onDelete={handleDeleteTask}
            onDragOverColumn={handleDragOverColumn}
            onDrop={handleDrop}
            onDragStart={setDraggedTaskId}
            activeColumnId={activeColumnId}
          />
          <KanbanColumn
            title="Done"
            color="bg-emerald-400"
            tasks={done}
            count={done.length}
            columnId="done"
            onAdd={() => handleAddItem("", "normal")}
            onToggleComplete={handleToggleComplete}
            onEdit={handleEditTask}
            onDelete={handleDeleteTask}
            onDragOverColumn={handleDragOverColumn}
            onDrop={handleDrop}
            onDragStart={setDraggedTaskId}
            activeColumnId={activeColumnId}
          />
          <KanbanColumn
            title="Carry Forward"
            color="bg-orange-400"
            tasks={carryForward}
            count={carryForward.length}
            columnId="carry-forward"
            onAdd={() => handleAddItem("", "normal")}
            onToggleComplete={handleToggleComplete}
            onEdit={handleEditTask}
            onDelete={handleDeleteTask}
            onDragOverColumn={handleDragOverColumn}
            onDrop={handleDrop}
            onDragStart={setDraggedTaskId}
            activeColumnId={activeColumnId}
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
            />
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
          });
        }}
        projects={projects}
        weekStartDate={weekRange.from}
        editingTask={editingTask}
        isPending={saveMutation.isPending}
        error={saveMutation.error instanceof Error ? saveMutation.error.message : undefined}
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

function today() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
