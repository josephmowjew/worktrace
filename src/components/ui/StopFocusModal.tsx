import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import type { FocusSession, StopFocusSessionInput } from "../../types/focusSession";
import { Button } from "./Button";
import { ModalShell } from "./ModalShell";

export function StopFocusModal({
  isOpen,
  session,
  isPending,
  error,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  session?: FocusSession | null;
  isPending: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (input: StopFocusSessionInput) => void;
}) {
  const [notes, setNotes] = useState("");
  const [createManualLog, setCreateManualLog] = useState(true);
  const [manualLogSummary, setManualLogSummary] = useState("");
  const [completeTask, setCompleteTask] = useState(false);
  const [progressPercent, setProgressPercent] = useState(75);

  useEffect(() => {
    if (!isOpen || !session) return;
    setNotes("");
    setCreateManualLog(true);
    setManualLogSummary(`Focus session: ${session.title}`);
    setCompleteTask(false);
    setProgressPercent(75);
  }, [isOpen, session]);

  useEscapeKey(onClose, isOpen);

  if (!isOpen || !session) return null;

  return (
    <ModalShell title="Stop Focus Session" description={session.title} onClose={onClose}>
        <form
          className="space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({
              notes: notes.trim() || null,
              createManualLog,
              manualLogSummary: manualLogSummary.trim() || session.title,
              completeTask,
              progressPercent: completeTask ? 100 : progressPercent,
            });
          }}
        >
          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.currentTarget.value)}
              className={`${inputClass} min-h-20 resize-y py-3`}
              placeholder="What changed during this focus block?"
            />
          </Field>

          <label className="flex items-center gap-3 rounded-xl border border-[var(--wt-border)] bg-[var(--wt-surface-muted)] px-3 py-2 text-sm text-[var(--wt-text)]">
            <input
              type="checkbox"
              className="h-4 w-4 accent-blue-500"
              checked={createManualLog}
              onChange={(event) => setCreateManualLog(event.currentTarget.checked)}
            />
            Create manual log
          </label>

          {createManualLog ? (
            <Field label="Manual Log Summary">
              <input
                value={manualLogSummary}
                onChange={(event) => setManualLogSummary(event.currentTarget.value)}
                className={inputClass}
              />
            </Field>
          ) : null}

          {session.taskId ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-3 rounded-xl border border-[var(--wt-border)] bg-[var(--wt-surface-muted)] px-3 py-2 text-sm text-[var(--wt-text)]">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-blue-500"
                  checked={completeTask}
                  onChange={(event) => setCompleteTask(event.currentTarget.checked)}
                />
                Mark task complete
              </label>
              <Field label="Progress">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={progressPercent}
                  onChange={(event) => setProgressPercent(Number(event.currentTarget.value))}
                  className={inputClass}
                  disabled={completeTask}
                />
              </Field>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-100">
              {error}
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isPending} className="flex-1">
              <Save className="h-4 w-4" />
              {isPending ? "Saving..." : "Stop Focus"}
            </Button>
          </div>
        </form>
    </ModalShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-xs font-semibold text-[var(--wt-text-muted)]">
      {label}
      {children}
    </label>
  );
}

const inputClass =
  "wt-input h-10 w-full rounded-xl px-3 text-sm transition-[border-color,box-shadow,background-color] disabled:opacity-60";
