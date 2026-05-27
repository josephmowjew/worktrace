import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import {
  CalendarClock,
  Check,
  Cloud,
  DatabaseBackup,
  FolderOpen,
  HardDrive,
  Save,
  ShieldCheck,
} from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { SelectField } from "../components/ui/SelectField";
import { useToast } from "../components/ui/ToastProvider";
import {
  getSettings,
  updateSettings,
  validateBackupLocation,
} from "../lib/api/settings";
import type { BackupLocationValidation, Settings } from "../types/settings";

const days = [
  { label: "Monday", value: "monday" },
  { label: "Tuesday", value: "tuesday" },
  { label: "Wednesday", value: "wednesday" },
  { label: "Thursday", value: "thursday" },
  { label: "Friday", value: "friday" },
  { label: "Saturday", value: "saturday" },
  { label: "Sunday", value: "sunday" },
];

const backupSchema = z
  .object({
    backupEnabled: z.boolean(),
    backupSchedule: z.enum(["manual", "daily", "weekly"]),
    backupTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM format"),
    backupDay: z.enum([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ]),
    backupStorageMode: z.enum(["local", "online"]),
    backupStorageLocation: z.string().trim(),
    onlineBackupStatus: z.enum(["research", "deferred", "approved"]),
    onlineBackupProvider: z.string().trim(),
  })
  .superRefine((values, context) => {
    if (values.backupEnabled && !values.backupStorageLocation) {
      context.addIssue({
        code: "custom",
        path: ["backupStorageLocation"],
        message: "Choose where backups should be stored",
      });
    }
  });

type BackupFormValues = z.infer<typeof backupSchema>;

const risks = [
  ["Unavailable storage location", "Validate location and show clear errors"],
  ["Silent backup failure", "Provide visible status, alerts, and failure messaging"],
  ["Misunderstood schedule", "Use clear labels and exact scheduled timing"],
  ["Online security or privacy concern", "Complete review before implementation"],
  ["Online backup cost uncertainty", "Model cost before roadmap commitment"],
  ["Undefined restore behavior", "Define restore expectations before implementation"],
];

const evaluationCriteria = [
  "Security",
  "Privacy",
  "Compliance",
  "Latency",
  "Cost",
  "Reliability",
  "User Control",
  "Operational Complexity",
];

export function BackupPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const form = useForm<BackupFormValues>({
    resolver: zodResolver(backupSchema),
    defaultValues: {
      backupEnabled: false,
      backupSchedule: "daily",
      backupTime: "17:00",
      backupDay: "friday",
      backupStorageMode: "local",
      backupStorageLocation: "",
      onlineBackupStatus: "research",
      onlineBackupProvider: "",
    },
  });

  useEffect(() => {
    if (settingsQuery.data && !form.formState.isDirty) {
      form.reset(toFormValues(settingsQuery.data));
    }
  }, [form, form.formState.isDirty, settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (values: BackupFormValues) => updateSettings(values),
    onSuccess: async (settings) => {
      form.reset(toFormValues(settings));
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Backup plan saved", "Backup schedule and storage preferences were updated.");
    },
    onError: (error) => {
      toast.error(
        "Backup settings failed",
        error instanceof Error ? error.message : "Backup settings could not be saved.",
      );
    },
  });

  const selectedMode = form.watch("backupStorageMode");
  const selectedSchedule = form.watch("backupSchedule");
  const location = form.watch("backupStorageLocation").trim();
  const backupEnabled = form.watch("backupEnabled");
  const canValidateLocation = isDesktopRuntime() && selectedMode === "local" && location.length > 0;
  const locationValidationQuery = useQuery({
    queryKey: ["backup-location-validation", location],
    queryFn: () => validateBackupLocation(location),
    enabled: canValidateLocation,
    retry: false,
  });
  const storageStatus = getStorageStatus({
    enabled: backupEnabled,
    mode: selectedMode,
    location,
    validation: locationValidationQuery.data,
    isValidating: locationValidationQuery.isFetching,
    validationError: locationValidationQuery.isError,
  });
  const scheduleStatus = getScheduleStatus({
    enabled: backupEnabled,
    schedule: selectedSchedule,
    time: form.watch("backupTime"),
    day: form.watch("backupDay"),
  });
  const status = getBackupStatus(storageStatus, scheduleStatus);
  const blocksSave =
    backupEnabled &&
    selectedMode === "local" &&
    canValidateLocation &&
    (locationValidationQuery.isFetching || locationValidationQuery.data?.status !== "ready");

  async function chooseFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Choose backup storage location",
    });

    if (typeof selected === "string") {
      form.setValue("backupStorageLocation", selected, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }

  return (
    <div className="space-y-4">
      <Panel className="relative overflow-hidden p-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_25%,rgba(20,184,166,0.2),transparent_28%),radial-gradient(circle_at_82%_10%,rgba(59,130,246,0.16),transparent_25%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
              <DatabaseBackup className="h-3.5 w-3.5" />
              Data backup
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Backup Plan</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">
              Configure when backups should happen, where backups are stored, and how the online backup option is being evaluated.
            </p>
          </div>
          <Badge tone={status.tone}>
            <Check className="mr-1 h-3 w-3" />
            {status.label}
          </Badge>
        </div>
      </Panel>

      <form
        className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]"
        onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
      >
        <div className="space-y-4">
          <Panel>
            <div className="mb-4 flex items-center gap-2 text-base font-semibold text-white">
              <CalendarClock className="h-4 w-4 text-cyan-300" />
              Backup Scheduling
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="flex min-h-10 items-center gap-3 rounded-xl border border-white/10 bg-slate-950/50 px-3 text-sm font-semibold text-slate-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-blue-500"
                  disabled={settingsQuery.isLoading}
                  {...form.register("backupEnabled")}
                />
                Enable backups
              </label>
              <Field label="Schedule" error={form.formState.errors.backupSchedule?.message}>
                <SelectField
                  control={form.control}
                  name="backupSchedule"
                  disabled={settingsQuery.isLoading}
                  options={[
                    { value: "manual", label: "Manual", icon: CalendarClock },
                    { value: "daily", label: "Daily", icon: CalendarClock },
                    { value: "weekly", label: "Weekly", icon: CalendarClock },
                  ]}
                  size="sm"
                />
              </Field>
              <Field label="Time" error={form.formState.errors.backupTime?.message}>
                <input
                  type="time"
                  className={inputClass}
                  disabled={settingsQuery.isLoading || selectedSchedule === "manual"}
                  {...form.register("backupTime")}
                />
              </Field>
              <Field label="Day" error={form.formState.errors.backupDay?.message}>
                <SelectField
                  control={form.control}
                  name="backupDay"
                  disabled={settingsQuery.isLoading || selectedSchedule === "daily" || selectedSchedule === "manual"}
                  options={days.map((day) => ({
                    ...day,
                    icon: CalendarClock,
                  }))}
                  size="sm"
                />
              </Field>
              <div className="md:col-span-3 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-slate-400">
                {scheduleStatus.message}
              </div>
            </div>
          </Panel>

          <Panel>
            <div className="mb-4 flex items-center gap-2 text-base font-semibold text-white">
              <HardDrive className="h-4 w-4 text-cyan-300" />
              Storage Location
            </div>
            <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <Field label="Storage Type" error={form.formState.errors.backupStorageMode?.message}>
                <SelectField
                  control={form.control}
                  name="backupStorageMode"
                  disabled={settingsQuery.isLoading}
                  options={[
                    { value: "local", label: "Local storage", icon: HardDrive },
                    { value: "online", label: "Online backup", icon: Cloud },
                  ]}
                  size="sm"
                />
              </Field>
              <Field
                label={selectedMode === "online" ? "Online Backup Location" : "Backup Folder"}
                error={form.formState.errors.backupStorageLocation?.message}
              >
                <div className="flex gap-2">
                  <input
                    className={inputClass}
                    disabled={settingsQuery.isLoading}
                    placeholder={selectedMode === "online" ? "[FILL: online storage model]" : "Choose a folder"}
                    {...form.register("backupStorageLocation")}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={settingsQuery.isLoading || selectedMode === "online"}
                    onClick={chooseFolder}
                    aria-label="Choose backup folder"
                    title="Choose backup folder"
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>
                <p className={`text-xs ${storageStatus.tone === "green" ? "text-emerald-300" : storageStatus.tone === "orange" ? "text-orange-300" : "text-slate-400"}`}>
                  {storageStatus.message}
                </p>
              </Field>
            </div>
          </Panel>

          <Panel>
            <div className="mb-4 flex items-center gap-2 text-base font-semibold text-white">
              <Cloud className="h-4 w-4 text-cyan-300" />
              Online Backup Exploration
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Research Status" error={form.formState.errors.onlineBackupStatus?.message}>
                <SelectField
                  control={form.control}
                  name="onlineBackupStatus"
                  disabled={settingsQuery.isLoading}
                  options={[
                    { value: "research", label: "Researching", icon: Cloud },
                    { value: "deferred", label: "Deferred", icon: Cloud },
                    { value: "approved", label: "Approved", icon: Cloud },
                  ]}
                  size="sm"
                />
              </Field>
              <Field label="Provider Or Model" error={form.formState.errors.onlineBackupProvider?.message}>
                <input
                  className={inputClass}
                  disabled={settingsQuery.isLoading}
                  placeholder="[FILL: online storage model]"
                  {...form.register("onlineBackupProvider")}
                />
              </Field>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {evaluationCriteria.map((criterion) => (
                <div
                  key={criterion}
                  className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-slate-300"
                >
                  {criterion}
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-white">MVP Status</h2>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
            <p className="text-xs leading-5 text-slate-400">
              MVP scope covers backup scheduling configuration, storage location selection, basic validation, and visible status. Online backup remains tied to research status.
            </p>
            <div className="grid gap-2 rounded-lg border border-white/8 bg-white/[0.03] p-3 text-xs text-slate-400">
              <div className="flex items-center justify-between gap-3">
                <span>Schedule</span>
                <span className="font-semibold text-slate-200">{scheduleStatus.label}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Storage</span>
                <span className="font-semibold text-slate-200">{storageStatus.label}</span>
              </div>
            </div>
            {settingsQuery.isError ? (
              <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
                {settingsQuery.error instanceof Error
                  ? settingsQuery.error.message
                  : "Backup settings could not be loaded."}
              </div>
            ) : null}
            {saveMutation.isError ? (
              <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
                {saveMutation.error instanceof Error
                  ? saveMutation.error.message
                  : "Backup settings could not be saved."}
              </div>
            ) : null}
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={saveMutation.isPending || settingsQuery.isLoading || blocksSave}
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Saving..." : "Save Backup Plan"}
            </Button>
          </Panel>

          <Panel>
            <div className="mb-4 flex items-center gap-2 text-base font-semibold text-white">
              <ShieldCheck className="h-4 w-4 text-cyan-300" />
              Risks And Mitigations
            </div>
            <div className="space-y-2">
              {risks.map(([risk, mitigation]) => (
                <div key={risk} className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
                  <p className="text-xs font-semibold text-slate-200">{risk}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{mitigation}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </form>

    </div>
  );
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

function toFormValues(settings: Settings): BackupFormValues {
  return {
    backupEnabled: Boolean(settings.backupEnabled),
    backupSchedule: isBackupSchedule(settings.backupSchedule) ? settings.backupSchedule : "daily",
    backupTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(settings.backupTime)
      ? settings.backupTime
      : "17:00",
    backupDay: isBackupDay(settings.backupDay) ? settings.backupDay : "friday",
    backupStorageMode: settings.backupStorageMode === "online" ? "online" : "local",
    backupStorageLocation: settings.backupStorageLocation ?? "",
    onlineBackupStatus: isOnlineBackupStatus(settings.onlineBackupStatus)
      ? settings.onlineBackupStatus
      : "research",
    onlineBackupProvider: settings.onlineBackupProvider ?? "",
  };
}

function getBackupStatus(
  storageStatus: StatusSummary,
  scheduleStatus: StatusSummary,
): { label: string; tone: "green" | "orange" | "cyan" | "slate" } {
  if (storageStatus.tone === "orange") {
    return { label: storageStatus.label, tone: "orange" };
  }

  if (scheduleStatus.tone === "slate") {
    return { label: scheduleStatus.label, tone: "slate" };
  }

  if (storageStatus.tone === "cyan") {
    return { label: storageStatus.label, tone: "cyan" };
  }

  return { label: scheduleStatus.label, tone: "green" };
}

function isBackupSchedule(value: string): value is BackupFormValues["backupSchedule"] {
  return ["manual", "daily", "weekly"].includes(value);
}

function isBackupDay(value: string): value is BackupFormValues["backupDay"] {
  return days.some((day) => day.value === value);
}

function isOnlineBackupStatus(value: string): value is BackupFormValues["onlineBackupStatus"] {
  return ["research", "deferred", "approved"].includes(value);
}

type StatusSummary = {
  label: string;
  message: string;
  tone: "green" | "orange" | "cyan" | "slate";
};

function getScheduleStatus({
  enabled,
  schedule,
  time,
  day,
}: {
  enabled: boolean;
  schedule: BackupFormValues["backupSchedule"];
  time: string;
  day: string;
}): StatusSummary {
  if (!enabled) {
    return {
      label: "Paused",
      message: "Automatic backups are paused.",
      tone: "slate",
    };
  }

  if (schedule === "manual") {
    return {
      label: "Manual only",
      message: "Automatic backups are off. Use manual backup when needed.",
      tone: "green",
    };
  }

  if (schedule === "daily") {
    return {
      label: "Scheduled",
      message: `Backups are scheduled daily at ${time}.`,
      tone: "green",
    };
  }

  const dayLabel = days.find((entry) => entry.value === day)?.label ?? "Friday";
  return {
    label: "Scheduled",
    message: `Backups are scheduled every ${dayLabel} at ${time}.`,
    tone: "green",
  };
}

function getStorageStatus({
  enabled,
  mode,
  location,
  validation,
  isValidating,
  validationError,
}: {
  enabled: boolean;
  mode: BackupFormValues["backupStorageMode"];
  location: string;
  validation?: BackupLocationValidation;
  isValidating: boolean;
  validationError: boolean;
}): StatusSummary {
  if (!location) {
    return {
      label: enabled ? "Needs location" : "No location",
      message: enabled
        ? "Choose where backups should be stored before enabling backups."
        : "Choose a backup folder when you are ready to enable backups.",
      tone: enabled ? "orange" : "slate",
    };
  }

  if (mode === "online") {
    return {
      label: "Online research",
      message: "Online backup remains exploratory until the storage model is approved.",
      tone: "cyan",
    };
  }

  if (isValidating) {
    return {
      label: "Validating",
      message: "Checking whether WorkTrace can use this folder.",
      tone: "slate",
    };
  }

  if (validationError) {
    return {
      label: "Unavailable",
      message: "Backup folder validation could not be completed.",
      tone: "orange",
    };
  }

  if (validation?.status === "ready") {
    return {
      label: "Ready",
      message: validation.message,
      tone: "green",
    };
  }

  if (validation) {
    return {
      label: validation.status === "not_writable" ? "Not writable" : "Unavailable",
      message: validation.message,
      tone: "orange",
    };
  }

  return {
    label: "Selected",
    message: "This folder will be validated in the desktop app before backups are enabled.",
    tone: "slate",
  };
}

function isDesktopRuntime() {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

const inputClass =
  "h-10 w-full rounded-xl border border-white/10 bg-slate-950/75 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/15 disabled:cursor-not-allowed disabled:opacity-50";
