import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Bug,
  CalendarDays,
  Check,
  ClipboardCheck,
  Clock3,
  Code,
  Edit3,
  Eraser,
  Eye,
  FileText,
  FlaskConical,
  FolderKanban,
  Headphones,
  MessageSquare,
  NotebookText,
  RefreshCw,
  Rocket,
  Save,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { DatePicker } from "../components/ui/DatePicker";
import { Panel } from "../components/ui/Panel";
import { SelectField } from "../components/ui/SelectField";
import { useSpeech } from "../components/ui/SpeechProvider";
import { useToast } from "../components/ui/ToastProvider";
import {
  createManualLog,
  deleteManualLog,
  listManualLogs,
  updateManualLog,
} from "../lib/api/manualLogs";
import { listProjects } from "../lib/api/projects";
import { manualLogAnnouncement } from "../lib/announcements";
import { currentWeekRange } from "../lib/dates";
import type { ActivityType, ManualLog } from "../types/manualLog";

const activityTypes: Array<{
  value: ActivityType;
  label: string;
  icon: React.ElementType;
  tone: IconTone;
}> = [
  { value: "Meeting", label: "Meeting", icon: Users, tone: "purple" },
  { value: "Development", label: "Development", icon: Code, tone: "blue" },
  { value: "BugFix", label: "Bug Fix", icon: Bug, tone: "orange" },
  { value: "Testing", label: "Testing", icon: FlaskConical, tone: "amber" },
  { value: "Deployment", label: "Deployment", icon: Rocket, tone: "green" },
  { value: "Research", label: "Research", icon: Eye, tone: "cyan" },
  { value: "Documentation", label: "Documentation", icon: FileText, tone: "blue" },
  { value: "Planning", label: "Planning", icon: CalendarDays, tone: "purple" },
  { value: "Support", label: "Support", icon: Headphones, tone: "orange" },
  { value: "CodeReview", label: "Code Review", icon: Eye, tone: "cyan" },
  { value: "ClientFeedback", label: "Client Feedback", icon: MessageSquare, tone: "green" },
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
type IconTone = "blue" | "cyan" | "green" | "purple" | "orange" | "amber" | "slate";

export function ManualLogPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const speech = useSpeech();
  const weekRange = currentWeekRange();
  const [editingLog, setEditingLog] = useState<ManualLog | null>(null);
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");

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

  const projects = (projectsQuery.data ?? []).filter(
    (project) => project.status === "active",
  );
  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );
  const logs = useMemo(() => {
    const sorted = [...(logsQuery.data ?? [])];
    sorted.sort((left, right) =>
      sortDirection === "desc"
        ? right.date.localeCompare(left.date)
        : left.date.localeCompare(right.date),
    );
    return sorted;
  }, [logsQuery.data, sortDirection]);
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
    onSuccess: async (log, values) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["manualLogs"] }),
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
      ]);
      toast.success(editingLog ? "Manual log updated" : "Manual log saved");
      speech.announce(
        manualLogAnnouncement(
          editingLog ? "Manual log updated" : "Manual log saved",
          log,
          projectNameFor(values.projectId, projectNameById),
        ),
        { category: "general" },
      );
      clearForm();
    },
    onError: (error) => {
      toast.error("Manual log failed", error instanceof Error ? error.message : "The log could not be saved.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteManualLog,
    onSuccess: async (_result, logId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["manualLogs"] }),
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
      ]);
      toast.success("Manual log deleted");
      const deletedLog = logs.find((log) => log.id === logId);
      if (deletedLog) {
        speech.announce(
          manualLogAnnouncement(
            "Manual log deleted",
            deletedLog,
            projectNameFor(deletedLog.projectId, projectNameById),
          ),
          { category: "general" },
        );
      }
    },
    onError: (error) => {
      toast.error("Delete failed", error instanceof Error ? error.message : "The log could not be deleted.");
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
      <ManualLogHero
        weekLabel={weekRange.label}
        totalLogs={logs.length}
        includedCount={includedCount}
        totalMinutes={totalMinutes}
      />

      <div className="grid min-h-0 gap-4 2xl:grid-cols-[minmax(420px,0.84fr)_minmax(620px,1.16fr)]">
        <Panel className="relative overflow-hidden p-0">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-purple-300/50 to-transparent" />
          <div className="flex items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-purple-300" />
              <h2 className="text-sm font-semibold text-white">Recent Manual Logs</h2>
            </div>
            <button
              type="button"
              onClick={() =>
                setSortDirection((current) => (current === "desc" ? "asc" : "desc"))
              }
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-300 transition hover:border-cyan-300/25 hover:bg-cyan-300/10 hover:text-cyan-100"
            >
              {sortDirection === "desc" ? "Most recent" : "Oldest first"}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="max-h-[calc(100vh-350px)] min-h-[460px] space-y-3 overflow-y-auto p-5 pr-4">
            <button
              type="button"
              onClick={clearForm}
              className={`group flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-left transition ${
                editingLog
                  ? "border-white/10 bg-white/[0.03] hover:border-purple-300/30"
                  : "border-purple-300/60 bg-purple-500/10 shadow-lg shadow-purple-500/10"
              }`}
            >
              <span className="flex items-center gap-4">
                <span className="grid h-12 w-12 place-items-center rounded-2xl border border-purple-300/35 bg-purple-500/20 text-purple-100">
                  <NotebookText className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">New Entry</span>
                  <span className="mt-1 block text-xs text-slate-400">
                    Create a new manual log
                  </span>
                </span>
              </span>
              <ArrowRight className="h-4 w-4 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-purple-200" />
            </button>

            {logsQuery.isLoading ? (
              <div className="grid gap-3">
                {[0, 1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="h-20 animate-pulse rounded-2xl border border-white/8 bg-white/[0.03]"
                  />
                ))}
              </div>
            ) : logsQuery.isError ? (
              <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
                {logsQuery.error instanceof Error
                  ? logsQuery.error.message
                  : "Manual logs could not be loaded."}
              </div>
            ) : logs.length === 0 ? (
              <EmptyLogs />
            ) : (
              <div className="grid gap-3">
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
          </div>
        </Panel>

        <Panel className="relative overflow-hidden p-0">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-blue-300/0 via-cyan-300/50 to-blue-300/0" />
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 px-5 py-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold tracking-tight text-white">
                  {editingLog ? "Edit Non-Code Work" : "Log Non-Code Work"}
                </h2>
                <Badge tone="blue">{editingLog ? "Editing" : "New Entry"}</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-400">
                Add the details of the work you performed.
              </p>
            </div>
            <Button variant="ghost" onClick={clearForm}>
              {editingLog ? <X className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
              {editingLog ? "Cancel" : "Clear Form"}
            </Button>
          </div>

          <form
            className="grid gap-5 p-5 lg:grid-cols-2"
            onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
          >
            <Field
              label="Date"
              help="The date when the work was performed."
              error={form.formState.errors.date?.message}
            >
              <DatePicker
                value={form.watch("date")}
                subtitle="Manual work date"
                onChange={(value) =>
                  form.setValue("date", value, {
                    shouldDirty: true,
                    shouldTouch: true,
                    shouldValidate: true,
                  })
                }
              />
            </Field>

            <Field label="Project (optional)" help="Choose the related project, if any.">
              <SelectField
                control={form.control}
                name="projectId"
                options={[
                  { value: "", label: "General / no project", icon: FolderKanban },
                  ...projects.map((project) => ({
                    value: project.id,
                    label: project.name,
                    icon: FolderKanban,
                  })),
                ]}
                size="md"
              />
            </Field>

            <Field label="Activity Type" help="What type of non-code work was this?">
              <SelectField
                control={form.control}
                name="activityType"
                options={activityTypes.map((type) => ({
                  value: type.value,
                  label: type.label,
                  icon: type.icon,
                }))}
                size="md"
              />
            </Field>

            <Field
              label="Duration (minutes)"
              help="How much time did you spend on this?"
              error={form.formState.errors.durationMinutes?.message}
            >
              <div className="relative">
                <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="number"
                  min="0"
                  className={`${inputClass} pl-10`}
                  placeholder="60"
                  {...form.register("durationMinutes", {
                    setValueAs: (value) => (value === "" ? "" : Number(value)),
                  })}
                />
              </div>
            </Field>

            <Field
              label="Summary"
              help="Provide a clear, concise summary of the work."
              error={form.formState.errors.summary?.message}
              className="lg:col-span-2"
            >
              <textarea
                className={`${inputClass} min-h-20 resize-y py-3`}
                placeholder="Describe the work you performed in a few sentences."
                {...form.register("summary")}
              />
            </Field>

            <Field
              label="Outcome"
              help="Focus on decisions made, work shipped, or value delivered."
              className="lg:col-span-2"
            >
              <textarea
                className={`${inputClass} min-h-20 resize-y py-3`}
                placeholder="What was the outcome or result of this work?"
                {...form.register("outcome")}
              />
            </Field>

            <Field
              label="Follow-up / Next Steps"
              help="Capture any follow-ups, dependencies, or handoffs."
              className="lg:col-span-2"
            >
              <textarea
                className={`${inputClass} min-h-20 resize-y py-3`}
                placeholder="What are the next steps or who is responsible?"
                {...form.register("followUp")}
              />
            </Field>

            <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">
                    Include in weekly report
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    When enabled, this log will be included in your weekly report.
                  </p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    {...form.register("includedInReport")}
                  />
                  <span className="h-7 w-14 rounded-full border border-white/10 bg-slate-800 transition peer-checked:border-purple-300/40 peer-checked:bg-gradient-to-r peer-checked:from-purple-500 peer-checked:to-blue-500" />
                  <span className="absolute left-1 grid h-5 w-5 place-items-center rounded-full bg-white text-slate-700 shadow transition peer-checked:translate-x-7 peer-checked:text-blue-600">
                    <Check className="h-3 w-3" />
                  </span>
                </label>
              </div>
            </div>

            {saveMutation.isError ? (
              <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100 lg:col-span-2">
                {saveMutation.error instanceof Error
                  ? saveMutation.error.message
                  : "Manual log could not be saved."}
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-3 lg:col-span-2">
              <Button type="button" variant="secondary" onClick={clearForm}>
                <Eraser className="h-4 w-4" />
                Clear Form
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={saveMutation.isPending}
                className="min-w-40 bg-gradient-to-r from-blue-600 to-indigo-500 shadow-blue-500/30 hover:from-blue-500 hover:to-indigo-400"
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
      </div>
    </div>
  );
}

function ManualLogHero({
  weekLabel,
  totalLogs,
  includedCount,
  totalMinutes,
}: {
  weekLabel: string;
  totalLogs: number;
  includedCount: number;
  totalMinutes: number;
}) {
  return (
    <Panel className="relative overflow-hidden p-0">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_20%,rgba(59,130,246,0.20),transparent_24%),radial-gradient(circle_at_84%_36%,rgba(20,184,166,0.18),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.2),rgba(15,23,42,0.82))]" />
      <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:32px_32px]" />
      <div className="relative grid gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)] lg:items-center">
        <div className="flex items-center gap-5">
          <div className="relative hidden h-24 w-24 shrink-0 place-items-center rounded-[28px] border border-cyan-300/25 bg-gradient-to-br from-blue-500/20 to-purple-500/20 shadow-2xl shadow-blue-500/20 sm:grid">
            <div className="absolute inset-3 rounded-[22px] border border-white/10 bg-slate-950/40" />
            <NotebookText className="relative h-12 w-12 text-cyan-200 drop-shadow-[0_0_18px_rgba(34,211,238,0.55)]" />
          </div>
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
              <ClipboardCheck className="h-3.5 w-3.5" />
              Explicit work capture
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Manual Log
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Capture meetings, planning, testing, support, reviews, and other non-code work for the current reporting week.
            </p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {weekLabel}
            </p>
          </div>
        </div>

        <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/35 p-4 shadow-2xl shadow-black/20 sm:grid-cols-3">
          <HeroStat icon={FileText} label="Logs" value={totalLogs.toString()} detail="Total logs" tone="blue" />
          <HeroStat icon={Check} label="Included" value={includedCount.toString()} detail="Included in report" tone="green" />
          <HeroStat icon={Clock3} label="Logged Time" value={formatMinutes(totalMinutes)} detail="This week" tone="orange" />
        </div>
      </div>
    </Panel>
  );
}

function HeroStat({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  detail: string;
  tone: IconTone;
}) {
  return (
    <div className="flex items-center gap-3 border-white/10 sm:border-r sm:last:border-r-0">
      <IconBubble tone={tone} size="lg">
        <Icon className="h-5 w-5" />
      </IconBubble>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          {label}
        </p>
        <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
        <p className="text-xs text-slate-400">{detail}</p>
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
  const activity = activityTypes.find((item) => item.value === log.activityType);
  const Icon = activity?.icon ?? NotebookText;

  return (
    <article className="group rounded-2xl border border-white/10 bg-slate-950/35 p-4 shadow-lg shadow-black/10 transition hover:border-cyan-300/25 hover:bg-white/[0.045]">
      <div className="flex items-center gap-4">
        <IconBubble tone={activity?.tone ?? "slate"}>
          <Icon className="h-4 w-4" />
        </IconBubble>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              {formatDate(log.date)}
            </span>
            <span className="text-slate-700">•</span>
            <span className="text-xs text-slate-400">
              {activity?.label ?? log.activityType}
            </span>
            {projectName ? (
              <>
                <span className="text-slate-700">•</span>
                <span className="truncate text-xs text-slate-500">{projectName}</span>
              </>
            ) : null}
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-slate-100">
            {log.summary}
          </p>
        </div>

        <div className="hidden shrink-0 text-sm font-semibold text-slate-300 sm:block">
          {log.durationMinutes ? formatMinutes(log.durationMinutes) : "0m"}
        </div>
        <Badge tone={log.includedInReport ? "green" : "slate"}>
          {log.includedInReport ? "Included" : "Not included"}
        </Badge>
        <div className="flex shrink-0 items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
          <Button variant="ghost" onClick={onEdit} className="h-8 w-8 px-0">
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            onClick={onDelete}
            disabled={isDeleting}
            className="h-8 w-8 px-0 text-red-200 hover:border-red-300/20 hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </article>
  );
}

function EmptyLogs() {
  return (
    <div className="flex min-h-[210px] items-center rounded-2xl border border-white/10 bg-slate-950/35 p-8">
      <div className="flex items-center gap-5">
        <div className="grid h-14 w-14 place-items-center rounded-2xl border border-slate-500/20 bg-slate-700/20 text-slate-400">
          <ClipboardCheck className="h-7 w-7" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">No logs yet</p>
          <p className="mt-1 max-w-sm text-sm leading-6 text-slate-400">
            Once you add more non-code work, it will appear here.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  help,
  error,
  className = "",
  children,
}: {
  label: string;
  help?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`grid gap-2 text-xs font-semibold text-slate-200 ${className}`}>
      {label}
      {children}
      {error ? (
        <span className="text-[11px] text-red-300">{error}</span>
      ) : help ? (
        <span className="text-[11px] font-medium leading-5 text-slate-500">{help}</span>
      ) : null}
    </label>
  );
}

function IconBubble({
  tone,
  size = "md",
  children,
}: {
  tone: IconTone;
  size?: "md" | "lg";
  children: ReactNode;
}) {
  const sizeClass = size === "lg" ? "h-14 w-14 rounded-2xl" : "h-12 w-12 rounded-2xl";
  const toneClass: Record<IconTone, string> = {
    blue: "border-blue-300/25 bg-blue-500/15 text-blue-200 shadow-blue-500/10",
    cyan: "border-cyan-300/25 bg-cyan-500/15 text-cyan-200 shadow-cyan-500/10",
    green: "border-emerald-300/25 bg-emerald-500/15 text-emerald-200 shadow-emerald-500/10",
    purple: "border-purple-300/25 bg-purple-500/15 text-purple-200 shadow-purple-500/10",
    orange: "border-orange-300/25 bg-orange-500/15 text-orange-200 shadow-orange-500/10",
    amber: "border-amber-300/25 bg-amber-500/15 text-amber-200 shadow-amber-500/10",
    slate: "border-slate-300/15 bg-slate-500/10 text-slate-300 shadow-black/10",
  };

  return (
    <span
      className={`grid shrink-0 place-items-center border shadow-lg ${sizeClass} ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}

const inputClass =
  "w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/15 disabled:opacity-60 h-10";

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

function projectNameFor(projectId: string | null | undefined, projectNameById: Map<string, string>) {
  if (!projectId) return null;
  return projectNameById.get(projectId) ?? null;
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

  if (remainder === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainder.toString().padStart(2, "0")}m`;
}
