import { zodResolver } from "@hookform/resolvers/zod";
import { Save, X } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { Project } from "../../types/project";
import type {
  WeeklyTask,
  WeeklyTaskPriority,
  WeeklyTaskStatus,
  WeeklyTaskType,
} from "../../types/weeklyTask";
import { Button } from "./Button";
import { Panel } from "./Panel";

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
  progressPercent: z.number().optional(),
});

type TaskFormValues = z.infer<typeof taskSchema>;

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
    progressPercent: undefined,
  };
}

export function AddTaskModal({
  isOpen,
  onClose,
  onSubmit,
  projects,
  weekStartDate,
  editingTask,
  isPending,
  error,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: TaskFormValues) => void;
  projects: Project[];
  weekStartDate: string;
  editingTask: WeeklyTask | null;
  isPending: boolean;
  error?: string;
}) {
  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: defaultValues(weekStartDate),
  });

  useEffect(() => {
    if (editingTask) {
      form.reset({
        projectId: editingTask.projectId ?? "",
        taskType: editingTask.taskType,
        status: editingTask.status,
        title: editingTask.title,
        details: editingTask.details ?? "",
        weekStartDate: editingTask.weekStartDate,
        targetDate: editingTask.targetDate ?? "",
        completedAt: editingTask.completedAt ?? "",
        priority: editingTask.priority,
        includedInReport: editingTask.includedInReport,
        progressPercent: editingTask.progressPercent ?? undefined,
      });
    } else {
      form.reset(defaultValues(weekStartDate));
    }
  }, [editingTask, weekStartDate, form]);

  useEffect(() => {
    if (!isOpen) {
      form.reset(defaultValues(weekStartDate));
    }
  }, [isOpen, weekStartDate, form]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <Panel className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto p-0">
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">
              {editingTask ? "Edit Plan Item" : "Add Plan Item"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {editingTask ? "Modify task details" : "Create a new weekly task"}
            </p>
          </div>
          <Button variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form
          className="space-y-4 p-5"
          onSubmit={form.handleSubmit((values) => onSubmit(values))}
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
              {projects.map((project) => (
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

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Priority">
              <select className={inputClass} {...form.register("priority")}>
                {priorities.map((priority) => (
                  <option key={priority.value} value={priority.value}>
                    {priority.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Progress (%)">
              <input
                type="number"
                min={0}
                max={100}
                className={inputClass}
                placeholder="0"
                {...form.register("progressPercent", { valueAsNumber: true })}
              />
            </Field>
          </div>

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

          {error ? (
            <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
              {error}
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              disabled={isPending}
            >
              <Save className="h-4 w-4" />
              {isPending ? "Saving..." : editingTask ? "Save Task" : "Add Task"}
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-xs font-semibold text-slate-300">
      {label}
      {children}
      {error ? <span className="text-[11px] text-red-300">{error}</span> : null}
    </label>
  );
}
