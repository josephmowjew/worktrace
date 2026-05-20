import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Mail, Palette, Save, Settings as SettingsIcon, User } from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { getSettings, updateSettings } from "../lib/api/settings";
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
  theme: z.enum(["dark", "system"]),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export function SettingsPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      name: "",
      email: "",
      defaultManagerName: "",
      gitAuthorEmail: "",
      defaultReportTemplate: "professional_weekly_summary",
      workingDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      theme: "dark",
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
        theme: values.theme,
    }),
    onSuccess: async (settings) => {
      form.reset(toFormValues(settings));
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  const selectedWorkingDays = form.watch("workingDays");

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
          {saveMutation.isSuccess ? (
            <Badge tone="green">
              <Check className="mr-1 h-3 w-3" />
              Saved
            </Badge>
          ) : null}
        </div>
      </Panel>

      <form
        className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]"
        onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
      >
        <div className="space-y-4">
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

          <Panel>
            <div className="mb-4 flex items-center gap-2 text-base font-semibold text-white">
              <Mail className="h-4 w-4 text-cyan-300" />
              Reporting Defaults
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Default Report Template">
                <select
                  className={inputClass}
                  disabled={settingsQuery.isLoading}
                  {...form.register("defaultReportTemplate")}
                >
                  <option value="professional_weekly_summary">
                    Professional weekly summary
                  </option>
                  <option value="project_based">Project based</option>
                  <option value="concise_manager_update">
                    Concise manager update
                  </option>
                </select>
              </Field>
              <Field label="Theme Preference">
                <select
                  className={inputClass}
                  disabled={settingsQuery.isLoading}
                  {...form.register("theme")}
                >
                  <option value="dark">Dark</option>
                  <option value="system">System</option>
                </select>
              </Field>
            </div>
          </Panel>
        </div>

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
    theme: settings.theme === "system" ? "system" : "dark",
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
