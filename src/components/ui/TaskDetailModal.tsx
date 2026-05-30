import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  Edit3,
  FileImage,
  FileText,
  Flag,
  FolderKanban,
  ListTodo,
  Paperclip,
  Plus,
  Trash2,
  Target,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ElementType } from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import {
  addTaskAttachment,
  deleteTaskAttachment,
  getTaskAttachmentPreview,
  listTaskAttachments,
  openTaskAttachment,
} from "../../lib/api/taskAttachments";
import type { TaskAttachment } from "../../types/taskAttachment";
import type { WeeklyTask } from "../../types/weeklyTask";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { CloseButton } from "./CloseButton";
import { Panel } from "./Panel";
import { useToast } from "./ToastProvider";

const typeLabels: Record<WeeklyTask["taskType"], string> = {
  planned_work: "Planned Work",
  blocker: "Blocker",
  carryover: "Carryover",
  completed_checklist: "Completed Checklist",
  follow_up: "Follow-up",
};

const statusTones: Record<WeeklyTask["status"], "blue" | "green" | "orange" | "slate"> = {
  todo: "slate",
  in_progress: "blue",
  blocked: "orange",
  completed: "green",
  dropped: "slate",
};

const priorityTones: Record<WeeklyTask["priority"], "blue" | "orange" | "slate"> = {
  low: "slate",
  normal: "blue",
  high: "orange",
};

export function TaskDetailModal({
  task,
  isOpen,
  onClose,
  onEdit,
}: {
  task: WeeklyTask | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (task: WeeklyTask) => void;
}) {
  useEscapeKey(onClose, isOpen);
  const queryClient = useQueryClient();
  const toast = useToast();

  if (!isOpen || !task) return null;
  const attachmentQueryKey = ["taskAttachments", task.id];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm">
      <Panel className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto p-0 shadow-[0_28px_90px_rgba(2,6,23,0.5)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone={statusTones[task.status]}>{task.status.replace("_", " ")}</Badge>
              <Badge tone={priorityTones[task.priority]}>{task.priority} priority</Badge>
              {task.includedInReport ? <Badge tone="green">In report</Badge> : <Badge tone="slate">Not in report</Badge>}
            </div>
            <h2 className="text-lg font-semibold leading-7 text-white [text-wrap:balance]">{task.title}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {task.projectName ?? "General"} / {typeLabels[task.taskType]}
            </p>
          </div>
          <CloseButton label="Close task details" onClick={onClose} />
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-2xl border border-white/8 bg-slate-950/45 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300">
              <FileText className="h-4 w-4 text-blue-200" />
              Details
            </div>
            {task.details ? (
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-300 [text-wrap:pretty]">{task.details}</p>
            ) : (
              <p className="text-sm text-slate-500">No extra details captured.</p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <DetailItem icon={FolderKanban} label="Project" value={task.projectName ?? "General / no project"} />
            <DetailItem icon={ListTodo} label="Type" value={typeLabels[task.taskType]} />
            <DetailItem icon={CheckCircle2} label="Status" value={task.status.replace("_", " ")} />
            <DetailItem icon={Flag} label="Priority" value={task.priority} />
            <DetailItem icon={CalendarDays} label="Week" value={formatDate(task.weekStartDate)} />
            <DetailItem icon={Target} label="Target" value={formatOptionalDate(task.targetDate)} />
            <DetailItem icon={CheckCircle2} label="Completed" value={formatOptionalDate(task.completedAt)} />
            <DetailItem icon={Clock3} label="Estimate" value={formatMinutes(task.estimatedMinutes)} />
          </div>

          {task.progressPercent !== undefined && task.progressPercent !== null ? (
            <div className="rounded-2xl border border-white/8 bg-slate-950/45 p-4">
              <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-300">Progress</span>
                <span className="tabular-nums">{task.progressPercent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-blue-500 transition-[width] duration-300"
                  style={{ width: `${Math.max(0, Math.min(100, task.progressPercent))}%` }}
                />
              </div>
            </div>
          ) : null}

          <TaskAttachmentsSection
            taskId={task.id}
            queryKey={attachmentQueryKey}
            onChanged={() => queryClient.invalidateQueries({ queryKey: attachmentQueryKey })}
            onError={(title, message) => toast.error(title, message)}
            onSuccess={(title, message) => toast.success(title, message)}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <DetailItem label="Created" value={formatTimestamp(task.createdAt)} />
            <DetailItem label="Updated" value={formatTimestamp(task.updatedAt)} />
          </div>

          <div className="flex flex-wrap gap-2 border-t border-white/8 pt-4">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              Close
            </Button>
            {onEdit ? (
              <Button type="button" variant="primary" onClick={() => onEdit(task)} className="flex-1">
                <Edit3 className="h-4 w-4" />
                Edit Task
              </Button>
            ) : null}
          </div>
        </div>
      </Panel>
    </div>
  );
}

export function TaskAttachmentsSection({
  taskId,
  queryKey,
  onChanged,
  onError,
  onSuccess,
}: {
  taskId: string;
  queryKey: readonly unknown[];
  onChanged: () => void;
  onError: (title: string, message?: string) => void;
  onSuccess: (title: string, message?: string) => void;
}) {
  const attachmentsQuery = useQuery({
    queryKey,
    queryFn: () => listTaskAttachments(taskId),
  });

  const addMutation = useMutation({
    mutationFn: (path: string) => addTaskAttachment(taskId, path),
    onSuccess: (attachment) => {
      onChanged();
      onSuccess("Attachment added", attachment.originalName);
    },
    onError: (error) => onError("Attachment failed", toMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTaskAttachment,
    onSuccess: () => {
      onChanged();
      onSuccess("Attachment deleted");
    },
    onError: (error) => onError("Delete failed", toMessage(error)),
  });

  const openMutation = useMutation({
    mutationFn: openTaskAttachment,
    onError: (error) => onError("Open failed", toMessage(error)),
  });

  async function pickAttachment() {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: "Images and PDFs",
          extensions: ["png", "jpg", "jpeg", "webp", "gif", "pdf"],
        },
      ],
    });
    if (typeof selected === "string") {
      addMutation.mutate(selected);
    }
  }

  const attachments = attachmentsQuery.data ?? [];

  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/45 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Paperclip className="h-4 w-4 text-cyan-200" />
            Attachments
            {attachments.length > 0 ? (
              <span className="rounded-md bg-white/6 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-400">
                {attachments.length}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-slate-500">Images and PDFs are copied into local WorkTrace storage.</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void pickAttachment()}
          disabled={addMutation.isPending || attachments.length >= 20}
          className="shrink-0"
        >
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>

      {attachmentsQuery.isLoading ? (
        <div className="space-y-2">
          <div className="h-14 animate-pulse rounded-xl bg-white/[0.04]" />
          <div className="h-14 animate-pulse rounded-xl bg-white/[0.03]" />
        </div>
      ) : attachmentsQuery.isError ? (
        <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {toMessage(attachmentsQuery.error)}
        </p>
      ) : attachments.length === 0 ? (
        <p className="rounded-xl bg-white/[0.03] px-3 py-3 text-sm text-slate-500">
          No task evidence attached yet.
        </p>
      ) : (
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <AttachmentRow
              key={attachment.id}
              attachment={attachment}
              onOpen={() => openMutation.mutate(attachment.id)}
              onDelete={() => deleteMutation.mutate(attachment.id)}
              isDeleting={deleteMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AttachmentRow({
  attachment,
  onOpen,
  onDelete,
  isDeleting,
}: {
  attachment: TaskAttachment;
  onOpen: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const isImage = attachment.mimeType.startsWith("image/");
  const previewQuery = useQuery({
    queryKey: ["taskAttachmentPreview", attachment.id],
    queryFn: () => getTaskAttachmentPreview(attachment.id),
    enabled: isImage,
  });

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-2.5">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-900/80 outline outline-1 outline-white/10">
        {previewQuery.data?.dataUrl ? (
          <img src={previewQuery.data.dataUrl} alt="" className="h-full w-full object-cover" />
        ) : isImage ? (
          <FileImage className="h-5 w-5 text-cyan-200" />
        ) : (
          <FileText className="h-5 w-5 text-blue-200" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-200">{attachment.originalName}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {attachment.extension.toUpperCase()} / {formatBytes(attachment.sizeBytes)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onOpen}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-[background-color,color,transform] hover:bg-white/8 hover:text-slate-100 active:scale-[0.96]"
          aria-label={`Open ${attachment.originalName}`}
          title="Open attachment"
        >
          <Download className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-[background-color,color,transform] hover:bg-rose-500/10 hover:text-rose-200 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={`Delete ${attachment.originalName}`}
          title="Delete attachment"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function DetailItem({
  icon: Icon,
  label,
  value,
}: {
  icon?: ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
      <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {label}
      </div>
      <p className="text-sm capitalize text-slate-200">{value}</p>
    </div>
  );
}

function formatOptionalDate(value?: string | null) {
  return value ? formatDate(value) : "Not set";
}

function formatDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatMinutes(value?: number | null) {
  if (!value) return "Not set";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (!hours) return `${minutes}m`;
  if (!minutes) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
