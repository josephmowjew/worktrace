import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  Check,
  ClipboardList,
  Edit3,
  ListChecks,
  Play,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { listProjects } from "../lib/api/projects";
import {
  createWeeklyTask,
  deleteWeeklyTask,
  listWeeklyTasks,
  updateWeeklyTask,
} from "../lib/api/weeklyTasks";
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

const priorities: Array<{ value: WeeklyTaskPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
];

const taskSchema = z.object({
  projectId: z.string().optional(),
  taskType: z.enum([
    "planned_work",
    "blocker",
    "carryover",
    "completed_checklist",
    "follow_up",
  ]),
  status: z.enum(["todo", "in_progress", "blocked", "completed", "dropped"]),
  title: z.string().trim().min(1, "Task title is required"),
  details: z.string().optional(),
  weekStartDate: z.string().trim().min(1, "Week is required"),
  targetDate: z.string().optional(),
  completedAt: z.string().optional(),
  priority: z.enum(["low", "normal", "high"]),
  includedInReport: z.boolean(),
});

type TaskFormValues = z.infer<typeof taskSchema>;

export function WeeklyPlanPage() {
  const queryClient = useQueryClient();
  const weekRange = currentWeekRange();
  const [editingTask, setEditingTask] = useState<WeeklyTask | null>(null);
  const [typeFilter, setTypeFilter] = useState<WeeklyTaskType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<WeeklyTaskStatus | "all">("all");
  const [projectFilter, setProjectFilter] = useState("all");

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

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: defaultValues(weekRange.from),
  });

  const tasks = tasksQuery.data ?? [];
  const summary = useMemo(() => summarizeTasks(tasks), [tasks]);

  const saveMutation = useMutation({
    mutationFn: (values: TaskFormValues) => {
      const input = toTaskInput(values);
      if (editingTask) {
        return updateWeeklyTask(editingTask.id, input);
      }

      return createWeeklyTask(input);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["weeklyTasks"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
      ]);
      clearForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: WeeklyTaskStatus }) =>
      updateWeeklyTask(id, {
        status,
        completedAt: status === "completed" || status === "dropped" ? today() : null,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["weeklyTasks"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
      ]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWeeklyTask,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["weeklyTasks"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
      ]);
    },
  });

  function editTask(task: WeeklyTask) {
    setEditingTask(task);
    form.reset({
      projectId: task.projectId ?? "",
      taskType: task.taskType,
      status: task.status,
      title: task.title,
      details: task.details ?? "",
      weekStartDate: task.weekStartDate,
      targetDate: task.targetDate ?? "",
      completedAt: task.completedAt ?? "",
      priority: task.priority,
      includedInReport: task.includedInReport,
    });
  }

  function clearForm() {
    setEditingTask(null);
    saveMutation.reset();
    form.reset(defaultValues(weekRange.from));
  }

  return (
    <div className="space-y-4">
      <Panel className="relative overflow-hidden p-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_28%,rgba(56,189,248,0.18),transparent_26%),radial-gradient(circle_at_72%_12%,rgba(37,99,235,0.18),transparent_24%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
              <ListChecks className="h-3.5 w-3.5" />
              Weekly plan
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
            <MiniStat label="Open" value={summary.open.toString()} />
            <MiniStat label="Blocked" value={summary.blocked.toString()} />
            <MiniStat label="Done" value={summary.completed.toString()} />
            <MiniStat label="Report" value={summary.included.toString()} />
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Panel className="grid gap-3 p-3 lg:grid-cols-3">
            <FilterSelect label="Type" value={typeFilter} onChange={setTypeFilter}>
              <option value="all">All types</option>
              {taskTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter}>
              <option value="all">All statuses</option>
              {statuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Project"
              value={projectFilter}
              onChange={setProjectFilter}
            >
              <option value="all">All projects</option>
              {(projectsQuery.data ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </FilterSelect>
          </Panel>

          <Panel className="min-h-[520px]">
            {tasksQuery.isLoading ? (
              <TaskSkeleton />
            ) : tasksQuery.isError ? (
              <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
                {tasksQuery.error instanceof Error
                  ? tasksQuery.error.message
                  : "Weekly tasks could not be loaded."}
              </div>
            ) : tasks.length === 0 ? (
              <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 text-center">
                <div>
                  <ClipboardList className="mx-auto h-9 w-9 text-blue-300" />
                  <p className="mt-3 text-sm font-semibold text-white">
                    No weekly plan items yet
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Add planned work, blockers, follow-ups, or completed checklist
                    items for {weekRange.label}.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {taskTypes.map((type) => {
                  const sectionTasks = tasks.filter((task) => task.taskType === type.value);
                  if (sectionTasks.length === 0) {
                    return null;
                  }

                  return (
                    <section key={type.value} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-slate-100">
                          {type.label}
                        </h2>
                        <Badge tone="slate">{sectionTasks.length}</Badge>
                      </div>
                      <div className="grid gap-2">
                        {sectionTasks.map((task) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            onEdit={() => editTask(task)}
                            onDelete={() => deleteMutation.mutate(task.id)}
                            onStatus={(status) =>
                              updateMutation.mutate({ id: task.id, status })
                            }
                            isPending={updateMutation.isPending || deleteMutation.isPending}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        <Panel className="h-fit p-0">
          <div className="border-b border-white/8 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">
                  {editingTask ? "Edit Plan Item" : "Add Plan Item"}
                </h2>
                <p className="mt-1 text-xs text-slate-400">{weekRange.label}</p>
              </div>
              {editingTask ? (
                <Button variant="ghost" onClick={clearForm}>
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>

          <form
            className="space-y-4 p-4"
            onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
          >
            <Field label="Title" error={form.formState.errors.title?.message}>
              <input
                className={inputClass}
                placeholder="Finalize report export polish"
                {...form.register("title")}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Type">
                <select className={inputClass} {...form.register("taskType")}>
                  {taskTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Status">
                <select className={inputClass} {...form.register("status")}>
                  {statuses.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Project">
              <select className={inputClass} {...form.register("projectId")}>
                <option value="">General / no project</option>
                {(projectsQuery.data ?? []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Week Start">
                <input type="date" className={inputClass} {...form.register("weekStartDate")} />
              </Field>
              <Field label="Target Date">
                <input type="date" className={inputClass} {...form.register("targetDate")} />
              </Field>
            </div>

            <Field label="Priority">
              <select className={inputClass} {...form.register("priority")}>
                {priorities.map((priority) => (
                  <option key={priority.value} value={priority.value}>
                    {priority.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Details">
              <textarea
                className={`${inputClass} min-h-24 resize-y py-3`}
                placeholder="Context, blocker details, or report wording"
                {...form.register("details")}
              />
            </Field>

            <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/45 px-3 py-2 text-sm text-slate-300">
              <input
                type="checkbox"
                className="h-4 w-4 accent-blue-500"
                {...form.register("includedInReport")}
              />
              Include in weekly report
            </label>

            {saveMutation.isError ? (
              <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
                {saveMutation.error instanceof Error
                  ? saveMutation.error.message
                  : "Task could not be saved."}
              </div>
            ) : null}

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={saveMutation.isPending}
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending
                ? "Saving..."
                : editingTask
                  ? "Save Task"
                  : "Add Task"}
            </Button>
          </form>
        </Panel>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  onEdit,
  onDelete,
  onStatus,
  isPending,
}: {
  task: WeeklyTask;
  onEdit: () => void;
  onDelete: () => void;
  onStatus: (status: WeeklyTaskStatus) => void;
  isPending: boolean;
}) {
  return (
    <article className="rounded-xl border border-white/8 bg-slate-950/45 p-3 shadow-lg shadow-black/10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={task.status === "blocked" ? "orange" : "blue"}>
              {labelStatus(task.status)}
            </Badge>
            <Badge tone={task.priority === "high" ? "orange" : "slate"}>
              {task.priority}
            </Badge>
            {task.projectName ? <Badge tone="cyan">{task.projectName}</Badge> : null}
            {task.includedInReport ? <Badge tone="green">Report</Badge> : null}
          </div>
          <p className="mt-2 text-sm font-semibold text-white">{task.title}</p>
          {task.details ? (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">
              {task.details}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <IconButton label="Start" disabled={isPending} onClick={() => onStatus("in_progress")}>
            <Play className="h-4 w-4" />
          </IconButton>
          <IconButton label="Block" disabled={isPending} onClick={() => onStatus("blocked")}>
            <AlertTriangle className="h-4 w-4" />
          </IconButton>
          <IconButton label="Complete" disabled={isPending} onClick={() => onStatus("completed")}>
            <Check className="h-4 w-4" />
          </IconButton>
          <IconButton label="Drop" disabled={isPending} onClick={() => onStatus("dropped")}>
            <Ban className="h-4 w-4" />
          </IconButton>
          <IconButton label="Edit" disabled={isPending} onClick={onEdit}>
            <Edit3 className="h-4 w-4" />
          </IconButton>
          <IconButton label="Delete" disabled={isPending} onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
    </article>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      className="h-8 w-8 px-0"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </Button>
  );
}

function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-xs font-semibold text-slate-300">
      {label}
      <select
        className={inputClass}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value as T)}
      >
        {children}
      </select>
    </label>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-xs font-semibold text-slate-300">
      {label}
      {children}
      {error ? <span className="text-[11px] text-red-300">{error}</span> : null}
    </label>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-right shadow-xl shadow-black/10">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function TaskSkeleton() {
  return (
    <div className="grid gap-2">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-24 animate-pulse rounded-xl border border-white/8 bg-white/[0.03]"
        />
      ))}
    </div>
  );
}

const inputClass =
  "h-10 w-full rounded-xl border border-white/10 bg-slate-950/75 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/15";

function defaultValues(weekStartDate: string): TaskFormValues {
  return {
    projectId: "",
    taskType: "planned_work",
    status: "todo",
    title: "",
    details: "",
    weekStartDate,
    targetDate: "",
    completedAt: "",
    priority: "normal",
    includedInReport: false,
  };
}

function toTaskInput(values: TaskFormValues) {
  return {
    projectId: values.projectId || null,
    taskType: values.taskType,
    status: values.status,
    title: values.title,
    details: values.details?.trim() || null,
    weekStartDate: values.weekStartDate,
    targetDate: values.targetDate || null,
    completedAt: values.completedAt || null,
    priority: values.priority,
    includedInReport: values.includedInReport,
  };
}

function summarizeTasks(tasks: WeeklyTask[]) {
  return {
    open: tasks.filter((task) => ["todo", "in_progress"].includes(task.status)).length,
    blocked: tasks.filter((task) => task.status === "blocked").length,
    completed: tasks.filter((task) => task.status === "completed").length,
    included: tasks.filter((task) => task.includedInReport).length,
  };
}

function labelStatus(value: WeeklyTaskStatus) {
  return statuses.find((status) => status.value === value)?.label ?? value;
}

function today() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
