import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardCheck,
  Clock3,
  Edit3,
  NotebookText,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { listProjects } from "../lib/api/projects";
import {
  createManualLog,
  deleteManualLog,
  listManualLogs,
  updateManualLog,
} from "../lib/api/manualLogs";
import { currentWeekRange } from "../lib/dates";
import type { ActivityType, ManualLog } from "../types/manualLog";

const activityTypes: Array<{ value: ActivityType; label: string }> = [
  { value: "Meeting", label: "Meeting" },
  { value: "Development", label: "Development" },
  { value: "BugFix", label: "Bug Fix" },
  { value: "Testing", label: "Testing" },
  { value: "Deployment", label: "Deployment" },
  { value: "Research", label: "Research" },
  { value: "Documentation", label: "Documentation" },
  { value: "Planning", label: "Planning" },
  { value: "Support", label: "Support" },
  { value: "CodeReview", label: "Code Review" },
  { value: "ClientFeedback", label: "Client Feedback" },
];

const manualLogSchema = z.object({
  projectId: z.string().optional(),
  date: z.string().trim().min(1, "Date is required"),
  activityType: z.enum([
    "Meeting",
    "Development",
    "BugFix",
    "Testing",
    "Deployment",
    "Research",
    "Documentation",
    "Planning",
    "Support",
    "CodeReview",
    "ClientFeedback",
  ]),
  summary: z.string().trim().min(1, "Summary is required"),
  outcome: z.string().optional(),
  durationMinutes: z.union([
    z.number().min(0, "Duration cannot be negative"),
    z.literal(""),
  ]),
  followUp: z.string().optional(),
  includedInReport: z.boolean(),
});

type ManualLogFormValues = z.infer<typeof manualLogSchema>;

export function ManualLogPage() {
  const queryClient = useQueryClient();
  const weekRange = currentWeekRange();
  const [editingLog, setEditingLog] = useState<ManualLog | null>(null);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });
  const logsQuery = useQuery({
    queryKey: ["manualLogs", weekRange.from, weekRange.to],
    queryFn: () =>
      listManualLogs({
        from: weekRange.from,
        to: weekRange.to,
      }),
  });

  const form = useForm<ManualLogFormValues>({
    resolver: zodResolver(manualLogSchema),
    defaultValues: defaultValues(weekRange.from),
  });

  const projects = projectsQuery.data ?? [];
  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );
  const logs = logsQuery.data ?? [];
  const includedCount = logs.filter((log) => log.includedInReport).length;
  const totalMinutes = logs.reduce(
    (total, log) => total + (log.durationMinutes ?? 0),
    0,
  );

  const saveMutation = useMutation({
    mutationFn: (values: ManualLogFormValues) => {
      const input = toManualLogInput(values);

      if (editingLog) {
        return updateManualLog(editingLog.id, input);
      }

      return createManualLog(input);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["manualLogs"] }),
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
      ]);
      clearForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteManualLog,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["manualLogs"] }),
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
      ]);
    },
  });

  function editLog(log: ManualLog) {
    setEditingLog(log);
    form.reset({
      projectId: log.projectId ?? "",
      date: log.date,
      activityType: log.activityType,
      summary: log.summary,
      outcome: log.outcome ?? "",
      durationMinutes: log.durationMinutes ?? "",
      followUp: log.followUp ?? "",
      includedInReport: log.includedInReport,
    });
  }

  function clearForm() {
    setEditingLog(null);
    saveMutation.reset();
    form.reset(defaultValues(weekRange.from));
  }

  return (
    <div className="space-y-4">
      <Panel className="relative overflow-hidden p-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_25%,rgba(59,130,246,0.18),transparent_28%),radial-gradient(circle_at_78%_8%,rgba(20,184,166,0.14),transparent_24%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
              <NotebookText className="h-3.5 w-3.5" />
              Explicit work capture
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Manual Log
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Capture meetings, planning, testing, support, reviews, and other
              non-code work for the current reporting week.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Logs" value={logs.length.toString()} />
            <MiniStat label="Included" value={includedCount.toString()} />
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel className="p-0">
          <div className="border-b border-white/8 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">
                  {editingLog ? "Edit Activity" : "Log Non-Code Work"}
                </h2>
                <p className="mt-1 text-xs text-slate-400">{weekRange.label}</p>
              </div>
              {editingLog ? (
                <Button variant="ghost" onClick={clearForm}>
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>

          <form
            className="grid gap-4 p-4 lg:grid-cols-2"
            onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
          >
            <Field label="Date" error={form.formState.errors.date?.message}>
              <input
                type="date"
                className={inputClass}
                {...form.register("date")}
              />
            </Field>

            <Field label="Project">
              <select className={inputClass} {...form.register("projectId")}>
                <option value="">General / no project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Activity Type">
              <select className={inputClass} {...form.register("activityType")}>
                {activityTypes.map((activityType) => (
                  <option key={activityType.value} value={activityType.value}>
                    {activityType.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Duration (minutes)"
              error={form.formState.errors.durationMinutes?.message}
            >
              <input
                type="number"
                min="0"
                className={inputClass}
                placeholder="60"
                {...form.register("durationMinutes", {
                  setValueAs: (value) => (value === "" ? "" : Number(value)),
                })}
              />
            </Field>

            <Field
              label="Summary"
              error={form.formState.errors.summary?.message}
              className="lg:col-span-2"
            >
              <textarea
                className={`${inputClass} min-h-20 resize-y py-3`}
                placeholder="Reviewed onboarding flow with the team"
                {...form.register("summary")}
              />
            </Field>

            <Field label="Outcome" className="lg:col-span-2">
              <textarea
                className={`${inputClass} min-h-20 resize-y py-3`}
                placeholder="Decisions, shipped work, or result"
                {...form.register("outcome")}
              />
            </Field>

            <Field label="Follow-up / Next Steps" className="lg:col-span-2">
              <textarea
                className={`${inputClass} min-h-20 resize-y py-3`}
                placeholder="Anything to carry into the report or next week"
                {...form.register("followUp")}
              />
            </Field>

            <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/45 px-3 py-2 text-sm text-slate-300">
              <input
                type="checkbox"
                className="h-4 w-4 accent-blue-500"
                {...form.register("includedInReport")}
              />
              Include in weekly report
            </label>

            {saveMutation.isError ? (
              <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100 lg:col-span-2">
                {saveMutation.error instanceof Error
                  ? saveMutation.error.message
                  : "Manual log could not be saved."}
              </div>
            ) : null}

            <div className="flex justify-end lg:col-span-2">
              <Button
                type="submit"
                variant="primary"
                disabled={saveMutation.isPending}
                className="min-w-40"
              >
                <Save className="h-4 w-4" />
                {saveMutation.isPending
                  ? "Saving..."
                  : editingLog
                    ? "Save Changes"
                    : "Save Log"}
              </Button>
            </div>
          </form>
        </Panel>

        <div className="space-y-4">
          <Panel className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Clock3 className="h-4 w-4 text-cyan-300" />
              This Week
            </div>
            <GateLine label="Manual logs" value={logs.length.toString()} />
            <GateLine label="Report-ready" value={includedCount.toString()} />
            <GateLine label="Logged time" value={formatMinutes(totalMinutes)} />
          </Panel>

          <Panel className="min-h-[360px]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">Recent Logs</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {logs.length} entries for {weekRange.label}
                </p>
              </div>
              <Badge tone="blue">manual</Badge>
            </div>

            {logsQuery.isLoading ? (
              <div className="grid gap-2">
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="h-20 animate-pulse rounded-xl border border-white/8 bg-white/[0.03]"
                  />
                ))}
              </div>
            ) : logsQuery.isError ? (
              <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
                {logsQuery.error instanceof Error
                  ? logsQuery.error.message
                  : "Manual logs could not be loaded."}
              </div>
            ) : logs.length === 0 ? (
              <div className="flex min-h-[250px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 text-center">
                <div>
                  <ClipboardCheck className="mx-auto h-8 w-8 text-blue-300" />
                  <p className="mt-3 text-sm font-semibold text-white">No logs yet</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Add meetings, reviews, planning, or support work as it happens.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                {logs.map((log) => (
                  <ManualLogRow
                    key={log.id}
                    log={log}
                    projectName={
                      log.projectId ? projectNameById.get(log.projectId) : undefined
                    }
                    onEdit={() => editLog(log)}
                    onDelete={() => deleteMutation.mutate(log.id)}
                    isDeleting={deleteMutation.isPending}
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ManualLogRow({
  log,
  projectName,
  onEdit,
  onDelete,
  isDeleting,
}: {
  log: ManualLog;
  projectName?: string;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <article className="rounded-xl border border-white/8 bg-slate-950/45 p-3 shadow-lg shadow-black/10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="cyan">{activityLabel(log.activityType)}</Badge>
            {projectName ? <Badge tone="slate">{projectName}</Badge> : null}
            {!log.includedInReport ? <Badge tone="orange">Hidden</Badge> : null}
          </div>
          <p className="mt-2 truncate text-sm font-semibold text-white">{log.summary}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            {formatDate(log.date)}
            {log.durationMinutes ? ` · ${formatMinutes(log.durationMinutes)}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" onClick={onEdit} className="h-8 w-8 px-0">
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            onClick={onDelete}
            disabled={isDeleting}
            className="h-8 w-8 px-0"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </article>
  );
}

function Field({
  label,
  error,
  className = "",
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`grid gap-2 text-xs font-semibold text-slate-300 ${className}`}>
      {label}
      {children}
      {error ? <span className="text-[11px] text-red-300">{error}</span> : null}
    </label>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-right shadow-xl shadow-black/10">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function GateLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/8 bg-slate-950/35 px-3 py-2 text-xs">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold text-slate-100">{value}</span>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-white/10 bg-slate-950/75 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/15 disabled:opacity-60 h-10";

function defaultValues(date: string): ManualLogFormValues {
  return {
    projectId: "",
    date,
    activityType: "Meeting",
    summary: "",
    outcome: "",
    durationMinutes: "",
    followUp: "",
    includedInReport: true,
  };
}

function toManualLogInput(values: ManualLogFormValues) {
  return {
    projectId: values.projectId || null,
    date: values.date,
    activityType: values.activityType,
    summary: values.summary,
    outcome: values.outcome?.trim() || null,
    durationMinutes:
      values.durationMinutes === "" || values.durationMinutes === undefined
        ? null
        : Number(values.durationMinutes),
    followUp: values.followUp?.trim() || null,
    includedInReport: values.includedInReport,
  };
}

function activityLabel(value: ActivityType) {
  return activityTypes.find((activityType) => activityType.value === value)?.label ?? value;
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) {
    return `${remainder}m`;
  }

  return `${hours}h ${remainder.toString().padStart(2, "0")}m`;
}
