import { Clock3, Focus, Play, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { FocusSession, FocusTarget, FocusTargetGroup } from "../../types/focusSession";
import { Button } from "./Button";
import { FocusTargetPicker } from "./FocusTargetPicker";
import { Panel } from "./Panel";

export function FocusSessionPanel({
  activeSession,
  groups,
  onStart,
  onStop,
  onCancel,
  isPending,
}: {
  activeSession?: FocusSession | null;
  groups: FocusTargetGroup[];
  onStart: (input: { title: string; projectId?: string | null; taskId?: string | null }) => void;
  onStop: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState<FocusTarget | null>(null);
  const elapsed = useElapsedSeconds(activeSession?.startedAt);

  useEffect(() => {
    if (!target) {
      setTitle("");
      return;
    }
    if (target.kind === "task" || target.kind === "log") {
      setTitle(target.title);
    } else {
      setTitle("");
    }
  }, [target]);

  return (
    <Panel className="border-emerald-300/15 bg-emerald-400/10">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Focus className="h-4 w-4 text-emerald-200" />
          <h2 className="text-sm font-semibold text-white">Focus Session</h2>
        </div>
        {activeSession ? (
          <span className="rounded-full border border-emerald-300/20 bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200">
            Active
          </span>
        ) : null}
      </div>

      {activeSession ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
            <p className="text-lg font-semibold text-white">{activeSession.title}</p>
            <p className="mt-1 text-xs text-slate-400">
              {activeSession.projectName ?? activeSession.taskTitle ?? "General focus"}
            </p>
            <div className="mt-4 flex items-center gap-2 text-3xl font-semibold text-emerald-100">
              <Clock3 className="h-6 w-6" />
              {formatElapsed(elapsed)}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={onStop} disabled={isPending}>
              <Square className="h-4 w-4" />
              Stop
            </Button>
            <Button variant="ghost" onClick={onCancel} disabled={isPending}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <FocusTargetPicker
            value={target}
            onChange={setTarget}
            groups={groups}
            placeholder="General focus or pick a target"
          />
          <input
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            placeholder="What are you focusing on?"
            className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-300/50 focus:ring-2 focus:ring-emerald-500/15"
          />
          <Button
            variant="primary"
            onClick={() => {
              onStart(resolveFocusTarget(target, title));
              setTitle("");
              setTarget(null);
            }}
            disabled={isPending}
            className="w-full"
          >
            <Play className="h-4 w-4" />
            Start Focus
          </Button>
        </div>
      )}
    </Panel>
  );
}

function resolveFocusTarget(
  target: FocusTarget | null,
  title: string,
): { title: string; projectId: string | null; taskId: string | null } {
  const trimmedTitle = title.trim() || "Focus session";
  if (!target || target.kind === "general") {
    return { title: trimmedTitle, projectId: null, taskId: null };
  }
  if (target.kind === "task") {
    return {
      title: title.trim() || target.title,
      projectId: target.projectId ?? null,
      taskId: target.id,
    };
  }
  if (target.kind === "log") {
    return {
      title: title.trim() || target.title,
      projectId: target.projectId ?? null,
      taskId: null,
    };
  }
  return { title: trimmedTitle, projectId: target.id, taskId: null };
}

function useElapsedSeconds(startedAt?: string) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  if (!startedAt) return 0;
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return 0;
  return Math.max(0, Math.floor((now - started) / 1_000));
}

function formatElapsed(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
}
