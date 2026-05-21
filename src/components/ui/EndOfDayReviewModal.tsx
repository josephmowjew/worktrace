import { AlertTriangle, CheckCircle2, ClipboardEdit, FileText, GitCommit, ListChecks, RefreshCw, X } from "lucide-react";
import { useEffect } from "react";
import type { ActivityItem } from "../../types/activity";
import type { WeeklyTask } from "../../types/weeklyTask";
import { Button } from "./Button";
import { Panel } from "./Panel";

export function EndOfDayReviewModal({
  isOpen,
  onClose,
  dateLabel,
  activityItems,
  openTasks,
  blockers,
  isSyncing,
  isUpdating,
  onSync,
  onQuickLog,
  onGenerateReport,
  onCompleteTask,
  onCarryTask,
  onIncludeTask,
}: {
  isOpen: boolean;
  onClose: () => void;
  dateLabel: string;
  activityItems: ActivityItem[];
  openTasks: WeeklyTask[];
  blockers: WeeklyTask[];
  isSyncing: boolean;
  isUpdating: boolean;
  onSync: () => void;
  onQuickLog: () => void;
  onGenerateReport: () => void;
  onCompleteTask: (task: WeeklyTask) => void;
  onCarryTask: (task: WeeklyTask) => void;
  onIncludeTask: (task: WeeklyTask) => void;
}) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const commits = activityItems.filter((item) => item.activityType === "commit");
  const manualItems = activityItems.filter((item) => item.activityType !== "commit");
  const reportReadyTasks = openTasks.filter((task) => task.includedInReport).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <Panel className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden p-0">
        <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
              <ListChecks className="h-3.5 w-3.5" />
              Guided review
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-white">End-of-Day Review</h2>
            <p className="mt-1 text-xs text-slate-400">{dateLabel}</p>
          </div>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 px-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <ReviewStat icon={GitCommit} label="Commits" value={commits.length.toString()} />
            <ReviewStat icon={ClipboardEdit} label="Manual Logs" value={manualItems.length.toString()} />
            <ReviewStat icon={AlertTriangle} label="Blockers" value={blockers.length.toString()} />
            <ReviewStat icon={FileText} label="Report Tasks" value={reportReadyTasks.toString()} />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <section className="space-y-4">
              <ReviewStep
                icon={RefreshCw}
                title="Sync repositories"
                description="Pull today’s local Git activity into WorkTrace before reviewing."
                done={commits.length > 0}
              >
                <Button variant="primary" onClick={onSync} disabled={isSyncing}>
                  <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
                  {isSyncing ? "Syncing..." : "Sync Now"}
                </Button>
              </ReviewStep>

              <ReviewStep
                icon={ClipboardEdit}
                title="Add missing non-code work"
                description="Capture meetings, support, planning, research, and handoffs that Git cannot see."
                done={manualItems.length > 0}
              >
                <Button onClick={onQuickLog}>
                  <ClipboardEdit className="h-4 w-4" />
                  Quick Log
                </Button>
              </ReviewStep>

              <ReviewStep
                icon={FileText}
                title="Generate weekly report"
                description="Once today is tidy, jump to Reports and produce the weekly summary."
                done={activityItems.length > 0 || reportReadyTasks > 0}
              >
                <Button onClick={onGenerateReport}>
                  <FileText className="h-4 w-4" />
                  Reports
                </Button>
              </ReviewStep>
            </section>

            <section className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Confirm task updates</h3>
                    <p className="mt-1 text-xs text-slate-500">Nothing changes until you click an action.</p>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                </div>
                <div className="space-y-2">
                  {openTasks.length > 0 ? (
                    openTasks.slice(0, 8).map((task) => (
                      <TaskReviewRow
                        key={task.id}
                        task={task}
                        disabled={isUpdating}
                        onComplete={() => onCompleteTask(task)}
                        onCarry={() => onCarryTask(task)}
                        onInclude={() => onIncludeTask(task)}
                      />
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-xs leading-5 text-slate-400">
                      No open tasks need confirmation today.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                <h3 className="mb-3 text-sm font-semibold text-white">Today’s activity</h3>
                <div className="space-y-2">
                  {activityItems.length > 0 ? (
                    activityItems.slice(0, 6).map((item) => (
                      <div key={item.id} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                        <p className="truncate text-sm font-semibold text-slate-100">{item.summary}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.projectName ?? "General"} · {item.activityType}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-xs leading-5 text-slate-400">
                      No activity has been captured for today yet.
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function ReviewStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
      <Icon className="h-4 w-4 text-cyan-200" />
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function ReviewStep({
  icon: Icon,
  title,
  description,
  done,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-blue-300/20 bg-blue-500/10 text-blue-200">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            <span className={done ? "text-emerald-300" : "text-slate-500"}>
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

function TaskReviewRow({
  task,
  disabled,
  onComplete,
  onCarry,
  onInclude,
}: {
  task: WeeklyTask;
  disabled: boolean;
  onComplete: () => void;
  onCarry: () => void;
  onInclude: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-100">{task.title}</p>
          <p className="mt-1 text-xs text-slate-500">
            {task.projectName ?? "General"} · {task.status.replace("_", " ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={onComplete} disabled={disabled} className="h-8 px-2 text-xs">
            Done
          </Button>
          <Button variant="ghost" onClick={onCarry} disabled={disabled} className="h-8 px-2 text-xs">
            Carry
          </Button>
          {!task.includedInReport ? (
            <Button variant="ghost" onClick={onInclude} disabled={disabled} className="h-8 px-2 text-xs">
              Report
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
