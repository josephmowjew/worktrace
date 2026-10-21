import {
  Download,
  FileJson,
  Focus,
  ArrowLeft,
  Upload,
  HelpCircle,
  RefreshCw,
  ArrowUpCircle,
  Mic,
  Square,
  ChevronRight,
} from "lucide-react";
import type { PropsWithChildren } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit, listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listActivity } from "../../lib/api/activity";
import { getActiveFocusSession, stopFocusSession } from "../../lib/api/focusSessions";
import { getSparcForceIntegrationStatus, syncSparcForce } from "../../lib/api/sparcForce";
import { listProjects } from "../../lib/api/projects";
import { exportSettingsToFile, getSettings, importSettings } from "../../lib/api/settings";
import { toggleTodoWidget } from "../../lib/api/todoWidget";
import { showQuickCapture } from "../../lib/api/windows";
import {
  checkForAppUpdate,
  getAppVersion,
  getReleaseNotes,
  installAppUpdate,
} from "../../lib/api/appUpdates";
import { useWeekRange } from "../../hooks/useWeekRange";
import { useExperience } from "../../features/experience/useExperience";
import { TitleBar } from "./TitleBar";
import { WorkspaceNavigation, workspaceRoute } from "./WorkspaceNavigation";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useToast } from "../ui/ToastProvider";
import { CommandPalette, createBaseCommandActions } from "../ui/CommandPalette";
import { CloseButton } from "../ui/CloseButton";
import { useSpeech } from "../ui/SpeechProvider";
import { normalizeVoiceTranscript, parseVoiceCaptureDraft } from "../../lib/voiceCommands";
import { invalidateWorkEvidence } from "../../lib/api/queryKeys";
import type { VoiceCaptureDraft } from "../../types/voiceCapture";
import {
  sparcForceSyncAnnouncement,
  syncAnnouncement,
  syncStartedAnnouncement,
} from "../../lib/announcements";
import { gravatarUrl } from "../../lib/gravatar";
import { isRepositorySyncInProgressError, useRepositorySync } from "../../features/repositorySync/RepositorySyncProvider";

export function AppLayout({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const experience = useExperience();
  const speech = useSpeech();
  const navigate = useNavigate();
  const location = useLocation();
  const route = workspaceRoute(location.pathname);
  const [isNavigationOpen, setIsNavigationOpen] = useState(() => typeof window.matchMedia !== "function" || window.matchMedia("(min-width: 901px)").matches);
  const repositorySync = useRepositorySync();
  const importInputRef = useRef<HTMLInputElement>(null);
  const voiceCommandHandlerRef = useRef<() => void>(() => {});
  const weekRange = useWeekRange();
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
    enabled: experience.isDeveloper && settingsQuery.isSuccess,
    staleTime: 60_000,
  });
  const activeFocusQuery = useQuery({
    queryKey: ["focusSession", "active"],
    queryFn: getActiveFocusSession,
    refetchInterval: 5_000,
    retry: false,
  });
  const voiceParseContext = useMemo(
    () => ({
      projects: (projectsQuery.data ?? [])
        .filter((project) => project.status === "active")
        .map((project) => ({ id: project.id, name: project.name })),
    }),
    [projectsQuery.data],
  );
  const sparcForceStatusQuery = useQuery({
    queryKey: ["sparcForceIntegrationStatus"],
    queryFn: getSparcForceIntegrationStatus,
    enabled: experience.isDeveloper && Boolean(settingsQuery.data?.sparcForceAddonEnabled),
    staleTime: 60_000,
  });
  const activityQuery = useQuery({
    queryKey: ["activity", weekRange.from, weekRange.to],
    enabled: experience.isDeveloper,
    queryFn: () =>
      listActivity({
        from: weekRange.from,
        to: weekRange.to,
      }),
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
  const stopFocusMutation = useMutation({
    mutationFn: (id: string) =>
      stopFocusSession(id, {
        createManualLog: false,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["focusSession"] });
      await queryClient.invalidateQueries({ queryKey: ["focusSessions"] });
      await queryClient.invalidateQueries({ queryKey: ["todayCommandCenter"] });
      toast.success("Focus session stopped");
      speech.announce("Focus session stopped.", { category: "focus", interrupt: true });
    },
    onError: (error) => {
      toast.error(
        "Stop focus failed",
        error instanceof Error ? error.message : "Focus session could not be stopped.",
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
  const isDesktopRuntime = Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

  useEscapeKey(() => { setIsHelpMenuOpen(false); setIsWhatsNewOpen(false); }, isHelpMenuOpen || isWhatsNewOpen);
  useEscapeKey(() => setIsNavigationOpen(false), isNavigationOpen && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 900px)").matches);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(min-width: 901px)");
    const onResize = () => setIsNavigationOpen(media.matches);
    media.addEventListener("change", onResize);
    return () => media.removeEventListener("change", onResize);
  }, []);
  const hasSyncableProjects =
    projectsQuery.data?.some(
      (project) => project.status === "active" && Boolean(project.repoPath),
    ) ?? false;
  const releaseNotes = useMemo(() => {
    const localReleases = releaseNotesQuery.data?.releases ?? [];
    const update = checkForUpdateMutation.data;
    if (update?.status !== "available" || !update.latestVersion || !update.body) {
      return localReleases;
    }

    const updateRelease = {
      version: update.latestVersion,
      publishedAt: update.pubDate,
      notes: update.body,
    };
    return [
      updateRelease,
      ...localReleases.filter((release) => release.version !== update.latestVersion),
    ];
  }, [checkForUpdateMutation.data, releaseNotesQuery.data?.releases]);
  const activeFocusSession = activeFocusQuery.data ?? null;
  const isFocusModeActive = experience.isDeveloper && Boolean(activeFocusSession);

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

  async function runRepositorySync({
    scope = "all",
    announce = true,
    notify = true,
    onSettled,
  }: {
    scope?: "all" | "auto";
    announce?: boolean;
    notify?: boolean;
    onSettled?: () => void;
  } = {}) {
    if (announce) {
      speech.announce(syncStartedAnnouncement(scope === "auto" ? "background activity" : "activity"), {
        category: "sync",
        interrupt: scope !== "auto",
      });
    }

    try {
      const result = await repositorySync.syncRepositories(
        {
          from: null,
          to: null,
          authorEmail: scope === "auto" ? null : settingsQuery.data?.gitAuthorEmail || null,
        },
        {
          scope,
          onAlreadyRunning: notify
            ? () => toast.info("Sync already running", "Repository activity is still being refreshed.")
            : undefined,
        },
      );
      if (notify) {
        toast.success(
          scope === "auto" ? "Auto-sync complete" : "Sync complete",
          `Added ${result.newCommits} commits and updated ${result.updatedCommits}.`,
        );
      } else if (result.newCommits > 0 || result.updatedCommits > 0) {
        toast.info(
          "Auto-sync complete",
          `Added ${result.newCommits} commits and updated ${result.updatedCommits}.`,
        );
      }
      if (announce) {
        speech.announce(syncAnnouncement(result), { category: "sync", interrupt: scope !== "auto" });
      }
    } catch (error) {
      if (isRepositorySyncInProgressError(error)) return;
      if (notify) {
        toast.error(
          "Sync failed",
          error instanceof Error ? error.message : "Repository sync could not be completed.",
        );
      }
    } finally {
      onSettled?.();
    }
  }

  function runPowerCommand(query: string) {
    if (!experience.isDeveloper) {
      const command = query.trim().toLowerCase();
      if (command.startsWith("task:")) { navigate("/tasks", { state: { powerCommand: query.trim() } }); return true; }
      if (command === "report") { navigate("/reports"); return true; }
      if (command.startsWith("log:")) { navigate("/manual-log"); return true; }
      if (command.startsWith("focus:")) { navigate(experience.hasFeature("focus") ? "/" : "/settings", { state: { openFocus: true } }); return true; }
      if (command === "sync") { toast.info("Developer tool", "Switch to Developer in Settings to sync repositories."); return true; }
    }
    const normalized = query.trim().toLowerCase();
    if (normalized === "sync") {
      void runRepositorySync();
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

  async function showVoiceCaptureReview(draft: VoiceCaptureDraft) {
    try {
      await showQuickCapture();
      window.setTimeout(() => {
        void emit("quick-capture://voice-draft", draft);
      }, 120);
      setIsCommandPaletteOpen(false);
      return true;
    } catch (error) {
      toast.error(
        "Voice capture failed",
        error instanceof Error ? error.message : "Could not open Quick Capture.",
      );
      return false;
    }
  }

  async function handleVoiceCommand() {
    if (speech.status === "listening") {
      speech.stopVoiceCommand();
      return;
    }

    const result = await speech.startVoiceCommand({ localOnly: true });
    if (!result) {
      if (speech.error) {
        toast.error("Voice command failed", speech.error);
      }
      return;
    }

    const command = normalizeVoiceTranscript(result.transcript, voiceParseContext);
    if (command.kind === "unknown") {
      if (await showVoiceCaptureReview(parseVoiceCaptureDraft(result.transcript, voiceParseContext))) {
        toast.info("Review voice capture", "Choose task or manual log before saving.");
        speech.announce("Review the captured transcript before saving.", {
          category: "general",
          interrupt: true,
        });
      }
      return;
    }

    if (command.kind === "capture") {
      if (await showVoiceCaptureReview(command.draft)) {
        toast.success("Voice capture ready", command.label);
        speech.announce("Voice capture is ready to review.", {
          category: "general",
          interrupt: true,
        });
      }
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

  useEffect(() => {
    voiceCommandHandlerRef.current = () => {
      void handleVoiceCommand();
    };
  });

  const commandActions = useMemo(
    () => [
      ...createBaseCommandActions({
        projects: projectsQuery.data ?? [],
        isDeveloper: experience.isDeveloper,
        enabledFeatures: experience.settings?.enabledFeatures ?? [],
        navigate: (path, state) => navigate(path, state === undefined ? undefined : { state }),
        onSync: () => void runRepositorySync(),
        onScanRepos: () => void runRepositorySync({ onSettled: openProjectsWorkspaceScan }),
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
      experience.isDeveloper,
      experience.settings?.enabledFeatures,
      exportSettingsMutation,
      navigate,
      projectsQuery.data,
      repositorySync,
      settingsQuery.data?.gitAuthorEmail,
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
      if (document.getElementById("root")?.inert) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b" && !(event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable=true]"))) {
        event.preventDefault();
        setIsNavigationOpen((open) => !open);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsCommandPaletteOpen((isOpen) => !isOpen);
        return;
      }

      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "m"
      ) {
        event.preventDefault();
        voiceCommandHandlerRef.current();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("quick-capture://created", () => {
      void invalidateWorkEvidence(queryClient);
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
      void runRepositorySync();
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
  }, [navigate, queryClient, repositorySync, settingsQuery.data?.gitAuthorEmail]);

  useEffect(() => {
    if (!experience.isDeveloper || !hasSyncableProjects) {
      return;
    }

    const syncInterval = window.setInterval(
      () => {
        if (!repositorySync.isSyncing) {
          void runRepositorySync({ scope: "auto", announce: false, notify: false });
        }
      },
      5 * 60 * 1000,
    );

    return () => window.clearInterval(syncInterval);
  }, [experience.isDeveloper, hasSyncableProjects, repositorySync.isSyncing, repositorySync, settingsQuery.data?.gitAuthorEmail]);

  useEffect(() => {
    if (!experience.isDeveloper || !sparcForceAvailable || !sparcForceStatusQuery.data?.connected) {
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
  }, [experience.isDeveloper, commandSparcForceSyncMutation, sparcForceAvailable, sparcForceStatusQuery.data?.connected]);

  useEffect(() => {
    if (!isWhatsNewOpen || checkForUpdateMutation.isPending || checkForUpdateMutation.data) {
      return;
    }

    checkForUpdateMutation.mutate();
  }, [checkForUpdateMutation, isWhatsNewOpen]);

  return (
    <div
      className={`h-screen overflow-hidden bg-[var(--wt-bg)] text-[var(--wt-text)] ${
        isFocusModeActive ? "wt-focus-mode-active" : ""
      }`}
    >
      <a className="wt-skip-link" href="#workspace-content">Skip to content</a>
      <div className="relative flex h-screen flex-col overflow-hidden">
        <TitleBar
          onCommand={() => setIsCommandPaletteOpen(true)}
          onToggleNavigation={() => setIsNavigationOpen((open) => !open)}
          navigationOpen={isNavigationOpen}
        />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <WorkspaceNavigation
            isOpen={isNavigationOpen}
            onClose={() => setIsNavigationOpen(false)}
            onNavigate={() => { if (window.innerWidth <= 900) setIsNavigationOpen(false); }}
            onWidget={() => widgetMutation.mutate()}
            widgetPending={widgetMutation.isPending}
            name={settings?.name && settings.name !== "John Developer" ? settings.name : "Local workspace"}
            avatar={<ProfileAvatar imageUrl={profileImageUrl} name={settings?.name && settings.name !== "John Developer" ? settings.name : "WorkTrace"} email={settings?.email || ""} />}
          />
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--wt-bg)]">
            <header className="wt-workspace-toolbar wt-focus-muted">
              <div className="flex min-w-0 items-center gap-2 text-xs">
                {isWidgetWindow ? <button type="button" className="wt-shell-icon" aria-label="Back to todos" onClick={() => navigate("/widget")}><ArrowLeft size={15} /></button> : null}
                <span className="hidden text-[var(--wt-text-muted)] sm:inline">{route.section}</span>
                <ChevronRight size={12} className="hidden text-[var(--wt-text-faint)] sm:block" />
                <span className="truncate font-medium text-[var(--wt-text-strong)]">{route.label}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {speech.isVoiceCommandAvailable ? <button type="button" className="wt-shell-icon" onClick={() => void handleVoiceCommand()} disabled={speech.status === "transcribing"} aria-label={speech.status === "listening" ? "Stop voice capture" : "Voice capture"} title="Voice capture (Ctrl + Shift + M)">{speech.status === "listening" ? <Square size={15} /> : <Mic size={15} />}</button> : null}
                <div className="relative">
                  <button type="button" className="wt-shell-icon" aria-label="Help and updates" aria-expanded={isHelpMenuOpen} onClick={() => setIsHelpMenuOpen((open) => !open)}><HelpCircle size={15} /></button>
                  {isHelpMenuOpen ? (
                    <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-[var(--wt-border)] bg-[var(--wt-surface)] p-2 shadow-[var(--wt-panel-shadow)]">
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
              </div>
            </header>
            <section id="workspace-content" tabIndex={-1} className="wt-focus-page wt-workspace-content min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              <div className="mx-auto w-full max-w-[1600px]">{children}</div>
            </section>
          </main>
        </div>
        <footer className="wt-status-bar">
          <span className="flex items-center gap-1.5"><span className="wt-status-dot" />{isDesktopRuntime ? "Local workspace" : "Browser preview"}</span>
          {experience.isDeveloper ? <span className="hidden sm:inline">{activityQuery.isSuccess ? `${commitCount} commits · ${manualCount} logs this week` : "Activity unavailable"}</span> : <span className="hidden sm:inline">Essentials</span>}
          {experience.isDeveloper ? <span className="ml-auto flex items-center gap-1.5"><RefreshCw size={11} className={repositorySync.isSyncing ? "animate-spin" : ""} />{repositorySync.isSyncing ? "Syncing repositories…" : projectsQuery.isError ? "Repositories unavailable" : hasSyncableProjects ? "Auto-sync every 5 min" : "No syncable repositories"}</span> : <span className="ml-auto">{isDesktopRuntime ? "Saved on this device" : "Desktop app required to save"}</span>}
          <span className="hidden md:inline">{appVersionQuery.data?.version ? `v${appVersionQuery.data.version}` : "WorkTrace"}</span>
        </footer>
      </div>
      {activeFocusSession ? (
        <ImmersiveFocusBar
          title={activeFocusSession.title}
          context={activeFocusSession.projectName ?? activeFocusSession.taskTitle ?? "General focus"}
          startedAt={activeFocusSession.startedAt}
          isStopping={stopFocusMutation.isPending}
          onOpenFocus={() => navigate("/", { state: { openFocus: true } })}
          onStop={() => stopFocusMutation.mutate(activeFocusSession.id)}
        />
      ) : null}
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
              <CloseButton label="Close What's New" variant="subtle" onClick={() => setIsWhatsNewOpen(false)} />
            </div>
            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {releaseNotesQuery.isLoading ? <p className="text-xs text-[var(--wt-text-muted)]">Loading release notes...</p> : null}
              {releaseNotes.map((release) => (
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

function ImmersiveFocusBar({
  title,
  context,
  startedAt,
  isStopping,
  onOpenFocus,
  onStop,
}: {
  title: string;
  context: string;
  startedAt: string;
  isStopping: boolean;
  onOpenFocus: () => void;
  onStop: () => void;
}) {
  const elapsed = useElapsedSeconds(startedAt);

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-[9000] flex justify-center sm:inset-x-4">
      <div className="wt-focus-bar pointer-events-auto flex w-full max-w-4xl items-center justify-between gap-3 rounded-2xl border border-emerald-300/25 bg-[color-mix(in_oklch,var(--wt-bg)_82%,oklch(0.24_0.06_170))] px-3 py-3 shadow-[0_18px_60px_rgba(2,6,23,0.42),inset_0_1px_0_rgba(255,255,255,0.10)] sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-200/25 bg-emerald-300/12 text-emerald-100">
            <Focus className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--wt-text-strong)]">{title}</p>
            <p className="mt-0.5 truncate text-xs text-[var(--wt-text-muted)]">{context}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden min-w-[88px] rounded-xl border border-white/10 bg-slate-950/45 px-3 py-2 text-center text-sm font-semibold text-emerald-100 tabular-nums sm:inline-block">
            {formatElapsedTime(elapsed)}
          </span>
          <button
            type="button"
            onClick={onOpenFocus}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] px-3 text-xs font-semibold text-slate-200 transition-[background-color,border-color,color,transform] duration-150 ease-out hover:border-emerald-200/25 hover:bg-emerald-300/10 hover:text-emerald-100 active:scale-[0.96]"
          >
            Focus
          </button>
          <button
            type="button"
            onClick={onStop}
            disabled={isStopping}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-rose-400/35 bg-rose-600 px-3 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(225,29,72,0.26)] transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out hover:bg-rose-500 active:scale-[0.96] disabled:scale-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Square className="h-3.5 w-3.5" />
            {isStopping ? "Stopping" : "Stop"}
          </button>
        </div>
      </div>
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

function useElapsedSeconds(startedAt?: string | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return useMemo(() => {
    if (!startedAt) return 0;
    const started = new Date(startedAt).getTime();
    if (Number.isNaN(started)) return 0;
    return Math.max(0, Math.floor((now - started) / 1_000));
  }, [now, startedAt]);
}

function formatElapsedTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
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
