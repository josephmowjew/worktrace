import {
  AlertTriangle,
  CheckCircle2,
  ClipboardEdit,
  FileText,
  GitCommit,
  ListChecks,
  RefreshCw,
  Timer,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import type { ActivityItem } from "../../types/activity";
import type { FocusSession } from "../../types/focusSession";
import type { ReportNote } from "../../types/report";
import type { WeeklyTask } from "../../types/weeklyTask";
import { Button } from "./Button";
import { Panel } from "./Panel";

type ReviewFields = {
  finished: string;
  blocked: string;
  carryIntoTomorrow: string;
};

export function EndOfDayReviewModal({
  isOpen,
  onClose,
  dateLabel,
  activityItems,
  focusSessions,
  openTasks,
  blockers,
  existingNote,
  noteLoadWarning,
  isSyncing,
  isUpdating,
  isSaving,
  onSync,
  onQuickLog,
  onGenerateReport,
  onCompleteTask,
  onCarryTask,
  onIncludeTask,
  onSaveReview,
}: {
  isOpen: boolean;
  onClose: () => void;
  dateLabel: string;
  activityItems: ActivityItem[];
  focusSessions: FocusSession[];
  openTasks: WeeklyTask[];
  blockers: WeeklyTask[];
  existingNote: ReportNote | null;
  noteLoadWarning: string | null;
  isSyncing: boolean;
  isUpdating: boolean;
  isSaving: boolean;
  onSync: () => void;
  onQuickLog: () => void;
  onGenerateReport: () => void;
  onCompleteTask: (task: WeeklyTask) => void;
  onCarryTask: (task: WeeklyTask) => void;
  onIncludeTask: (task: WeeklyTask) => void;
  onSaveReview: (input: ReviewFields) => void;
}) {
  const draftFields = useMemo(
    () => buildReviewDraft(activityItems, focusSessions, openTasks, blockers),
    [activityItems, blockers, focusSessions, openTasks],
  );
  const [fields, setFields] = useState<ReviewFields>(draftFields);

  useEscapeKey(onClose, isOpen);

  useEffect(() => {
    if (!isOpen) return;
    setFields(existingNote ? parseDailyReviewNote(existingNote.content) : draftFields);
  }, [draftFields, existingNote, isOpen]);

  if (!isOpen) return null;

  const commits = activityItems.filter((item) => item.activityType === "commit");
  const manualItems = activityItems.filter((item) => item.activityType !== "commit");
  const completedTasks = openTasks.filter((task) => task.status === "completed");
  const carryCandidates = openTasks.filter((task) => task.status === "todo" || task.status === "in_progress" || task.status === "blocked");
  const reportReadyTasks = openTasks.filter((task) => task.includedInReport).length;
  const canSave = Object.values(fields).some((value) => value.trim().length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <Panel className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden p-0">
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
          <div className="grid gap-3 md:grid-cols-5">
            <ReviewStat icon={GitCommit} label="Commits" value={commits.length.toString()} />
            <ReviewStat icon={ClipboardEdit} label="Manual Logs" value={manualItems.length.toString()} />
            <ReviewStat icon={Timer} label="Focus" value={focusSessions.length.toString()} />
            <ReviewStat icon={AlertTriangle} label="Blockers" value={blockers.length.toString()} />
            <ReviewStat icon={FileText} label="Report Tasks" value={reportReadyTasks.toString()} />
          </div>

          {noteLoadWarning ? (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-orange-300/15 bg-orange-500/10 p-3 text-xs leading-5 text-orange-100/85">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-200" />
              <span>{noteLoadWarning}</span>
            </div>
          ) : null}

          <div className="mt-5 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <section className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-1">
                <ReviewStep
                  icon={RefreshCw}
                  title="Sync repositories"
                  description="Pull today's local Git activity into WorkTrace before reviewing."
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
                  description="Saved review notes will appear in the weekly report."
                  done={Boolean(existingNote)}
                >
                  <Button onClick={onGenerateReport}>
                    <FileText className="h-4 w-4" />
                    Reports
                  </Button>
                </ReviewStep>
              </div>

              <SourceSection title="Captured today">
                <SourceList
                  empty="No activity has been captured for today yet."
                  items={[
                    ...commits.map((item) => sourceLine(item.summary, item.projectName, "commit")),
                    ...manualItems.map((item) => sourceLine(item.summary, item.projectName, item.activityType)),
                    ...focusSessions.map((session) =>
                      sourceLine(session.title, session.projectName, `${session.status} focus${session.durationMinutes ? ` / ${session.durationMinutes}m` : ""}`),
                    ),
                  ]}
                />
              </SourceSection>

              <SourceSection title="Confirm task updates">
                <div className="space-y-2">
                  {carryCandidates.length > 0 ? (
                    carryCandidates.slice(0, 8).map((task) => (
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
                    <EmptyState>No open tasks need confirmation today.</EmptyState>
                  )}
                </div>
              </SourceSection>
            </section>

            <section className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">Daily review note</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Edit the draft before saving it into weekly report notes.
                  </p>
                </div>
                {existingNote ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/15 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Saved
                  </span>
                ) : null}
              </div>

              <div className="space-y-3">
                <ReviewTextarea
                  label="What did I finish today?"
                  value={fields.finished}
                  onChange={(finished) => setFields((current) => ({ ...current, finished }))}
                />
                <ReviewTextarea
                  label="What is blocked?"
                  value={fields.blocked}
                  onChange={(blocked) => setFields((current) => ({ ...current, blocked }))}
                />
                <ReviewTextarea
                  label="What should carry into tomorrow?"
                  value={fields.carryIntoTomorrow}
                  onChange={(carryIntoTomorrow) => setFields((current) => ({ ...current, carryIntoTomorrow }))}
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  {completedTasks.length} completed task(s), {blockers.length} blocker(s), {carryCandidates.length} carry candidate(s).
                </p>
                <Button
                  variant="primary"
                  onClick={() => onSaveReview(fields)}
                  disabled={!canSave || isSaving}
                >
                  <FileText className="h-4 w-4" />
                  {isSaving ? "Saving..." : "Save Review"}
                </Button>
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

function SourceSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
      <h3 className="mb-3 text-sm font-semibold text-white">{title}</h3>
      {children}
    </div>
  );
}

function SourceList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) {
    return <EmptyState>{empty}</EmptyState>;
  }

  return (
    <div className="space-y-2">
      {items.slice(0, 10).map((item) => (
        <div key={item} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
          <p className="text-sm leading-5 text-slate-200">{item}</p>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-xs leading-5 text-slate-400">
      {children}
    </div>
  );
}

function ReviewTextarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-xs font-semibold text-slate-300">
      {label}
      <textarea
        className="min-h-28 w-full resize-y rounded-xl border border-white/10 bg-slate-950/75 px-3 py-2 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/15"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
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
            {task.projectName ?? "General"} / {task.status.replace("_", " ")}
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

function buildReviewDraft(
  activityItems: ActivityItem[],
  focusSessions: FocusSession[],
  openTasks: WeeklyTask[],
  blockers: WeeklyTask[],
): ReviewFields {
  const finished = [
    ...activityItems.map((item) => `- ${sourceLine(item.summary, item.projectName, item.activityType)}`),
    ...focusSessions
      .filter((session) => session.status === "completed")
      .map((session) => `- ${sourceLine(session.title, session.projectName, session.durationMinutes ? `${session.durationMinutes}m focus` : "focus")}`),
    ...openTasks
      .filter((task) => task.status === "completed")
      .map((task) => `- ${sourceLine(task.title, task.projectName, "task")}`),
  ].join("\n");

  const blocked = blockers
    .map((task) => `- ${sourceLine(task.title, task.projectName, task.details || "blocked")}`)
    .join("\n");

  const carryIntoTomorrow = openTasks
    .filter((task) => task.status === "todo" || task.status === "in_progress" || task.status === "blocked")
    .map((task) => `- ${sourceLine(task.title, task.projectName, task.status.replace("_", " "))}`)
    .join("\n");

  return { finished, blocked, carryIntoTomorrow };
}

function parseDailyReviewNote(content: string): ReviewFields {
  return {
    finished: extractSection(content, "Finished today"),
    blocked: extractSection(content, "Blocked"),
    carryIntoTomorrow: extractSection(content, "Carry into tomorrow"),
  };
}

function extractSection(content: string, heading: string) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`### ${escaped}\\n([\\s\\S]*?)(?=\\n\\n### |$)`, "i"));
  return match?.[1]?.trim() ?? "";
}

function sourceLine(summary: string, projectName?: string | null, detail?: string | null) {
  const suffix = [projectName || "General", detail].filter(Boolean).join(" / ");
  return suffix ? `${summary} (${suffix})` : summary;
}
