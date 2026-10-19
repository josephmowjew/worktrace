import { Activity, BarChart3, BookOpen, ClipboardEdit, DatabaseBackup, FileText, Focus, FolderKanban, Gauge, HelpCircle, Home, ListChecks, ListTodo, Mic, RefreshCw, Search, Settings, Square } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { CloseButton } from "./CloseButton";
import type { OptionalFeature } from "../../types/settings";
import type { Project } from "../../types/project";

type PaletteGroup = "Navigation" | "Capture" | "Focus" | "Review" | "Reporting" | "Sync" | "Repositories" | "Settings";

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
  isDeveloper = true,
  enabledFeatures = [],
}: {
  isDeveloper?: boolean;
  enabledFeatures?: OptionalFeature[];
  projects: Project[];
  navigate: (path: string, state?: unknown) => void;
  onSync: () => void;
  onScanRepos: () => void;
  onToggleWidget: () => void;
}): CommandPaletteAction[] {
  const navigation: CommandPaletteAction[] = [
    { id: "nav-tasks", label: "Go to Tasks", description: "All your tasks and completed work", group: "Navigation", icon: ListChecks, onRun: () => navigate("/tasks") },
    { id: "nav-today", label: "Go to Today", description: "Open daily workflow", group: "Navigation", icon: Home, onRun: () => navigate("/") },
    { id: "nav-weekly-plan", label: "Go to Weekly Plan", description: "Plan and update weekly tasks", group: "Navigation", icon: ListChecks, onRun: () => navigate("/weekly-plan") },
    { id: "nav-manual-log", label: "Go to Work journal", description: "Notes about work and progress", group: "Navigation", icon: ClipboardEdit, onRun: () => navigate("/manual-log") },
    { id: "nav-activity", label: "Go to Activity Timeline", description: "Review commits and manual logs", group: "Navigation", icon: Activity, onRun: () => navigate("/activity") },
    { id: "nav-reports", label: "Go to Reports", description: "Generate or load weekly reports", group: "Reporting", icon: FileText, onRun: () => navigate("/reports") },
    { id: "nav-projects", label: "Go to Repositories", description: "Manage tracked repositories", group: "Navigation", icon: FolderKanban, onRun: () => navigate("/projects") },
    { id: "nav-dashboard", label: "Go to Dashboard", description: "Open analytics dashboard", group: "Navigation", icon: BarChart3, onRun: () => navigate("/dashboard") },
    { id: "nav-friction", label: "Go to Friction", description: "Review patterns that may be slowing the week down", group: "Review", icon: Gauge, onRun: () => navigate("/friction") },
    { id: "nav-backup", label: "Go to Backup", description: "Manage backup settings", group: "Navigation", icon: DatabaseBackup, onRun: () => navigate("/backup") },
    { id: "nav-onboarding", label: "Open Onboarding", description: "Revisit setup steps anytime", group: "Navigation", icon: HelpCircle, onRun: () => navigate("/onboarding") },
    { id: "nav-guide", label: "Go to Help", description: "Find your way around WorkTrace", group: "Navigation", icon: BookOpen, onRun: () => navigate("/guide") },
    { id: "nav-settings", label: "Go to Settings", description: "Choose your experience and preferences", group: "Navigation", icon: Settings, onRun: () => navigate("/settings") },
  ];

  const workflow: CommandPaletteAction[] = [
    { id: "capture-task", label: "Add task", description: "Start with a title", group: "Capture", icon: ListChecks, onRun: () => navigate("/tasks", { openTask: true }) },
    { id: "capture-log", label: isDeveloper ? "Create manual log" : "Add journal note", description: "Capture work or progress", group: "Capture", icon: ClipboardEdit, onRun: () => isDeveloper ? navigate("/", { openManualLog: true }) : navigate("/manual-log") },
    { id: "focus-start", label: "Start focus session", description: "Jump to the Today focus panel", group: "Focus", icon: Focus, onRun: () => navigate("/", { openFocus: true }) },
    { id: "review-today", label: "What did I do today?", description: "Open the guided daily review", group: "Review", icon: ListTodo, onRun: () => navigate("/", { openReview: true }) },
    { id: "report-prep", label: "Prepare weekly report", description: isDeveloper ? "Open the report readiness checklist" : "Turn tasks and notes into an update", group: "Reporting", icon: FileText, onRun: () => isDeveloper ? navigate("/", { openReportPrep: true }) : navigate("/reports") },
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
    description: `Jump to ${project.projectType ?? "repository"} repository`,
    group: "Repositories" as const,
    icon: FolderKanban,
    onRun: () => navigate(`/projects/${project.id}`),
  }));

  const actions = [...workflow, ...navigation, ...projectActions];
  if (isDeveloper) return actions;
  const allowed = new Set(["nav-today", "nav-tasks", "nav-guide", "nav-settings", "capture-task", "widget"]);
  if (enabledFeatures.includes("focus")) allowed.add("focus-start");
  if (enabledFeatures.includes("journal")) { allowed.add("nav-manual-log"); allowed.add("capture-log"); }
  if (enabledFeatures.includes("reports")) { allowed.add("nav-reports"); allowed.add("report-prep"); }
  return actions.filter((action) => allowed.has(action.id));
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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement;
    setQuery("");
    setSelectedIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(timer);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [isOpen]);

  useEscapeKey(onClose, isOpen);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return actions;
    return actions.filter((action) =>
      `${action.label} ${action.description} ${action.group}`.toLowerCase().includes(normalized),
    );
  }, [actions, query]);

  const grouped = groupActions(filtered);
  const orderedActions = grouped.flatMap(([, items]) => items);
  const activeIndex = Math.min(selectedIndex, Math.max(0, orderedActions.length - 1));

  useEffect(() => {
    if (isOpen) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView?.({ block: "nearest" });
  }, [isOpen, activeIndex, listId]);
  const canRunPowerCommand = Boolean(onPowerCommand && parsePowerCommand(query));

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-[var(--wt-overlay)] p-4 ">
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="mx-auto mt-[8vh] w-full max-w-2xl overflow-hidden rounded-lg border border-[var(--wt-border)] bg-[var(--wt-surface)] shadow-[var(--wt-popover-shadow)]">
        <div className="flex items-center gap-3 border-b border-[var(--wt-border)] px-4 py-3">
          <Search className="h-4 w-4 text-[var(--wt-text-muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => { setQuery(event.currentTarget.value); setSelectedIndex(0); }}
            role="combobox"
            aria-label="Search commands"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls={listId}
            aria-activedescendant={orderedActions.length ? `${listId}-${activeIndex}` : undefined}
            placeholder="Search commands, pages, repositories..."
            className="h-10 min-w-0 flex-1 bg-transparent text-sm text-[var(--wt-text-strong)] outline-none placeholder:text-[var(--wt-text-faint)]"
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setSelectedIndex((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + orderedActions.length) % Math.max(1, orderedActions.length));
                return;
              }
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (canRunPowerCommand && onPowerCommand?.(query.trim())) { onClose(); return; }
              const action = orderedActions[activeIndex];
              if (action) { action.onRun(); onClose(); }

            }}
          />
          <CloseButton label="Close command palette" variant="subtle" onClick={onClose} />
        </div>
        {onVoiceCommand ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--wt-border)] px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--wt-text-strong)]">
                {voiceStatus === "listening"
                  ? "Listening..."
                  : voiceStatus === "transcribing"
                    ? "Transcribing locally..."
                    : "Push-to-talk voice command"}
              </p>
              <p className="mt-1 truncate text-[11px] text-[var(--wt-text-muted)]">
                {voiceError || "Try: add task finish release notes, sync repositories, or start focus on API cleanup."}
              </p>
            </div>
            <button
              type="button"
              disabled={voiceStatus === "transcribing"}
              onClick={onVoiceCommand}
              className={[
                "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition disabled:opacity-60",
                voiceStatus === "listening"
                  ? "border-red-500/25 bg-red-500/10 text-red-600 hover:bg-red-500/15 dark:text-red-100"
                  : "border-blue-500/25 bg-[var(--wt-accent-soft)] text-[var(--wt-accent-text)] hover:bg-[var(--wt-selected)]",
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
              className="mb-2 flex w-full items-center gap-3 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-left text-emerald-700 transition hover:bg-emerald-500/15 dark:text-emerald-100"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-emerald-500/20 bg-emerald-500/10">
                <ListTodo className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">Run command</span>
                <span className="block truncate text-xs text-emerald-700/70 dark:text-emerald-100/70">{query.trim()}</span>
              </span>
            </button>
          ) : null}
          <div id={listId} role="listbox" aria-label="Commands">
          {grouped.length > 0 ? (
            grouped.map(([group, items]) => (
              <div key={group} className="mb-2 last:mb-0">
                <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--wt-text-faint)]">
                  {group}
                </p>
                <div className="grid gap-1">
                  {items.map((action) => (
                    <button
                      key={action.id}
                      id={`${listId}-${orderedActions.indexOf(action)}`}
                      role="option"
                      aria-selected={orderedActions[activeIndex]?.id === action.id}
                      type="button"
                      onClick={() => {
                        action.onRun();
                        onClose();
                      }}
                      className={`group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-[background-color] hover:bg-[var(--wt-selected)] ${orderedActions[activeIndex]?.id === action.id ? "bg-[var(--wt-selected)]" : ""}`}
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center text-[var(--wt-text-muted)] group-hover:border-blue-500/25 group-hover:text-[var(--wt-accent-text)]">
                        <action.icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[var(--wt-text-strong)]">{action.label}</span>
                        <span className="block truncate text-xs text-[var(--wt-text-muted)]">{action.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-md border border-dashed border-[var(--wt-border-strong)] bg-[var(--wt-surface-muted)] p-6 text-center text-sm text-[var(--wt-text-muted)]">
              No commands match that search.
            </div>
          )}
          </div>
        </div>
        <div className="flex gap-4 border-t border-[var(--wt-border)] px-4 py-2 text-[10px] text-[var(--wt-text-muted)]"><span>Arrow keys to navigate</span><span>Enter to open</span><span className="ml-auto">Esc to close</span></div>
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
  const groups: PaletteGroup[] = ["Capture", "Focus", "Review", "Reporting", "Sync", "Settings", "Repositories", "Navigation"];
  return groups
    .map((group) => [group, actions.filter((action) => action.group === group)] as const)
    .filter(([, items]) => items.length > 0);
}
