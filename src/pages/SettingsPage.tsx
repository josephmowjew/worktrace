import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Briefcase, Building2, CalendarDays, Check, CheckCircle2, ChevronDown, Clock3, Database, Download, ExternalLink, FileJson, FileText, Filter, Folder, Hash, Keyboard, Layers, Link2, LockKeyhole, Mail, Mic, Monitor, MoreHorizontal, PlugZap, Save, Search, Settings as SettingsIcon, Sparkles, Upload, User, Users, Volume2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { SimpleIcon } from "simple-icons";
import {
  siGit,
  siGithub,
  siGooglecalendar,
  siOpenrouter,
  siWakatime,
} from "simple-icons";
import { useForm } from "react-hook-form";
import { useLocation } from "react-router-dom";
import { save } from "@tauri-apps/plugin-dialog";
import { z } from "zod";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { PageHeader } from "../components/ui/PageHeader";
import { SegmentedTabs } from "../components/ui/SegmentedTabs";
import { SelectField } from "../components/ui/SelectField";
import { useSpeech } from "../components/ui/SpeechProvider";
import { useToast } from "../components/ui/ToastProvider";
import { THEME_PREVIEW_EVENT } from "../app/ThemeProvider";
import { activateSparcForceAddon, exportSettingsToFile, getSettings, importSettings, updateSettings } from "../lib/api/settings";
import {
  connectGitHubPat,
  disconnectGitHub,
  getGitHubIntegrationStatus,
  testGitHubConnection,
} from "../lib/api/github";
import {
  connectGoogleCalendar,
  disconnectCalendarSource,
  listCalendarSources,
  syncCalendarEvents,
} from "../lib/api/calendar";
import {
  connectReportAiProvider,
  disconnectReportAiProvider,
  getReportAiStatus,
  listReportAiProviderModels,
  testReportAiProvider,
} from "../lib/api/reports";
import {
  connectEmbeddingProvider,
  disconnectEmbeddingProvider,
  getEmbeddingStatus,
  testEmbeddingProvider,
} from "../lib/api/embeddings";
import {
  connectSparcForce,
  disconnectSparcForce,
  getSparcForceCaseDetail,
  getSparcForceIntegrationStatus,
  importSparcForceTaskToWeeklyTask,
  listSparcForceRecords,
  syncSparcForce,
  testSparcForceConnection,
  verifySparcForceLoginOtp,
} from "../lib/api/sparcForce";
import type { ReportAiModelList, ReportAiProvider, ReportAiStatus } from "../types/report";
import type { CalendarSource } from "../types/calendar";
import type { Settings } from "../types/settings";
import type { SparcForceImportedItem, SparcForceIntegrationStatus, SparcForceRecordCounts } from "../types/sparcForce";
import type { WeeklyTaskPriority, WeeklyTaskStatus } from "../types/weeklyTask";
import { sparcForceSyncAnnouncement, syncStartedAnnouncement, taskAnnouncement } from "../lib/announcements";
import { currentWeekRange } from "../lib/dates";
import { weeklyTaskQueryRoots } from "../lib/api/queryKeys";
import { gravatarUrl } from "../lib/gravatar";
import { appSignature } from "../lib/appSignature";
import {
  configureDesktopLifecycle,
  configureQuickCaptureShortcut,
  getDesktopLifecycleStatus,
  getQuickCaptureStatus,
  showQuickCapture,
} from "../lib/api/windows";

const workingDays = [
  { label: "Mon", value: "monday" },
  { label: "Tue", value: "tuesday" },
  { label: "Wed", value: "wednesday" },
  { label: "Thu", value: "thursday" },
  { label: "Fri", value: "friday" },
  { label: "Sat", value: "saturday" },
  { label: "Sun", value: "sunday" },
];

const settingsSchema = z.object({
  name: z.string().trim().min(1, "Full name is required"),
  email: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || isEmailLike(value), {
      message: "Use a valid email address",
    }),
  useGravatarProfileImage: z.boolean(),
  defaultManagerName: z.string().optional(),
  gitAuthorEmail: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || isEmailLike(value), {
      message: "Use a valid email address",
    }),
  defaultReportTemplate: z.enum([
    "professional_weekly_summary",
    "project_based",
    "concise_manager_update",
  ]),
  workingDays: z.array(z.string()).min(1, "Select at least one working day"),
  dailyWorkMinutes: z.number().min(60).max(960),
  theme: z.enum(["dark", "light", "system"]),
  announcementsEnabled: z.boolean(),
  announcementVolume: z.number().min(0).max(1),
  announcementVoice: z.string(),
  announceFocusEvents: z.boolean(),
  announceNudges: z.boolean(),
  announceSyncResults: z.boolean(),
  announceTaskChanges: z.boolean(),
  voiceCommandsEnabled: z.boolean(),
  voiceCommandMode: z.enum(["push_to_talk"]),
  voiceCommandConfirmBeforeAction: z.boolean(),
  voiceTranscriptionProvider: z.enum(["local_whisper", "groq", "openrouter"]),
  voiceOnlineAllowed: z.boolean(),
  voicePrivacyAcknowledged: z.boolean(),
  voiceGroqModel: z.string(),
  voiceOpenrouterModel: z.string(),
  reportAiEnabled: z.boolean(),
  reportAiProvider: z.enum(["local_llama_cpp", "openrouter_free", "groq", "nvidia_build"]),
  reportAiOnlineAllowed: z.boolean(),
  reportAiPrivacyAcknowledged: z.boolean(),
  reportAiLocalModelPath: z.string(),
  reportAiGroqModel: z.string(),
  reportAiNvidiaModel: z.string(),
  embeddingsEnabled: z.boolean(),
  embeddingProvider: z.enum(["native_local", "local_endpoint", "openai_compatible"]),
  embeddingLocalEndpoint: z.string(),
  embeddingOnlineEndpoint: z.string(),
  embeddingModel: z.string(),
  embeddingOnlineAllowed: z.boolean(),
  embeddingPrivacyAcknowledged: z.boolean(),
  quickCaptureEnabled: z.boolean(),
  quickCaptureShortcut: z.string().trim().min(1, "Shortcut is required"),
  quickCaptureIncludeInReport: z.boolean(),
  startupEnabled: z.boolean(),
  startMinimizedToTray: z.boolean(),
  minimizeToTrayOnClose: z.boolean(),
  priorityRemindersEnabled: z.boolean(),
  priorityReminderDesktopEnabled: z.boolean(),
  priorityReminderCheckpoints: z.string().trim().min(1, "Add at least one checkpoint"),
  priorityReminderSnoozeMinutes: z.number().min(5).max(480),
  priorityReminderQuietStart: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  priorityReminderQuietEnd: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  sparcForceAddonEnabled: z.boolean(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;
type SettingsTab = "general" | "work" | "audio" | "integrations" | "reporting" | "portability";
type IntegrationPanel =
  | "github"
  | "sparcForce"
  | "git"
  | "calendar"
  | "voice"
  | "openrouter"
  | "groq"
  | "nvidiaBuild"
  | null;

const settingsTabs: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "work", label: "Work Preferences" },
  { id: "audio", label: "Audio & Voice" },
  { id: "integrations", label: "Integrations" },
  { id: "reporting", label: "Reporting" },
  { id: "portability", label: "Import / Export" },
];

export function SettingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const speech = useSpeech();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [activeIntegrationPanel, setActiveIntegrationPanel] =
    useState<IntegrationPanel>(null);
  const integrationSetupPanelRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });
  const githubStatusQuery = useQuery({
    queryKey: ["githubIntegrationStatus"],
    queryFn: getGitHubIntegrationStatus,
  });
  const [githubToken, setGithubToken] = useState("");
  const sparcForceStatusQuery = useQuery({
    queryKey: ["sparcForceIntegrationStatus"],
    queryFn: getSparcForceIntegrationStatus,
  });
  const [sparcForceBaseUrl, setSparcForceBaseUrl] = useState("");
  const [sparcForceEmail, setSparcForceEmail] = useState("");
  const [sparcForcePassword, setSparcForcePassword] = useState("");
  const [sparcForceOtp, setSparcForceOtp] = useState("");
  const [sparcForceAddonCode, setSparcForceAddonCode] = useState("");
  const calendarSourcesQuery = useQuery({
    queryKey: ["calendarSources"],
    queryFn: listCalendarSources,
  });
  const [calendarEmail, setCalendarEmail] = useState("");
  const reportAiStatusQuery = useQuery({
    queryKey: ["reportAiStatus"],
    queryFn: getReportAiStatus,
  });
  const embeddingStatusQuery = useQuery({
    queryKey: ["embeddingStatus"],
    queryFn: getEmbeddingStatus,
  });
  const quickCaptureStatusQuery = useQuery({
    queryKey: ["quickCaptureStatus"],
    queryFn: getQuickCaptureStatus,
  });
  const desktopLifecycleStatusQuery = useQuery({
    queryKey: ["desktopLifecycleStatus"],
    queryFn: getDesktopLifecycleStatus,
  });
  const [openRouterKey, setOpenRouterKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [nvidiaBuildKey, setNvidiaBuildKey] = useState("");
  const [embeddingApiKey, setEmbeddingApiKey] = useState("");
  const [providerModels, setProviderModels] = useState<
    Partial<Record<ReportAiProvider, ReportAiModelList>>
  >({});

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      name: "",
      email: "",
      useGravatarProfileImage: false,
      defaultManagerName: "",
      gitAuthorEmail: "",
      defaultReportTemplate: "professional_weekly_summary",
      workingDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      dailyWorkMinutes: 480,
      theme: "dark",
      announcementsEnabled: true,
      announcementVolume: 0.8,
      announcementVoice: "",
      announceFocusEvents: true,
      announceNudges: true,
      announceSyncResults: true,
      announceTaskChanges: true,
      voiceCommandsEnabled: true,
      voiceCommandMode: "push_to_talk",
      voiceCommandConfirmBeforeAction: true,
      voiceTranscriptionProvider: "local_whisper",
      voiceOnlineAllowed: false,
      voicePrivacyAcknowledged: false,
      voiceGroqModel: "whisper-large-v3-turbo",
      voiceOpenrouterModel: "openai/whisper-1",
      reportAiEnabled: true,
      reportAiProvider: "local_llama_cpp",
      reportAiOnlineAllowed: false,
      reportAiPrivacyAcknowledged: false,
      reportAiLocalModelPath: "",
      reportAiGroqModel: "llama-3.1-8b-instant",
      reportAiNvidiaModel: "meta/llama-3.1-70b-instruct",
      embeddingsEnabled: false,
      embeddingProvider: "native_local",
      embeddingLocalEndpoint: "",
      embeddingOnlineEndpoint: "https://api.openai.com/v1/embeddings",
      embeddingModel: "BGESmallENV15",
      embeddingOnlineAllowed: false,
      embeddingPrivacyAcknowledged: false,
      quickCaptureEnabled: true,
      quickCaptureShortcut: "CommandOrControl+Shift+Space",
      quickCaptureIncludeInReport: true,
      priorityRemindersEnabled: true,
      priorityReminderDesktopEnabled: false,
      priorityReminderCheckpoints: "10:00, 13:00, 16:00",
      priorityReminderSnoozeMinutes: 45,
      priorityReminderQuietStart: "09:00",
      priorityReminderQuietEnd: "17:30",
      sparcForceAddonEnabled: false,
    },
  });
  const selectedTheme = form.watch("theme");

  useEffect(() => {
    if (settingsQuery.data && !form.formState.isDirty) {
      form.reset(toFormValues(settingsQuery.data));
    }
  }, [form, form.formState.isDirty, settingsQuery.data]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(THEME_PREVIEW_EVENT, { detail: selectedTheme }));

    return () => {
      window.dispatchEvent(new CustomEvent(THEME_PREVIEW_EVENT, { detail: null }));
    };
  }, [selectedTheme]);

  useEffect(() => {
    const status = sparcForceStatusQuery.data;
    if (!status) return;
    if (status.baseUrl && !sparcForceBaseUrl) setSparcForceBaseUrl(status.baseUrl);
    if (status.accountEmail && !sparcForceEmail) setSparcForceEmail(status.accountEmail);
  }, [sparcForceBaseUrl, sparcForceEmail, sparcForceStatusQuery.data]);

  useEffect(() => {
    const state = location.state as {
      openIntegrationPanel?: IntegrationPanel;
      openSettingsTab?: SettingsTab;
    } | null;
    if (state?.openSettingsTab) {
      setActiveTab(state.openSettingsTab);
    }
    const canOpenSparcForce =
      form.getValues("sparcForceAddonEnabled") ||
      sparcForceStatusQuery.data?.addonEnabled ||
      sparcForceStatusQuery.data?.connected;
    if (state?.openIntegrationPanel === "sparcForce" && canOpenSparcForce) {
      setActiveTab("integrations");
      setActiveIntegrationPanel("sparcForce");
    }
  }, [form, location.state, sparcForceStatusQuery.data]);

  useEffect(() => {
    if (!activeIntegrationPanel || activeTab !== "integrations") return;
    const scrollTimer = window.setTimeout(() => {
      integrationSetupPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }, 0);

    return () => window.clearTimeout(scrollTimer);
  }, [activeIntegrationPanel, activeTab]);

  const saveMutation = useMutation({
    mutationFn: (values: SettingsFormValues) =>
      updateSettings({
        name: values.name,
        email: values.email ?? "",
        useGravatarProfileImage: values.useGravatarProfileImage,
        defaultManagerName: values.defaultManagerName ?? "",
        gitAuthorEmail: values.gitAuthorEmail ?? "",
        defaultReportTemplate: values.defaultReportTemplate,
        workingDays: values.workingDays,
        dailyWorkMinutes: values.dailyWorkMinutes,
        theme: values.theme,
        announcementsEnabled: values.announcementsEnabled,
        announcementVolume: values.announcementVolume,
        announcementVoice: values.announcementVoice,
        announceFocusEvents: values.announceFocusEvents,
        announceNudges: values.announceNudges,
        announceSyncResults: values.announceSyncResults,
        announceTaskChanges: values.announceTaskChanges,
        voiceCommandsEnabled: values.voiceCommandsEnabled,
        voiceCommandMode: values.voiceCommandMode,
        voiceCommandConfirmBeforeAction: values.voiceCommandConfirmBeforeAction,
        voiceTranscriptionProvider: values.voiceTranscriptionProvider,
        voiceOnlineAllowed: values.voiceOnlineAllowed,
        voicePrivacyAcknowledged: values.voicePrivacyAcknowledged,
        voiceGroqModel: values.voiceGroqModel,
        voiceOpenrouterModel: values.voiceOpenrouterModel,
        reportAiEnabled: values.reportAiEnabled,
        reportAiProvider: values.reportAiProvider,
        reportAiOnlineAllowed: values.reportAiOnlineAllowed,
        reportAiPrivacyAcknowledged: values.reportAiPrivacyAcknowledged,
        reportAiLocalModelPath: values.reportAiLocalModelPath,
        reportAiGroqModel: values.reportAiGroqModel,
        reportAiNvidiaModel: values.reportAiNvidiaModel,
        embeddingsEnabled: values.embeddingsEnabled,
        embeddingProvider: values.embeddingProvider,
        embeddingLocalEndpoint: values.embeddingLocalEndpoint,
        embeddingOnlineEndpoint: values.embeddingOnlineEndpoint,
        embeddingModel: values.embeddingModel,
        embeddingOnlineAllowed: values.embeddingOnlineAllowed,
        embeddingPrivacyAcknowledged: values.embeddingPrivacyAcknowledged,
        quickCaptureEnabled: values.quickCaptureEnabled,
        quickCaptureShortcut: values.quickCaptureShortcut,
        quickCaptureIncludeInReport: values.quickCaptureIncludeInReport,
        startupEnabled: values.startupEnabled,
        startMinimizedToTray: values.startMinimizedToTray,
        minimizeToTrayOnClose: values.minimizeToTrayOnClose,
        priorityRemindersEnabled: values.priorityRemindersEnabled,
        priorityReminderDesktopEnabled: values.priorityReminderDesktopEnabled,
        priorityReminderCheckpoints: values.priorityReminderCheckpoints
          .split(",")
          .map((time) => time.trim())
          .filter(Boolean),
        priorityReminderSnoozeMinutes: values.priorityReminderSnoozeMinutes,
        priorityReminderQuietStart: values.priorityReminderQuietStart,
        priorityReminderQuietEnd: values.priorityReminderQuietEnd,
        sparcForceAddonEnabled: values.sparcForceAddonEnabled,
    }),
    onSuccess: async (settings) => {
      await configureQuickCaptureShortcut({
        enabled: settings.quickCaptureEnabled,
        shortcut: settings.quickCaptureShortcut,
      }).catch(() => null);
      await configureDesktopLifecycle({
        startupEnabled: settings.startupEnabled,
        startMinimizedToTray: settings.startMinimizedToTray,
        minimizeToTrayOnClose: settings.minimizeToTrayOnClose,
      }).catch(() => null);
      form.reset(toFormValues(settings));
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      await queryClient.invalidateQueries({ queryKey: ["quickCaptureStatus"] });
      await queryClient.invalidateQueries({ queryKey: ["desktopLifecycleStatus"] });
      toast.success("Preferences saved", "Settings have been updated.");
    },
    onError: (error) => {
      toast.error("Settings failed", error instanceof Error ? error.message : "Settings could not be saved.");
    },
  });
  const exportMutation = useMutation({
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
      toast.error("Export failed", error instanceof Error ? error.message : "Settings could not be exported.");
    },
  });
  const importMutation = useMutation({
    mutationFn: importSettings,
    onSuccess: async (result) => {
      form.reset(toFormValues(result.settings));
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Settings imported", result.warnings[0] ?? "Your saved WorkTrace settings were loaded.");
    },
    onError: (error) => {
      toast.error("Import failed", error instanceof Error ? error.message : "Settings could not be imported.");
    },
  });
  const connectCalendarMutation = useMutation({
    mutationFn: () => connectGoogleCalendar({ accountEmail: calendarEmail || null }),
    onSuccess: async () => {
      setCalendarEmail("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["calendarSources"] }),
        queryClient.invalidateQueries({ queryKey: ["weekCapacity"] }),
      ]);
      toast.success("Google Calendar connected");
    },
    onError: (error) => {
      toast.error("Calendar connect failed", error instanceof Error ? error.message : "Google Calendar could not be connected.");
    },
  });
  const syncCalendarMutation = useMutation({
    mutationFn: (sourceId?: string) =>
      syncCalendarEvents({
        sourceId,
        from: new Date().toISOString().slice(0, 10),
        to: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      }),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["calendarSources"] }),
        queryClient.invalidateQueries({ queryKey: ["weekCapacity"] }),
      ]);
      toast.success("Calendar sync checked", result.message);
    },
    onError: (error) => {
      toast.error("Calendar sync failed", error instanceof Error ? error.message : "Google Calendar could not sync.");
    },
  });
  const disconnectCalendarMutation = useMutation({
    mutationFn: (sourceId: string) => disconnectCalendarSource({ sourceId }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["calendarSources"] }),
        queryClient.invalidateQueries({ queryKey: ["weekCapacity"] }),
      ]);
      toast.success("Calendar disconnected");
    },
    onError: (error) => {
      toast.error("Calendar disconnect failed", error instanceof Error ? error.message : "Google Calendar could not be disconnected.");
    },
  });
  const connectGithubMutation = useMutation({
    mutationFn: () => connectGitHubPat({ token: githubToken }),
    onSuccess: async () => {
      setGithubToken("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["githubIntegrationStatus"] }),
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
      ]);
      toast.success("GitHub connected", "WorkTrace can now create pull requests.");
    },
    onError: (error) => {
      toast.error("GitHub connect failed", error instanceof Error ? error.message : "The token could not be validated.");
    },
  });
  const testGithubMutation = useMutation({
    mutationFn: testGitHubConnection,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["githubIntegrationStatus"] }),
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
      ]);
      toast.success("GitHub connection verified");
    },
    onError: (error) => {
      toast.error("GitHub test failed", error instanceof Error ? error.message : "The connection could not be verified.");
    },
  });
  const disconnectGithubMutation = useMutation({
    mutationFn: disconnectGitHub,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["githubIntegrationStatus"] }),
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
      ]);
      toast.success("GitHub disconnected");
    },
    onError: (error) => {
      toast.error("Disconnect failed", error instanceof Error ? error.message : "GitHub could not be disconnected.");
    },
  });
  const connectSparcForceMutation = useMutation({
    mutationFn: () =>
      connectSparcForce({
        baseUrl: sparcForceBaseUrl,
        email: sparcForceEmail,
        password: sparcForcePassword,
      }),
    onSuccess: async (outcome) => {
      setSparcForcePassword("");
      await queryClient.invalidateQueries({ queryKey: ["sparcForceIntegrationStatus"] });
      if (outcome.status.baseUrl) setSparcForceBaseUrl(outcome.status.baseUrl);
      if (outcome.status.accountEmail) setSparcForceEmail(outcome.status.accountEmail);
      if (!outcome.otpRequired) setSparcForceOtp("");
      toast.success(outcome.otpRequired ? "OTP required" : "Sparc Force connected", outcome.message);
    },
    onError: (error) => {
      toast.error("Sparc Force connect failed", error instanceof Error ? error.message : "Sparc Force could not be connected.");
    },
  });
  const activateSparcForceAddonMutation = useMutation({
    mutationFn: () => activateSparcForceAddon(sparcForceAddonCode),
    onSuccess: async (settings) => {
      setSparcForceAddonCode("");
      form.reset(toFormValues(settings));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
        queryClient.invalidateQueries({ queryKey: ["sparcForceIntegrationStatus"] }),
      ]);
      toast.success("Add-on unlocked", "The Sparc Force integration is now available.");
    },
    onError: (error) => {
      toast.error("Unlock failed", error instanceof Error ? error.message : "Invalid add-on activation code.");
    },
  });
  const verifySparcForceOtpMutation = useMutation({
    mutationFn: () => verifySparcForceLoginOtp({ otpCode: sparcForceOtp }),
    onSuccess: async () => {
      setSparcForceOtp("");
      await queryClient.invalidateQueries({ queryKey: ["sparcForceIntegrationStatus"] });
      toast.success("Sparc Force connected", "OTP verified.");
    },
    onError: (error) => {
      toast.error("OTP verification failed", error instanceof Error ? error.message : "Sparc Force OTP could not be verified.");
    },
  });
  const testSparcForceMutation = useMutation({
    mutationFn: testSparcForceConnection,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sparcForceIntegrationStatus"] });
      toast.success("Sparc Force connection verified");
    },
    onError: (error) => {
      toast.error("Sparc Force test failed", error instanceof Error ? error.message : "The connection could not be verified.");
    },
  });
  const syncSparcForceMutation = useMutation({
    mutationFn: syncSparcForce,
    onMutate: () => {
      speech.announce(syncStartedAnnouncement("Sparc Force"), { category: "sync" });
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sparcForceIntegrationStatus"] }),
        queryClient.invalidateQueries({ queryKey: ["sparcForceRecords"] }),
      ]);
      toast.success("Sparc Force synced", result.message);
      speech.announce(sparcForceSyncAnnouncement(result), { category: "sync" });
    },
    onError: (error) => {
      toast.error("Sparc Force sync failed", error instanceof Error ? error.message : "Sparc Force data could not be imported.");
    },
  });
  const disconnectSparcForceMutation = useMutation({
    mutationFn: disconnectSparcForce,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sparcForceIntegrationStatus"] }),
        queryClient.invalidateQueries({ queryKey: ["sparcForceRecords"] }),
      ]);
      setSparcForcePassword("");
      setSparcForceOtp("");
      toast.success("Sparc Force disconnected");
    },
    onError: (error) => {
      toast.error("Sparc Force disconnect failed", error instanceof Error ? error.message : "Sparc Force could not be disconnected.");
    },
  });
  const connectAiMutation = useMutation({
    mutationFn: ({ provider, apiKey }: { provider: ReportAiProvider; apiKey: string }) =>
      connectReportAiProvider({ provider, apiKey }),
    onSuccess: async (_, variables) => {
      if (variables.provider === "openrouter_free") setOpenRouterKey("");
      if (variables.provider === "groq") setGroqKey("");
      if (variables.provider === "nvidia_build") setNvidiaBuildKey("");
      await reportAiStatusQuery.refetch();
      toast.success("AI provider connected");
    },
    onError: (error) => {
      toast.error("Provider connect failed", error instanceof Error ? error.message : "The provider key could not be stored.");
    },
  });
  const testAiMutation = useMutation({
    mutationFn: (provider: ReportAiProvider) => testReportAiProvider({ provider }),
    onSuccess: (message) => {
      toast.success("Provider ready", message);
    },
    onError: (error) => {
      toast.error("Provider test failed", error instanceof Error ? error.message : "The provider could not be tested.");
    },
  });
  const connectAndTestAiMutation = useMutation({
    mutationFn: async ({ provider, apiKey }: { provider: ReportAiProvider; apiKey: string }) => {
      await connectReportAiProvider({ provider, apiKey });
      return testReportAiProvider({ provider });
    },
    onSuccess: async (message, variables) => {
      if (variables.provider === "openrouter_free") setOpenRouterKey("");
      if (variables.provider === "groq") setGroqKey("");
      if (variables.provider === "nvidia_build") setNvidiaBuildKey("");
      await reportAiStatusQuery.refetch();
      toast.success("Provider connected", message);
    },
    onError: (error) => {
      toast.error("Provider test failed", error instanceof Error ? error.message : "The provider could not be connected and tested.");
    },
  });
  const disconnectAiMutation = useMutation({
    mutationFn: (provider: ReportAiProvider) => disconnectReportAiProvider({ provider }),
    onSuccess: async () => {
      await reportAiStatusQuery.refetch();
      toast.success("AI provider disconnected");
    },
    onError: (error) => {
      toast.error("Provider disconnect failed", error instanceof Error ? error.message : "The provider could not be disconnected.");
    },
  });
  const listModelsMutation = useMutation({
    mutationFn: (provider: ReportAiProvider) => listReportAiProviderModels({ provider }),
    onSuccess: (modelList, provider) => {
      setProviderModels((current) => ({ ...current, [provider]: modelList }));
      toast.success("Models refreshed", `${modelList.models.length} models loaded.`);
    },
    onError: (error) => {
      toast.error("Model refresh failed", error instanceof Error ? error.message : "Provider models could not be loaded.");
    },
  });
  const connectEmbeddingMutation = useMutation({
    mutationFn: (apiKey: string) => connectEmbeddingProvider({ apiKey }),
    onSuccess: async () => {
      setEmbeddingApiKey("");
      await embeddingStatusQuery.refetch();
      toast.success("Embedding provider connected");
    },
    onError: (error) => {
      toast.error("Embedding connect failed", error instanceof Error ? error.message : "The embedding key could not be stored.");
    },
  });
  const testEmbeddingMutation = useMutation({
    mutationFn: testEmbeddingProvider,
    onSuccess: (message) => {
      toast.success("Embedding provider ready", message);
    },
    onError: (error) => {
      toast.error("Embedding test failed", error instanceof Error ? error.message : "The embedding provider could not be tested.");
    },
  });
  const disconnectEmbeddingMutation = useMutation({
    mutationFn: disconnectEmbeddingProvider,
    onSuccess: async () => {
      await embeddingStatusQuery.refetch();
      toast.success("Embedding provider disconnected");
    },
    onError: (error) => {
      toast.error("Embedding disconnect failed", error instanceof Error ? error.message : "The embedding provider could not be disconnected.");
    },
  });

  const selectedWorkingDays = form.watch("workingDays");
  const profileName = form.watch("name");
  const profileEmail = form.watch("email") ?? "";
  const useGravatarProfileImage = form.watch("useGravatarProfileImage");
  const githubConnected = Boolean(githubStatusQuery.data?.connected);
  const sparcForceConnected = Boolean(sparcForceStatusQuery.data?.connected);
  const sparcForceAddonAvailable = Boolean(
    form.watch("sparcForceAddonEnabled") ||
      sparcForceStatusQuery.data?.addonEnabled ||
      sparcForceConnected,
  );
  const sparcForceOtpRequired = sparcForceStatusQuery.data?.status === "otp_required";
  const calendarConnected = Boolean(
    calendarSourcesQuery.data?.some((source) => source.syncStatus === "connected"),
  );
  const voiceConfigured = form.watch("voiceCommandsEnabled");
  const reportAiEnabled = form.watch("reportAiEnabled");
  const openRouterKeyConfigured = isProviderConfigured(
    reportAiStatusQuery.data,
    "openrouter_free",
  );
  const groqKeyConfigured = isProviderConfigured(reportAiStatusQuery.data, "groq");
  const nvidiaBuildKeyConfigured = isProviderConfigured(reportAiStatusQuery.data, "nvidia_build");
  const openRouterConfigured =
    openRouterKeyConfigured ||
    form.watch("reportAiProvider") === "openrouter_free" ||
    form.watch("voiceTranscriptionProvider") === "openrouter";
  const groqConfigured =
    groqKeyConfigured ||
    form.watch("reportAiProvider") === "groq" ||
    form.watch("voiceTranscriptionProvider") === "groq";
  const nvidiaBuildConfigured =
    nvidiaBuildKeyConfigured || form.watch("reportAiProvider") === "nvidia_build";
  const connectedIntegrationCount = [
    githubConnected,
    sparcForceAddonAvailable && sparcForceConnected,
    calendarConnected,
    voiceConfigured,
    reportAiEnabled,
    openRouterConfigured,
    groqConfigured,
    nvidiaBuildConfigured,
  ].filter(Boolean).length;
  const integrationTotal = sparcForceAddonAvailable ? 8 : 7;
  const lastSyncLabel =
    sparcForceAddonAvailable && sparcForceStatusQuery.data?.lastSyncedAt
      ? formatTimestamp(sparcForceStatusQuery.data.lastSyncedAt)
      : calendarSourcesQuery.data?.find((source) => source.lastSyncedAt)?.lastSyncedAt
      ? formatTimestamp(
          calendarSourcesQuery.data.find((source) => source.lastSyncedAt)!
            .lastSyncedAt!,
        )
      : githubStatusQuery.data?.lastValidatedAt
        ? formatTimestamp(githubStatusQuery.data.lastValidatedAt)
        : "Not synced yet";
  const activePanelPlacement = integrationPanelPlacement(activeIntegrationPanel);

  function renderIntegrationSetupPanel() {
    if (!activeIntegrationPanel) return null;

    return (
      <div ref={integrationSetupPanelRef}>
        <IntegrationSetupPanel
          activePanel={activeIntegrationPanel}
          githubToken={githubToken}
          setGithubToken={setGithubToken}
          connectGithubMutation={connectGithubMutation}
          testGithubMutation={testGithubMutation}
          githubConnected={githubConnected}
          githubError={githubStatusQuery.error}
          githubIsError={githubStatusQuery.isError}
          sparcForceStatus={sparcForceStatusQuery.data}
          sparcForceIsError={sparcForceStatusQuery.isError}
          sparcForceError={sparcForceStatusQuery.error}
          sparcForceBaseUrl={sparcForceBaseUrl}
          setSparcForceBaseUrl={setSparcForceBaseUrl}
          sparcForceEmail={sparcForceEmail}
          setSparcForceEmail={setSparcForceEmail}
          sparcForcePassword={sparcForcePassword}
          setSparcForcePassword={setSparcForcePassword}
          sparcForceOtp={sparcForceOtp}
          setSparcForceOtp={setSparcForceOtp}
          sparcForceOtpRequired={sparcForceOtpRequired}
          connectSparcForceMutation={connectSparcForceMutation}
          verifySparcForceOtpMutation={verifySparcForceOtpMutation}
          testSparcForceMutation={testSparcForceMutation}
          syncSparcForceMutation={syncSparcForceMutation}
          disconnectSparcForceMutation={disconnectSparcForceMutation}
          calendarEmail={calendarEmail}
          setCalendarEmail={setCalendarEmail}
          connectCalendarMutation={connectCalendarMutation}
          syncCalendarMutation={syncCalendarMutation}
          calendarSources={calendarSourcesQuery.data ?? []}
          calendarError={calendarSourcesQuery.error}
          calendarIsError={calendarSourcesQuery.isError}
          openRouterKey={openRouterKey}
          setOpenRouterKey={setOpenRouterKey}
          groqKey={groqKey}
          setGroqKey={setGroqKey}
          nvidiaBuildKey={nvidiaBuildKey}
          setNvidiaBuildKey={setNvidiaBuildKey}
          connectAiMutation={connectAiMutation}
          testAiMutation={testAiMutation}
          connectAndTestAiMutation={connectAndTestAiMutation}
          disconnectAiMutation={disconnectAiMutation}
          listModelsMutation={listModelsMutation}
          providerModels={providerModels}
          reportAiStatus={reportAiStatusQuery.data}
          selectedGroqModel={form.watch("reportAiGroqModel")}
          selectedOpenRouterModel={form.watch("voiceOpenrouterModel")}
          selectedNvidiaModel={form.watch("reportAiNvidiaModel")}
          onSelectModel={(provider, modelId) => {
            if (provider === "groq") {
              form.setValue("reportAiGroqModel", modelId, { shouldDirty: true });
              form.setValue("voiceGroqModel", modelId, { shouldDirty: true });
            }
            if (provider === "openrouter_free") {
              form.setValue("voiceOpenrouterModel", modelId, { shouldDirty: true });
            }
            if (provider === "nvidia_build") {
              form.setValue("reportAiNvidiaModel", modelId, { shouldDirty: true });
            }
          }}
          onClose={() => setActiveIntegrationPanel(null)}
          onOpenAudio={() => setActiveTab("audio")}
          onOpenReporting={() => setActiveTab("reporting")}
        />
      </div>
    );
  }

  function toggleWorkingDay(day: string) {
    const current = form.getValues("workingDays");
    const next = current.includes(day)
      ? current.filter((value) => value !== day)
      : [...current, day];

    form.setValue("workingDays", next, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  async function importSelectedFile(file: File | undefined) {
    if (!file) return;

    const payload = await file.text();
    importMutation.mutate(payload);
    if (importInputRef.current) {
      importInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={SettingsIcon}
        eyebrow="Local preferences"
        title="Settings"
        description="Profile, reporting defaults, Git author, working days, and appearance preferences stored locally in SQLite."
        actions={
          <>
            {saveMutation.isSuccess ? (
              <Badge tone="green">
                <Check className="mr-1 h-3 w-3" />
                Saved
              </Badge>
            ) : null}
            <Button
              type="submit"
              form="settings-form"
              variant="primary"
              disabled={saveMutation.isPending || settingsQuery.isLoading}
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </>
        }
      />

      <Panel className="p-2">
        <SegmentedTabs
          items={settingsTabs}
          value={activeTab}
          onChange={setActiveTab}
          fullWidth
        />
      </Panel>

      <form
        id="settings-form"
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
      >
        <div className="space-y-4">
          {activeTab === "general" ? (
          <>
            <Panel>
              <div className="mb-4 flex items-center gap-2 text-base font-semibold text-white">
                <User className="h-4 w-4 text-cyan-300" />
                Profile
              </div>
              <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                <ProfileImagePreview
                  name={profileName}
                  email={profileEmail}
                  enabled={useGravatarProfileImage}
                  onToggle={(checked) =>
                    form.setValue("useGravatarProfileImage", checked, { shouldDirty: true })
                  }
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Full Name" error={form.formState.errors.name?.message}>
                    <input
                      className={inputClass}
                      disabled={settingsQuery.isLoading}
                      {...form.register("name")}
                    />
                  </Field>
                  <Field
                    label="Email Address"
                    error={form.formState.errors.email?.message}
                  >
                    <input
                      className={inputClass}
                      disabled={settingsQuery.isLoading}
                      {...form.register("email")}
                    />
                  </Field>
                  <Field label="Default Manager">
                    <input
                      className={inputClass}
                      disabled={settingsQuery.isLoading}
                      placeholder="Manager name"
                      {...form.register("defaultManagerName")}
                    />
                  </Field>
                  <Field
                    label="Git Author Email"
                    error={form.formState.errors.gitAuthorEmail?.message}
                  >
                    <input
                      className={inputClass}
                      disabled={settingsQuery.isLoading}
                      placeholder="you@example.com"
                      {...form.register("gitAuthorEmail")}
                    />
                  </Field>
                </div>
              </div>
            </Panel>
            <Panel>
              <div className="mb-4 flex items-center gap-2 text-base font-semibold text-white">
                <Monitor className="h-4 w-4 text-cyan-300" />
                Appearance
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Theme Preference">
                  <SelectField
                    control={form.control}
                    name="theme"
                    disabled={settingsQuery.isLoading}
                    options={[
                      { value: "dark", label: "Dark", icon: Monitor },
                      { value: "light", label: "Light", icon: Monitor },
                      { value: "system", label: "System", icon: Monitor },
                    ]}
                    size="sm"
                  />
                </Field>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                System follows your OS preference and updates while WorkTrace is open.
              </p>
            </Panel>
            <Panel>
              <div className="mb-4 flex items-center gap-2 text-base font-semibold text-white">
                <Bell className="h-4 w-4 text-cyan-300" />
                Priority Reminders
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <ToggleField
                  label="Today focus reminders"
                  description="Remind me at work-block checkpoints when top priorities are still incomplete."
                  checked={form.watch("priorityRemindersEnabled")}
                  onChange={(checked) =>
                    form.setValue("priorityRemindersEnabled", checked, { shouldDirty: true })
                  }
                />
                <ToggleField
                  label="Desktop notifications"
                  description="Mirror due reminders as native OS notifications when permissions allow it."
                  checked={form.watch("priorityReminderDesktopEnabled")}
                  onChange={(checked) =>
                    form.setValue("priorityReminderDesktopEnabled", checked, { shouldDirty: true })
                  }
                />
                <Field label="Checkpoints" error={form.formState.errors.priorityReminderCheckpoints?.message}>
                  <input
                    className={inputClass}
                    disabled={settingsQuery.isLoading}
                    placeholder="10:00, 13:00, 16:00"
                    {...form.register("priorityReminderCheckpoints")}
                  />
                </Field>
                <Field label="Snooze minutes" error={form.formState.errors.priorityReminderSnoozeMinutes?.message}>
                  <input
                    className={inputClass}
                    type="number"
                    min={5}
                    max={480}
                    disabled={settingsQuery.isLoading}
                    {...form.register("priorityReminderSnoozeMinutes", { valueAsNumber: true })}
                  />
                </Field>
                <Field label="Quiet start" error={form.formState.errors.priorityReminderQuietStart?.message}>
                  <input className={inputClass} type="time" disabled={settingsQuery.isLoading} {...form.register("priorityReminderQuietStart")} />
                </Field>
                <Field label="Quiet end" error={form.formState.errors.priorityReminderQuietEnd?.message}>
                  <input className={inputClass} type="time" disabled={settingsQuery.isLoading} {...form.register("priorityReminderQuietEnd")} />
                </Field>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                In-app reminders are always local. Desktop notifications may ask the OS for permission the first time they are shown.
              </p>
            </Panel>
            <Panel>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-base font-semibold text-white">
                  <Keyboard className="h-4 w-4 text-cyan-300" />
                  Quick Capture
                </div>
                <Badge tone={quickCaptureStatusQuery.data?.registered ? "green" : "orange"}>
                  {quickCaptureStatusQuery.data?.registered ? "Shortcut active" : "Shortcut inactive"}
                </Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <ToggleField
                  label="Global quick capture"
                  description="Open a small capture window from anywhere and save non-code work as a local manual log."
                  checked={form.watch("quickCaptureEnabled")}
                  onChange={(checked) =>
                    form.setValue("quickCaptureEnabled", checked, { shouldDirty: true })
                  }
                />
                <ToggleField
                  label="Include captures in reports"
                  description="New quick captures are report-ready by default."
                  checked={form.watch("quickCaptureIncludeInReport")}
                  onChange={(checked) =>
                    form.setValue("quickCaptureIncludeInReport", checked, { shouldDirty: true })
                  }
                />
                <Field label="Shortcut" error={form.formState.errors.quickCaptureShortcut?.message}>
                  <input
                    className={inputClass}
                    disabled={settingsQuery.isLoading}
                    placeholder="CommandOrControl+Shift+Space"
                    {...form.register("quickCaptureShortcut")}
                  />
                </Field>
                <div className="flex items-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => showQuickCapture()}>
                    Test Capture
                  </Button>
                </div>
              </div>
              {quickCaptureStatusQuery.data?.lastError ? (
                <p className="mt-3 rounded-xl border border-orange-300/20 bg-orange-500/10 p-3 text-xs leading-5 text-orange-100">
                  {quickCaptureStatusQuery.data.lastError}
                </p>
              ) : null}
            </Panel>
            <Panel>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-base font-semibold text-white">
                  <Monitor className="h-4 w-4 text-cyan-300" />
                  Background Mode
                </div>
                <Badge tone={desktopLifecycleStatusQuery.data?.autostartRegistered ? "green" : "slate"}>
                  {desktopLifecycleStatusQuery.data?.autostartRegistered ? "Starts with Windows" : "Tray ready"}
                </Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <ToggleField
                  label="Start with Windows"
                  description="Register WorkTrace to launch when you sign in. This stays off until you choose it."
                  checked={form.watch("startupEnabled")}
                  onChange={(checked) =>
                    form.setValue("startupEnabled", checked, { shouldDirty: true })
                  }
                />
                <ToggleField
                  label="Start in tray"
                  description="Windows startup opens WorkTrace quietly in the tray instead of showing the main window."
                  checked={form.watch("startMinimizedToTray")}
                  onChange={(checked) =>
                    form.setValue("startMinimizedToTray", checked, { shouldDirty: true })
                  }
                />
                <ToggleField
                  label="Close to tray"
                  description="The window close button keeps WorkTrace running for quick capture and reminders."
                  checked={form.watch("minimizeToTrayOnClose")}
                  onChange={(checked) =>
                    form.setValue("minimizeToTrayOnClose", checked, { shouldDirty: true })
                  }
                />
              </div>
              {desktopLifecycleStatusQuery.data?.lastError ? (
                <p className="mt-3 rounded-xl border border-orange-300/20 bg-orange-500/10 p-3 text-xs leading-5 text-orange-100">
                  {desktopLifecycleStatusQuery.data.lastError}
                </p>
              ) : null}
            </Panel>
            <Panel>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-base font-semibold text-white">
                    <Sparkles className="h-4 w-4 text-cyan-300" />
                    Application Signature
                </div>
                <p className="text-sm text-slate-300">{appSignature.developerCredit}</p>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
                  This credit is included in the application metadata, Git metadata, and installer bundle.
                </p>
              </div>
              <a
                href={appSignature.developerProfileUrl}
                target="_blank"
                rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:border-cyan-300/35 hover:bg-cyan-300/15"
                >
                  GitHub profile
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </Panel>
          </>
          ) : null}

          {activeTab === "portability" ? (
          <Panel className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-3 flex items-center gap-2 text-base font-semibold text-white">
                  <FileJson className="h-4 w-4 text-cyan-300" />
                  Settings Import / Export
                </div>
                <p className="max-w-2xl text-sm leading-6 text-slate-400">
                  Export a WorkTrace settings file before reinstalling, then import it on the fresh install to restore preferences, backup setup, integrations, voice, reporting, and onboarding state.
                </p>
              </div>
              <Badge tone="cyan">JSON</Badge>
            </div>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                void importSelectedFile(event.currentTarget.files?.[0]);
              }}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                disabled={exportMutation.isPending || settingsQuery.isLoading}
                onClick={() => exportMutation.mutate()}
                className="flex min-h-24 items-center gap-4 rounded-xl border border-white/10 bg-slate-950/45 p-4 text-left transition hover:border-cyan-300/25 hover:bg-cyan-300/5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
                  <Download className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-white">
                    {exportMutation.isPending ? "Exporting settings..." : "Export Settings"}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-400">
                    Download a portable file for reinstall or device migration.
                  </span>
                </span>
              </button>
              <button
                type="button"
                disabled={importMutation.isPending}
                onClick={() => importInputRef.current?.click()}
                className="flex min-h-24 items-center gap-4 rounded-xl border border-white/10 bg-slate-950/45 p-4 text-left transition hover:border-blue-300/25 hover:bg-blue-400/5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-blue-300/20 bg-blue-400/10 text-blue-100">
                  <Upload className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-white">
                    {importMutation.isPending ? "Importing settings..." : "Import Settings"}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-400">
                    Load a WorkTrace settings export from disk.
                  </span>
                </span>
              </button>
            </div>
            {importMutation.data?.warnings.length ? (
              <div className="rounded-lg border border-orange-300/20 bg-orange-500/10 px-3 py-2 text-xs leading-5 text-orange-100">
                {importMutation.data.warnings.join(" ")}
              </div>
            ) : null}
          </Panel>
          ) : null}

          {activeTab === "audio" ? (
          <Panel>
            <div className="mb-4 flex items-center gap-2 text-base font-semibold text-white">
              <Volume2 className="h-4 w-4 text-cyan-300" />
              Audio & Voice
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <ToggleField
                label="Spoken announcements"
                description="Read out focus, sync, nudge, and task updates with installed system voices."
                checked={form.watch("announcementsEnabled")}
                onChange={(checked) =>
                  form.setValue("announcementsEnabled", checked, { shouldDirty: true })
                }
              />
              <ToggleField
                label="Voice commands"
                description="Use push-to-talk microphone capture and the local Whisper sidecar."
                checked={form.watch("voiceCommandsEnabled")}
                onChange={(checked) =>
                  form.setValue("voiceCommandsEnabled", checked, { shouldDirty: true })
                }
              />
              <Field label="Announcement Voice">
                <select
                  className={inputClass}
                  disabled={settingsQuery.isLoading || !speech.isSpeechSynthesisAvailable}
                  {...form.register("announcementVoice")}
                >
                  <option value="">System default</option>
                  {speech.voices.map((voice) => (
                    <option key={`${voice.name}-${voice.lang}`} value={voice.name}>
                      {voice.name} ({voice.lang})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`Announcement Volume (${Math.round(form.watch("announcementVolume") * 100)}%)`}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  className="h-10 w-full accent-cyan-300"
                  disabled={settingsQuery.isLoading}
                  {...form.register("announcementVolume", { valueAsNumber: true })}
                />
              </Field>
              <Field label="Voice Transcription">
                <SelectField
                  control={form.control}
                  name="voiceTranscriptionProvider"
                  disabled={settingsQuery.isLoading}
                  options={[
                    { value: "local_whisper", label: "Local Whisper", icon: Monitor },
                    { value: "groq", label: "Groq Whisper", icon: PlugZap },
                    { value: "openrouter", label: "OpenRouter STT", icon: PlugZap },
                  ]}
                  size="sm"
                />
              </Field>
              <ToggleField
                label="Allow online voice"
                description="Permit push-to-talk audio to be sent to Groq or OpenRouter for transcription."
                checked={form.watch("voiceOnlineAllowed")}
                onChange={(checked) =>
                  form.setValue("voiceOnlineAllowed", checked, { shouldDirty: true })
                }
              />
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              <ToggleField
                label="Announce focus events"
                description="Speak when focus sessions start, stop, or cancel."
                checked={form.watch("announceFocusEvents")}
                onChange={(checked) =>
                  form.setValue("announceFocusEvents", checked, { shouldDirty: true })
                }
              />
              <ToggleField
                label="Announce sync results"
                description="Speak repository sync summaries after manual voice or command syncs."
                checked={form.watch("announceSyncResults")}
                onChange={(checked) =>
                  form.setValue("announceSyncResults", checked, { shouldDirty: true })
                }
              />
              <ToggleField
                label="Announce task changes"
                description="Speak when tasks are added or updated."
                checked={form.watch("announceTaskChanges")}
                onChange={(checked) =>
                  form.setValue("announceTaskChanges", checked, { shouldDirty: true })
                }
              />
              <ToggleField
                label="Confirm captured actions"
                description="Ask before running voice-created task, log, or focus commands."
                checked={form.watch("voiceCommandConfirmBeforeAction")}
                onChange={(checked) =>
                  form.setValue("voiceCommandConfirmBeforeAction", checked, { shouldDirty: true })
                }
              />
              <ToggleField
                label="Announce nudges"
                description="Reserved for quiet nudge readouts when nudge timing is enabled."
                checked={form.watch("announceNudges")}
                onChange={(checked) =>
                  form.setValue("announceNudges", checked, { shouldDirty: true })
                }
              />
              <ToggleField
                label="Voice privacy acknowledgement"
                description="I understand online voice sends recorded command audio to the chosen transcription provider."
                checked={form.watch("voicePrivacyAcknowledged")}
                onChange={(checked) =>
                  form.setValue("voicePrivacyAcknowledged", checked, { shouldDirty: true })
                }
              />
              <Field label="Groq Voice Model">
                <input
                  className={inputClass}
                  disabled={settingsQuery.isLoading}
                  placeholder="whisper-large-v3-turbo"
                  {...form.register("voiceGroqModel")}
                />
              </Field>
              <Field label="OpenRouter Voice Model">
                <input
                  className={inputClass}
                  disabled={settingsQuery.isLoading}
                  placeholder="openai/whisper-1"
                  {...form.register("voiceOpenrouterModel")}
                />
              </Field>
              <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/5 p-3 text-xs leading-5 text-cyan-100/80">
                <div className="mb-1 flex items-center gap-2 font-semibold text-cyan-100">
                  <Mic className="h-3.5 w-3.5" />
                  Push-to-talk
                </div>
                Voice command mode is fixed to push-to-talk for v1. Online transcription reuses the OpenRouter/Groq keys stored for report AI.
              </div>
            </div>
          </Panel>
          ) : null}

          {activeTab === "reporting" ? (
          <Panel>
            <div className="mb-4 flex items-center gap-2 text-base font-semibold text-white">
              <Sparkles className="h-4 w-4 text-cyan-300" />
              Report Intelligence
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <ToggleField
                label="AI report polish"
                description="Enable offline-first report polish and readiness analysis."
                checked={form.watch("reportAiEnabled")}
                onChange={(checked) =>
                  form.setValue("reportAiEnabled", checked, { shouldDirty: true })
                }
              />
              <ToggleField
                label="Allow online providers"
                description="Permit selected report drafts and context to be sent to OpenRouter, Groq, or NVIDIA Build."
                checked={form.watch("reportAiOnlineAllowed")}
                onChange={(checked) =>
                  form.setValue("reportAiOnlineAllowed", checked, { shouldDirty: true })
                }
              />
              <Field label="Preferred Provider">
                <SelectField
                  control={form.control}
                  name="reportAiProvider"
                  disabled={settingsQuery.isLoading}
                  options={[
                    { value: "local_llama_cpp", label: "Local llama.cpp", icon: Monitor },
                    { value: "openrouter_free", label: "OpenRouter free router", icon: PlugZap },
                    { value: "groq", label: "Groq", icon: PlugZap },
                    { value: "nvidia_build", label: "NVIDIA Build", icon: PlugZap },
                  ]}
                  size="sm"
                />
              </Field>
              <ToggleField
                label="Online privacy acknowledgement"
                description="I understand online AI sends selected report context to the chosen provider."
                checked={form.watch("reportAiPrivacyAcknowledged")}
                onChange={(checked) =>
                  form.setValue("reportAiPrivacyAcknowledged", checked, { shouldDirty: true })
                }
              />
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Local Offline Runtime</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      Use this when `Local llama.cpp` is selected.
                    </p>
                  </div>
                  <Badge tone={form.watch("reportAiProvider") === "local_llama_cpp" ? "green" : "slate"}>
                    {form.watch("reportAiProvider") === "local_llama_cpp" ? "Selected" : "Optional"}
                  </Badge>
                </div>
                <Field label="Local GGUF Model Path">
                  <input
                    className={inputClass}
                    disabled={settingsQuery.isLoading}
                    placeholder="C:\\models\\qwen-report.Q4_K_M.gguf"
                    {...form.register("reportAiLocalModelPath")}
                  />
                </Field>
              </div>

              <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/5 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Online Provider Keys</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      Connect OpenRouter, Groq, or NVIDIA Build here. Keys stay in OS credential storage and are never returned to the UI.
                    </p>
                  </div>
                  <Badge tone={form.watch("reportAiOnlineAllowed") ? "blue" : "slate"}>
                    {form.watch("reportAiOnlineAllowed") ? "Online allowed" : "Offline first"}
                  </Badge>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <ProviderKeyRow
                    label="OpenRouter"
                    value={openRouterKey}
                    status={providerStatus(reportAiStatusQuery.data, "openrouter_free")}
                    configured={isProviderConfigured(reportAiStatusQuery.data, "openrouter_free")}
                    isPending={connectAiMutation.isPending || testAiMutation.isPending || disconnectAiMutation.isPending}
                    onChange={setOpenRouterKey}
                    onConnect={() =>
                      connectAiMutation.mutate({ provider: "openrouter_free", apiKey: openRouterKey })
                    }
                    onTest={() => testAiMutation.mutate("openrouter_free")}
                    onDisconnect={() => disconnectAiMutation.mutate("openrouter_free")}
                  />
                  <ProviderKeyRow
                    label="Groq"
                    value={groqKey}
                    status={providerStatus(reportAiStatusQuery.data, "groq")}
                    configured={isProviderConfigured(reportAiStatusQuery.data, "groq")}
                    isPending={connectAiMutation.isPending || testAiMutation.isPending || disconnectAiMutation.isPending}
                    onChange={setGroqKey}
                    onConnect={() => connectAiMutation.mutate({ provider: "groq", apiKey: groqKey })}
                    onTest={() => testAiMutation.mutate("groq")}
                    onDisconnect={() => disconnectAiMutation.mutate("groq")}
                  />
                  <ProviderKeyRow
                    label="NVIDIA Build"
                    value={nvidiaBuildKey}
                    status={providerStatus(reportAiStatusQuery.data, "nvidia_build")}
                    configured={isProviderConfigured(reportAiStatusQuery.data, "nvidia_build")}
                    isPending={connectAiMutation.isPending || testAiMutation.isPending || disconnectAiMutation.isPending}
                    onChange={setNvidiaBuildKey}
                    onConnect={() =>
                      connectAiMutation.mutate({ provider: "nvidia_build", apiKey: nvidiaBuildKey })
                    }
                    onTest={() => testAiMutation.mutate("nvidia_build")}
                    onDisconnect={() => disconnectAiMutation.mutate("nvidia_build")}
                  />
                </div>
                <div className="mt-4">
                  <Field label="Groq Report Model">
                    <input
                      className={inputClass}
                      disabled={settingsQuery.isLoading}
                      placeholder="llama-3.1-8b-instant"
                      {...form.register("reportAiGroqModel")}
                    />
                  </Field>
                  <Field label="NVIDIA Build Report Model">
                    <input
                      className={inputClass}
                      disabled={settingsQuery.isLoading}
                      placeholder="meta/llama-3.1-70b-instruct"
                      {...form.register("reportAiNvidiaModel")}
                    />
                  </Field>
                </div>
              </div>
            </div>
          </Panel>
          ) : null}

          {activeTab === "reporting" ? (
          <Panel>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-base font-semibold text-white">
                <Search className="h-4 w-4 text-cyan-300" />
                Semantic Grouping
              </div>
              <Badge tone={embeddingStatusQuery.data?.available ? "green" : "slate"}>
                {embeddingStatusQuery.data?.message ?? "Local endpoint optional"}
              </Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <ToggleField
                label="Embeddings"
                description="Use semantic similarity as a supporting signal for grouping and timeline search."
                checked={form.watch("embeddingsEnabled")}
                onChange={(checked) =>
                  form.setValue("embeddingsEnabled", checked, { shouldDirty: true })
                }
              />
              <Field label="Provider">
                <SelectField
                  control={form.control}
                  name="embeddingProvider"
                  disabled={settingsQuery.isLoading}
                  options={[
                    { value: "native_local", label: "Native local", icon: Database },
                    { value: "local_endpoint", label: "Local endpoint", icon: Monitor },
                    { value: "openai_compatible", label: "OpenAI-compatible", icon: PlugZap },
                  ]}
                  size="sm"
                />
              </Field>
              <Field label="Local Endpoint">
                <input
                  className={inputClass}
                  disabled={settingsQuery.isLoading}
                  placeholder="http://127.0.0.1:11434/v1/embeddings"
                  {...form.register("embeddingLocalEndpoint")}
                />
              </Field>
              <Field label="Embedding Model">
                <input
                  className={inputClass}
                  disabled={settingsQuery.isLoading}
                  placeholder="BGESmallENV15"
                  {...form.register("embeddingModel")}
                />
              </Field>
              <Field label="Online Endpoint">
                <input
                  className={inputClass}
                  disabled={settingsQuery.isLoading}
                  placeholder="https://api.openai.com/v1/embeddings"
                  {...form.register("embeddingOnlineEndpoint")}
                />
              </Field>
              <ToggleField
                label="Allow online fallback"
                description="Permit privacy-bounded embedding payloads to be sent to the online endpoint."
                checked={form.watch("embeddingOnlineAllowed")}
                onChange={(checked) =>
                  form.setValue("embeddingOnlineAllowed", checked, { shouldDirty: true })
                }
              />
              <ToggleField
                label="Embedding privacy acknowledgement"
                description="I understand online embeddings may send titles, paths, summaries, and bounded context to the provider."
                checked={form.watch("embeddingPrivacyAcknowledged")}
                onChange={(checked) =>
                  form.setValue("embeddingPrivacyAcknowledged", checked, { shouldDirty: true })
                }
              />
              <ProviderKeyRow
                label="Online Embeddings"
                value={embeddingApiKey}
                status={embeddingStatusQuery.data?.message ?? "Status unavailable."}
                configured={embeddingStatusQuery.data?.configured ?? false}
                isPending={connectEmbeddingMutation.isPending || testEmbeddingMutation.isPending || disconnectEmbeddingMutation.isPending}
                onChange={setEmbeddingApiKey}
                onConnect={() => connectEmbeddingMutation.mutate(embeddingApiKey)}
                onTest={() => testEmbeddingMutation.mutate()}
                onDisconnect={() => disconnectEmbeddingMutation.mutate()}
              />
            </div>
          </Panel>
          ) : null}

          {activeTab === "reporting" ? (
          <Panel>
            <div className="mb-4 flex items-center gap-2 text-base font-semibold text-white">
              <Mail className="h-4 w-4 text-cyan-300" />
              Reporting Defaults
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Default Report Template">
                <SelectField
                  control={form.control}
                  name="defaultReportTemplate"
                  disabled={settingsQuery.isLoading}
                  options={[
                    { value: "professional_weekly_summary", label: "Professional weekly summary", icon: FileText },
                    { value: "project_based", label: "Project based", icon: FileText },
                    { value: "concise_manager_update", label: "Concise manager update", icon: FileText },
                  ]}
                  size="sm"
                />
              </Field>
            </div>
          </Panel>
          ) : null}

          {activeTab === "integrations" ? (
          <Panel className="p-0">
            <div className="border-b border-[var(--wt-border)] bg-[linear-gradient(90deg,color-mix(in_oklch,var(--wt-accent)_10%,transparent),color-mix(in_oklch,oklch(0.7_0.12_190)_8%,transparent),transparent)] px-5 py-5">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_240px_280px_240px] xl:items-center">
                <div className="flex items-center gap-5">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-blue-300/10 bg-blue-400/10 shadow-lg shadow-blue-500/10">
                    <PlugZap className="h-9 w-9 text-blue-200" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Integrations</h2>
                    <p className="mt-1 max-w-md text-xs leading-5 text-slate-400">
                      Connect your favorite tools and services to automate workflows and enhance productivity.
                    </p>
                  </div>
                </div>
                <IntegrationMetric
                  value={String(connectedIntegrationCount)}
                  label="Connected"
                  detail={`of ${integrationTotal} integrations`}
                  tone="green"
                />
                <IntegrationMetric
                  value="Last sync"
                  label={lastSyncLabel}
                  detail={
                    calendarSourcesQuery.isFetching || githubStatusQuery.isFetching
                      ? "Checking systems"
                      : "All systems operational"
                  }
                  tone="cyan"
                />
                <IntegrationMetric
                  value="Secure"
                  label="Your data is encrypted"
                  detail="and private"
                  tone="blue"
                />
              </div>
            </div>

            <div className="px-5 py-5">
            <section>
              <h3 className="mb-3 text-sm font-semibold text-white">Development Tools</h3>
              <div className="grid gap-4 xl:grid-cols-3">
                <IntegrationCard
                  icon={<BrandIcon icon={siGithub} />}
                  title="GitHub"
                  connected={githubConnected}
                  description="Sync commits, pull requests, and repository activity to track your development work."
                  primaryLabel="Manage"
                  primaryIcon
                  onPrimary={() => setActiveIntegrationPanel("github")}
                  dangerLabel={githubConnected ? "Disconnect" : undefined}
                  onDanger={() => disconnectGithubMutation.mutate()}
                  disabledDanger={disconnectGithubMutation.isPending}
                />
                {sparcForceAddonAvailable ? (
                  <IntegrationCard
                    icon={<PlugZap className="h-8 w-8 text-cyan-300" />}
                    title="Sparc Force"
                    connected={sparcForceConnected}
                    description="Import read-only cases, projects, project tasks, and standalone tasks from Sparc Force."
                    primaryLabel="Manage"
                    primaryIcon
                    onPrimary={() => setActiveIntegrationPanel("sparcForce")}
                    dangerLabel={sparcForceConnected ? "Disconnect" : undefined}
                    onDanger={() => disconnectSparcForceMutation.mutate()}
                    disabledDanger={disconnectSparcForceMutation.isPending}
                  />
                ) : null}
                <IntegrationCard
                  icon={<BrandIcon icon={siGit} />}
                  title="Git Repositories"
                  connected
                  description="Monitor local and remote Git repositories for activity and changes."
                  primaryLabel="Configure"
                  primaryIcon
                  onPrimary={() => setActiveIntegrationPanel("git")}
                  secondaryLabel="Manage"
                  onSecondary={() => setActiveTab("work")}
                />
                <IntegrationCard
                  icon={<BrandIcon icon={siWakatime} />}
                  title="VS Code / WakaTime"
                  connected={false}
                  description="Track coding activity, metrics, and insights via WakaTime integration."
                  primaryLabel="Manage"
                  primaryIcon
                  onPrimary={() => setActiveIntegrationPanel("git")}
                  dangerLabel="Disconnect"
                  disabledDanger
                />
              </div>
              {!sparcForceAddonAvailable ? (
                <AddOnUnlockPanel
                  code={sparcForceAddonCode}
                  onCodeChange={setSparcForceAddonCode}
                  isPending={activateSparcForceAddonMutation.isPending}
                  onUnlock={() => activateSparcForceAddonMutation.mutate()}
                />
              ) : null}
            </section>
            {activePanelPlacement === "development" ? renderIntegrationSetupPanel() : null}

            <section className="mt-5">
              <h3 className="mb-3 text-sm font-semibold text-white">Calendar & Productivity</h3>
              <div className="grid gap-4 xl:grid-cols-2">
                <IntegrationCard
                  icon={<BrandIcon icon={siGooglecalendar} />}
                  title="Calendar Sync"
                  connected={calendarConnected}
                  description="Sync your calendar events to understand focus time, meetings, and deep work blocks."
                  primaryLabel="Manage Calendars"
                  primaryIcon
                  onPrimary={() => setActiveIntegrationPanel("calendar")}
                  dangerLabel={calendarConnected ? "Disconnect" : undefined}
                  onDanger={() => {
                    const sourceId = calendarSourcesQuery.data?.[0]?.id;
                    if (sourceId) disconnectCalendarMutation.mutate(sourceId);
                  }}
                  disabledDanger={disconnectCalendarMutation.isPending}
                />
              </div>
            </section>
            {activePanelPlacement === "calendar" ? renderIntegrationSetupPanel() : null}

            <section className="mt-5">
              <h3 className="mb-3 text-sm font-semibold text-white">AI / Voice Services</h3>
              <div className="grid gap-4 xl:grid-cols-3">
                <IntegrationCard
                  icon={<Mic className="h-8 w-8 text-violet-300" />}
                  title="Whisper / Voice Transcription"
                  connected={voiceConfigured}
                  description="Transcribe voice notes and commands using local Whisper models."
                  primaryLabel="Configure"
                  primaryIcon
                  onPrimary={() => setActiveIntegrationPanel("voice")}
                  secondaryLabel="Manage"
                  onSecondary={() => setActiveTab("audio")}
                />
                <IntegrationCard
                  icon={<BrandIcon icon={siOpenrouter} />}
                  title="OpenRouter"
                  connected={openRouterKeyConfigured}
                  description="Route requests to top AI models securely via OpenRouter."
                  primaryLabel="Manage Models"
                  primaryIcon
                  onPrimary={() => {
                    form.setValue("reportAiProvider", "openrouter_free", { shouldDirty: true });
                    form.setValue("reportAiOnlineAllowed", true, { shouldDirty: true });
                    setActiveIntegrationPanel("openrouter");
                  }}
                  dangerLabel={openRouterKeyConfigured ? "Disconnect" : undefined}
                  onDanger={() => disconnectAiMutation.mutate("openrouter_free")}
                  disabledDanger={disconnectAiMutation.isPending}
                />
                <IntegrationCard
                  icon={<img src="https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@latest/icons/groq.svg" alt="" className="h-8 w-8 object-contain" />}
                  title="Groq"
                  connected={groqKeyConfigured}
                  description="Ultra-fast inference for voice commands and AI workflows."
                  primaryLabel="Manage Models"
                  primaryIcon
                  onPrimary={() => {
                    form.setValue("reportAiProvider", "groq", { shouldDirty: true });
                    form.setValue("reportAiOnlineAllowed", true, { shouldDirty: true });
                    setActiveIntegrationPanel("groq");
                  }}
                  dangerLabel={groqKeyConfigured ? "Disconnect" : undefined}
                  onDanger={() => disconnectAiMutation.mutate("groq")}
                  disabledDanger={disconnectAiMutation.isPending}
                />
                <IntegrationCard
                  icon={<Sparkles className="h-8 w-8 text-emerald-300" />}
                  title="NVIDIA Build"
                  connected={nvidiaBuildKeyConfigured}
                  description="Use NVIDIA Build hosted models for report polish and readiness analysis."
                  primaryLabel="Manage Models"
                  primaryIcon
                  onPrimary={() => {
                    form.setValue("reportAiProvider", "nvidia_build", { shouldDirty: true });
                    form.setValue("reportAiOnlineAllowed", true, { shouldDirty: true });
                    setActiveIntegrationPanel("nvidiaBuild");
                  }}
                  dangerLabel={nvidiaBuildKeyConfigured ? "Disconnect" : undefined}
                  onDanger={() => disconnectAiMutation.mutate("nvidia_build")}
                  disabledDanger={disconnectAiMutation.isPending}
                />
              </div>
            </section>
            {activePanelPlacement === "ai" ? renderIntegrationSetupPanel() : null}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--wt-border)] bg-[var(--wt-accent-soft)] px-4 py-3 text-xs text-[var(--wt-text-muted)]">
              <span className="inline-flex items-center gap-2">
                <LockKeyhole className="h-4 w-4 text-slate-300" />
                Your integrations are private and secure. We never access your data without permission.
              </span>
              <button
                type="button"
                className="inline-flex items-center gap-2 font-semibold text-blue-300 hover:text-blue-200"
                onClick={() => setActiveIntegrationPanel("openrouter")}
              >
                View Integration Guide
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
            </div>
          </Panel>
          ) : null}
        </div>

        {activeTab === "work" ? (
        <div className="space-y-4">
          <Panel className="border-blue-300/15 bg-gradient-to-r from-[#08162f] via-[#0a1a38] to-[#09162f] p-6">
            <div className="mb-5 flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-blue-300/20 bg-blue-500/14">
                <CalendarDays className="h-5 w-5 text-cyan-200" />
              </div>
              <div>
                <div className="text-[1.65rem] font-semibold tracking-tight text-white">Working Days</div>
                <p className="mt-1 text-sm text-slate-400">
                  Select the days of the week you typically work.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
              {workingDays.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  disabled={settingsQuery.isLoading}
                  onClick={() => toggleWorkingDay(day.value)}
                  className={[
                    "flex items-center justify-between rounded-xl border px-4 py-3 text-base font-medium transition-all",
                    selectedWorkingDays.includes(day.value)
                      ? "border-blue-300/45 bg-blue-500/20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_22px_rgba(37,99,235,0.18)]"
                      : "border-white/12 bg-slate-950/45 text-slate-400 hover:border-white/20 hover:bg-white/8 hover:text-slate-200",
                  ].join(" ")}
                >
                  <span>{day.label}</span>
                  <span
                    className={[
                      "grid h-6 w-6 place-items-center rounded-full border transition",
                      selectedWorkingDays.includes(day.value)
                        ? "border-blue-200/60 bg-blue-500 text-white"
                        : "border-white/15 text-transparent",
                    ].join(" ")}
                  >
                    <Check className="h-4 w-4" />
                  </span>
                </button>
              ))}
            </div>
            {form.formState.errors.workingDays?.message ? (
              <p className="mt-2 text-xs text-red-300">
                {form.formState.errors.workingDays.message}
              </p>
            ) : null}
          </Panel>

          <Panel className="border-blue-300/15 bg-gradient-to-r from-[#08162f] via-[#0a1a38] to-[#09162f] p-6">
            <div className="mb-5 flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-blue-300/20 bg-blue-500/14">
                <Clock3 className="h-5 w-5 text-cyan-200" />
              </div>
              <div>
                <div className="text-[1.65rem] font-semibold tracking-tight text-white">Daily Capacity</div>
                <p className="mt-1 text-sm text-slate-400">Set your daily work capacity.</p>
              </div>
            </div>
            <Field
              label="Work Capacity (minutes/day)"
              error={form.formState.errors.dailyWorkMinutes?.message}
            >
              <div className="flex overflow-hidden rounded-xl border border-white/12 bg-slate-950/55">
                <div className="flex w-full items-center gap-3 px-4 py-2">
                  <span className="text-sm text-slate-300">Work Capacity (minutes/day)</span>
                  <input
                    type="number"
                    min={60}
                    max={960}
                    step={15}
                    className="h-10 min-w-0 flex-1 rounded-lg border border-white/8 bg-slate-950/80 px-3 text-lg font-semibold tabular-nums text-slate-100 outline-none transition focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/15"
                    disabled={settingsQuery.isLoading}
                    {...form.register("dailyWorkMinutes", { valueAsNumber: true })}
                  />
                </div>
              </div>
            </Field>
          </Panel>

          <Panel className="border-blue-300/15 bg-gradient-to-r from-[#08162f] via-[#0a1a38] to-[#09162f] p-6">
            <div className="flex flex-wrap items-center justify-between gap-5">
              <div className="min-w-[240px] flex-1">
                <div className="mb-2 flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-full border border-blue-300/20 bg-blue-500/14">
                    <CheckCircle2 className="h-5 w-5 text-cyan-200" />
                  </div>
                  <h2 className="text-[1.65rem] font-semibold tracking-tight text-white">Save Preferences</h2>
                </div>
                <p className="text-sm leading-6 text-slate-400">
                  Settings stay on this machine and are used as defaults for reports and local Git workflows.
                </p>
              </div>
              <div className="w-full max-w-[340px]">
                <Button
                  type="submit"
                  variant="primary"
                  className="h-12 w-full text-base"
                  disabled={saveMutation.isPending || settingsQuery.isLoading}
                >
                  <Save className="h-4 w-4" />
                  {saveMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
                <p className="mt-2 text-center text-sm text-slate-400">Preferences are saved locally</p>
              </div>
            </div>
            {settingsQuery.isError ? (
              <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
                {settingsQuery.error instanceof Error
                  ? settingsQuery.error.message
                  : "Settings could not be loaded."}
              </div>
            ) : null}
            {settingsQuery.isLoading ? (
              <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.03] p-3 text-xs text-slate-400">
                Loading saved preferences...
              </div>
            ) : null}
            {saveMutation.isError ? (
              <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
                {saveMutation.error instanceof Error
                  ? saveMutation.error.message
                  : "Settings could not be saved."}
              </div>
            ) : null}
          </Panel>

          <div className="flex items-center justify-center gap-2 py-1 text-sm text-slate-400">
            <LockKeyhole className="h-4 w-4 text-slate-500" />
            <span>All preferences are stored locally on this device.</span>
          </div>
        </div>
        ) : null}
      </form>
    </div>
  );
}

function IntegrationMetric({
  value,
  label,
  detail,
  tone,
}: {
  value: string;
  label: string;
  detail: string;
  tone: "blue" | "cyan" | "green";
}) {
  return (
    <div className="rounded-2xl border border-[var(--wt-border)] bg-[var(--wt-surface)] p-4 shadow-sm shadow-[rgb(var(--wt-shadow)/0.08)]">
      <div className="text-2xl font-semibold text-[var(--wt-text-strong)]">{value}</div>
      <div className="mt-1 text-xs font-semibold text-[var(--wt-text)]">{label}</div>
      <div className="mt-1 flex items-center gap-2 text-xs text-[var(--wt-text-muted)]">
        <span
          className={[
            "h-1.5 w-1.5 rounded-full",
            tone === "green" ? "bg-emerald-300" : tone === "cyan" ? "bg-cyan-300" : "bg-blue-300",
          ].join(" ")}
        />
        {detail}
      </div>
    </div>
  );
}

function AddOnUnlockPanel({
  code,
  onCodeChange,
  isPending,
  onUnlock,
}: {
  code: string;
  onCodeChange: (code: string) => void;
  isPending: boolean;
  onUnlock: () => void;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-400/8 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label className="text-xs font-semibold text-slate-200" htmlFor="addon-code">
            Unlock add-on
          </label>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Enter your activation code to reveal an additional private integration.
          </p>
          <input
            id="addon-code"
            value={code}
            onChange={(event) => onCodeChange(event.currentTarget.value)}
            className={`${inputClass} mt-3`}
            placeholder="Activation code"
          />
        </div>
        <Button
          type="button"
          variant="primary"
          disabled={!code.trim() || isPending}
          onClick={onUnlock}
        >
          <PlugZap className="h-4 w-4" />
          {isPending ? "Unlocking..." : "Unlock"}
        </Button>
      </div>
    </div>
  );
}

function BrandIcon({ icon }: { icon: SimpleIcon }) {
  return (
    <svg
      aria-hidden="true"
      className="h-8 w-8"
      viewBox="0 0 24 24"
      role="img"
      fill={`#${icon.hex}`}
    >
      <path d={icon.path} />
    </svg>
  );
}

function IntegrationCard({
  icon,
  title,
  connected,
  description,
  primaryLabel,
  primaryIcon = false,
  onPrimary,
  secondaryLabel,
  onSecondary,
  dangerLabel,
  onDanger,
  disabledDanger = false,
}: {
  icon: ReactNode;
  title: string;
  connected: boolean;
  description: string;
  primaryLabel: string;
  primaryIcon?: boolean;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  dangerLabel?: string;
  onDanger?: () => void;
  disabledDanger?: boolean;
}) {
  return (
    <div className="relative min-h-[142px] rounded-2xl border border-[var(--wt-border)] bg-[linear-gradient(135deg,color-mix(in_oklch,var(--wt-accent)_8%,var(--wt-surface)),var(--wt-surface)_48%,var(--wt-surface-strong))] p-4 shadow-lg shadow-[rgb(var(--wt-shadow)/0.12)]">
      <button
        type="button"
        className="absolute right-4 top-4 rounded-lg p-1 text-[var(--wt-text-muted)] outline-none transition hover:bg-[var(--wt-surface-muted)] hover:text-[var(--wt-text-strong)] focus-visible:ring-2 focus-visible:ring-blue-400/45"
        onClick={onPrimary}
        aria-label={`Manage ${title}`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      <div className="flex gap-4 pr-7">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--wt-border)] bg-[var(--wt-surface-muted)] shadow-lg shadow-[rgb(var(--wt-shadow)/0.12)]">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-[var(--wt-text-strong)]">{title}</h4>
            <Badge tone={connected ? "green" : "slate"}>
              {connected ? "Connected" : "Not connected"}
            </Badge>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--wt-text-muted)]">{description}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg px-1 py-1 text-xs font-semibold text-blue-600 outline-none transition hover:text-blue-500 focus-visible:ring-2 focus-visible:ring-blue-400/45"
          onClick={onPrimary}
        >
          {primaryLabel}
          {primaryIcon ? <ExternalLink className="h-3.5 w-3.5" /> : null}
        </button>
        <div className="flex items-center gap-2">
          {secondaryLabel && onSecondary ? (
            <button
              type="button"
              className="rounded-lg border border-blue-300/35 px-3 py-1.5 text-xs font-semibold text-blue-600 outline-none transition hover:bg-blue-500/10 focus-visible:ring-2 focus-visible:ring-blue-400/45"
              onClick={onSecondary}
            >
              {secondaryLabel}
            </button>
          ) : null}
          {dangerLabel && onDanger ? (
            <button
              type="button"
              className="rounded-lg border border-red-300/35 px-3 py-1.5 text-xs font-semibold text-red-600 outline-none transition hover:bg-red-500/10 focus-visible:ring-2 focus-visible:ring-red-400/35 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onDanger}
              disabled={disabledDanger}
            >
              {dangerLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type PendingMutation = { isPending: boolean };

function IntegrationSetupPanel({
  activePanel,
  githubToken,
  setGithubToken,
  connectGithubMutation,
  testGithubMutation,
  githubConnected,
  githubError,
  githubIsError,
  sparcForceStatus,
  sparcForceIsError,
  sparcForceError,
  sparcForceBaseUrl,
  setSparcForceBaseUrl,
  sparcForceEmail,
  setSparcForceEmail,
  sparcForcePassword,
  setSparcForcePassword,
  sparcForceOtp,
  setSparcForceOtp,
  sparcForceOtpRequired,
  connectSparcForceMutation,
  verifySparcForceOtpMutation,
  testSparcForceMutation,
  syncSparcForceMutation,
  disconnectSparcForceMutation,
  calendarEmail,
  setCalendarEmail,
  connectCalendarMutation,
  syncCalendarMutation,
  calendarSources,
  calendarError,
  calendarIsError,
  openRouterKey,
  setOpenRouterKey,
  groqKey,
  setGroqKey,
  nvidiaBuildKey,
  setNvidiaBuildKey,
  connectAiMutation,
  testAiMutation,
  connectAndTestAiMutation,
  disconnectAiMutation,
  listModelsMutation,
  providerModels,
  reportAiStatus,
  selectedGroqModel,
  selectedOpenRouterModel,
  selectedNvidiaModel,
  onSelectModel,
  onClose,
  onOpenAudio,
  onOpenReporting,
}: {
  activePanel: Exclude<IntegrationPanel, null>;
  githubToken: string;
  setGithubToken: (value: string) => void;
  connectGithubMutation: PendingMutation & { mutate: () => void };
  testGithubMutation: PendingMutation & { mutate: () => void };
  githubConnected: boolean;
  githubError: unknown;
  githubIsError: boolean;
  sparcForceStatus: SparcForceIntegrationStatus | undefined;
  sparcForceIsError: boolean;
  sparcForceError: unknown;
  sparcForceBaseUrl: string;
  setSparcForceBaseUrl: (value: string) => void;
  sparcForceEmail: string;
  setSparcForceEmail: (value: string) => void;
  sparcForcePassword: string;
  setSparcForcePassword: (value: string) => void;
  sparcForceOtp: string;
  setSparcForceOtp: (value: string) => void;
  sparcForceOtpRequired: boolean;
  connectSparcForceMutation: PendingMutation & { mutate: () => void };
  verifySparcForceOtpMutation: PendingMutation & { mutate: () => void };
  testSparcForceMutation: PendingMutation & { mutate: () => void };
  syncSparcForceMutation: PendingMutation & { mutate: () => void };
  disconnectSparcForceMutation: PendingMutation & { mutate: () => void };
  calendarEmail: string;
  setCalendarEmail: (value: string) => void;
  connectCalendarMutation: PendingMutation & { mutate: () => void };
  syncCalendarMutation: PendingMutation & { mutate: (sourceId?: string) => void };
  calendarSources: CalendarSource[];
  calendarError: unknown;
  calendarIsError: boolean;
  openRouterKey: string;
  setOpenRouterKey: (value: string) => void;
  groqKey: string;
  setGroqKey: (value: string) => void;
  nvidiaBuildKey: string;
  setNvidiaBuildKey: (value: string) => void;
  connectAiMutation: PendingMutation & {
    mutate: (input: { provider: ReportAiProvider; apiKey: string }) => void;
  };
  testAiMutation: PendingMutation & { mutate: (provider: ReportAiProvider) => void };
  connectAndTestAiMutation: PendingMutation & {
    mutate: (input: { provider: ReportAiProvider; apiKey: string }) => void;
  };
  disconnectAiMutation: PendingMutation & { mutate: (provider: ReportAiProvider) => void };
  listModelsMutation: PendingMutation & { mutate: (provider: ReportAiProvider) => void };
  providerModels: Partial<Record<ReportAiProvider, ReportAiModelList>>;
  reportAiStatus: ReportAiStatus | undefined;
  selectedGroqModel: string;
  selectedOpenRouterModel: string;
  selectedNvidiaModel: string;
  onSelectModel: (provider: ReportAiProvider, modelId: string) => void;
  onClose: () => void;
  onOpenAudio: () => void;
  onOpenReporting: () => void;
}) {
  const pending =
    connectAiMutation.isPending ||
    testAiMutation.isPending ||
    connectAndTestAiMutation.isPending ||
    disconnectAiMutation.isPending ||
    listModelsMutation.isPending;

  return (
    <div className="mt-5 rounded-2xl border border-blue-300/20 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.16),transparent_36%),linear-gradient(135deg,rgba(15,23,42,0.94),rgba(2,12,27,0.96))] p-5 shadow-2xl shadow-blue-950/30">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-2xl font-bold leading-tight text-white">
            {integrationPanelTitle(activePanel)}
          </h3>
          <p className="mt-2 text-sm leading-5 text-slate-400">
            Configure this integration without leaving the Integrations section.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-3 rounded-xl border border-white/10 bg-slate-950/35 px-4 py-2 text-sm font-semibold text-slate-200 shadow-lg shadow-black/10 transition hover:border-blue-300/30 hover:bg-white/8 active:scale-[0.96]"
          onClick={onClose}
        >
          Close
          <X className="h-4 w-4 text-slate-400" />
        </button>
      </div>

      {activePanel === "github" ? (
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <input
            className={inputClass}
            type="password"
            value={githubToken}
            onChange={(event) => setGithubToken(event.target.value)}
            placeholder="github_pat_..."
            disabled={connectGithubMutation.isPending}
          />
          <Button
            type="button"
            variant="primary"
            disabled={!githubToken.trim() || connectGithubMutation.isPending}
            onClick={() => connectGithubMutation.mutate()}
          >
            {connectGithubMutation.isPending ? "Connecting..." : "Connect"}
          </Button>
          <Button
            type="button"
            disabled={!githubConnected || testGithubMutation.isPending}
            onClick={() => testGithubMutation.mutate()}
          >
            {testGithubMutation.isPending ? "Testing..." : "Test"}
          </Button>
          {githubIsError ? <InlineError error={githubError} fallback="GitHub integration status could not be loaded." /> : null}
        </div>
      ) : null}

      {activePanel === "sparcForce" ? (
        <div className="grid gap-4">
          {sparcForceStatus ? (
            <div className="grid gap-4 rounded-xl border border-blue-300/20 bg-[linear-gradient(135deg,rgba(30,64,175,0.22),rgba(15,23,42,0.6))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_48px_rgba(15,23,42,0.28)] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="grid gap-3 text-xs text-slate-400 sm:grid-cols-2 xl:grid-cols-4">
                <StatusLine
                  icon={
                    <span
                      className={[
                        "h-3 w-3 rounded-full",
                        sparcForceStatus.connected
                          ? "bg-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.65)]"
                          : "bg-slate-500 shadow-[0_0_14px_rgba(148,163,184,0.28)]",
                      ].join(" ")}
                    />
                  }
                  label="Status"
                  value={humanizeStatus(sparcForceStatus.status)}
                />
                <StatusLine icon={<User className="h-4 w-4" />} label="User" value={sparcForceStatus.remoteUsername ?? sparcForceStatus.accountEmail ?? "Not connected"} />
                <StatusLine icon={<CalendarDays className="h-4 w-4" />} label="Last synced" value={sparcForceStatus.lastSyncedAt ? formatTimestamp(sparcForceStatus.lastSyncedAt) : "Not synced yet"} />
                <StatusLine icon={<Layers className="h-4 w-4" />} label="Imported" value={`${sparcForceStatus.importedCases} cases / ${sparcForceStatus.importedProjects} projects / ${sparcForceStatus.importedTasks} tasks`} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={!sparcForceStatus.connected || testSparcForceMutation.isPending}
                  onClick={() => testSparcForceMutation.mutate()}
                  className="h-10 min-w-20 rounded-lg border-blue-300/35 bg-slate-950/30 px-4 text-sm"
                >
                  {testSparcForceMutation.isPending ? "Testing..." : "Test"}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={!sparcForceStatus.connected || syncSparcForceMutation.isPending}
                  onClick={() => syncSparcForceMutation.mutate()}
                  className="h-10 min-w-28 rounded-lg px-4 text-sm shadow-blue-500/30"
                >
                  {syncSparcForceMutation.isPending ? "Syncing..." : "Sync Now"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!sparcForceStatus.connected || disconnectSparcForceMutation.isPending}
                  onClick={() => disconnectSparcForceMutation.mutate()}
                  className="h-10 min-w-28 rounded-lg border-red-300/30 bg-red-500/8 px-4 text-sm text-red-200 hover:border-red-300/45 hover:bg-red-500/14"
                >
                  Disconnect
                </Button>
              </div>
            </div>
          ) : null}

          <details
            className="group rounded-xl border border-white/10 bg-slate-950/42 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
            open={!sparcForceStatus?.connected || sparcForceOtpRequired}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-100">
              <span className="inline-flex items-center gap-3">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/12 text-blue-200">
                  <LockKeyhole className="h-4 w-4" />
                </span>
                {sparcForceStatus?.connected ? "Connection credentials" : "Connect Sparc Force"}
              </span>
              <ChevronDown className="h-4 w-4 text-blue-300 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <Field label="Sparc Force URL">
                <input
                  className={inputClass}
                  type="url"
                  value={sparcForceBaseUrl}
                  onChange={(event) => setSparcForceBaseUrl(event.currentTarget.value)}
                  placeholder="https://your-sparc-force-api-host"
                  disabled={connectSparcForceMutation.isPending}
                />
              </Field>
              <Field label="Account Email">
                <input
                  className={inputClass}
                  type="email"
                  value={sparcForceEmail}
                  onChange={(event) => setSparcForceEmail(event.currentTarget.value)}
                  placeholder="integration.user@example.com"
                  disabled={connectSparcForceMutation.isPending}
                />
              </Field>
              <Field label="Password">
                <input
                  className={inputClass}
                  type="password"
                  value={sparcForcePassword}
                  onChange={(event) => setSparcForcePassword(event.currentTarget.value)}
                  placeholder="Enter password to connect or reconnect"
                  disabled={connectSparcForceMutation.isPending}
                />
              </Field>
              {sparcForceOtpRequired ? (
                <Field label={`OTP Code${sparcForceStatus?.maskedEmail ? ` (${sparcForceStatus.maskedEmail})` : ""}`}>
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    value={sparcForceOtp}
                    onChange={(event) => setSparcForceOtp(event.currentTarget.value)}
                    placeholder="1234"
                    disabled={verifySparcForceOtpMutation.isPending}
                  />
                </Field>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="primary"
                disabled={
                  connectSparcForceMutation.isPending ||
                  !sparcForceBaseUrl.trim() ||
                  !sparcForceEmail.trim() ||
                  !sparcForcePassword.trim()
                }
                onClick={() => connectSparcForceMutation.mutate()}
              >
                {connectSparcForceMutation.isPending
                  ? "Connecting..."
                  : sparcForceStatus?.connected
                    ? "Reconnect"
                    : "Connect"}
              </Button>
              {sparcForceOtpRequired ? (
                <Button
                  type="button"
                  disabled={verifySparcForceOtpMutation.isPending || !sparcForceOtp.trim()}
                  onClick={() => verifySparcForceOtpMutation.mutate()}
                >
                  {verifySparcForceOtpMutation.isPending ? "Verifying..." : "Verify OTP"}
                </Button>
              ) : null}
            </div>
          </details>

          <SparcForceImportedExplorer connected={Boolean(sparcForceStatus?.connected)} />
          {sparcForceStatus?.lastError ? (
            <InlineError error={sparcForceStatus.lastError} fallback="Sparc Force reported an error." />
          ) : null}
          {sparcForceIsError ? <InlineError error={sparcForceError} fallback="Sparc Force integration status could not be loaded." /> : null}
        </div>
      ) : null}

      {activePanel === "calendar" ? (
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <input
            className={inputClass}
            type="email"
            value={calendarEmail}
            onChange={(event) => setCalendarEmail(event.target.value)}
            placeholder="you@example.com"
            disabled={connectCalendarMutation.isPending}
          />
          <Button
            type="button"
            variant="primary"
            disabled={connectCalendarMutation.isPending}
            onClick={() => connectCalendarMutation.mutate()}
          >
            {connectCalendarMutation.isPending ? "Connecting..." : "Connect"}
          </Button>
          <Button
            type="button"
            disabled={!calendarSources.length || syncCalendarMutation.isPending}
            onClick={() => syncCalendarMutation.mutate(calendarSources[0]?.id)}
          >
            {syncCalendarMutation.isPending ? "Syncing..." : "Sync Now"}
          </Button>
          {calendarSources.map((source) => (
            <p key={source.id} className="text-xs text-slate-500 md:col-span-3">
              {source.accountEmail}
              {source.lastSyncedAt ? ` / synced ${formatTimestamp(source.lastSyncedAt)}` : ""}
            </p>
          ))}
          {calendarIsError ? <InlineError error={calendarError} fallback="Calendar integration status could not be loaded." /> : null}
        </div>
      ) : null}

      {activePanel === "openrouter" ? (
        <ProviderModelManager
          label="OpenRouter"
          provider="openrouter_free"
          value={openRouterKey}
          status={providerStatus(reportAiStatus, "openrouter_free")}
          configured={isProviderConfigured(reportAiStatus, "openrouter_free")}
          isPending={pending}
          selectedModel={selectedOpenRouterModel}
          models={providerModels.openrouter_free?.models ?? []}
          onChange={setOpenRouterKey}
          onConnect={() =>
            connectAiMutation.mutate({ provider: "openrouter_free", apiKey: openRouterKey })
          }
          onTest={() => testAiMutation.mutate("openrouter_free")}
          onConnectAndTest={() =>
            connectAndTestAiMutation.mutate({
              provider: "openrouter_free",
              apiKey: openRouterKey,
            })
          }
          onDisconnect={() => disconnectAiMutation.mutate("openrouter_free")}
          onRefreshModels={() => listModelsMutation.mutate("openrouter_free")}
          onSelectModel={(modelId) => onSelectModel("openrouter_free", modelId)}
        />
      ) : null}

      {activePanel === "groq" ? (
        <ProviderModelManager
          label="Groq"
          provider="groq"
          value={groqKey}
          status={providerStatus(reportAiStatus, "groq")}
          configured={isProviderConfigured(reportAiStatus, "groq")}
          isPending={pending}
          selectedModel={selectedGroqModel}
          models={providerModels.groq?.models ?? []}
          onChange={setGroqKey}
          onConnect={() => connectAiMutation.mutate({ provider: "groq", apiKey: groqKey })}
          onTest={() => testAiMutation.mutate("groq")}
          onConnectAndTest={() =>
            connectAndTestAiMutation.mutate({ provider: "groq", apiKey: groqKey })
          }
          onDisconnect={() => disconnectAiMutation.mutate("groq")}
          onRefreshModels={() => listModelsMutation.mutate("groq")}
          onSelectModel={(modelId) => onSelectModel("groq", modelId)}
        />
      ) : null}

      {activePanel === "nvidiaBuild" ? (
        <ProviderModelManager
          label="NVIDIA Build"
          provider="nvidia_build"
          value={nvidiaBuildKey}
          status={providerStatus(reportAiStatus, "nvidia_build")}
          configured={isProviderConfigured(reportAiStatus, "nvidia_build")}
          isPending={pending}
          selectedModel={selectedNvidiaModel}
          models={providerModels.nvidia_build?.models ?? []}
          onChange={setNvidiaBuildKey}
          onConnect={() =>
            connectAiMutation.mutate({ provider: "nvidia_build", apiKey: nvidiaBuildKey })
          }
          onTest={() => testAiMutation.mutate("nvidia_build")}
          onConnectAndTest={() =>
            connectAndTestAiMutation.mutate({ provider: "nvidia_build", apiKey: nvidiaBuildKey })
          }
          onDisconnect={() => disconnectAiMutation.mutate("nvidia_build")}
          onRefreshModels={() => listModelsMutation.mutate("nvidia_build")}
          onSelectModel={(modelId) => onSelectModel("nvidia_build", modelId)}
        />
      ) : null}

      {activePanel === "voice" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-xs leading-5 text-slate-400">
            Voice commands use local Whisper first. Online transcription can reuse OpenRouter or Groq keys when enabled.
          </p>
          <Button type="button" onClick={onOpenAudio}>Open Audio & Voice</Button>
        </div>
      ) : null}

      {activePanel === "git" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-xs leading-5 text-slate-400">
            Repository tracking is built into WorkTrace. Use work preferences and project settings to tune defaults.
          </p>
          <Button type="button" onClick={onOpenReporting}>Open Reporting Settings</Button>
        </div>
      ) : null}
    </div>
  );
}

function ProviderKeyRow({
  label,
  value,
  status,
  configured,
  isPending,
  onChange,
  onConnect,
  onTest,
  onDisconnect,
}: {
  label: string;
  value: string;
  status: string;
  configured: boolean;
  isPending: boolean;
  onChange: (value: string) => void;
  onConnect: () => void;
  onTest: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-200">{label}</p>
        <Badge tone={configured ? "green" : "slate"}>
          {configured ? "Connected" : "Not connected"}
        </Badge>
      </div>
      <p className="mb-2 truncate text-[10px] text-slate-500">
        {configured && !value.trim() ? "API key is stored in secure storage." : status}
      </p>
      <input
        type="password"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className={inputClass}
        placeholder={configured ? "Enter a new key to replace the stored key" : `${label} API key`}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          disabled={!value.trim() || isPending}
          onClick={onConnect}
          className="h-8 px-2 text-xs"
        >
          Connect
        </Button>
        <Button type="button" disabled={isPending} onClick={onTest} className="h-8 px-2 text-xs">
          {value.trim() ? "Connect & Test" : "Test"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={isPending}
          onClick={onDisconnect}
          className="h-8 px-2 text-xs"
        >
          Disconnect
        </Button>
      </div>
    </div>
  );
}

function ProviderModelManager({
  label,
  provider,
  value,
  status,
  configured,
  isPending,
  selectedModel,
  models,
  onChange,
  onConnect,
  onTest,
  onConnectAndTest,
  onDisconnect,
  onRefreshModels,
  onSelectModel,
}: {
  label: string;
  provider: ReportAiProvider;
  value: string;
  status: string;
  configured: boolean;
  isPending: boolean;
  selectedModel: string;
  models: ReportAiModelList["models"];
  onChange: (value: string) => void;
  onConnect: () => void;
  onTest: () => void;
  onConnectAndTest: () => void;
  onDisconnect: () => void;
  onRefreshModels: () => void;
  onSelectModel: (modelId: string) => void;
}) {
  const [modelSearch, setModelSearch] = useState("");
  const selected = models.find((model) => model.id === selectedModel);
  const filteredModels = models
    .filter((model) => {
      const needle = modelSearch.trim().toLowerCase();
      if (!needle) return true;
      return (
        model.id.toLowerCase().includes(needle) ||
        model.name.toLowerCase().includes(needle) ||
        (model.description ?? "").toLowerCase().includes(needle)
      );
    })
    .slice(0, 80);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <ProviderKeyRow
        label={label}
        value={value}
        status={status}
        configured={configured}
        isPending={isPending}
        onChange={onChange}
        onConnect={onConnect}
        onTest={value.trim() ? onConnectAndTest : onTest}
        onDisconnect={onDisconnect}
      />
      <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-slate-200">Provider Models</p>
            <p className="mt-1 text-[11px] text-slate-500">
              {models.length ? `${models.length} models loaded` : "Refresh after connecting a key."}
            </p>
          </div>
          <Button
            type="button"
            disabled={isPending || provider === "local_llama_cpp"}
            onClick={onRefreshModels}
            className="h-8 px-2 text-xs"
          >
            Refresh Models
          </Button>
        </div>
        <div className="mb-2 rounded-xl border border-blue-300/20 bg-blue-500/10 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-200">
            Selected model
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-white">
            {selected?.name ?? (selectedModel || "No model selected")}
          </p>
          {selected?.id && selected.id !== selected.name ? (
            <p className="mt-0.5 truncate text-[11px] text-slate-400">{selected.id}</p>
          ) : null}
        </div>
        <input
          className={inputClass}
          value={modelSearch}
          disabled={!models.length || isPending}
          onChange={(event) => setModelSearch(event.currentTarget.value)}
          placeholder="Search models by name, id, or description"
        />
        {models.length ? (
          <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-white/8 bg-slate-950/55 p-1">
            {filteredModels.map((model) => (
              <button
                key={model.id}
                type="button"
                className={[
                  "grid w-full gap-1 rounded-lg px-3 py-2 text-left text-xs transition",
                  model.id === selectedModel
                    ? "bg-blue-500/20 text-white"
                    : "text-slate-300 hover:bg-white/8 hover:text-white",
                ].join(" ")}
                onClick={() => {
                  onSelectModel(model.id);
                  setModelSearch("");
                }}
              >
                <span className="font-semibold">{model.name}</span>
                <span className="truncate text-[11px] text-slate-500">{model.id}</span>
              </button>
            ))}
            {!filteredModels.length ? (
              <div className="px-3 py-4 text-xs text-slate-500">No models match that search.</div>
            ) : null}
          </div>
        ) : null}
        {selected?.description ? (
          <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-slate-500">
            {selected.description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function InlineError({ error, fallback }: { error: unknown; fallback: string }) {
  return (
    <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100 md:col-span-3">
      {error instanceof Error ? error.message : typeof error === "string" ? error : fallback}
    </div>
  );
}

function StatusLine({
  icon,
  label,
  value,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {icon ? (
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-300/10 bg-blue-400/8 text-blue-200">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
        <p className="mt-1 truncate text-sm font-bold text-slate-100">{value}</p>
      </div>
    </div>
  );
}

type SparcForceImportedKind = "all" | "case" | "project" | "task";
type SparcForceOwnershipFilter = "all" | "mine" | "created_by_me" | "other" | "unassigned";
type SparcForceTaskDraft = {
  title: string;
  details: string;
  status: WeeklyTaskStatus;
  priority: WeeklyTaskPriority;
  targetDate: string;
  completedAt: string;
  includedInReport: boolean;
  progressPercent: string;
  estimatedMinutes: string;
};

const sparcForceImportedTabs: {
  id: SparcForceImportedKind;
  label: string;
  emptyLabel: string;
}[] = [
  { id: "all", label: "All", emptyLabel: "No records imported yet." },
  { id: "case", label: "Cases", emptyLabel: "No cases imported yet." },
  { id: "project", label: "Projects", emptyLabel: "No projects imported yet." },
  { id: "task", label: "Tasks", emptyLabel: "No tasks imported yet." },
];

const sparcForceOwnershipFilters: {
  id: SparcForceOwnershipFilter;
  label: string;
}[] = [
  { id: "all", label: "All ownership" },
  { id: "mine", label: "Assigned to me" },
  { id: "created_by_me", label: "Created by me" },
  { id: "other", label: "Assigned to others" },
  { id: "unassigned", label: "Unassigned" },
];

function SparcForceImportedExplorer({
  connected,
}: {
  connected: boolean;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const speech = useSpeech();
  const [activeKind, setActiveKind] = useState<SparcForceImportedKind>("all");
  const [selectedKey, setSelectedKey] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [relationshipFilter, setRelationshipFilter] = useState("all");
  const [ownershipFilter, setOwnershipFilter] = useState<SparcForceOwnershipFilter>("all");
  const [sortBy, setSortBy] = useState("created");
  const [sortDirection, setSortDirection] = useState("desc");
  const [reviewTask, setReviewTask] = useState<SparcForceImportedItem | null>(null);
  const [taskDraft, setTaskDraft] = useState<SparcForceTaskDraft | null>(null);
  const recordsQuery = useQuery({
    queryKey: [
      "sparcForceRecords",
      activeKind,
      searchTerm,
      statusFilter,
      priorityFilter,
      relationshipFilter,
      ownershipFilter,
      sortBy,
      sortDirection,
    ],
    queryFn: () =>
      listSparcForceRecords({
        kind: activeKind,
        search: searchTerm || null,
        statuses: statusFilter === "all" ? null : [statusFilter],
        priorities: priorityFilter === "all" ? null : [priorityFilter],
        relationship: activeKind === "task" && relationshipFilter !== "all" ? relationshipFilter : null,
        ownership:
          (activeKind === "case" || activeKind === "task") &&
          ownershipFilter !== "all" &&
          ownershipFilter !== "created_by_me"
            ? ownershipFilter
            : null,
        createdOwnership:
          (activeKind === "case" || activeKind === "task") && ownershipFilter === "created_by_me"
            ? ownershipFilter
            : null,
        limit: 100,
        offset: 0,
        sortBy,
        sortDirection,
      }),
    enabled: connected,
  });
  const counts = recordsQuery.data?.counts;
  const filteredItems = recordsQuery.data?.records ?? [];
  const selectedItem =
    filteredItems.find((item) => sparcForceImportedKey(item) === selectedKey) ??
    filteredItems[0];
  const shouldLoadCaseDetail =
    connected &&
    selectedItem?.kind === "case" &&
    !sparcForceDescription("case", parseSparcForceRaw(selectedItem.rawJson));
  const caseDetailQuery = useQuery({
    queryKey: ["sparcForceCaseDetail", selectedItem?.externalId],
    queryFn: () => getSparcForceCaseDetail(selectedItem!.externalId),
    enabled: shouldLoadCaseDetail,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const hydratedSelectedItem =
    selectedItem?.kind === "case" && caseDetailQuery.data ? caseDetailQuery.data : selectedItem;
  const activeTab = sparcForceImportedTabs.find((tab) => tab.id === activeKind);
  const importTaskMutation = useMutation({
    mutationFn: ({ item, draft }: { item: SparcForceImportedItem; draft: SparcForceTaskDraft }) =>
      importSparcForceTaskToWeeklyTask({
        source: item.source ?? "task",
        externalKind: item.externalKind ?? item.source ?? "task",
        externalId: item.externalId,
        weekStartDate: currentWeekRange().from,
        title: draft.title,
        details: draft.details || null,
        status: draft.status,
        priority: draft.priority,
        targetDate: draft.targetDate || null,
        completedAt: draft.completedAt || null,
        includedInReport: draft.includedInReport,
        progressPercent: draft.progressPercent.trim() ? Number(draft.progressPercent) : null,
        estimatedMinutes: draft.estimatedMinutes.trim() ? Number(draft.estimatedMinutes) : null,
      }),
    onSuccess: async (outcome) => {
      await Promise.all([
        ...weeklyTaskQueryRoots.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
        queryClient.invalidateQueries({ queryKey: ["sparcForceRecords"] }),
      ]);
      toast.success(
        outcome.alreadyImported ? "Task already exists" : "Task added to WorkTrace",
        outcome.task.title,
      );
      speech.announce(
        outcome.alreadyImported
          ? taskAnnouncement("Task already exists in WorkTrace", outcome.task, {
              projectName: outcome.task.projectName,
            })
          : taskAnnouncement("Sparc Force task added to WorkTrace", outcome.task, {
              projectName: outcome.task.projectName,
            }),
        { category: "task" },
      );
      setReviewTask(null);
      setTaskDraft(null);
    },
    onError: (error) => {
      toast.error(
        "Task import failed",
        error instanceof Error ? error.message : "The Sparc Force task could not be added.",
      );
    },
  });

  function openTaskReview(item: SparcForceImportedItem) {
    setReviewTask(item);
    setTaskDraft(sparcForceTaskDraftFromItem(item));
  }

  function confirmTaskImport() {
    if (!reviewTask || !taskDraft || !taskDraft.title.trim()) return;
    importTaskMutation.mutate({ item: reviewTask, draft: taskDraft });
  }

  useEffect(() => {
    if (!selectedItem) {
      setSelectedKey("");
      return;
    }
    setSelectedKey(sparcForceImportedKey(selectedItem));
  }, [
    activeKind,
    searchTerm,
    ownershipFilter,
    selectedItem?.externalId,
    selectedItem?.externalKind,
    selectedItem?.kind,
    selectedItem?.source,
  ]);

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(23rem,0.78fr)_minmax(0,1.22fr)]">
      <div className="flex min-h-[42rem] min-w-0 flex-col rounded-xl border border-blue-300/15 bg-[linear-gradient(180deg,rgba(15,30,58,0.82),rgba(5,13,30,0.9))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_20px_60px_rgba(0,0,0,0.18)] xl:max-h-[calc(100vh-10rem)]">
        <div className="flex flex-wrap items-center gap-2">
          {sparcForceImportedTabs.map((tab) => {
            const count = sparcForceCountForKind(counts, tab.id);
            const selected = tab.id === activeKind;
            return (
              <button
                key={tab.id}
                type="button"
                className={[
                  "inline-flex min-h-10 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-transform duration-150 active:scale-[0.96]",
                  selected
                    ? "border-blue-300/45 bg-blue-500/20 text-white shadow-[0_0_0_1px_rgba(96,165,250,0.08),0_16px_36px_rgba(37,99,235,0.16)]"
                    : "border-white/8 bg-slate-950/45 text-slate-400 hover:border-blue-300/25 hover:text-slate-100",
                ].join(" ")}
                onClick={() => {
                  setActiveKind(tab.id);
                  setSearchTerm("");
                  setRelationshipFilter("all");
                  setOwnershipFilter(tab.id === "case" || tab.id === "task" ? "mine" : "all");
                  setSelectedKey("");
                }}
              >
                {tab.label}
                <span className="rounded-md bg-white/8 px-2 py-0.5 text-[11px] text-slate-300 tabular-nums">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 grid gap-2">
          <div className="flex min-h-12 items-center gap-3 rounded-xl border border-blue-300/12 bg-slate-950/60 px-3 shadow-inner shadow-black/15">
            <Search className="h-4 w-4 text-blue-200/70" />
            <input
              className="h-11 min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.currentTarget.value)}
              placeholder={`Search ${activeTab?.label.toLowerCase() ?? "records"}...`}
              disabled={!connected}
            />
            {searchTerm ? (
              <button
                type="button"
                className="rounded-md p-1 text-slate-500 transition hover:bg-white/8 hover:text-slate-200 active:scale-[0.96]"
                onClick={() => setSearchTerm("")}
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 bg-white/[0.03] text-blue-200/80">
              <Filter className="h-4 w-4" />
            </span>
          </div>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            {activeKind === "case" || activeKind === "task" ? (
              <div className="grid gap-2 rounded-xl border border-blue-300/12 bg-slate-950/45 p-1 sm:col-span-2 sm:grid-cols-5">
                {sparcForceOwnershipFilters.map((filter) => {
                  const selected = ownershipFilter === filter.id;
                  const count = sparcForceOwnershipCount(counts, filter.id, activeKind);
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      className={[
                        "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.96]",
                        selected
                          ? "bg-blue-500/22 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_24px_rgba(37,99,235,0.14)]"
                          : "text-slate-400 hover:bg-white/6 hover:text-slate-100",
                      ].join(" ")}
                      onClick={() => setOwnershipFilter(filter.id)}
                      disabled={!connected}
                    >
                      {filter.label}
                      <span className="rounded-md bg-white/8 px-1.5 py-0.5 text-[10px] text-slate-300 tabular-nums">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            <select className={filterSelectClass} value={statusFilter} aria-label="Filter by status" onChange={(event) => setStatusFilter(event.currentTarget.value)} disabled={!connected}>
              <option value="all">All statuses</option>
              {(counts?.statuses ?? []).map((bucket) => <option key={bucket.label} value={bucket.label}>{bucket.label} ({bucket.count})</option>)}
            </select>
            <select className={filterSelectClass} value={priorityFilter} aria-label="Filter by priority" onChange={(event) => setPriorityFilter(event.currentTarget.value)} disabled={!connected}>
              <option value="all">All priorities</option>
              {(counts?.priorities ?? []).map((bucket) => <option key={bucket.label} value={bucket.label}>{bucket.label} ({bucket.count})</option>)}
            </select>
            <select className={filterSelectClass} value={relationshipFilter} aria-label="Filter by task relationship" onChange={(event) => setRelationshipFilter(event.currentTarget.value)} disabled={!connected || activeKind !== "task"}>
              <option value="all">All task relationships</option>
              {(counts?.relationships ?? []).map((bucket) => <option key={bucket.label} value={bucket.label}>{bucket.label} ({bucket.count})</option>)}
            </select>
            <select className={filterSelectClass} value={`${sortBy}:${sortDirection}`} aria-label="Sort imported records" onChange={(event) => {
              const [nextSortBy, nextDirection] = event.currentTarget.value.split(":");
              setSortBy(nextSortBy);
              setSortDirection(nextDirection);
            }} disabled={!connected}>
              <option value="updated:desc">Recently updated</option>
              <option value="created:desc">Newest created</option>
              <option value="created:asc">Oldest created</option>
              <option value="imported:desc">Recently imported</option>
              <option value="title:asc">Title A-Z</option>
              <option value="priority:desc">Priority</option>
            </select>
          </div>
        </div>

        <div className="mt-3 grid flex-1 content-start gap-2 overflow-y-auto pr-1">
          {!connected ? (
            <div className="rounded-lg border border-dashed border-white/10 px-3 py-8 text-center text-xs text-slate-500">
              Connect Sparc Force to search and filter imported records.
            </div>
          ) : null}
          {connected && recordsQuery.isLoading ? (
            <div className="rounded-lg border border-dashed border-white/10 px-3 py-8 text-center text-xs text-slate-500">
              Loading imported records...
            </div>
          ) : null}
          {filteredItems.map((item) => {
            const selected = selectedItem
              ? sparcForceImportedKey(item) === sparcForceImportedKey(selectedItem)
              : false;
            const displayTitle = sparcForceDisplayTitle(item);
            return (
              <div key={sparcForceImportedKey(item)} className="grid gap-2">
                <button
                  type="button"
                  className={[
                    "grid gap-3 rounded-lg border p-3.5 text-left transition-[background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.99]",
                    selected
                      ? "border-blue-300/55 bg-blue-500/14 shadow-[0_0_0_1px_rgba(96,165,250,0.12),0_18px_44px_rgba(37,99,235,0.16)]"
                      : "border-white/8 bg-slate-950/48 hover:border-blue-300/25 hover:bg-slate-900/70 hover:shadow-lg hover:shadow-black/10",
                  ].join(" ")}
                  onClick={() => setSelectedKey(sparcForceImportedKey(item))}
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-100">{displayTitle}</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {humanizeStatus(item.kind)} #{item.externalId}
                      </p>
                    </div>
                    <Badge tone={statusBadgeTone(item.status)}>{item.status ?? "Imported"}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    {item.priority ? <span className="rounded-md bg-red-500/10 px-2 py-0.5 font-semibold text-red-200">{item.priority}</span> : null}
                    {item.kind === "case" ? sparcForceOwnershipChip(item, parseSparcForceRaw(item.rawJson)) : null}
                    {item.kind === "task" ? (
                      <span className="rounded-md bg-blue-500/12 px-2 py-0.5 font-semibold text-blue-200">{sparcForceTaskRelationshipLabel(item, parseSparcForceRaw(item.rawJson))}</span>
                    ) : item.source ? (
                      <span>{humanizeStatus(item.source)}</span>
                    ) : null}
                    {item.createdAtRemote ? <span>Created {formatTimestamp(item.createdAtRemote)}</span> : null}
                  </div>
                </button>
                {selected ? (
                  <div className="xl:hidden">
                    <SparcForceImportedDetails
                      item={hydratedSelectedItem}
                      compact
                      onImportTask={openTaskReview}
                      isImportingTask={importTaskMutation.isPending}
                      isLoadingDetail={caseDetailQuery.isFetching}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
          {connected && !recordsQuery.isLoading && !filteredItems.length ? (
            <div className="rounded-lg border border-dashed border-white/10 px-3 py-8 text-center text-xs text-slate-500">
              {recordsQuery.data?.counts.total ? "No matching imported records." : activeTab?.emptyLabel}
            </div>
          ) : null}
          {recordsQuery.isError ? (
            <InlineError error={recordsQuery.error} fallback="Sparc Force records could not be loaded." />
          ) : null}
        </div>
      </div>

      <div className="hidden min-w-0 xl:block">
        <SparcForceImportedDetails
          item={hydratedSelectedItem}
          onImportTask={openTaskReview}
          isImportingTask={importTaskMutation.isPending}
          isLoadingDetail={caseDetailQuery.isFetching}
        />
      </div>
      <SparcForceTaskImportReview
        item={reviewTask}
        draft={taskDraft}
        isPending={importTaskMutation.isPending}
        onChange={setTaskDraft}
        onCancel={() => {
          if (importTaskMutation.isPending) return;
          setReviewTask(null);
          setTaskDraft(null);
        }}
        onConfirm={confirmTaskImport}
      />
    </div>
  );
}

function SparcForceImportedDetails({
  item,
  compact = false,
  onImportTask,
  isImportingTask = false,
  isLoadingDetail = false,
}: {
  item: SparcForceImportedItem | undefined;
  compact?: boolean;
  onImportTask?: (item: SparcForceImportedItem) => void;
  isImportingTask?: boolean;
  isLoadingDetail?: boolean;
}) {
  if (!item) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/35 p-6 text-sm text-slate-500 xl:min-h-[42rem]">
        Select an imported case, project, or task to inspect its synced details.
      </div>
    );
  }

  const raw = parseSparcForceRaw(item.rawJson);
  const displayTitle = sparcForceDisplayTitle(item, raw);
  const description = sparcForceDescription(item.kind, raw);
  const descriptionIsHtml = item.kind === "case" && looksLikeHtml(description);
  const detailRows = sparcForceDetailRows(item, raw, displayTitle);
  const sectionTitle = `${humanizeStatus(item.kind)} details`;
  const ownershipSummary = item.kind === "case" ? sparcForceOwnershipSummary(item, raw) : null;

  return (
    <div
      className={[
        "rounded-xl border border-blue-300/15 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_34%),linear-gradient(180deg,rgba(15,30,58,0.72),rgba(5,13,30,0.92))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_20px_60px_rgba(0,0,0,0.18)]",
        compact ? "" : "xl:min-h-[42rem]",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 pb-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {humanizeStatus(item.kind)} #{item.externalId}
          </p>
          <h4 className="mt-2 text-2xl font-bold leading-tight text-white">{displayTitle}</h4>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ownershipSummary ? (
            <span className={ownershipSummary.className}>
              <User className="h-3.5 w-3.5" />
              {ownershipSummary.label}
            </span>
          ) : null}
          {item.status ? <Badge tone={statusBadgeTone(item.status)}>{item.status}</Badge> : null}
          {item.priority ? <Badge tone={priorityBadgeTone(item.priority)}>{item.priority}</Badge> : null}
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 bg-slate-950/35 text-slate-400 transition hover:border-blue-300/25 hover:text-slate-100 active:scale-[0.96]"
            aria-label="More actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {item.kind === "task" && onImportTask ? (
            <Button
              type="button"
              className="h-7 px-2 text-xs"
              disabled={isImportingTask}
              onClick={() => onImportTask(item)}
            >
              {isImportingTask ? "Adding..." : "Add to WorkTrace"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {detailRows.map(([label, value]) => (
          <div key={label} className="flex min-h-[4.15rem] gap-3 rounded-lg border border-white/8 bg-slate-950/42 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/12 text-blue-200">
              {sparcForceDetailIcon(label)}
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
              <p className="mt-1 min-h-5 break-words text-sm font-bold leading-5 text-slate-100">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-white/8 bg-slate-950/42 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{sectionTitle}</p>
        {isLoadingDetail ? (
          <p className="mt-2 text-xs font-semibold text-blue-200/80">Loading case details...</p>
        ) : null}
        {description ? (
          descriptionIsHtml ? (
            <div
              className="sparc-force-html mt-3 text-sm leading-6 text-slate-300"
              dangerouslySetInnerHTML={{ __html: sanitizeSparcForceHtml(description) }}
            />
          ) : (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">
              {description}
            </p>
          )
        ) : (
          <p className="mt-2 text-sm leading-6 text-slate-500">
            No description was included in the synced record.
          </p>
        )}
      </div>

      <details className="mt-3 rounded-lg border border-white/8 bg-slate-950/42 p-3">
        <summary className="cursor-pointer text-xs font-semibold text-slate-300">Synced payload</summary>
        <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-slate-500">
          {formatRawPayload(item.rawJson)}
        </pre>
      </details>
    </div>
  );
}

function SparcForceTaskImportReview({
  item,
  draft,
  isPending,
  onChange,
  onCancel,
  onConfirm,
}: {
  item: SparcForceImportedItem | null;
  draft: SparcForceTaskDraft | null;
  isPending: boolean;
  onChange: (draft: SparcForceTaskDraft) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!item || !draft) return null;

  const titleValid = draft.title.trim().length > 0;
  const progressValue = draft.progressPercent.trim() ? Number(draft.progressPercent) : null;
  const progressValid =
    progressValue === null || (Number.isFinite(progressValue) && progressValue >= 0 && progressValue <= 100);
  const minutesValue = draft.estimatedMinutes.trim() ? Number(draft.estimatedMinutes) : null;
  const minutesValid =
    minutesValue === null || (Number.isFinite(minutesValue) && minutesValue >= 0);
  const canConfirm = titleValid && progressValid && minutesValid && !isPending;
  const currentDraft = draft;

  function update(next: Partial<SparcForceTaskDraft>) {
    onChange({ ...currentDraft, ...next });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/72 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-2xl border border-blue-300/20 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.2),transparent_34%),linear-gradient(180deg,rgba(15,30,58,0.98),rgba(4,11,26,0.98))] p-5 shadow-2xl shadow-black/45">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 pb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-200/70">
              Review WorkTrace task
            </p>
            <h4 className="mt-2 text-xl font-bold text-white">Confirm before adding</h4>
            <p className="mt-1 text-sm text-slate-400">
              Adjust the task fields, then create it in WorkTrace.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-950/35 text-slate-300 transition hover:border-blue-300/30 hover:text-white active:scale-[0.96]"
            onClick={onCancel}
            disabled={isPending}
            aria-label="Close review"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Title" error={titleValid ? undefined : "Title is required"}>
            <input
              className={inputClass}
              value={draft.title}
              onChange={(event) => update({ title: event.currentTarget.value })}
              disabled={isPending}
            />
          </Field>
          <Field label="Status">
            <select
              className={filterSelectClass}
              value={draft.status}
              onChange={(event) => update({ status: event.currentTarget.value as WeeklyTaskStatus })}
              disabled={isPending}
            >
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="blocked">Blocked</option>
              <option value="completed">Completed</option>
              <option value="dropped">Dropped</option>
            </select>
          </Field>
          <Field label="Priority">
            <select
              className={filterSelectClass}
              value={draft.priority}
              onChange={(event) => update({ priority: event.currentTarget.value as WeeklyTaskPriority })}
              disabled={isPending}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </Field>
          <Field label="Target date">
            <input
              className={inputClass}
              type="date"
              value={draft.targetDate}
              onChange={(event) => update({ targetDate: event.currentTarget.value })}
              disabled={isPending}
            />
          </Field>
          <Field label="Completed date">
            <input
              className={inputClass}
              type="date"
              value={draft.completedAt}
              onChange={(event) => update({ completedAt: event.currentTarget.value })}
              disabled={isPending}
            />
          </Field>
          <Field label="Progress percent" error={progressValid ? undefined : "Use a value from 0 to 100"}>
            <input
              className={inputClass}
              inputMode="numeric"
              value={draft.progressPercent}
              onChange={(event) => update({ progressPercent: event.currentTarget.value })}
              placeholder="0"
              disabled={isPending}
            />
          </Field>
          <Field label="Estimated minutes" error={minutesValid ? undefined : "Use 0 or more minutes"}>
            <input
              className={inputClass}
              inputMode="numeric"
              value={draft.estimatedMinutes}
              onChange={(event) => update({ estimatedMinutes: event.currentTarget.value })}
              placeholder="60"
              disabled={isPending}
            />
          </Field>
          <label className="flex min-h-10 items-center gap-3 rounded-xl border border-white/10 bg-slate-950/45 px-3 text-sm font-semibold text-slate-200">
            <input
              type="checkbox"
              className="h-4 w-4 accent-blue-400"
              checked={draft.includedInReport}
              onChange={(event) => update({ includedInReport: event.currentTarget.checked })}
              disabled={isPending}
            />
            Include in weekly report
          </label>
          <Field label="Details">
            <textarea
              className={`${inputClass} min-h-36 resize-y py-3 leading-6 md:col-span-2`}
              value={draft.details}
              onChange={(event) => update({ details: event.currentTarget.value })}
              disabled={isPending}
            />
          </Field>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-4">
          <p className="text-xs text-slate-500">
            Source: Sparc Force task #{item.externalId}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={onConfirm} disabled={!canConfirm}>
              {isPending ? "Creating..." : "Create WorkTrace Task"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function sparcForceCountForKind(
  counts: SparcForceRecordCounts | undefined,
  kind: SparcForceImportedKind,
) {
  if (!counts) return 0;
  if (kind === "all") return counts.total;
  if (kind === "case") return counts.cases;
  if (kind === "project") return counts.projects;
  return counts.tasks;
}

function sparcForceOwnershipCount(
  counts: SparcForceRecordCounts | undefined,
  ownership: SparcForceOwnershipFilter,
  kind: SparcForceImportedKind,
) {
  if (!counts) return 0;
  if (ownership === "all") {
    if (kind === "task") return counts.tasks;
    if (kind === "case") return counts.cases;
    return counts.cases + counts.tasks;
  }
  if (ownership === "created_by_me") {
    const label = sparcForceOwnershipLabel(ownership);
    return counts.createdOwnerships.find((bucket) => bucket.label === label)?.count ?? 0;
  }
  const label = sparcForceOwnershipLabel(ownership);
  return counts.ownerships.find((bucket) => bucket.label === label)?.count ?? 0;
}

function sparcForceImportedKey(item: SparcForceImportedItem) {
  return `${item.kind}-${item.externalKind ?? item.source ?? "record"}-${item.externalId}`;
}

function sparcForceDisplayTitle(
  item: SparcForceImportedItem,
  raw = parseSparcForceRaw(item.rawJson),
) {
  const rawTitle = rawString(raw, [
    "title",
    "case_Title",
    "caseTitle",
    "case_Name",
    "caseName",
    "project_Name",
    "projectName",
    "task_Name",
    "taskName",
    "task_Title",
    "taskTitle",
    "name",
    "summary",
    "subject",
  ]);

  if (item.title.trim() && !item.title.toLowerCase().startsWith("untitled ")) {
    return item.title;
  }

  return rawTitle ?? item.title;
}

type SparcForceDetailRow = [string, string];

function sparcForceDetailRows(
  item: SparcForceImportedItem,
  raw: Record<string, unknown>,
  _displayTitle: string,
): SparcForceDetailRow[] {
  const common: SparcForceDetailRow[] = [
    ["External ID", item.externalId],
    ["Imported", formatTimestamp(item.importedAt)],
  ];

  if (item.kind === "case") {
    return [
      ...common,
      ["Case number", rawDisplay(raw, ["case_Number", "caseNumber"], item.externalId)],
      ["Client", rawDisplay(raw, ["client_Name", "clientName"], "Unknown client")],
      ["Assigned to", rawDisplay(raw, ["assigned_User_Name", "assignedUserName", "assigned_To", "assignedTo"], "Unassigned")],
      ["Created by", item.createdBy ?? rawDisplay(raw, ["created_By_Name", "createdByName", "created_By", "createdBy"], "Unknown")],
      ["Department", rawDisplay(raw, ["department_Name", "departmentName"], "None")],
      ["Team", rawDisplay(raw, ["teamName", "team_Name"], "None")],
      ["Project", rawDisplay(raw, ["project_Name", "projectName", "project_ID", "projectId"], "None")],
      ["Contract", rawDisplay(raw, ["contract_Number", "contractNumber", "contract_ID", "contractId"], "None")],
      ["Created", item.createdAtRemote ? formatTimestamp(item.createdAtRemote) : rawDateDisplay(raw, ["created_At", "createdAt", "created_Date", "createdDate"])],
      ["Updated", item.updatedAtRemote ? formatTimestamp(item.updatedAtRemote) : rawDateDisplay(raw, ["updated_At", "updatedAt", "lastActivityDate"])],
      ["Last activity", rawDateDisplay(raw, ["lastActivityDate", "last_Activity_Date"], "Unavailable")],
      ["SLA status", rawDisplay(raw, ["slaStatus", "slA_Status"], "Unavailable")],
      ["Days open", rawDisplay(raw, ["daysOpen", "days_Open"], "Unavailable")],
      ["Comments", rawDisplay(raw, ["commentCount", "comment_Count"], "0")],
      ["Attachments", rawDisplay(raw, ["attachmentCount", "attachment_Count"], "0")],
      ["Escalated", rawBoolDisplay(raw, ["is_Escalated", "isEscalated"])],
    ];
  }

  if (item.kind === "task") {
    return [
      ...common,
      ["Task source", rawDisplay(raw, ["task_Source", "taskSource"], item.source ? humanizeStatus(item.source) : "Sparc Force")],
      ["Scope", sparcForceTaskRelationshipLabel(item, raw)],
      ["Category", rawDisplay(raw, ["task_Category", "taskCategory"], "Uncategorized")],
      ["Project", rawDisplay(raw, ["project_Name", "projectName", "project_Code", "projectCode", "fk_Project_ID", "fkProjectId"], item.projectExternalId ?? "None")],
      ["Linked case", rawDisplay(raw, ["case_Title", "caseTitle", "case_Number", "caseNumber", "case_ID", "caseId"], item.caseExternalId ?? "None")],
      ["Assigned to", rawDisplay(raw, ["assigned_User_Name", "assignedUserName", "assigned_To", "assignedTo"], "Unassigned")],
      ["Owner", rawDisplay(raw, ["owner_User_Name", "ownerUserName", "owner_User_ID", "ownerUserId"], "None")],
      ["Created by", item.createdBy ?? rawDisplay(raw, ["created_By_Name", "createdByName", "created_By", "createdBy"], "Unknown")],
      ["Department", rawDisplay(raw, ["department_Name", "departmentName"], "None")],
      ["Team", rawDisplay(raw, ["team_Name", "teamName"], "None")],
      ["Due", rawDateDisplay(raw, ["due_Date", "dueDate"], "No due date")],
      ["Created", item.createdAtRemote ? formatTimestamp(item.createdAtRemote) : rawDateDisplay(raw, ["created_At", "createdAt", "created_Date", "createdDate"])],
      ["Completion", rawDateDisplay(raw, ["completion_Date", "completionDate"], "Not completed")],
      ["Progress", rawPercentDisplay(raw, ["completion_Percentage", "completionPercentage"])],
      ["Estimated hours", rawDisplay(raw, ["estimated_Hours", "estimatedHours"], "Unavailable")],
      ["Actual hours", rawDisplay(raw, ["actual_Hours", "actualHours"], "Unavailable")],
      ["Overdue", rawBoolDisplay(raw, ["is_Overdue", "isOverdue"])],
      ["Milestone", rawBoolDisplay(raw, ["is_Milestone", "isMilestone"])],
    ];
  }

  return [
    ...common,
    ["Project code", rawDisplay(raw, ["project_Code", "projectCode"], item.externalId)],
    ["Client", rawDisplay(raw, ["client_Name", "clientName"], "Unknown client")],
    ["Manager", rawDisplay(raw, ["project_Manager_Name", "projectManagerName", "project_Manager_ID", "projectManagerId"], "Unassigned")],
    ["Type", rawDisplay(raw, ["project_Type", "projectType"], "Unspecified")],
    ["Start date", rawDateDisplay(raw, ["start_Date", "startDate"], "Unavailable")],
    ["End date", rawDateDisplay(raw, ["end_Date", "endDate"], "Unavailable")],
    ["Progress", rawPercentDisplay(raw, ["completion_Percentage", "completionPercentage"])],
    ["Budget", rawMoneyDisplay(raw, ["budget_Amount", "budgetAmount"], rawString(raw, ["currency_Code", "currencyCode"]))],
    ["Tasks", projectTaskCountDisplay(raw)],
    ["Overdue", rawBoolDisplay(raw, ["is_Overdue", "isOverdue"])],
    ["Created", rawDateDisplay(raw, ["created_At", "createdAt", "created_Date", "createdDate"])],
    ["Updated", item.updatedAtRemote ? formatTimestamp(item.updatedAtRemote) : rawDateDisplay(raw, ["updated_At", "updatedAt"], "Unavailable")],
  ];
}

function sparcForceDetailIcon(label: string) {
  const normalized = label.toLowerCase();
  const className = "h-4 w-4";

  if (normalized.includes("external") || normalized.includes("number") || normalized.includes("code")) {
    return <Hash className={className} />;
  }
  if (normalized.includes("imported") || normalized.includes("created") || normalized.includes("updated") || normalized.includes("due") || normalized.includes("completion") || normalized.includes("activity") || normalized.includes("start") || normalized.includes("end")) {
    return <CalendarDays className={className} />;
  }
  if (normalized.includes("client") || normalized.includes("department")) {
    return <Building2 className={className} />;
  }
  if (normalized.includes("assigned") || normalized.includes("owner") || normalized.includes("manager") || normalized.includes("created by")) {
    return <User className={className} />;
  }
  if (normalized.includes("team")) {
    return <Users className={className} />;
  }
  if (normalized.includes("project") || normalized.includes("contract")) {
    return <Folder className={className} />;
  }
  if (normalized.includes("case") || normalized.includes("scope")) {
    return <Link2 className={className} />;
  }
  if (normalized.includes("source") || normalized.includes("category") || normalized.includes("type")) {
    return <Layers className={className} />;
  }
  if (normalized.includes("progress") || normalized.includes("sla") || normalized.includes("overdue") || normalized.includes("milestone") || normalized.includes("escalated")) {
    return <CheckCircle2 className={className} />;
  }
  if (normalized.includes("hours") || normalized.includes("days")) {
    return <Clock3 className={className} />;
  }
  if (normalized.includes("budget")) {
    return <Briefcase className={className} />;
  }
  if (normalized.includes("task") || normalized.includes("comment") || normalized.includes("attachment")) {
    return <FileText className={className} />;
  }

  return <Database className={className} />;
}

function sparcForceTaskDraftFromItem(item: SparcForceImportedItem): SparcForceTaskDraft {
  const raw = parseSparcForceRaw(item.rawJson);
  const dueDate = rawIsoDate(raw, ["due_Date", "dueDate"]);
  const completedAt = rawIsoDate(raw, ["completion_Date", "completionDate"]);
  const estimatedHours = rawNumber(raw, ["estimated_Hours", "estimatedHours"]);
  const estimatedMinutes =
    estimatedHours === null ? "" : String(Math.max(0, Math.round(estimatedHours * 60)));
  const progress = rawNumber(raw, ["completion_Percentage", "completionPercentage"]);

  return {
    title: sparcForceDisplayTitle(item, raw),
    details: sparcForceDescription(item.kind, raw) ?? sparcForceTaskDetailsForImport(item, raw),
    status: weeklyTaskStatusFromSparcForce(item.status),
    priority: weeklyTaskPriorityFromSparcForce(item.priority),
    targetDate: dueDate ?? "",
    completedAt: completedAt ?? "",
    includedInReport: true,
    progressPercent: progress === null ? "" : String(progress),
    estimatedMinutes,
  };
}

function sparcForceTaskDetailsForImport(
  item: SparcForceImportedItem,
  raw: Record<string, unknown>,
) {
  const lines = [
    rawString(raw, ["task_Description", "taskDescription", "description", "notes"]),
    rawString(raw, ["case_Title", "caseTitle", "case_Number", "caseNumber"])
      ? `Sparc Force case: ${rawString(raw, ["case_Title", "caseTitle", "case_Number", "caseNumber"])}`
      : null,
    rawString(raw, ["project_Name", "projectName", "project_Code", "projectCode"])
      ? `Sparc Force project: ${rawString(raw, ["project_Name", "projectName", "project_Code", "projectCode"])}`
      : null,
    `Imported from Sparc Force task ${item.externalId} (${item.source ?? "task"})`,
  ];

  return lines.filter(Boolean).join("\n\n");
}

function weeklyTaskStatusFromSparcForce(status: string | null | undefined): WeeklyTaskStatus {
  const value = status?.toLowerCase() ?? "";
  if (value.includes("complete") || value.includes("resolved") || value.includes("closed")) {
    return "completed";
  }
  if (value.includes("progress")) return "in_progress";
  if (value.includes("block") || value.includes("hold")) return "blocked";
  return "todo";
}

function weeklyTaskPriorityFromSparcForce(priority: string | null | undefined): WeeklyTaskPriority {
  const value = priority?.toLowerCase() ?? "";
  if (value.includes("high") || value.includes("critical")) return "high";
  if (value.includes("low")) return "low";
  return "normal";
}

function sparcForceDescription(kind: string, raw: Record<string, unknown>) {
  if (kind === "case") {
    return rawString(raw, [
      "description",
      "Description",
      "case_description",
      "case_Description",
      "caseDescription",
      "caseDescriptionHtml",
      "case_Description_HTML",
      "htmlDescription",
      "descriptionHtml",
      "details",
      "case_Details",
      "caseDetails",
      "resolution_Summary",
      "resolutionSummary",
      "resolution_Notes",
      "resolutionNotes",
      "root_Cause",
      "rootCause",
    ]);
  }

  if (kind === "task") {
    return rawString(raw, ["task_Description", "taskDescription", "notes", "description"]);
  }

  return rawString(raw, ["project_Description", "projectDescription", "description", "notes"]);
}

function sparcForceTaskRelationshipLabel(
  item: SparcForceImportedItem,
  raw: Record<string, unknown>,
) {
  const caseReference =
    item.caseExternalId ??
    rawString(raw, ["case_ID", "caseId", "case_Number", "caseNumber", "case_Title", "caseTitle"]);
  if (caseReference) return "Case linked";

  const projectReference =
    item.projectExternalId ??
    rawString(raw, ["fk_Project_ID", "fkProjectId", "project_ID", "projectId", "project_Name", "projectName"]);
  if (projectReference) return "Project task";

  const scope = rawString(raw, ["task_Scope", "taskScope"]);
  if (scope) return humanizeStatus(scope);

  return item.source ? humanizeStatus(item.source) : "Task";
}

function sparcForceOwnershipLabel(ownership: string | null | undefined) {
  if (ownership === "mine") return "Assigned to me";
  if (ownership === "created_by_me") return "Created by me";
  if (ownership === "other") return "Assigned to others";
  if (ownership === "unassigned") return "Unassigned";
  return "All cases";
}

function sparcForceAssignedUser(item: SparcForceImportedItem, raw: Record<string, unknown>) {
  return rawString(raw, ["assigned_User_Name", "assignedUserName"])
    ?? (item.assignedTo ? `User #${item.assignedTo}` : null)
    ?? rawString(raw, ["assigned_To", "assignedTo"]);
}

function sparcForceOwnershipSummary(
  item: SparcForceImportedItem,
  raw: Record<string, unknown>,
) {
  const assignedUser = sparcForceAssignedUser(item, raw);
  if (item.ownership === "mine") {
    return {
      label: "Assigned to me",
      className: "inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-300/20 bg-emerald-500/14 px-2.5 text-xs font-bold text-emerald-200",
    };
  }
  if (item.ownership === "other") {
    return {
      label: assignedUser ? `Other owner: ${assignedUser}` : "Assigned to others",
      className: "inline-flex h-8 items-center gap-1.5 rounded-lg border border-orange-300/20 bg-orange-500/12 px-2.5 text-xs font-bold text-orange-200",
    };
  }
  return {
    label: "Unassigned",
    className: "inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-slate-500/10 px-2.5 text-xs font-bold text-slate-300",
  };
}

function sparcForceOwnershipChip(
  item: SparcForceImportedItem,
  raw: Record<string, unknown>,
) {
  const summary = sparcForceOwnershipSummary(item, raw);
  return (
    <span className={summary.className.replace("h-8", "min-h-6").replace("text-xs", "text-[11px]")}>
      <User className="h-3 w-3" />
      {summary.label}
    </span>
  );
}

function parseSparcForceRaw(rawJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawJson);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function rawString(raw: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function looksLikeHtml(value: string | null | undefined) {
  return /<\/?[a-z][\s\S]*>/i.test(value ?? "");
}

function sanitizeSparcForceHtml(html: string) {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return escapeHtml(html);
  }

  const allowedTags = new Set([
    "A",
    "B",
    "BLOCKQUOTE",
    "BR",
    "CODE",
    "DIV",
    "EM",
    "I",
    "LI",
    "OL",
    "P",
    "PRE",
    "SPAN",
    "STRONG",
    "TABLE",
    "TBODY",
    "TD",
    "TH",
    "THEAD",
    "TR",
    "U",
    "UL",
  ]);
  const allowedAttributes = new Set(["href", "title", "target", "rel"]);
  const document = new DOMParser().parseFromString(html, "text/html");

  document.body.querySelectorAll("script, style, iframe, object, embed, link, meta").forEach((node) => {
    node.remove();
  });

  document.body.querySelectorAll("*").forEach((element) => {
    if (!allowedTags.has(element.tagName)) {
      const replacement = document.createTextNode(element.textContent ?? "");
      element.replaceWith(replacement);
      return;
    }

    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (!allowedAttributes.has(name) || name.startsWith("on")) {
        element.removeAttribute(attribute.name);
        return;
      }
      if (name === "href" && !/^(https?:|mailto:)/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
    });

    if (element.tagName === "A") {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noreferrer");
    }
  });

  return document.body.innerHTML;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function rawDisplay(raw: Record<string, unknown>, keys: string[], fallback: string) {
  return rawString(raw, keys) ?? fallback;
}

function rawIsoDate(raw: Record<string, unknown>, keys: string[]) {
  const value = rawString(raw, keys);
  return value?.slice(0, 10) ?? null;
}

function rawNumber(raw: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function rawDateDisplay(
  raw: Record<string, unknown>,
  keys: string[],
  fallback = "Unavailable",
) {
  const value = rawString(raw, keys);
  return value ? formatTimestamp(value) : fallback;
}

function rawBoolDisplay(raw: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "string" && value.trim()) {
      const normalized = value.trim().toLowerCase();
      if (["true", "yes", "1"].includes(normalized)) return "Yes";
      if (["false", "no", "0"].includes(normalized)) return "No";
    }
    if (typeof value === "number") return value > 0 ? "Yes" : "No";
  }
  return "Unavailable";
}

function rawPercentDisplay(raw: Record<string, unknown>, keys: string[]) {
  const value = rawString(raw, keys);
  if (!value) return "Unavailable";
  return value.endsWith("%") ? value : `${value}%`;
}

function rawMoneyDisplay(
  raw: Record<string, unknown>,
  keys: string[],
  currency: string | null,
) {
  const value = rawString(raw, keys);
  if (!value) return "Unavailable";
  return currency ? `${currency} ${value}` : value;
}

function projectTaskCountDisplay(raw: Record<string, unknown>) {
  const total = rawString(raw, ["task_Count", "taskCount"]);
  const completed = rawString(raw, ["completed_Task_Count", "completedTaskCount"]);
  if (total && completed) return `${completed} / ${total} completed`;
  return total ?? "Unavailable";
}

function formatRawPayload(rawJson: string) {
  try {
    return JSON.stringify(JSON.parse(rawJson), null, 2);
  } catch {
    return rawJson;
  }
}

function statusBadgeTone(status: string | null | undefined): "blue" | "green" | "orange" | "slate" {
  const value = status?.toLowerCase() ?? "";
  if (value.includes("resolved") || value.includes("complete") || value.includes("closed")) return "green";
  if (value.includes("progress") || value.includes("new") || value.includes("open")) return "blue";
  if (value.includes("hold") || value.includes("blocked")) return "orange";
  return "slate";
}

function priorityBadgeTone(priority: string | null | undefined): "blue" | "cyan" | "orange" | "slate" {
  const value = priority?.toLowerCase() ?? "";
  if (value.includes("critical") || value.includes("high")) return "orange";
  if (value.includes("medium")) return "blue";
  if (value.includes("low")) return "slate";
  return "cyan";
}

function humanizeStatus(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function integrationPanelTitle(panel: Exclude<IntegrationPanel, null>) {
  switch (panel) {
    case "github":
      return "GitHub Connection";
    case "sparcForce":
      return "Sparc Force Integration";
    case "git":
      return "Git Repository Settings";
    case "calendar":
      return "Calendar Sync";
    case "voice":
      return "Whisper / Voice Transcription";
    case "openrouter":
      return "OpenRouter Provider";
    case "groq":
      return "Groq Provider";
    case "nvidiaBuild":
      return "NVIDIA Build Provider";
  }
}

function integrationPanelPlacement(panel: IntegrationPanel) {
  if (!panel) return null;
  if (["github", "sparcForce", "git"].includes(panel)) return "development";
  if (panel === "calendar") return "calendar";
  return "ai";
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-xs font-semibold text-[var(--wt-text-muted)]">
      {label}
      {children}
      {error ? <span className="text-[11px] text-red-300">{error}</span> : null}
    </label>
  );
}

function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[var(--wt-border)] bg-[var(--wt-surface)] p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="mt-1 h-4 w-4 accent-blue-500"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[var(--wt-text-strong)]">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-[var(--wt-text-muted)]">{description}</span>
      </span>
    </label>
  );
}

function ProfileImagePreview({
  name,
  email,
  enabled,
  onToggle,
}: {
  name: string;
  email: string;
  enabled: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const hasUsableEmail = isEmailLike(email);
  const imageUrl = enabled && hasUsableEmail ? gravatarUrl(email, 192) : null;
  const initials = initialsForName(name || email);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[var(--wt-border)] bg-[var(--wt-surface)] p-4 lg:block">
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-blue-500/20 bg-[var(--wt-accent-soft)] shadow-[var(--wt-control-shadow)] lg:mx-auto lg:h-24 lg:w-24">
        {imageUrl && !imageFailed ? (
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-xl font-semibold text-[var(--wt-accent-text)] lg:text-2xl">
            {initials}
          </div>
        )}
      </div>
      <div className="min-w-0 lg:mt-3">
        <div className="text-sm font-semibold text-[var(--wt-text-strong)]">Profile image</div>
        <div className="mt-1 text-xs leading-5 text-[var(--wt-text-muted)]">
          {profileImageStatusText({
            enabled,
            hasUsableEmail,
            hasLoadedImage: Boolean(imageUrl && !imageFailed),
          })}
        </div>
        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-[var(--wt-border)] bg-[var(--wt-surface-muted)] p-2 text-left">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onToggle(event.currentTarget.checked)}
            className="mt-0.5 h-4 w-4 accent-blue-500"
          />
          <span className="text-xs leading-5 text-[var(--wt-text)]">
            Use Gravatar
            <span className="block text-[var(--wt-text-faint)]">
              Loads an external image from Gravatar for this email.
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}

const inputClass =
  "h-10 w-full rounded-xl border border-[var(--wt-border)] bg-[var(--wt-input)] px-3 text-sm text-[var(--wt-text-strong)] outline-none transition placeholder:text-[var(--wt-text-faint)] focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/15";
const filterSelectClass =
  "h-10 w-full min-w-0 max-w-full truncate rounded-lg border border-[var(--wt-border)] bg-[var(--wt-input)] px-3 pr-9 text-sm font-semibold text-[var(--wt-text-strong)] outline-none transition focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/15 disabled:cursor-not-allowed disabled:opacity-50";

function isEmailLike(value: string) {
  const trimmed = value.trim();
  const [localPart, domain, extra] = trimmed.split("@");
  return Boolean(
    localPart &&
      domain &&
      !extra &&
      domain.includes(".") &&
      !domain.startsWith(".") &&
      !domain.endsWith("."),
  );
}

function profileImageStatusText({
  enabled,
  hasUsableEmail,
  hasLoadedImage,
}: {
  enabled: boolean;
  hasUsableEmail: boolean;
  hasLoadedImage: boolean;
}) {
  if (!enabled) {
    return "WorkTrace is using local initials until Gravatar is enabled.";
  }

  if (!hasUsableEmail) {
    return "Enter a valid profile email before loading Gravatar.";
  }

  if (hasLoadedImage) {
    return "Loaded from Gravatar using your profile email.";
  }

  return "No Gravatar found for this email, so WorkTrace is using these initials.";
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

function toFormValues(settings: Settings): SettingsFormValues {
  return {
    name: settings.name,
    email: settings.email,
    useGravatarProfileImage: settings.useGravatarProfileImage,
    defaultManagerName: settings.defaultManagerName,
    gitAuthorEmail: settings.gitAuthorEmail,
    defaultReportTemplate: isReportTemplate(settings.defaultReportTemplate)
      ? settings.defaultReportTemplate
      : "professional_weekly_summary",
    workingDays: settings.workingDays.length
      ? settings.workingDays
      : ["monday", "tuesday", "wednesday", "thursday", "friday"],
    dailyWorkMinutes: settings.dailyWorkMinutes || 480,
    theme: isThemePreference(settings.theme) ? settings.theme : "dark",
    announcementsEnabled: settings.announcementsEnabled,
    announcementVolume: settings.announcementVolume,
    announcementVoice: settings.announcementVoice,
    announceFocusEvents: settings.announceFocusEvents,
    announceNudges: settings.announceNudges,
    announceSyncResults: settings.announceSyncResults,
    announceTaskChanges: settings.announceTaskChanges,
    voiceCommandsEnabled: settings.voiceCommandsEnabled,
    voiceCommandMode: "push_to_talk",
    voiceCommandConfirmBeforeAction: settings.voiceCommandConfirmBeforeAction,
    voiceTranscriptionProvider: isVoiceTranscriptionProvider(settings.voiceTranscriptionProvider)
      ? settings.voiceTranscriptionProvider
      : "local_whisper",
    voiceOnlineAllowed: settings.voiceOnlineAllowed,
    voicePrivacyAcknowledged: settings.voicePrivacyAcknowledged,
    voiceGroqModel: settings.voiceGroqModel || "whisper-large-v3-turbo",
    voiceOpenrouterModel: settings.voiceOpenrouterModel || "openai/whisper-1",
    reportAiEnabled: settings.reportAiEnabled,
    reportAiProvider: isReportAiProvider(settings.reportAiProvider)
      ? settings.reportAiProvider
      : "local_llama_cpp",
    reportAiOnlineAllowed: settings.reportAiOnlineAllowed,
    reportAiPrivacyAcknowledged: settings.reportAiPrivacyAcknowledged,
    reportAiLocalModelPath: settings.reportAiLocalModelPath,
    reportAiGroqModel: settings.reportAiGroqModel || "llama-3.1-8b-instant",
    reportAiNvidiaModel: settings.reportAiNvidiaModel || "meta/llama-3.1-70b-instruct",
    embeddingsEnabled: settings.embeddingsEnabled ?? false,
    embeddingProvider: isEmbeddingProvider(settings.embeddingProvider)
      ? settings.embeddingProvider
      : "native_local",
    embeddingLocalEndpoint: settings.embeddingLocalEndpoint || "",
    embeddingOnlineEndpoint: settings.embeddingOnlineEndpoint || "https://api.openai.com/v1/embeddings",
    embeddingModel: settings.embeddingModel || "BGESmallENV15",
    embeddingOnlineAllowed: settings.embeddingOnlineAllowed ?? false,
    embeddingPrivacyAcknowledged: settings.embeddingPrivacyAcknowledged ?? false,
    quickCaptureEnabled: settings.quickCaptureEnabled ?? true,
    quickCaptureShortcut: settings.quickCaptureShortcut || "CommandOrControl+Shift+Space",
    quickCaptureIncludeInReport: settings.quickCaptureIncludeInReport ?? true,
    startupEnabled: settings.startupEnabled ?? false,
    startMinimizedToTray: settings.startMinimizedToTray ?? true,
    minimizeToTrayOnClose: settings.minimizeToTrayOnClose ?? true,
    priorityRemindersEnabled: settings.priorityRemindersEnabled ?? true,
    priorityReminderDesktopEnabled: settings.priorityReminderDesktopEnabled ?? false,
    priorityReminderCheckpoints: (settings.priorityReminderCheckpoints?.length
      ? settings.priorityReminderCheckpoints
      : ["10:00", "13:00", "16:00"]
    ).join(", "),
    priorityReminderSnoozeMinutes: settings.priorityReminderSnoozeMinutes ?? 45,
    priorityReminderQuietStart: settings.priorityReminderQuietStart || "09:00",
    priorityReminderQuietEnd: settings.priorityReminderQuietEnd || "17:30",
    sparcForceAddonEnabled: settings.sparcForceAddonEnabled,
  };
}

function isReportTemplate(
  value: string,
): value is SettingsFormValues["defaultReportTemplate"] {
  return [
    "professional_weekly_summary",
    "project_based",
    "concise_manager_update",
  ].includes(value);
}

function isThemePreference(value: string): value is SettingsFormValues["theme"] {
  return ["dark", "light", "system"].includes(value);
}

function isReportAiProvider(
  value: string,
): value is SettingsFormValues["reportAiProvider"] {
  return ["local_llama_cpp", "openrouter_free", "groq", "nvidia_build"].includes(value);
}

function isEmbeddingProvider(
  value: string,
): value is SettingsFormValues["embeddingProvider"] {
  return ["native_local", "local_endpoint", "openai_compatible"].includes(value);
}

function isVoiceTranscriptionProvider(
  value: string,
): value is SettingsFormValues["voiceTranscriptionProvider"] {
  return ["local_whisper", "groq", "openrouter"].includes(value);
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function providerStatus(
  status: { providers: { provider: string; message: string }[] } | undefined,
  provider: ReportAiProvider,
) {
  return status?.providers.find((item) => item.provider === provider)?.message ?? "Status unavailable.";
}

function isProviderConfigured(
  status: ReportAiStatus | undefined,
  provider: ReportAiProvider,
) {
  return Boolean(
    status?.providers.find((item) => item.provider === provider)?.configured,
  );
}
