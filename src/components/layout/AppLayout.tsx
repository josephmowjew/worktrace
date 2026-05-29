import {
  Activity,
  BarChart3,
  CalendarDays,
  Download,
  FileJson,
  Home,
  BookOpen,
  ClipboardEdit,
  DatabaseBackup,
  FolderKanban,
  LayoutDashboard,
  Settings,
  ListChecks,
  ListTodo,
  ArrowLeft,
  Upload,
  ExternalLink,
  HelpCircle,
  RefreshCw,
  ArrowUpCircle,
  X,
} from "lucide-react";
import type { PropsWithChildren } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listActivity } from "../../lib/api/activity";
import { syncCommits } from "../../lib/api/gitSync";
import { getSparcForceIntegrationStatus, syncSparcForce } from "../../lib/api/sparcForce";
import { listProjects } from "../../lib/api/projects";
import { exportSettingsToFile, getSettings, importSettings } from "../../lib/api/settings";
import { toggleTodoWidget } from "../../lib/api/todoWidget";
import {
  checkForAppUpdate,
  getAppVersion,
  getReleaseNotes,
  installAppUpdate,
} from "../../lib/api/appUpdates";
import { currentWeekRange } from "../../lib/dates";
import { TitleBar } from "./TitleBar";
import { useToast } from "../ui/ToastProvider";
import { CommandPalette, createBaseCommandActions } from "../ui/CommandPalette";
import { useSpeech } from "../ui/SpeechProvider";
import { normalizeVoiceTranscript } from "../../lib/voiceCommands";
import {
  sparcForceSyncAnnouncement,
  syncAnnouncement,
  syncStartedAnnouncement,
} from "../../lib/announcements";
import { appSignature } from "../../lib/appSignature";
import { gravatarUrl } from "../../lib/gravatar";

const navItems = [
  { label: "Today", href: "/", icon: Home },
  { label: "Weekly Plan", href: "/weekly-plan", icon: ListChecks },
  { label: "Manual Log", href: "/manual-log", icon: ClipboardEdit },
  { label: "Activity Timeline", href: "/activity", icon: Activity },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Repositories", href: "/projects", icon: FolderKanban },
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Backup", href: "/backup", icon: DatabaseBackup },
  { label: "Guide", href: "/guide", icon: BookOpen },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function AppLayout({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const speech = useSpeech();
  const navigate = useNavigate();
  const importInputRef = useRef<HTMLInputElement>(null);
  const weekRange = currentWeekRange();
  const [isWidgetWindow, setIsWidgetWindow] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false);
  const [isWhatsNewOpen, setIsWhatsNewOpen] = useState(false);
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });
  const appVersionQuery = useQuery({ queryKey: ["appVersion"], queryFn: getAppVersion, retry: false });
  const releaseNotesQuery = useQuery({
    queryKey: ["releaseNotes"],
    queryFn: getReleaseNotes,
    retry: false,
    enabled: isWhatsNewOpen,
  });
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
    staleTime: 60_000,
  });
  const sparcForceStatusQuery = useQuery({
    queryKey: ["sparcForceIntegrationStatus"],
    queryFn: getSparcForceIntegrationStatus,
    staleTime: 60_000,
  });
  const activityQuery = useQuery({
    queryKey: ["activity", weekRange.from, weekRange.to],
    queryFn: () =>
      listActivity({
        from: weekRange.from,
        to: weekRange.to,
      }),
  });
  const intervalSyncMutation = useMutation({
    mutationFn: () =>
      syncCommits({
        from: null,
        to: null,
        authorEmail: null,
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["activity"] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      if (result.newCommits > 0 || result.updatedCommits > 0) {
        toast.info(
          "Auto-sync complete",
          `Added ${result.newCommits} commits and updated ${result.updatedCommits}.`,
        );
      }
    },
  });
  const widgetMutation = useMutation({
    mutationFn: toggleTodoWidget,
    onSuccess: (isVisible) => {
      toast.info(isVisible ? "Todo widget shown" : "Todo widget hidden");
    },
    onError: (error) => {
      toast.error(
        "Todo widget failed",
        error instanceof Error ? error.message : "Could not toggle the todo widget.",
      );
    },
  });
  const exportSettingsMutation = useMutation({
    mutationFn: async () => {
      const stamp = new Date().toISOString().slice(0, 10);
      const path = await save({
        title: "Export WorkTrace settings",
        defaultPath: `worktrace-settings-${stamp}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return false;

      await exportSettingsToFile(path);
      return true;
    },
    onSuccess: (saved) => {
      if (saved) {
        toast.success("Settings exported", "Your WorkTrace settings file was saved.");
      }
    },
    onError: (error) => {
      toast.error(
        "Export failed",
        error instanceof Error ? error.message : "Settings could not be exported.",
      );
    },
  });
  const importSettingsMutation = useMutation({
    mutationFn: importSettings,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success(
        "Settings imported",
        result.warnings[0] ?? "Your saved WorkTrace settings were loaded.",
      );
    },
    onError: (error) => {
      toast.error(
        "Import failed",
        error instanceof Error ? error.message : "Settings could not be imported.",
      );
    },
  });
  const commandSyncMutation = useMutation({
    mutationFn: () =>
      syncCommits({
        from: null,
        to: null,
        authorEmail: settingsQuery.data?.gitAuthorEmail || null,
      }),
    onMutate: () => {
      speech.announce(syncStartedAnnouncement("activity"), { category: "sync", interrupt: true });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["activity"] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      await queryClient.invalidateQueries({ queryKey: ["weeklyTasks"] });
      toast.success(
        "Sync complete",
        `Added ${result.newCommits} commits and updated ${result.updatedCommits}.`,
      );
      speech.announce(syncAnnouncement(result), { category: "sync", interrupt: true });
    },
    onError: (error) => {
      toast.error(
        "Sync failed",
        error instanceof Error ? error.message : "Repository sync could not be completed.",
      );
    },
  });
  const commandSparcForceSyncMutation = useMutation({
    mutationFn: syncSparcForce,
    onMutate: () => {
      speech.announce(syncStartedAnnouncement("Sparc Force"), {
        category: "sync",
        interrupt: true,
      });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["sparcForceIntegrationStatus"] });
      await queryClient.invalidateQueries({ queryKey: ["sparcForceRecords"] });
      toast.success("Sparc Force synced", result.message);
      speech.announce(sparcForceSyncAnnouncement(result), {
        category: "sync",
        interrupt: true,
      });
    },
    onError: (error) => {
      toast.error(
        "Sparc Force sync failed",
        error instanceof Error ? error.message : "Sparc Force data could not be imported.",
      );
    },
  });
  const checkForUpdateMutation = useMutation({ mutationFn: checkForAppUpdate });
  const installUpdateMutation = useMutation({ mutationFn: installAppUpdate });
  const settings = settingsQuery.data;
  const sparcForceAvailable = Boolean(
    settings?.sparcForceAddonEnabled ||
      sparcForceStatusQuery.data?.addonEnabled ||
      sparcForceStatusQuery.data?.connected,
  );
  const profileImageUrl =
    settings?.useGravatarProfileImage && isEmailLike(settings.email)
      ? gravatarUrl(settings.email, 96)
      : null;
  const activityItems = activityQuery.data?.flatMap((day) => day.items) ?? [];
  const commitCount = activityItems.filter((item) => item.activityType === "commit").length;
  const manualCount = activityItems.length - commitCount;
  const hasSyncableProjects =
    projectsQuery.data?.some(
      (project) => project.status === "active" && Boolean(project.repoPath),
    ) ?? false;

  function openProjectsWorkspaceScan() {
    navigate("/projects", { state: { openWorkspaceScan: true } });
  }

  async function importSelectedSettingsFile(file: File | undefined) {
    if (!file) return;

    const payload = await file.text();
    importSettingsMutation.mutate(payload);
    if (importInputRef.current) {
      importInputRef.current.value = "";
    }
  }

  function runPowerCommand(query: string) {
    const normalized = query.trim().toLowerCase();
    if (normalized === "sync") {
      commandSyncMutation.mutate();
      return true;
    }
    if (normalized === "sparc_force_sync") {
      if (!sparcForceAvailable) {
        toast.info("Add-on locked", "Unlock the add-on in Settings before using this command.");
        return true;
      }
      commandSparcForceSyncMutation.mutate();
      return true;
    }
    if (normalized === "report") {
      navigate("/", { state: { openReportPrep: true } });
      return true;
    }
    if (
      normalized.startsWith("task:") ||
      normalized.startsWith("log:") ||
      normalized.startsWith("focus:")
    ) {
      navigate("/", { state: { powerCommand: query.trim() } });
      return true;
    }
    return false;
  }

  async function handleVoiceCommand() {
    if (speech.status === "listening") {
      speech.stopVoiceCommand();
      return;
    }

    const result = await speech.startVoiceCommand();
    if (!result) {
      if (speech.error) {
        toast.error("Voice command failed", speech.error);
      }
      return;
    }

    const command = normalizeVoiceTranscript(result.transcript);
    if (command.kind === "unknown") {
      toast.info("Voice command not recognized", result.transcript);
      speech.announce("I could not match that to a WorkTrace command.", {
        category: "general",
        interrupt: true,
      });
      return;
    }

    if (
      settings?.voiceCommandConfirmBeforeAction &&
      command.requiresConfirmation &&
      !window.confirm(`Run voice command?\n\n${command.label}`)
    ) {
      return;
    }

    if (command.kind === "navigation") {
      if (command.label === "Go to Sparc Force") {
        if (!sparcForceAvailable) {
          toast.info("Add-on locked", "Unlock the add-on in Settings before opening this integration.");
          return;
        }
        navigate(command.path, { state: { openIntegrationPanel: "sparcForce" } });
      } else {
        navigate(command.path);
      }
      toast.success("Voice command", command.label);
      speech.announce(command.label, { category: "general", interrupt: true });
      return;
    }

    if (runPowerCommand(command.command)) {
      toast.success("Voice command", command.label);
      speech.announce(command.label, { category: "general", interrupt: true });
    }
  }

  const commandActions = useMemo(
    () => [
      ...createBaseCommandActions({
        projects: projectsQuery.data ?? [],
        navigate: (path, state) => navigate(path, state === undefined ? undefined : { state }),
        onSync: () => commandSyncMutation.mutate(),
        onScanRepos: () =>
          commandSyncMutation.mutate(undefined, {
            onSettled: openProjectsWorkspaceScan,
          }),
        onToggleWidget: () => widgetMutation.mutate(),
      }),
      {
        id: "settings-portability",
        label: "Open Settings Import / Export",
        description: "Manage portable settings for reinstall or migration",
        group: "Settings" as const,
        icon: FileJson,
        onRun: () => navigate("/settings", { state: { openSettingsTab: "portability" } }),
      },
      {
        id: "settings-export",
        label: "Export Settings",
        description: "Download a WorkTrace settings JSON file",
        group: "Settings" as const,
        icon: Download,
        onRun: () => exportSettingsMutation.mutate(),
      },
      {
        id: "settings-import",
        label: "Import Settings",
        description: "Load a WorkTrace settings JSON file",
        group: "Settings" as const,
        icon: Upload,
        onRun: () => importInputRef.current?.click(),
      },
    ],
    [
      commandSyncMutation,
      exportSettingsMutation,
      navigate,
      projectsQuery.data,
      widgetMutation,
    ],
  );

  useEffect(() => {
    try {
      setIsWidgetWindow(getCurrentWindow().label === "widget");
    } catch {
      setIsWidgetWindow(false);
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsCommandPaletteOpen((isOpen) => !isOpen);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("quick-capture://created", () => {
      queryClient.invalidateQueries({ queryKey: ["manualLogs"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
      queryClient.invalidateQueries({ queryKey: ["projectStats"] });
      queryClient.invalidateQueries({ queryKey: ["weekSummary"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    }).then((dispose) => {
      unlisten = dispose;
    }).catch(() => {});

    return () => unlisten?.();
  }, [queryClient]);

  useEffect(() => {
    let unlistenSettings: (() => void) | undefined;
    let unlistenSync: (() => void) | undefined;
    let unlistenLifecycle: (() => void) | undefined;

    listen("tray://open-settings", () => {
      navigate("/settings");
    }).then((dispose) => {
      unlistenSettings = dispose;
    }).catch(() => {});

    listen("tray://sync-projects", () => {
      if (!commandSyncMutation.isPending) {
        commandSyncMutation.mutate();
      }
    }).then((dispose) => {
      unlistenSync = dispose;
    }).catch(() => {});

    listen("tray://lifecycle-changed", () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["desktopLifecycleStatus"] });
    }).then((dispose) => {
      unlistenLifecycle = dispose;
    }).catch(() => {});

    return () => {
      unlistenSettings?.();
      unlistenSync?.();
      unlistenLifecycle?.();
    };
  }, [commandSyncMutation, navigate, queryClient]);

  useEffect(() => {
    if (!hasSyncableProjects) {
      return;
    }

    const syncInterval = window.setInterval(
      () => {
        if (!intervalSyncMutation.isPending) {
          intervalSyncMutation.mutate();
        }
      },
      5 * 60 * 1000,
    );

    return () => window.clearInterval(syncInterval);
  }, [hasSyncableProjects, intervalSyncMutation]);

  useEffect(() => {
    if (!sparcForceAvailable || !sparcForceStatusQuery.data?.connected) {
      return;
    }

    const syncInterval = window.setInterval(
      () => {
        if (!commandSparcForceSyncMutation.isPending) {
          commandSparcForceSyncMutation.mutate();
        }
      },
      15 * 60 * 1000,
    );

    return () => window.clearInterval(syncInterval);
  }, [commandSparcForceSyncMutation, sparcForceAvailable, sparcForceStatusQuery.data?.connected]);

  return (
    <div className="h-screen overflow-hidden bg-[var(--wt-bg)] text-[var(--wt-text)]">
      <div
        className="fixed inset-0"
        style={{
          background:
            "linear-gradient(135deg, var(--wt-bg) 0%, var(--wt-bg-elevated) 52%, var(--wt-bg) 100%)",
        }}
      />
      <div className="relative flex h-screen flex-col overflow-hidden">
        <TitleBar />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="m-2 mt-0 hidden min-h-0 w-[236px] shrink-0 flex-col rounded-lg border border-[var(--wt-border)] bg-[var(--wt-shell)] p-3 shadow-[var(--wt-panel-shadow)] lg:flex">
            <div className="mb-5 rounded-2xl border border-[var(--wt-border)] bg-[var(--wt-surface)] p-3 shadow-[var(--wt-control-shadow)]">
              <div className="flex items-center gap-2.5">
                <img
                  src="/worktrace-icon.svg"
                  alt=""
                  className="h-10 w-10 rounded-xl object-contain shadow-sm"
                  draggable={false}
                />
                <div>
                  <p className="text-base font-semibold tracking-tight">WorkTrace</p>
                  <p className="text-[10px] text-[var(--wt-text-muted)]">Track. Focus. Deliver.</p>
                </div>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-[var(--wt-surface-muted)]">
                <div className="h-full w-2/3 rounded-full bg-blue-500" />
              </div>
            </div>

            <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.href}
                  to={item.href}
                  end={item.href === "/"}
                  className={({ isActive }) =>
                    [
                      "group relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all duration-150",
                      isActive
                        ? "bg-[var(--wt-selected)] text-[var(--wt-accent-text)] shadow-[var(--wt-control-shadow)]"
                        : "text-[var(--wt-text-muted)] hover:bg-[var(--wt-surface-hover)] hover:text-[var(--wt-text-strong)]",
                    ].join(" ")
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive ? (
                        <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-blue-500" />
                      ) : null}
                      <item.icon
                        className={[
                          "h-4 w-4",
                          isActive ? "text-[var(--wt-accent-text)]" : "text-[var(--wt-text-faint)]",
                        ].join(" ")}
                      />
                      {item.label}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="mt-3 overflow-hidden rounded-lg border border-blue-500/15 bg-[var(--wt-accent-soft)] p-3 shadow-[var(--wt-control-shadow)]">
              <div className="mb-3 flex items-center gap-1.5 text-xs text-[var(--wt-accent-text)]">
                <Activity className="h-3.5 w-3.5" />
                This Week
              </div>
              <p className="text-2xl font-semibold">{activityItems.length}</p>
              <p className="mt-0.5 text-xs text-[var(--wt-text-muted)]">
                {commitCount} commits / {manualCount} manual
              </p>
              {hasSyncableProjects ? (
                <p className="mt-1 text-[10px] text-[var(--wt-accent-text)]">
                  Auto-sync every 5 min
                </p>
              ) : null}
              <div className="mt-4 grid h-12 grid-cols-7 items-end gap-1">
                {[35, 62, 48, 76, 52, 28, 42].map((height, index) => (
                  <span
                    key={index}
                    className="rounded-t bg-blue-400/70"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => widgetMutation.mutate()}
              disabled={widgetMutation.isPending}
              className="mt-3 flex w-full min-h-10 items-center justify-center gap-2 rounded-xl border border-blue-500/18 bg-[var(--wt-selected)] px-3 py-2.5 text-xs font-semibold text-[var(--wt-accent-text)] shadow-[var(--wt-control-shadow)] transition-[background-color,border-color,transform] duration-150 hover:border-blue-500/30 hover:bg-[var(--wt-accent-soft)] active:scale-[0.96] disabled:scale-100 disabled:opacity-60"
            >
              <ListTodo className="h-4 w-4" />
              {widgetMutation.isPending ? "Opening..." : "Todo Widget"}
            </button>

            <a
              href={appSignature.developerProfileUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[var(--wt-border)] bg-[var(--wt-surface)] px-3 py-2 text-[10px] text-[var(--wt-text-muted)] transition-[background-color,border-color,color] duration-150 hover:border-blue-500/20 hover:bg-[var(--wt-surface-hover)] hover:text-[var(--wt-accent-text)]"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold text-[var(--wt-text-strong)]">
                  {appSignature.developerCredit}
                </span>
                <span className="block truncate">GitHub profile</span>
              </span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>
          </aside>

          <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-3 py-3 md:px-4 md:py-4">
            {isWidgetWindow ? (
              <div className="mb-3 flex shrink-0 items-center justify-between gap-2 rounded-2xl border border-blue-300/20 bg-blue-500/15 p-2 shadow-lg shadow-blue-950/20 backdrop-blur-xl">
                <button
                  type="button"
                  onClick={() => navigate("/widget")}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Todos
                </button>
                <p className="truncate pr-2 text-[11px] text-blue-100/75">
                  You are browsing from the floating widget.
                </p>
              </div>
            ) : null}

            <nav className="mb-3 flex shrink-0 gap-2 overflow-x-auto rounded-lg border border-[var(--wt-border)] bg-[var(--wt-surface)] p-2 shadow-[var(--wt-control-shadow)] lg:hidden">
              {navItems.map((item) => (
                <NavLink
                  key={item.href}
                  to={item.href}
                  end={item.href === "/"}
                  aria-label={item.label}
                  title={item.label}
                  className={({ isActive }) =>
                    [
                      "flex h-10 min-w-10 items-center justify-center rounded-md border px-3 text-xs font-semibold transition",
                      isActive
                        ? "border-blue-500/30 bg-blue-600 text-white shadow-[var(--wt-primary-shadow)]"
                        : "border-[var(--wt-border)] bg-[var(--wt-input)] text-[var(--wt-text-muted)] hover:bg-[var(--wt-surface-hover)] hover:text-[var(--wt-text-strong)]",
                    ].join(" ")
                  }
                >
                  <item.icon className="h-4 w-4" />
                  <span className="ml-2 hidden sm:inline">{item.label}</span>
                </NavLink>
              ))}
            </nav>
            <header className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
              <div className="wt-control flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs text-[var(--wt-text-muted)]">
                <CalendarDays className="h-4 w-4 text-[var(--wt-accent-text)]" />
                {weekRange.label}
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsHelpMenuOpen((open) => !open)}
                    className="wt-control inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
                  >
                    <HelpCircle className="h-4 w-4" />
                    Help
                  </button>
                  {isHelpMenuOpen ? (
                    <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-[var(--wt-border)] bg-[var(--wt-surface)] p-2 shadow-[var(--wt-panel-shadow)]">
                      <p className="rounded-lg px-2 py-1.5 text-[11px] text-[var(--wt-text-muted)]">
                        Current version: <span className="font-semibold text-[var(--wt-text-strong)]">{appVersionQuery.data?.version ?? "Unavailable"}</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setIsWhatsNewOpen(true);
                          setIsHelpMenuOpen(false);
                        }}
                        className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-[var(--wt-text)] transition hover:bg-[var(--wt-surface-hover)]"
                      >
                        <ArrowUpCircle className="h-4 w-4 text-[var(--wt-accent-text)]" />
                        What's New
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          checkForUpdateMutation.mutate(undefined, {
                            onSuccess: (result) => {
                              if (result.status === "available") {
                                toast.success("Update available", `Version ${result.latestVersion ?? "new"} is ready.`);
                              } else if (result.status === "up_to_date") {
                                toast.info("Up to date", `You are on ${result.currentVersion}.`);
                              } else {
                                toast.error("Update check failed", result.body ?? "Could not check for updates.");
                              }
                            },
                            onError: (error) => {
                              toast.error("Update check failed", error instanceof Error ? error.message : "Could not check for updates.");
                            },
                          })
                        }
                        disabled={checkForUpdateMutation.isPending}
                        className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-[var(--wt-text)] transition hover:bg-[var(--wt-surface-hover)] disabled:opacity-60"
                      >
                        <RefreshCw className="h-4 w-4 text-blue-300" />
                        Check for updates
                      </button>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => widgetMutation.mutate()}
                  disabled={widgetMutation.isPending}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-500/18 bg-[var(--wt-selected)] px-3 py-2 text-xs font-semibold text-[var(--wt-accent-text)] shadow-[var(--wt-control-shadow)] transition-[background-color,border-color,transform] duration-150 hover:border-blue-500/30 hover:bg-[var(--wt-accent-soft)] active:scale-[0.96] disabled:scale-100 disabled:opacity-60"
                >
                  <ListTodo className="h-4 w-4" />
                  Widget
                </button>
                <div className="wt-control flex items-center gap-2 rounded-xl px-3 py-2">
                  <ProfileAvatar
                    imageUrl={profileImageUrl}
                    name={settings?.name ?? "John Developer"}
                    email={settings?.email ?? "johndev@worktrace.app"}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{settings?.name ?? "John Developer"}</p>
                    <p className="truncate text-[10px] text-[var(--wt-text-muted)]">
                      {settings?.email ?? "johndev@worktrace.app"}
                    </p>
                  </div>
                </div>
              </div>
            </header>

            <section className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
              <div className="mx-auto w-full max-w-[1680px] pb-6">{children}</div>
            </section>
          </main>
        </div>
      </div>
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        actions={commandActions}
        onPowerCommand={(query) => {
          return runPowerCommand(query);
        }}
        onVoiceCommand={speech.isVoiceCommandAvailable ? handleVoiceCommand : undefined}
        voiceStatus={speech.status}
        voiceError={speech.error}
      />
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          void importSelectedSettingsFile(event.currentTarget.files?.[0]);
        }}
      />
      {isWhatsNewOpen ? (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-[var(--wt-overlay)] p-4">
          <div className="w-full max-w-2xl rounded-xl border border-[var(--wt-border)] bg-[var(--wt-surface)] p-4 shadow-[var(--wt-panel-shadow)]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--wt-text-strong)]">What's New</h2>
              <button type="button" onClick={() => setIsWhatsNewOpen(false)} className="rounded-lg p-1 text-[var(--wt-text-muted)] hover:bg-[var(--wt-surface-hover)] hover:text-[var(--wt-text-strong)]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {releaseNotesQuery.isLoading ? <p className="text-xs text-[var(--wt-text-muted)]">Loading release notes...</p> : null}
              {(releaseNotesQuery.data?.releases ?? []).map((release) => (
                <article key={`${release.version}-${release.publishedAt ?? "na"}`} className="rounded-lg border border-[var(--wt-border)] bg-[var(--wt-surface-muted)] p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-[var(--wt-accent-text)]">{release.version}</p>
                    <p className="text-[10px] text-[var(--wt-text-muted)]">{release.publishedAt ? new Date(release.publishedAt).toLocaleDateString() : "Unknown date"}</p>
                  </div>
                  <pre className="whitespace-pre-wrap text-xs text-[var(--wt-text)]">{release.notes || "No notes."}</pre>
                </article>
              ))}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  checkForUpdateMutation.mutate(undefined, {
                    onSuccess: (result) => {
                      if (result.status === "available") {
                        toast.success("Update available", `Version ${result.latestVersion ?? "new"} is ready.`);
                      } else if (result.status === "up_to_date") {
                        toast.info("Up to date", `You are on ${result.currentVersion}.`);
                      } else {
                        toast.error("Update check failed", result.body ?? "Could not check for updates.");
                      }
                    },
                  })
                }
                className="rounded-lg border border-[var(--wt-border)] px-3 py-2 text-xs text-[var(--wt-text)] hover:bg-[var(--wt-surface-hover)]"
              >
                Check for updates
              </button>
              <button
                type="button"
                onClick={() =>
                  installUpdateMutation.mutate(undefined, {
                    onSuccess: (installed) => {
                      if (!installed) {
                        toast.info("No update available");
                      }
                    },
                    onError: (error) => {
                      toast.error("Update install failed", error instanceof Error ? error.message : "Could not install update.");
                    },
                  })
                }
                className="rounded-lg border border-blue-500/30 bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-500"
              >
                Install update
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProfileAvatar({
  imageUrl,
  name,
  email,
}: {
  imageUrl: string | null;
  name: string;
  email: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = initialsForName(name || email);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <div className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-blue-500/20 bg-[var(--wt-accent-soft)] text-[11px] font-semibold text-[var(--wt-accent-text)]">
      {imageUrl && !imageFailed ? (
        <img
          src={imageUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        initials
      )}
    </div>
  );
}

function initialsForName(value: string) {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "WT";
}

function isEmailLike(value: string) {
  const [localPart, domain, extra] = value.trim().split("@");
  return Boolean(
    localPart &&
      domain &&
      !extra &&
      domain.includes(".") &&
      !domain.startsWith(".") &&
      !domain.endsWith("."),
  );
}
