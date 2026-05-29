import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Edit3,
  FileText,
  Flag,
  FolderKanban,
  ListTodo,
  Target,
} from "lucide-react";
import type { ElementType } from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import type { WeeklyTask } from "../../types/weeklyTask";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { CloseButton } from "./CloseButton";
import { Panel } from "./Panel";

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

  if (!isOpen || !task) return null;

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
