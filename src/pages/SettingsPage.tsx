import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, ExternalLink, FileText, LockKeyhole, Mail, Mic, Monitor, MoreHorizontal, Palette, PlugZap, Save, Settings as SettingsIcon, Sparkles, User, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
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
import { z } from "zod";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { SelectField } from "../components/ui/SelectField";
import { useSpeech } from "../components/ui/SpeechProvider";
import { useToast } from "../components/ui/ToastProvider";
import { getSettings, updateSettings } from "../lib/api/settings";
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
import type { ReportAiModelList, ReportAiProvider, ReportAiStatus } from "../types/report";
import type { CalendarSource } from "../types/calendar";
import type { Settings } from "../types/settings";

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
      message: "Use an email-like value",
    }),
  defaultManagerName: z.string().optional(),
  gitAuthorEmail: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || isEmailLike(value), {
      message: "Use an email-like value",
    }),
  defaultReportTemplate: z.enum([
    "professional_weekly_summary",
    "project_based",
    "concise_manager_update",
  ]),
  workingDays: z.array(z.string()).min(1, "Select at least one working day"),
  dailyWorkMinutes: z.number().min(60).max(960),
  theme: z.enum(["dark", "system"]),
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
  reportAiProvider: z.enum(["local_llama_cpp", "openrouter_free", "groq"]),
  reportAiOnlineAllowed: z.boolean(),
  reportAiPrivacyAcknowledged: z.boolean(),
  reportAiLocalModelPath: z.string(),
  reportAiGroqModel: z.string(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;
type SettingsTab = "general" | "work" | "audio" | "integrations" | "reporting";
type IntegrationPanel =
  | "github"
  | "git"
  | "calendar"
  | "voice"
  | "openrouter"
  | "groq"
  | null;

const settingsTabs: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "work", label: "Work Preferences" },
  { id: "audio", label: "Audio & Voice" },
  { id: "integrations", label: "Integrations" },
  { id: "reporting", label: "Reporting" },
];

export function SettingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const speech = useSpeech();
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [activeIntegrationPanel, setActiveIntegrationPanel] =
    useState<IntegrationPanel>(null);
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });
  const githubStatusQuery = useQuery({
    queryKey: ["githubIntegrationStatus"],
    queryFn: getGitHubIntegrationStatus,
  });
  const [githubToken, setGithubToken] = useState("");
  const calendarSourcesQuery = useQuery({
    queryKey: ["calendarSources"],
    queryFn: listCalendarSources,
  });
  const [calendarEmail, setCalendarEmail] = useState("");
  const reportAiStatusQuery = useQuery({
    queryKey: ["reportAiStatus"],
    queryFn: getReportAiStatus,
  });
  const [openRouterKey, setOpenRouterKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [providerModels, setProviderModels] = useState<
    Partial<Record<ReportAiProvider, ReportAiModelList>>
  >({});

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      name: "",
      email: "",
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
    },
  });

  useEffect(() => {
    if (settingsQuery.data && !form.formState.isDirty) {
      form.reset(toFormValues(settingsQuery.data));
    }
  }, [form, form.formState.isDirty, settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (values: SettingsFormValues) =>
      updateSettings({
        name: values.name,
        email: values.email ?? "",
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
    }),
    onSuccess: async (settings) => {
      form.reset(toFormValues(settings));
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Preferences saved", "Settings have been updated.");
    },
    onError: (error) => {
      toast.error("Settings failed", error instanceof Error ? error.message : "Settings could not be saved.");
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
  const connectAiMutation = useMutation({
    mutationFn: ({ provider, apiKey }: { provider: ReportAiProvider; apiKey: string }) =>
      connectReportAiProvider({ provider, apiKey }),
    onSuccess: async (_, variables) => {
      if (variables.provider === "openrouter_free") setOpenRouterKey("");
      if (variables.provider === "groq") setGroqKey("");
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

  const selectedWorkingDays = form.watch("workingDays");
  const githubConnected = Boolean(githubStatusQuery.data?.connected);
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
  const openRouterConfigured =
    openRouterKeyConfigured ||
    form.watch("reportAiProvider") === "openrouter_free" ||
    form.watch("voiceTranscriptionProvider") === "openrouter";
  const groqConfigured =
    groqKeyConfigured ||
    form.watch("reportAiProvider") === "groq" ||
    form.watch("voiceTranscriptionProvider") === "groq";
  const connectedIntegrationCount = [
    githubConnected,
    calendarConnected,
    voiceConfigured,
    reportAiEnabled,
    openRouterConfigured,
    groqConfigured,
  ].filter(Boolean).length;
  const lastSyncLabel =
    calendarSourcesQuery.data?.find((source) => source.lastSyncedAt)?.lastSyncedAt
      ? formatTimestamp(
          calendarSourcesQuery.data.find((source) => source.lastSyncedAt)!
            .lastSyncedAt!,
        )
      : githubStatusQuery.data?.lastValidatedAt
        ? formatTimestamp(githubStatusQuery.data.lastValidatedAt)
        : "Not synced yet";

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

  return (
    <div className="space-y-4">
      <Panel className="relative overflow-hidden p-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_25%,rgba(59,130,246,0.18),transparent_28%),radial-gradient(circle_at_78%_8%,rgba(20,184,166,0.14),transparent_24%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
              <SettingsIcon className="h-3.5 w-3.5" />
              Local preferences
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Settings</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Profile, reporting defaults, Git author, working days, and appearance
              preferences stored locally in SQLite.
            </p>
          </div>
          <div className="flex items-center gap-2">
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
          </div>
        </div>
      </Panel>

      <Panel className="p-2">
        <div className="flex flex-wrap gap-2">
          {settingsTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                "relative rounded-xl px-4 py-2.5 text-sm font-semibold transition",
                activeTab === tab.id
                  ? "bg-blue-500/20 text-white shadow-lg shadow-blue-500/15"
                  : "text-slate-400 hover:bg-white/8 hover:text-slate-100",
              ].join(" ")}
            >
              {tab.label}
              {activeTab === tab.id ? (
                <span className="absolute inset-x-4 -bottom-2 h-0.5 rounded-full bg-cyan-300" />
              ) : null}
            </button>
          ))}
        </div>
      </Panel>

      <form
        id="settings-form"
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
      >
        <div className="space-y-4">
          {activeTab === "general" ? (
          <Panel>
            <div className="mb-4 flex items-center gap-2 text-base font-semibold text-white">
              <User className="h-4 w-4 text-cyan-300" />
              Profile
            </div>
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
                description="Permit selected report drafts and context to be sent to OpenRouter or Groq."
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
                      Connect OpenRouter or Groq here. Keys stay in OS credential storage and are never returned to the UI.
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
                </div>
              </div>
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
              <Field label="Theme Preference">
                <SelectField
                  control={form.control}
                  name="theme"
                  disabled={settingsQuery.isLoading}
                  options={[
                    { value: "dark", label: "Dark", icon: Monitor },
                    { value: "system", label: "System", icon: Monitor },
                  ]}
                  size="sm"
                />
              </Field>
            </div>
          </Panel>
          ) : null}

          {activeTab === "integrations" ? (
          <Panel className="p-0">
            <div className="border-b border-white/8 bg-[linear-gradient(90deg,rgba(59,130,246,0.16),rgba(20,184,166,0.08),rgba(15,23,42,0))] px-5 py-5">
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
                  detail="of 7 integrations"
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
            </section>

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
              </div>
            </section>

            {activeIntegrationPanel ? (
              <IntegrationSetupPanel
                activePanel={activeIntegrationPanel}
                githubToken={githubToken}
                setGithubToken={setGithubToken}
                connectGithubMutation={connectGithubMutation}
                testGithubMutation={testGithubMutation}
                githubConnected={githubConnected}
                githubError={githubStatusQuery.error}
                githubIsError={githubStatusQuery.isError}
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
                connectAiMutation={connectAiMutation}
                testAiMutation={testAiMutation}
                connectAndTestAiMutation={connectAndTestAiMutation}
                disconnectAiMutation={disconnectAiMutation}
                listModelsMutation={listModelsMutation}
                providerModels={providerModels}
                reportAiStatus={reportAiStatusQuery.data}
                selectedGroqModel={form.watch("reportAiGroqModel")}
                selectedOpenRouterModel={form.watch("voiceOpenrouterModel")}
                onSelectModel={(provider, modelId) => {
                  if (provider === "groq") {
                    form.setValue("reportAiGroqModel", modelId, { shouldDirty: true });
                    form.setValue("voiceGroqModel", modelId, { shouldDirty: true });
                  }
                  if (provider === "openrouter_free") {
                    form.setValue("voiceOpenrouterModel", modelId, { shouldDirty: true });
                  }
                }}
                onClose={() => setActiveIntegrationPanel(null)}
                onOpenAudio={() => setActiveTab("audio")}
                onOpenReporting={() => setActiveTab("reporting")}
              />
            ) : null}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-blue-500/8 px-4 py-3 text-xs text-slate-400">
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
          <Panel>
            <div className="mb-4 flex items-center gap-2 text-base font-semibold text-white">
              <Palette className="h-4 w-4 text-cyan-300" />
              Working Days
            </div>
            <div className="grid grid-cols-2 gap-2">
              {workingDays.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  disabled={settingsQuery.isLoading}
                  onClick={() => toggleWorkingDay(day.value)}
                  className={[
                    "rounded-xl border px-3 py-2 text-sm font-semibold transition-all",
                    selectedWorkingDays.includes(day.value)
                      ? "border-blue-300/25 bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                      : "border-white/10 bg-slate-950/45 text-slate-400 hover:bg-white/10 hover:text-slate-200",
                  ].join(" ")}
                >
                  {day.label}
                </button>
              ))}
            </div>
            {form.formState.errors.workingDays?.message ? (
              <p className="mt-2 text-xs text-red-300">
                {form.formState.errors.workingDays.message}
              </p>
            ) : null}
          </Panel>

          <Panel>
            <div className="mb-4 flex items-center gap-2 text-base font-semibold text-white">
              <CalendarDays className="h-4 w-4 text-cyan-300" />
              Daily Capacity
            </div>
            <Field
              label="Work Capacity (minutes/day)"
              error={form.formState.errors.dailyWorkMinutes?.message}
            >
              <input
                type="number"
                min={60}
                max={960}
                step={15}
                className={inputClass}
                disabled={settingsQuery.isLoading}
                {...form.register("dailyWorkMinutes", { valueAsNumber: true })}
              />
            </Field>
          </Panel>

          <Panel className="space-y-3">
            <h2 className="text-base font-semibold text-white">Save Preferences</h2>
            <p className="text-xs leading-5 text-slate-400">
              Settings stay on this machine and are used as defaults for reports and
              local Git workflows.
            </p>
            {settingsQuery.isError ? (
              <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
                {settingsQuery.error instanceof Error
                  ? settingsQuery.error.message
                  : "Settings could not be loaded."}
              </div>
            ) : null}
            {settingsQuery.isLoading ? (
              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3 text-xs text-slate-400">
                Loading saved preferences...
              </div>
            ) : null}
            {saveMutation.isError ? (
              <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
                {saveMutation.error instanceof Error
                  ? saveMutation.error.message
                  : "Settings could not be saved."}
              </div>
            ) : null}
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={saveMutation.isPending || settingsQuery.isLoading}
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </Panel>
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
    <div className="rounded-2xl border border-white/8 bg-slate-950/35 p-4">
      <div className="text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs font-semibold text-slate-200">{label}</div>
      <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
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
    <div className="relative min-h-[142px] rounded-2xl border border-white/10 bg-gradient-to-br from-blue-500/10 via-slate-950/55 to-slate-950/35 p-4 shadow-lg shadow-black/10">
      <button
        type="button"
        className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-white/8 hover:text-slate-100"
        onClick={onPrimary}
        aria-label={`Manage ${title}`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      <div className="flex gap-4 pr-7">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/8 shadow-lg shadow-black/20">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-white">{title}</h4>
            <Badge tone={connected ? "green" : "slate"}>
              {connected ? "Connected" : "Not connected"}
            </Badge>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">{description}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 text-xs font-semibold text-blue-300 hover:text-blue-200"
          onClick={onPrimary}
        >
          {primaryLabel}
          {primaryIcon ? <ExternalLink className="h-3.5 w-3.5" /> : null}
        </button>
        <div className="flex items-center gap-2">
          {secondaryLabel && onSecondary ? (
            <button
              type="button"
              className="rounded-lg border border-blue-300/25 px-3 py-1.5 text-xs font-semibold text-blue-200 hover:bg-blue-500/10"
              onClick={onSecondary}
            >
              {secondaryLabel}
            </button>
          ) : null}
          {dangerLabel && onDanger ? (
            <button
              type="button"
              className="rounded-lg border border-red-300/30 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
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
  connectAiMutation,
  testAiMutation,
  connectAndTestAiMutation,
  disconnectAiMutation,
  listModelsMutation,
  providerModels,
  reportAiStatus,
  selectedGroqModel,
  selectedOpenRouterModel,
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
    <div className="mt-5 rounded-2xl border border-blue-300/15 bg-slate-950/55 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">
            {integrationPanelTitle(activePanel)}
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Configure this integration without leaving the Integrations section.
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/8"
          onClick={onClose}
        >
          Close
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
      {error instanceof Error ? error.message : fallback}
    </div>
  );
}

function integrationPanelTitle(panel: Exclude<IntegrationPanel, null>) {
  switch (panel) {
    case "github":
      return "GitHub Connection";
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
  }
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
    <label className="grid gap-2 text-xs font-semibold text-slate-300">
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
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/45 p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="mt-1 h-4 w-4 accent-cyan-300"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-100">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-400">{description}</span>
      </span>
    </label>
  );
}

const inputClass =
  "h-10 w-full rounded-xl border border-white/10 bg-slate-950/75 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/15";

function isEmailLike(value: string) {
  const trimmed = value.trim();
  return trimmed.includes("@") && !trimmed.startsWith("@") && !trimmed.endsWith("@");
}

function toFormValues(settings: Settings): SettingsFormValues {
  return {
    name: settings.name,
    email: settings.email,
    defaultManagerName: settings.defaultManagerName,
    gitAuthorEmail: settings.gitAuthorEmail,
    defaultReportTemplate: isReportTemplate(settings.defaultReportTemplate)
      ? settings.defaultReportTemplate
      : "professional_weekly_summary",
    workingDays: settings.workingDays.length
      ? settings.workingDays
      : ["monday", "tuesday", "wednesday", "thursday", "friday"],
    dailyWorkMinutes: settings.dailyWorkMinutes || 480,
    theme: settings.theme === "system" ? "system" : "dark",
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

function isReportAiProvider(
  value: string,
): value is SettingsFormValues["reportAiProvider"] {
  return ["local_llama_cpp", "openrouter_free", "groq"].includes(value);
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
