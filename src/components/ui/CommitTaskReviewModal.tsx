import { CheckCircle2, GitCommit, ListTodo, Sparkles, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import type { CommitTaskDraftResponse } from "../../types/commitTask";
import type { CreateWeeklyTaskInput, WeeklyTaskPriority, WeeklyTaskStatus, WeeklyTaskType } from "../../types/weeklyTask";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { ModalShell } from "./ModalShell";

const inputClass =
  "wt-input h-10 w-full rounded-xl px-3 text-sm transition-[border-color,box-shadow,background-color]";
const textareaClass =
  "wt-input min-h-28 w-full resize-none rounded-xl px-3 py-2 text-sm leading-5 transition-[border-color,box-shadow,background-color]";

export function CommitTaskReviewModal({
  response,
  isSaving,
  error,
  onClose,
  onConfirm,
  onViewExisting,
}: {
  response: CommitTaskDraftResponse;
  isSaving: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (draft: CreateWeeklyTaskInput) => void;
  onViewExisting?: () => void;
}) {
  const [draft, setDraft] = useState<CreateWeeklyTaskInput>(response.draft);
  const existingTask = response.existingTask ?? null;
  const titleValid = draft.title.trim().length > 0;

  useEffect(() => {
    setDraft(response.draft);
  }, [response]);

  useEscapeKey(onClose, true);

  function update(next: Partial<CreateWeeklyTaskInput>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  return (
    <ModalShell
      title={existingTask ? "Task already exists" : "Create task from commit"}
      description={existingTask ? "This commit is already linked to a WorkTrace task." : "Review the smart draft before adding it to your week."}
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-4 p-5">
        <div className="rounded-xl border border-cyan-300/12 bg-cyan-400/[0.04] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <GitCommit className="h-4 w-4 text-cyan-200" />
            <Badge tone={response.confidenceLabel === "strong" ? "green" : response.confidenceLabel === "needs_review" ? "orange" : "blue"}>
              {response.confidenceLabel.replace("_", " ")}
            </Badge>
            <span className="text-xs font-semibold text-slate-300">{Math.round(response.confidence * 100)}% confidence</span>
            <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-cyan-200">
              {response.evidence.commitHash.slice(0, 8)}
            </code>
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-100">{response.evidence.subject}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
            {response.evidence.projectName ? <span>{response.evidence.projectName}</span> : null}
            {response.evidence.branch ? <span>{response.evidence.branch}</span> : null}
            {response.evidence.modules.map((module) => (
              <span key={module} className="rounded-md border border-white/8 bg-white/[0.03] px-2 py-0.5">{module}</span>
            ))}
          </div>
          {response.rationale.length ? (
            <p className="mt-2 text-xs leading-5 text-slate-500">{response.rationale.slice(0, 3).join(" / ")}</p>
          ) : null}
          {response.groupContext ? (
            <div className="mt-3 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-100/80">Smart group</p>
              <p className="mt-1 text-sm font-semibold text-slate-100">{response.groupContext.title}</p>
              {response.groupContext.reportSummary || response.groupContext.summary ? (
                <p className="mt-1 text-xs leading-5 text-slate-400">{response.groupContext.reportSummary ?? response.groupContext.summary}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {existingTask ? (
          <div className="rounded-xl border border-emerald-300/15 bg-emerald-500/10 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-200" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-emerald-50">{existingTask.title}</p>
                <p className="mt-1 text-xs text-emerald-100/70">
                  {existingTask.status.replace("_", " ")} / {existingTask.taskType.replace("_", " ")}
                </p>
              </div>
              {onViewExisting ? (
                <Button type="button" variant="secondary" onClick={onViewExisting}>
                  View task
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (titleValid && !isSaving) {
                onConfirm(draft);
              }
            }}
          >
            <Field label="Title" error={titleValid ? undefined : "Title is required"}>
              <input className={inputClass} value={draft.title} onChange={(event) => update({ title: event.currentTarget.value })} />
            </Field>

            {response.titleCandidates.length ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <Sparkles className="h-3.5 w-3.5 text-cyan-200" />
                  Candidate titles
                </div>
                <div className="flex flex-wrap gap-2">
                  {response.titleCandidates.map((candidate) => {
                    const selected = draft.title.trim() === candidate.title.trim();
                    return (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => update({ title: candidate.title })}
                        className={`rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                          selected
                            ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-50"
                            : "border-white/8 bg-white/[0.03] text-slate-300 hover:border-white/16 hover:bg-white/[0.06]"
                        }`}
                        title={`${candidate.strategy.replace("_", " ")} / ${Math.round(candidate.score * 100)}%`}
                      >
                        <span className="font-semibold">{candidate.title}</span>
                        <span className="ml-2 text-[10px] text-slate-500">{candidate.strategy.replace("_", " ")}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Type">
                <select className={inputClass} value={draft.taskType} onChange={(event) => update({ taskType: event.currentTarget.value as WeeklyTaskType })}>
                  <option value="planned_work">Planned work</option>
                  <option value="follow_up">Follow-up</option>
                  <option value="completed_checklist">Completed checklist</option>
                  <option value="blocker">Blocker</option>
                  <option value="carryover">Carryover</option>
                </select>
              </Field>
              <Field label="Status">
                <select className={inputClass} value={draft.status ?? "todo"} onChange={(event) => update({ status: event.currentTarget.value as WeeklyTaskStatus })}>
                  <option value="todo">Todo</option>
                  <option value="in_progress">In progress</option>
                  <option value="blocked">Blocked</option>
                  <option value="completed">Completed</option>
                  <option value="dropped">Dropped</option>
                </select>
              </Field>
              <Field label="Priority">
                <select className={inputClass} value={draft.priority ?? "normal"} onChange={(event) => update({ priority: event.currentTarget.value as WeeklyTaskPriority })}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </Field>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Week start">
                <input className={inputClass} type="date" value={draft.weekStartDate} onChange={(event) => update({ weekStartDate: event.currentTarget.value })} />
              </Field>
              <Field label="Target date">
                <input className={inputClass} type="date" value={draft.targetDate ?? ""} onChange={(event) => update({ targetDate: event.currentTarget.value || null })} />
              </Field>
              <Field label="Completed date">
                <input className={inputClass} type="date" value={draft.completedAt ?? ""} onChange={(event) => update({ completedAt: event.currentTarget.value || null })} />
              </Field>
            </div>

            <Field label="Details">
              <textarea className={textareaClass} value={draft.details ?? ""} onChange={(event) => update({ details: event.currentTarget.value })} />
            </Field>

            {response.descriptionSections.length || response.qualityWarnings.length ? (
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                {response.descriptionSections.length ? (
                  <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                    <p className="text-xs font-semibold text-slate-300">Structured draft</p>
                    <div className="mt-2 space-y-2">
                      {response.descriptionSections.map((section) => (
                        <div key={section.label}>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{section.label}</p>
                          <p className="mt-0.5 text-xs leading-5 text-slate-300">{section.body}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {response.qualityWarnings.length ? (
                  <div className="rounded-xl border border-amber-300/20 bg-amber-400/10 p-3">
                    <p className="text-xs font-semibold text-amber-100">Review notes</p>
                    <ul className="mt-2 space-y-1.5 text-xs leading-5 text-amber-100/80">
                      {response.qualityWarnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_150px_150px]">
              <label className="flex min-h-10 items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 text-sm text-slate-200">
                <input type="checkbox" checked={draft.includedInReport ?? false} onChange={(event) => update({ includedInReport: event.currentTarget.checked })} />
                Include in report
              </label>
              <Field label="Progress %">
                <input className={inputClass} type="number" min={0} max={100} value={draft.progressPercent ?? ""} onChange={(event) => update({ progressPercent: event.currentTarget.value ? Number(event.currentTarget.value) : null })} />
              </Field>
              <Field label="Estimate min">
                <input className={inputClass} type="number" min={0} value={draft.estimatedMinutes ?? ""} onChange={(event) => update({ estimatedMinutes: event.currentTarget.value ? Number(event.currentTarget.value) : null })} />
              </Field>
            </div>

            {error ? (
              <div className="flex items-center gap-2 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
                <XCircle className="h-4 w-4" />
                {error}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={!titleValid || isSaving}>
                <ListTodo className="h-4 w-4" />
                {isSaving ? "Creating..." : "Create task"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </ModalShell>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-slate-300">
      <span className="mb-1.5 flex items-center justify-between">
        {label}
        {error ? <span className="font-medium text-red-300">{error}</span> : null}
      </span>
      {children}
    </label>
  );
}
