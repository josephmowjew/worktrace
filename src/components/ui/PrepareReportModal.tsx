import { AlertTriangle, CheckCircle2, FileText, ListChecks, RefreshCw } from "lucide-react";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import type { ActivityItem } from "../../types/activity";
import type { WeeklyTask } from "../../types/weeklyTask";
import { Button } from "./Button";
import { CloseButton } from "./CloseButton";
import { Panel } from "./Panel";

export function PrepareReportModal({
  isOpen,
  onClose,
  activityItems,
  tasks,
  blockers,
  isSyncing,
  isUpdating,
  onSync,
  onCarryTask,
  onIncludeTask,
  onOpenReports,
}: {
  isOpen: boolean;
  onClose: () => void;
  activityItems: ActivityItem[];
  tasks: WeeklyTask[];
  blockers: WeeklyTask[];
  isSyncing: boolean;
  isUpdating: boolean;
  onSync: () => void;
  onCarryTask: (task: WeeklyTask) => void;
  onIncludeTask: (task: WeeklyTask) => void;
  onOpenReports: () => void;
}) {
  useEscapeKey(onClose, isOpen);

  if (!isOpen) return null;

  const openTasks = tasks.filter((task) => task.status !== "completed" && task.status !== "dropped");
  const reportReadyTasks = tasks.filter((task) => task.includedInReport);
  const reportReadyActivity = activityItems.filter((item) => item.includedInReport);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <Panel className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden p-0">
        <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-300/15 bg-blue-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-200">
              <FileText className="h-3.5 w-3.5" />
              Prepare weekly report
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-white">Friday Report Flow</h2>
            <p className="mt-1 text-xs text-slate-400">Review, tidy, and then open Reports.</p>
          </div>
          <CloseButton label="Close Friday Report Flow" onClick={onClose} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <FlowStat label="Activity" value={reportReadyActivity.length.toString()} done={activityItems.length > 0} />
            <FlowStat label="Report Tasks" value={reportReadyTasks.length.toString()} done={reportReadyTasks.length > 0} />
            <FlowStat label="Open Tasks" value={openTasks.length.toString()} done={openTasks.length === 0} />
            <FlowStat label="Blockers" value={blockers.length.toString()} done={blockers.length === 0} />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
            <section className="space-y-4">
              <FlowStep
                icon={RefreshCw}
                title="Sync repositories"
                description="Refresh local Git activity before generating the report."
                done={activityItems.length > 0}
              >
                <Button variant="primary" onClick={onSync} disabled={isSyncing}>
                  <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
                  {isSyncing ? "Syncing..." : "Sync Now"}
                </Button>
              </FlowStep>

              <FlowStep
                icon={AlertTriangle}
                title="Review blockers"
                description="Confirm unresolved blockers are still valid and report-worthy."
                done={blockers.length === 0}
              >
                <p className="text-xs text-slate-400">{blockers.length} blocker{blockers.length === 1 ? "" : "s"} open.</p>
              </FlowStep>

              <FlowStep
                icon={FileText}
                title="Open Reports"
                description="Go to the report builder when the checklist looks right."
                done={reportReadyActivity.length + reportReadyTasks.length > 0}
              >
                <Button onClick={onOpenReports}>
                  <FileText className="h-4 w-4" />
                  Open Reports
                </Button>
              </FlowStep>
            </section>

            <section className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">Task cleanup</h3>
                  <p className="mt-1 text-xs text-slate-500">Every change requires a click.</p>
                </div>
                <ListChecks className="h-4 w-4 text-blue-200" />
              </div>
              <div className="space-y-2">
                {openTasks.length > 0 ? (
                  openTasks.slice(0, 10).map((task) => (
                    <div key={task.id} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-100">{task.title}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {task.projectName ?? "General"} / {task.status.replace("_", " ")}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" onClick={() => onCarryTask(task)} disabled={isUpdating} className="h-8 px-2 text-xs">
                            Carry
                          </Button>
                          {!task.includedInReport ? (
                            <Button variant="ghost" onClick={() => onIncludeTask(task)} disabled={isUpdating} className="h-8 px-2 text-xs">
                              Report
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-xs leading-5 text-slate-400">
                    No open tasks need cleanup.
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function FlowStat({ label, value, done }: { label: string; value: string; done: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
      <CheckCircle2 className={`h-4 w-4 ${done ? "text-emerald-300" : "text-slate-600"}`} />
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function FlowStep({
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
            <CheckCircle2 className={`h-4 w-4 ${done ? "text-emerald-300" : "text-slate-600"}`} />
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
