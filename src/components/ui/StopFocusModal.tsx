import { Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { FocusSession, StopFocusSessionInput } from "../../types/focusSession";
import { Button } from "./Button";
import { Panel } from "./Panel";

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

  if (!isOpen || !session) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <Panel className="relative w-full max-w-lg overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">Stop Focus Session</h2>
            <p className="mt-0.5 text-xs text-slate-400">{session.title}</p>
          </div>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 px-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

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

          <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/45 px-3 py-2 text-sm text-slate-300">
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
              <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/45 px-3 py-2 text-sm text-slate-300">
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
            <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
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
      </Panel>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-xs font-semibold text-slate-300">
      {label}
      {children}
    </label>
  );
}

const inputClass =
  "h-10 w-full rounded-xl border border-white/10 bg-slate-950/75 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/15 disabled:opacity-60";
