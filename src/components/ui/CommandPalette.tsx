import { Activity, BarChart3, BookOpen, ClipboardEdit, FileText, Focus, FolderKanban, Home, ListChecks, ListTodo, Mic, RefreshCw, Search, Settings, Square, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Project } from "../../types/project";

type PaletteGroup = "Navigation" | "Capture" | "Focus" | "Review" | "Reporting" | "Sync" | "Projects";

export type CommandPaletteAction = {
  id: string;
  label: string;
  description: string;
  group: PaletteGroup;
  icon: React.ElementType;
  onRun: () => void;
};

export function createBaseCommandActions({
  projects,
  navigate,
  onSync,
  onScanRepos,
  onToggleWidget,
}: {
  projects: Project[];
  navigate: (path: string, state?: unknown) => void;
  onSync: () => void;
  onScanRepos: () => void;
  onToggleWidget: () => void;
}): CommandPaletteAction[] {
  const navigation: CommandPaletteAction[] = [
    { id: "nav-today", label: "Go to Today", description: "Open daily workflow", group: "Navigation", icon: Home, onRun: () => navigate("/") },
    { id: "nav-dashboard", label: "Go to Dashboard", description: "Open analytics dashboard", group: "Navigation", icon: BarChart3, onRun: () => navigate("/dashboard") },
    { id: "nav-projects", label: "Go to Projects", description: "Manage tracked repositories", group: "Navigation", icon: FolderKanban, onRun: () => navigate("/projects") },
    { id: "nav-activity", label: "Go to Activity Timeline", description: "Review commits and manual logs", group: "Navigation", icon: Activity, onRun: () => navigate("/activity") },
    { id: "nav-weekly-plan", label: "Go to Weekly Plan", description: "Plan and update weekly tasks", group: "Navigation", icon: ListChecks, onRun: () => navigate("/weekly-plan") },
    { id: "nav-reports", label: "Go to Reports", description: "Generate or load weekly reports", group: "Reporting", icon: FileText, onRun: () => navigate("/reports") },
    { id: "nav-guide", label: "Go to Guide", description: "Learn the best WorkTrace workflow", group: "Navigation", icon: BookOpen, onRun: () => navigate("/guide") },
    { id: "nav-settings", label: "Go to Settings", description: "Update reporting defaults", group: "Navigation", icon: Settings, onRun: () => navigate("/settings") },
  ];

  const workflow: CommandPaletteAction[] = [
    { id: "capture-task", label: "Add task", description: "Open the Today task form", group: "Capture", icon: ListChecks, onRun: () => navigate("/", { openTask: true }) },
    { id: "capture-log", label: "Create manual log", description: "Open today's quick manual log", group: "Capture", icon: ClipboardEdit, onRun: () => navigate("/", { openManualLog: true }) },
    { id: "focus-start", label: "Start focus session", description: "Jump to the Today focus panel", group: "Focus", icon: Focus, onRun: () => navigate("/", { openFocus: true }) },
    { id: "review-today", label: "What did I do today?", description: "Open the guided daily review", group: "Review", icon: ListTodo, onRun: () => navigate("/", { openReview: true }) },
    { id: "report-prep", label: "Prepare weekly report", description: "Open the report readiness checklist", group: "Reporting", icon: FileText, onRun: () => navigate("/", { openReportPrep: true }) },
    { id: "sync-now", label: "Sync repositories", description: "Sync active tracked repositories", group: "Sync", icon: RefreshCw, onRun: onSync },
    { id: "scan-repos", label: "Scan repos", description: "Sync tracked repos, then review workspace discovery", group: "Sync", icon: FolderKanban, onRun: onScanRepos },
    { id: "widget", label: "Toggle todo widget", description: "Show or hide the floating widget", group: "Capture", icon: ListTodo, onRun: onToggleWidget },
  ];

  const projectActions = projects
    .filter((project) => project.status === "active")
    .slice(0, 12)
    .map((project) => ({
    id: `project-${project.id}`,
    label: project.name,
    description: `Jump to ${project.projectType ?? "project"} project`,
    group: "Projects" as const,
    icon: FolderKanban,
    onRun: () => navigate(`/projects/${project.id}`),
  }));

  return [...workflow, ...navigation, ...projectActions];
}

export function CommandPalette({
  isOpen,
  onClose,
  actions,
  onPowerCommand,
  onVoiceCommand,
  voiceStatus = "idle",
  voiceError,
}: {
  isOpen: boolean;
  onClose: () => void;
  actions: CommandPaletteAction[];
  onPowerCommand?: (query: string) => boolean;
  onVoiceCommand?: () => void;
  voiceStatus?: "idle" | "listening" | "transcribing" | "error";
  voiceError?: string | null;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return actions;
    return actions.filter((action) =>
      `${action.label} ${action.description} ${action.group}`.toLowerCase().includes(normalized),
    );
  }, [actions, query]);

  const grouped = groupActions(filtered);
  const canRunPowerCommand = Boolean(onPowerCommand && parsePowerCommand(query));

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-black/65 p-4 backdrop-blur-sm">
      <div className="mx-auto mt-[8vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl shadow-black/50">
        <div className="flex items-center gap-3 border-b border-white/8 px-4 py-3">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search commands, pages, projects..."
            className="h-10 min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              const command = query.trim();
              if (!command || !onPowerCommand) return;
              const handled = onPowerCommand(command);
              if (handled) {
                onClose();
              }
            }}
          />
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {onVoiceCommand ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-200">
                {voiceStatus === "listening"
                  ? "Listening..."
                  : voiceStatus === "transcribing"
                    ? "Transcribing locally..."
                    : "Push-to-talk voice command"}
              </p>
              <p className="mt-1 truncate text-[11px] text-slate-500">
                {voiceError || "Try: add task finish release notes, sync repositories, or start focus on API cleanup."}
              </p>
            </div>
            <button
              type="button"
              disabled={voiceStatus === "transcribing"}
              onClick={onVoiceCommand}
              className={[
                "inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition disabled:opacity-60",
                voiceStatus === "listening"
                  ? "border-red-300/30 bg-red-500/15 text-red-100 hover:bg-red-500/25"
                  : "border-cyan-300/25 bg-cyan-500/12 text-cyan-100 hover:bg-cyan-500/20",
              ].join(" ")}
            >
              {voiceStatus === "listening" ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              {voiceStatus === "listening" ? "Stop" : "Speak"}
            </button>
          </div>
        ) : null}

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {canRunPowerCommand ? (
            <button
              type="button"
              onClick={() => {
                if (onPowerCommand?.(query.trim())) {
                  onClose();
                }
              }}
              className="mb-2 flex w-full items-center gap-3 rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-2.5 text-left text-emerald-100 transition hover:bg-emerald-500/15"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-500/10">
                <ListTodo className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">Run command</span>
                <span className="block truncate text-xs text-emerald-100/70">{query.trim()}</span>
              </span>
            </button>
          ) : null}
          {grouped.length > 0 ? (
            grouped.map(([group, items]) => (
              <div key={group} className="mb-2 last:mb-0">
                <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {group}
                </p>
                <div className="grid gap-1">
                  {items.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => {
                        action.onRun();
                        onClose();
                      }}
                      className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-blue-500/12"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-400 group-hover:border-blue-300/25 group-hover:text-blue-200">
                        <action.icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-100">{action.label}</span>
                        <span className="block truncate text-xs text-slate-500">{action.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center text-sm text-slate-400">
              No commands match that search.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function parsePowerCommand(query: string) {
  const normalized = query.trim().toLowerCase();
  return (
    normalized === "sync" ||
    normalized === "report" ||
    normalized.startsWith("task:") ||
    normalized.startsWith("log:") ||
    normalized.startsWith("focus:")
  );
}

function groupActions(actions: CommandPaletteAction[]) {
  const groups: PaletteGroup[] = ["Capture", "Focus", "Review", "Reporting", "Sync", "Projects", "Navigation"];
  return groups
    .map((group) => [group, actions.filter((action) => action.group === group)] as const)
    .filter(([, items]) => items.length > 0);
}
