import { Clock3, Focus, Play, Square, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FocusSession } from "../../types/focusSession";
import type { Project } from "../../types/project";
import { Button } from "./Button";
import { Panel } from "./Panel";
import { Select } from "./Select";

export function FocusSessionPanel({
  activeSession,
  projects,
  onStart,
  onStop,
  onCancel,
  isPending,
}: {
  activeSession?: FocusSession | null;
  projects: Project[];
  onStart: (input: { title: string; projectId?: string | null }) => void;
  onStop: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("none");
  const elapsed = useElapsedMinutes(activeSession?.startedAt);

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
          <input
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            placeholder="What are you focusing on?"
            className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-300/50 focus:ring-2 focus:ring-emerald-500/15"
          />
          <Select
            value={projectId}
            onChange={setProjectId}
            size="sm"
            options={[
              { value: "none", label: "General focus", icon: Focus },
              ...projects.map((project) => ({
                value: project.id,
                label: project.name,
                icon: Focus,
              })),
            ]}
          />
          <Button
            variant="primary"
            onClick={() => {
              onStart({
                title: title.trim() || "Focus session",
                projectId: projectId === "none" ? null : projectId,
              });
              setTitle("");
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

function useElapsedMinutes(startedAt?: string) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return useMemo(() => {
    if (!startedAt) return 0;
    const started = new Date(startedAt).getTime();
    if (Number.isNaN(started)) return 0;
    return Math.max(0, Math.floor((now - started) / 60_000));
  }, [now, startedAt]);
}

function formatElapsed(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
}
