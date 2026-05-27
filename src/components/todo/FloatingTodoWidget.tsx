import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Circle,
  Clock3,
  CalendarDays,
  ListChecks,
  Loader2,
  Minus,
  Pin,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type React from "react";
import { hideTodoWidget, setTodoWidgetAlwaysOnTop } from "../../lib/api/todoWidget";
import {
  createWeeklyTask,
  deleteWeeklyTask,
  listWeeklyTasks,
  updateWeeklyTask,
} from "../../lib/api/weeklyTasks";
import { weeklyTaskQueryRoots } from "../../lib/api/queryKeys";
import { todoAnnouncement, taskUpdateAnnouncement } from "../../lib/announcements";
import { currentWeekRange } from "../../lib/dates";
import type { WeeklyTask, WeeklyTaskStatus } from "../../types/weeklyTask";
import { useSpeech } from "../ui/SpeechProvider";
import { useToast } from "../ui/ToastProvider";

const visibleStatuses: WeeklyTaskStatus[] = ["blocked", "in_progress", "todo", "completed"];

export function FloatingTodoWidget() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const speech = useSpeech();
  const weekRange = currentWeekRange();
  const [title, setTitle] = useState("");
  const [isPinned, setIsPinned] = useState(true);
  const [view, setView] = useState<"todos" | "plan">("todos");

  const tasksQuery = useQuery({
    queryKey: ["weeklyTasks", "widget", weekRange.from, weekRange.to],
    queryFn: () =>
      listWeeklyTasks({
        weekStartDate: weekRange.from,
        weekEndDate: weekRange.to,
      }),
    refetchInterval: 60_000,
  });

  const tasks = useMemo(
    () =>
      (tasksQuery.data ?? [])
        .filter((task) => visibleStatuses.includes(task.status))
        .sort(sortWidgetTasks),
    [tasksQuery.data],
  );
  const allTasks = useMemo(
    () => (tasksQuery.data ?? []).slice().sort(sortWidgetTasks),
    [tasksQuery.data],
  );
  const planTasks = useMemo(
    () =>
      allTasks.filter(
        (task) => task.status !== "dropped" && task.taskType !== "completed_checklist",
      ),
    [allTasks],
  );

  const blockedCount = tasks.filter((task) => task.status === "blocked").length;
  const inProgressCount = tasks.filter((task) => task.status === "in_progress").length;
  const completedCount = tasks.filter((task) => task.status === "completed").length;

  async function invalidateTasks() {
    await Promise.all([
      ...weeklyTaskQueryRoots.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
      queryClient.invalidateQueries({ queryKey: ["reports"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
    ]);
  }

  const addMutation = useMutation({
    mutationFn: () =>
      createWeeklyTask({
        title: title.trim(),
        taskType: "planned_work",
        status: "todo",
        weekStartDate: weekRange.from,
        priority: "normal",
        includedInReport: false,
      }),
    onSuccess: async (task) => {
      setTitle("");
      await invalidateTasks();
      toast.success("Todo added");
      speech.announce(todoAnnouncement("Todo added", task, { projectName: task.projectName }), {
        category: "task",
      });
    },
    onError: (error) => {
      toast.error("Todo add failed", toMessage(error));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ task, status }: { task: WeeklyTask; status: WeeklyTaskStatus }) =>
      updateWeeklyTask(task.id, {
        status,
        completedAt: status === "completed" || status === "dropped" ? today() : null,
        progressPercent:
          status === "in_progress" && (task.progressPercent === null || task.progressPercent === undefined)
            ? 0
            : task.progressPercent,
      }),
    onSuccess: async (task, variables) => {
      await invalidateTasks();
      toast.success("Todo updated");
      speech.announce(
        taskUpdateAnnouncement(task, { status: variables.status }, { projectName: task.projectName }).replace(
          /^Task/,
          "Todo",
        ),
        { category: "task" },
      );
    },
    onError: (error) => {
      toast.error("Todo update failed", toMessage(error));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWeeklyTask,
    onSuccess: async (_result, taskId) => {
      await invalidateTasks();
      toast.success("Todo deleted");
      const deletedTask = tasks.find((task) => task.id === taskId);
      if (deletedTask) {
        speech.announce(todoAnnouncement("Todo deleted", deletedTask, { projectName: deletedTask.projectName }), {
          category: "task",
        });
      }
    },
    onError: (error) => {
      toast.error("Todo delete failed", toMessage(error));
    },
  });

  const pinMutation = useMutation({
    mutationFn: (enabled: boolean) => setTodoWidgetAlwaysOnTop(enabled),
    onSuccess: (enabled) => {
      setIsPinned(enabled);
      toast.info(enabled ? "Widget pinned" : "Widget unpinned");
    },
    onError: (error) => toast.error("Pin update failed", toMessage(error)),
  });

  function addTodo() {
    if (!title.trim()) {
      toast.error("Todo needs a title");
      return;
    }
    addMutation.mutate();
  }

  return (
    <div className="group/widget min-h-screen overflow-hidden bg-transparent p-2 text-slate-100">
      <div className="flex h-[calc(100vh-1rem)] min-h-[224px] flex-col overflow-hidden rounded-[24px] border border-white/6 bg-slate-950/28 opacity-55 shadow-lg shadow-black/10 backdrop-blur-md transition-[background-color,border-color,box-shadow,opacity,backdrop-filter] duration-200 ease-out hover:border-white/12 hover:bg-slate-950/85 hover:opacity-100 hover:shadow-2xl hover:shadow-black/40 hover:backdrop-blur-2xl focus-within:border-white/12 focus-within:bg-slate-950/85 focus-within:opacity-100 focus-within:shadow-2xl focus-within:shadow-black/40 focus-within:backdrop-blur-2xl">
        <header
          className="flex shrink-0 items-center justify-between gap-2 border-b border-white/8 px-3 py-2"
          data-tauri-drag-region
        >
          <div className="min-w-0" data-tauri-drag-region>
            <div className="flex items-center gap-2" data-tauri-drag-region>
              <div className="flex h-7 w-7 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-200">
                <Check className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {view === "todos" ? "WorkTrace Todos" : "Weekly Plan"}
                </p>
                <p className="truncate text-[10px] text-slate-500">{weekRange.label}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => pinMutation.mutate(!isPinned)}
              className={`rounded-lg p-1.5 transition ${
                isPinned
                  ? "bg-blue-500/15 text-blue-200"
                  : "text-slate-500 hover:bg-white/8 hover:text-slate-200"
              }`}
              title={isPinned ? "Unpin from top" : "Pin on top"}
            >
              <Pin className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => hideTodoWidget().catch((error) => toast.error("Hide failed", toMessage(error)))}
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/8 hover:text-slate-200"
              title="Hide widget"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => hideTodoWidget().catch((error) => toast.error("Close failed", toMessage(error)))}
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-red-500/10 hover:text-red-300"
              title="Close widget"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        {view === "todos" ? (
          <section className="grid shrink-0 grid-cols-3 gap-2 border-b border-white/8 p-3">
            <WidgetStat label="Open" value={tasks.length - completedCount} tone="blue" />
            <WidgetStat label="Doing" value={inProgressCount} tone="emerald" />
            <WidgetStat label="Done" value={completedCount} tone={blockedCount > 0 ? "red" : "slate"} />
          </section>
        ) : (
          <section className="grid shrink-0 grid-cols-3 gap-2 border-b border-white/8 p-3">
            <WidgetStat label="Planned" value={countByType(planTasks, "planned_work")} tone="blue" />
            <WidgetStat label="Carry" value={countByType(planTasks, "carryover")} tone="emerald" />
            <WidgetStat label="Blocks" value={countByType(planTasks, "blocker")} tone="red" />
          </section>
        )}

        {view === "todos" ? (
          <form
            className="flex shrink-0 gap-2 border-b border-white/8 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              addTodo();
            }}
          >
            <input
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              placeholder="Quick add a todo..."
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/20"
            />
            <button
              type="submit"
              disabled={addMutation.isPending}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500 disabled:opacity-60"
              title="Add todo"
            >
              {addMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </button>
          </form>
        ) : (
          <div className="shrink-0 border-b border-white/8 p-3">
            <button
              type="button"
              onClick={() => setView("todos")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-blue-100 transition hover:bg-blue-500/25"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to todos
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {tasksQuery.isLoading ? (
            <div className="flex h-full min-h-[180px] items-center justify-center text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : tasksQuery.isError ? (
            <WidgetEmpty
              icon={<AlertTriangle className="h-5 w-5" />}
              title="Todos unavailable"
              message={toMessage(tasksQuery.error)}
            />
          ) : view === "plan" ? (
            <CompactWeeklyPlan tasks={planTasks} />
          ) : tasks.length === 0 ? (
            <WidgetEmpty
              icon={<Circle className="h-5 w-5" />}
              title="Nothing open"
              message="Add a todo here or plan more work from Weekly Plan."
            />
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => (
                <WidgetTaskRow
                  key={task.id}
                  task={task}
                  isBusy={updateMutation.isPending || deleteMutation.isPending}
                  onComplete={() => updateMutation.mutate({ task, status: "completed" })}
                  onReopen={() => updateMutation.mutate({ task, status: "todo" })}
                  onStart={() => updateMutation.mutate({ task, status: "in_progress" })}
                  onBlock={() => updateMutation.mutate({ task, status: "blocked" })}
                  onDelete={() => deleteMutation.mutate(task.id)}
                />
              ))}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-white/8 px-3 py-2">
          <button
            type="button"
            onClick={() => setView(view === "todos" ? "plan" : "todos")}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-blue-200 transition hover:bg-blue-500/10"
          >
            {view === "todos" ? (
              <>
                <ListChecks className="h-3.5 w-3.5" />
                Weekly Plan
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" />
                Todos
              </>
            )}
          </button>
          <p className="text-[10px] text-slate-600">Drag the header to move</p>
        </footer>
      </div>
    </div>
  );
}

function WidgetTaskRow({
  task,
  isBusy,
  onComplete,
  onReopen,
  onStart,
  onBlock,
  onDelete,
}: {
  task: WeeklyTask;
  isBusy: boolean;
  onComplete: () => void;
  onReopen: () => void;
  onStart: () => void;
  onBlock: () => void;
  onDelete: () => void;
}) {
  const isCompleted = task.status === "completed";

  return (
    <div className={`group rounded-2xl border border-white/8 p-3 transition hover:bg-white/[0.055] ${
      isCompleted ? "bg-emerald-500/[0.035]" : "bg-white/[0.035]"
    }`}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={isCompleted ? onReopen : onComplete}
          disabled={isBusy}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition disabled:opacity-50 ${
            isCompleted
              ? "border-emerald-300/50 bg-emerald-500/20 text-emerald-200"
              : "border-slate-500/50 text-transparent hover:border-emerald-300/60 hover:bg-emerald-500/10 hover:text-emerald-200"
          }`}
          title={isCompleted ? "Reopen todo" : "Mark complete"}
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-semibold leading-5 ${
            isCompleted ? "text-slate-500 line-through decoration-emerald-300/60" : "text-slate-100"
          }`}>
            {task.title}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusPill status={task.status} />
            <PriorityPill priority={task.priority} />
            {task.projectName ? (
              <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                {task.projectName}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
        {isCompleted ? (
          <IconAction title="Reopen" onClick={onReopen} disabled={isBusy}>
            <Circle className="h-3.5 w-3.5" />
          </IconAction>
        ) : (
          <>
            <IconAction title="Start" onClick={onStart} disabled={isBusy}>
              <Clock3 className="h-3.5 w-3.5" />
            </IconAction>
            <IconAction title="Block" onClick={onBlock} disabled={isBusy}>
              <AlertTriangle className="h-3.5 w-3.5" />
            </IconAction>
          </>
        )}
        <IconAction title="Delete" onClick={onDelete} disabled={isBusy} danger>
          <Trash2 className="h-3.5 w-3.5" />
        </IconAction>
      </div>
    </div>
  );
}

function CompactWeeklyPlan({ tasks }: { tasks: WeeklyTask[] }) {
  const groups = [
    {
      key: "blocker",
      title: "Blockers",
      tone: "red",
      tasks: tasks.filter((task) => task.taskType === "blocker"),
    },
    {
      key: "in_progress",
      title: "In Progress",
      tone: "emerald",
      tasks: tasks.filter((task) => task.status === "in_progress"),
    },
    {
      key: "planned_work",
      title: "Planned Work",
      tone: "blue",
      tasks: tasks.filter((task) => task.taskType === "planned_work" && task.status !== "in_progress"),
    },
    {
      key: "carryover",
      title: "Carryovers",
      tone: "orange",
      tasks: tasks.filter((task) => task.taskType === "carryover"),
    },
    {
      key: "follow_up",
      title: "Follow-ups",
      tone: "slate",
      tasks: tasks.filter((task) => task.taskType === "follow_up"),
    },
  ].filter((group) => group.tasks.length > 0);

  if (groups.length === 0) {
    return (
      <WidgetEmpty
        icon={<CalendarDays className="h-5 w-5" />}
        title="No weekly plan yet"
        message="Add todos from the main view and they will appear here as planned work."
      />
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <section
          key={group.key}
          className="rounded-2xl border border-white/8 bg-white/[0.025] p-3"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${groupDotClass(group.tone)}`} />
              <h3 className="text-xs font-semibold text-slate-100">{group.title}</h3>
            </div>
            <span className="rounded-full border border-white/8 bg-slate-950/50 px-2 py-0.5 text-[10px] text-slate-500">
              {group.tasks.length}
            </span>
          </div>

          <div className="space-y-1.5">
            {group.tasks.slice(0, 5).map((task) => {
              const isCompleted = task.status === "completed";

              return (
                <div
                  key={task.id}
                  className="rounded-xl border border-white/8 bg-slate-950/40 px-2.5 py-2"
                >
                  <div className="flex items-start gap-2">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass(task.status)}`} />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-xs font-semibold ${
                          isCompleted
                            ? "text-slate-500 line-through decoration-emerald-300/60"
                            : "text-slate-200"
                        }`}
                      >
                        {task.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {task.projectName ? (
                          <span className="truncate rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                            {task.projectName}
                          </span>
                        ) : null}
                        <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">
                          {formatPlanDate(task.targetDate ?? task.weekStartDate)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {group.tasks.length > 5 ? (
              <p className="pt-1 text-[10px] text-slate-600">
                +{group.tasks.length - 5} more
              </p>
            ) : null}
          </div>
        </section>
      ))}
    </div>
  );
}

function IconAction({
  title,
  onClick,
  disabled,
  danger = false,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg p-1.5 transition disabled:opacity-50 ${
        danger
          ? "text-slate-500 hover:bg-red-500/10 hover:text-red-300"
          : "text-slate-500 hover:bg-white/8 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function WidgetStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "emerald" | "red" | "slate";
}) {
  const tones = {
    blue: "border-blue-300/15 bg-blue-500/10 text-blue-200",
    emerald: "border-emerald-300/15 bg-emerald-500/10 text-emerald-200",
    red: "border-red-300/15 bg-red-500/10 text-red-200",
    slate: "border-slate-300/15 bg-slate-500/10 text-slate-300",
  };

  return (
    <div className={`rounded-xl border px-2.5 py-2 ${tones[tone]}`}>
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] opacity-70">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function WidgetEmpty({
  icon,
  title,
  message,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
}) {
  return (
    <div className="flex h-full min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-4 text-center">
      <div>
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-300/20 bg-blue-500/10 text-blue-200">
          {icon}
        </div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mx-auto mt-1.5 max-w-[220px] text-xs leading-5 text-slate-500">{message}</p>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: WeeklyTaskStatus }) {
  const styles = {
    blocked: "border-red-300/20 bg-red-500/10 text-red-200",
    in_progress: "border-emerald-300/20 bg-emerald-500/10 text-emerald-200",
    todo: "border-blue-300/20 bg-blue-500/10 text-blue-200",
    completed: "border-slate-300/15 bg-slate-500/10 text-slate-300",
    dropped: "border-slate-300/15 bg-slate-500/10 text-slate-300",
  };

  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${styles[status]}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function PriorityPill({ priority }: { priority: WeeklyTask["priority"] }) {
  const styles = {
    high: "border-orange-300/20 bg-orange-500/10 text-orange-200",
    normal: "border-slate-300/15 bg-slate-500/10 text-slate-300",
    low: "border-cyan-300/15 bg-cyan-500/10 text-cyan-200",
  };

  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${styles[priority]}`}>
      {priority}
    </span>
  );
}

function sortWidgetTasks(a: WeeklyTask, b: WeeklyTask) {
  const statusRank: Record<WeeklyTaskStatus, number> = {
    blocked: 0,
    in_progress: 1,
    todo: 2,
    completed: 3,
    dropped: 4,
  };
  const priorityRank = { high: 0, normal: 1, low: 2 };
  const statusDiff = statusRank[a.status] - statusRank[b.status];
  if (statusDiff !== 0) return statusDiff;
  const priorityDiff = priorityRank[a.priority] - priorityRank[b.priority];
  if (priorityDiff !== 0) return priorityDiff;
  return (a.targetDate ?? a.createdAt).localeCompare(b.targetDate ?? b.createdAt);
}

function countByType(tasks: WeeklyTask[], taskType: WeeklyTask["taskType"]) {
  return tasks.filter((task) => task.taskType === taskType).length;
}

function groupDotClass(tone: string) {
  switch (tone) {
    case "red":
      return "bg-red-400";
    case "emerald":
      return "bg-emerald-400";
    case "blue":
      return "bg-blue-400";
    case "orange":
      return "bg-orange-400";
    default:
      return "bg-slate-400";
  }
}

function statusDotClass(status: WeeklyTaskStatus) {
  switch (status) {
    case "blocked":
      return "bg-red-400";
    case "in_progress":
      return "bg-emerald-400";
    case "completed":
      return "bg-slate-500";
    default:
      return "bg-blue-400";
  }
}

function formatPlanDate(dateString: string) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
