import { CalendarDays, ClipboardEdit, Clock3, FileText, FolderKanban } from "lucide-react";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import type { ManualLog } from "../../types/manualLog";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { CloseButton } from "./CloseButton";
import { Panel } from "./Panel";

export function ManualLogDetailModal({
  log,
  isOpen,
  onClose,
}: {
  log: ManualLog | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  useEscapeKey(onClose, isOpen);

  if (!isOpen || !log) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm">
      <Panel className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto p-0 shadow-[0_28px_90px_rgba(2,6,23,0.5)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone="purple">{log.activityType}</Badge>
              {log.includedInReport ? <Badge tone="green">In report</Badge> : <Badge tone="slate">Not in report</Badge>}
            </div>
            <h2 className="text-lg font-semibold leading-7 text-white [text-wrap:balance]">{log.summary}</h2>
            <p className="mt-1 text-xs text-slate-500">{log.projectId ? "Project activity" : "General activity"}</p>
          </div>
          <CloseButton label="Close activity details" onClick={onClose} />
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-2xl border border-white/8 bg-slate-950/45 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300">
              <FileText className="h-4 w-4 text-blue-200" />
              Outcome
            </div>
            {log.outcome ? (
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-300 [text-wrap:pretty]">{log.outcome}</p>
            ) : (
              <p className="text-sm text-slate-500">No outcome captured.</p>
            )}
          </div>

          {log.followUp ? (
            <div className="rounded-2xl border border-white/8 bg-slate-950/45 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300">
                <ClipboardEdit className="h-4 w-4 text-purple-200" />
                Follow-up
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-300 [text-wrap:pretty]">{log.followUp}</p>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <DetailItem icon={FolderKanban} label="Scope" value={log.projectId ? "Project" : "General"} />
            <DetailItem icon={ClipboardEdit} label="Type" value={log.activityType} />
            <DetailItem icon={CalendarDays} label="Date" value={formatTimestamp(log.date)} />
            <DetailItem icon={Clock3} label="Duration" value={formatMinutes(log.durationMinutes)} />
          </div>

          <div className="flex justify-end border-t border-white/8 pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
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
  icon: typeof ClipboardEdit;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
      <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="text-sm capitalize text-slate-200">{value}</p>
    </div>
  );
}

function formatTimestamp(value: string) {
  const date = value.length <= 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: value.length <= 10 ? undefined : "numeric",
    minute: value.length <= 10 ? undefined : "2-digit",
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
