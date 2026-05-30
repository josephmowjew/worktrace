import { zodResolver } from "@hookform/resolvers/zod";
import { open } from "@tauri-apps/plugin-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { Save, ListTodo, AlertCircle, CheckCircle2, Clock, FolderKanban, Flag, Paperclip, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import type { Project } from "../../types/project";
import type {
  WeeklyTask,
  WeeklyTaskPriority,
  WeeklyTaskStatus,
  WeeklyTaskType,
} from "../../types/weeklyTask";
import { Button } from "./Button";
import { DatePicker } from "./DatePicker";
import { ModalShell } from "./ModalShell";
import { SelectField } from "./SelectField";
import { TaskAttachmentsSection } from "./TaskDetailModal";
import { useToast } from "./ToastProvider";

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
  estimatedMinutes: z.number().optional(),
});

type TaskFormValues = z.infer<typeof taskSchema>;
export type TaskSubmitValues = TaskFormValues & {
  attachmentPaths?: string[];
};

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
  "wt-input h-10 w-full rounded-xl px-3 text-sm transition-[border-color,box-shadow,background-color]";

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
    estimatedMinutes: undefined,
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
  onSubmit: (values: TaskSubmitValues) => void;
  projects: Project[];
  weekStartDate: string;
  editingTask: WeeklyTask | null;
  isPending: boolean;
  error?: string;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [pendingAttachmentPaths, setPendingAttachmentPaths] = useState<string[]>([]);
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
        estimatedMinutes: editingTask.estimatedMinutes ?? undefined,
      });
    } else {
      form.reset(defaultValues(weekStartDate));
    }
  }, [editingTask, weekStartDate, form]);

  useEffect(() => {
    if (!isOpen) {
      form.reset(defaultValues(weekStartDate));
      setPendingAttachmentPaths([]);
    }
  }, [isOpen, weekStartDate, form]);

  useEffect(() => {
    setPendingAttachmentPaths([]);
  }, [editingTask?.id]);

  useEscapeKey(onClose, isOpen);

  if (!isOpen) return null;

  return (
    <ModalShell
      title={editingTask ? "Edit Plan Item" : "Add Plan Item"}
      description={editingTask ? "Modify task details" : "Create a new weekly task"}
      onClose={onClose}
    >
        <form
          className="space-y-4 p-5"
          onSubmit={form.handleSubmit((values) =>
            onSubmit({
              ...values,
              attachmentPaths: editingTask ? [] : pendingAttachmentPaths,
            }),
          )}
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
              <SelectField
                control={form.control}
                name="taskType"
                options={taskTypes.map((type) => ({
                  value: type.value,
                  label: type.label,
                  icon: ListTodo,
                }))}
                size="sm"
              />
            </Field>
            <Field label="Status">
              <SelectField
                control={form.control}
                name="status"
                options={statuses.map((status) => ({
                  value: status.value,
                  label: status.label,
                  icon: status.value === "completed" ? CheckCircle2 : status.value === "blocked" ? AlertCircle : status.value === "in_progress" ? Clock : ListTodo,
                }))}
                size="sm"
              />
            </Field>
          </div>

          <Field label="Project">
            <SelectField
              control={form.control}
              name="projectId"
              options={[
                { value: "", label: "General / no project", icon: FolderKanban },
                ...projects.map((project) => ({
                  value: project.id,
                  label: project.name,
                  icon: FolderKanban,
                })),
              ]}
              size="sm"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Week Start">
              <DatePicker
                value={form.watch("weekStartDate")}
                onChange={(value) =>
                  form.setValue("weekStartDate", value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                label="Week"
                subtitle="Week start"
              />
            </Field>
            <Field label="Target Date">
              <DatePicker
                value={form.watch("targetDate") ?? ""}
                onChange={(value) =>
                  form.setValue("targetDate", value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                label="Target"
                subtitle="Target date"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Priority">
              <SelectField
                control={form.control}
                name="priority"
                options={priorities.map((priority) => ({
                  value: priority.value,
                  label: priority.label,
                  icon: Flag,
                }))}
                size="sm"
              />
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
            <Field label="Estimate (minutes)">
              <input
                type="number"
                min={0}
                max={1440}
                className={inputClass}
                placeholder="60"
                {...form.register("estimatedMinutes", { valueAsNumber: true })}
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

          <label className="flex items-center gap-3 rounded-xl border border-[var(--wt-border)] bg-[var(--wt-surface-muted)] px-3 py-2 text-sm text-[var(--wt-text)]">
            <input
              type="checkbox"
              className="h-4 w-4 accent-blue-500"
              {...form.register("includedInReport")}
            />
            Include in weekly report
          </label>

          {editingTask ? (
            <TaskAttachmentsSection
              taskId={editingTask.id}
              queryKey={["taskAttachments", editingTask.id]}
              onChanged={() => queryClient.invalidateQueries({ queryKey: ["taskAttachments", editingTask.id] })}
              onError={(title, message) => toast.error(title, message)}
              onSuccess={(title, message) => toast.success(title, message)}
            />
          ) : (
            <PendingAttachmentsSection
              paths={pendingAttachmentPaths}
              onChange={setPendingAttachmentPaths}
              onError={(message) => toast.error("Attachment failed", message)}
            />
          )}

          {error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-100">
              {error}
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
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
    </ModalShell>
  );
}

function PendingAttachmentsSection({
  paths,
  onChange,
  onError,
}: {
  paths: string[];
  onChange: (paths: string[]) => void;
  onError: (message: string) => void;
}) {
  const rows = useMemo(
    () =>
      paths.map((path) => ({
        path,
        name: path.split(/[\\/]/).pop() || "Attachment",
      })),
    [paths],
  );

  async function pickAttachment() {
    const selected = await open({
      multiple: true,
      directory: false,
      filters: [
        {
          name: "Images and PDFs",
          extensions: ["png", "jpg", "jpeg", "webp", "gif", "pdf"],
        },
      ],
    });
    const selectedPaths = Array.isArray(selected) ? selected : typeof selected === "string" ? [selected] : [];
    if (!selectedPaths.length) return;
    const next = [...paths];
    for (const path of selectedPaths) {
      if (next.includes(path)) continue;
      if (next.length >= 20) {
        onError("A task can have up to 20 attachments.");
        break;
      }
      next.push(path);
    }
    onChange(next);
  }

  return (
    <div className="rounded-2xl border border-[var(--wt-border)] bg-[var(--wt-surface-muted)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--wt-text)]">
            <Paperclip className="h-4 w-4 text-cyan-300" />
            Attachments
            {rows.length > 0 ? (
              <span className="rounded-md bg-white/6 px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--wt-text-muted)]">
                {rows.length}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-[var(--wt-text-muted)]">Files are copied into WorkTrace after the task is saved.</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => void pickAttachment()} disabled={rows.length >= 20}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl bg-white/[0.03] px-3 py-3 text-sm text-[var(--wt-text-muted)]">
          Add screenshots or PDFs before saving this task.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.path} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
              <Paperclip className="h-4 w-4 shrink-0 text-cyan-200" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--wt-text)]">{row.name}</p>
                <p className="truncate text-xs text-[var(--wt-text-muted)]">{row.path}</p>
              </div>
              <button
                type="button"
                onClick={() => onChange(paths.filter((path) => path !== row.path))}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--wt-text-muted)] transition-[background-color,color,transform] hover:bg-red-500/10 hover:text-red-400 active:scale-[0.96]"
                aria-label={`Remove ${row.name}`}
                title="Remove attachment"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
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
    <label className="grid gap-2 text-xs font-semibold text-[var(--wt-text-muted)]">
      {label}
      {children}
      {error ? <span className="text-[11px] text-red-500">{error}</span> : null}
    </label>
  );
}
