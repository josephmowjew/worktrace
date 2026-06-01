import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bug,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Code,
  BriefcaseBusiness,
  Copy,
  Edit3,
  Eraser,
  Eye,
  FileText,
  FlaskConical,
  FolderKanban,
  Headphones,
  MessageSquare,
  NotebookText,
  Plus,
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
import {
  ManualLogAttachmentsSection,
  PendingManualLogAttachmentsSection,
} from "../components/ui/ManualLogAttachmentsSection";
import { ManualLogDetailModal } from "../components/ui/ManualLogDetailModal";
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
import { addManualLogAttachment } from "../lib/api/manualLogAttachments";
import { listProjects } from "../lib/api/projects";
import { manualLogAnnouncement } from "../lib/announcements";
import { useWeekRange } from "../hooks/useWeekRange";
import { manualLogToneByType, toneBadgeClass } from "../lib/workItemStyles";
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
  { value: "Debugging", label: "Debugging", icon: Bug, tone: "orange" },
  { value: "ClientCall", label: "Client Call", icon: Users, tone: "purple" },
  { value: "AdminTask", label: "Admin Task", icon: BriefcaseBusiness, tone: "slate" },
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
    "Debugging",
    "ClientCall",
    "AdminTask",
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
type ManualLogSubmitValues = ManualLogFormValues & {
  attachmentPaths?: string[];
};
type IconTone = "blue" | "cyan" | "green" | "purple" | "orange" | "amber" | "rose" | "slate";

export function ManualLogPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const speech = useSpeech();
  const weekRange = useWeekRange();
  const [editingLog, setEditingLog] = useState<ManualLog | null>(null);
  const [viewingLog, setViewingLog] = useState<ManualLog | null>(null);
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");
  const [pendingAttachmentPaths, setPendingAttachmentPaths] = useState<string[]>([]);

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
  const newestLogId = logs[0]?.id;

  const saveMutation = useMutation({
    mutationFn: async (values: ManualLogSubmitValues) => {
      const input = toManualLogInput(values);
      let log: ManualLog;

      if (editingLog) {
        log = await updateManualLog(editingLog.id, input);
      } else {
        log = await createManualLog(input);
      }

      for (const path of values.attachmentPaths ?? []) {
        await addManualLogAttachment(log.id, path);
      }

      return log;
    },
    onSuccess: async (log, values) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["manualLogs"] }),
        queryClient.invalidateQueries({ queryKey: ["manualLogAttachments", log.id] }),
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
    setPendingAttachmentPaths([]);
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

  function duplicateLog(log: ManualLog) {
    setEditingLog(null);
    setPendingAttachmentPaths([]);
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
    setPendingAttachmentPaths([]);
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

      <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(380px,0.9fr)_minmax(600px,1.45fr)]">
        <Panel className="relative overflow-hidden p-0 shadow-[0_18px_60px_rgb(2_8_23/0.20)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--wt-border)] px-5 py-5">
            <div className="flex items-center gap-2">
              <NotebookText className="h-4 w-4 text-violet-600 dark:text-purple-300" />
              <h2 className="text-base font-semibold text-[var(--wt-text-strong)]">Recent Manual Logs</h2>
            </div>
            <button
              type="button"
              onClick={() =>
                setSortDirection((current) => (current === "desc" ? "asc" : "desc"))
              }
              className="inline-flex h-10 min-w-[136px] items-center justify-center gap-2 rounded-lg border border-[var(--wt-border)] bg-[var(--wt-input)] px-3 text-sm font-semibold text-[var(--wt-text-strong)] shadow-[var(--wt-control-shadow)] transition-[background-color,border-color,color,transform] duration-150 hover:border-blue-500/25 hover:bg-[var(--wt-surface-hover)] hover:text-[var(--wt-accent-text)] active:scale-[0.96]"
            >
              {sortDirection === "desc" ? "Most recent" : "Oldest first"}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[calc(100vh-280px)] min-h-[520px] space-y-4 overflow-y-auto p-5 pr-4">
            <button
              type="button"
              onClick={clearForm}
              className={`group flex w-full items-center justify-between rounded-xl border px-4 py-4 text-left transition-[background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.99] ${
                editingLog
                  ? "border-[var(--wt-border)] bg-[var(--wt-surface)] hover:border-violet-500/25"
                  : "border-violet-500/30 bg-violet-500/10 shadow-[0_10px_24px_rgb(124_58_237/0.10)]"
              }`}
            >
              <span className="flex items-center gap-4">
                <span className="grid h-12 w-12 place-items-center rounded-lg border border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-100">
                  <Plus className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-[var(--wt-text-strong)]">New Entry</span>
                  <span className="mt-1 block text-xs text-[var(--wt-text-muted)]">
                    Create a new manual log
                  </span>
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-[var(--wt-text-muted)] transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-violet-600" />
            </button>

            {logsQuery.isLoading ? (
              <div className="grid gap-3">
                {[0, 1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="h-20 animate-pulse rounded-2xl border border-[var(--wt-border)] bg-[var(--wt-surface-muted)]"
                  />
                ))}
              </div>
            ) : logsQuery.isError ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-100">
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
                    onView={() => setViewingLog(log)}
                    onEdit={() => editLog(log)}
                    onDuplicate={() => duplicateLog(log)}
                    onDelete={() => deleteMutation.mutate(log.id)}
                    isDeleting={deleteMutation.isPending}
                    isNewest={log.id === newestLogId}
                  />
                ))}
              </div>
            )}
          </div>
        </Panel>

        <Panel className="relative overflow-hidden p-0 shadow-[0_18px_60px_rgb(2_8_23/0.20)]">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--wt-border)] px-6 py-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold tracking-tight text-[var(--wt-text-strong)]">
                  {editingLog ? "Edit Non-Code Work" : "Log Non-Code Work"}
                </h2>
                <Badge tone="blue">{editingLog ? "Editing" : "New Entry"}</Badge>
              </div>
              <p className="mt-1 text-sm text-[var(--wt-text-muted)]">
                Add the details of the work you performed.
              </p>
            </div>
            <Button variant="ghost" onClick={clearForm}>
              {editingLog ? <X className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
              {editingLog ? "Cancel" : "Clear Form"}
            </Button>
          </div>

          <form
            className="grid gap-x-5 gap-y-4 p-6 lg:grid-cols-2"
            onSubmit={form.handleSubmit((values) =>
              saveMutation.mutate({
                ...values,
                attachmentPaths: editingLog ? [] : pendingAttachmentPaths,
              }),
            )}
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
                className={`${inputClass} min-h-[58px] resize-y py-3 leading-5`}
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
                className={`${inputClass} min-h-[58px] resize-y py-3 leading-5`}
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
                className={`${inputClass} min-h-[58px] resize-y py-3 leading-5`}
                placeholder="What are the next steps or who is responsible?"
                {...form.register("followUp")}
              />
            </Field>

            <div className="rounded-xl border border-[var(--wt-border)] bg-[var(--wt-surface-muted)] p-4 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--wt-text-strong)]">
                    Include in weekly report
                  </p>
                  <p className="mt-1 text-xs text-[var(--wt-text-muted)]">
                    When enabled, this log will be included in your weekly report.
                  </p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    {...form.register("includedInReport")}
                  />
                  <span className="h-7 w-14 rounded-full border border-[var(--wt-border)] bg-[var(--wt-surface)] transition peer-checked:border-blue-500/40 peer-checked:bg-blue-600" />
                  <span className="absolute left-1 grid h-5 w-5 place-items-center rounded-full bg-white text-slate-700 shadow transition peer-checked:translate-x-7 peer-checked:text-blue-600">
                    <Check className="h-3 w-3" />
                  </span>
                </label>
              </div>
            </div>

            <div className="lg:col-span-2">
              {editingLog ? (
                <ManualLogAttachmentsSection
                  manualLogId={editingLog.id}
                  queryKey={["manualLogAttachments", editingLog.id]}
                  onChanged={() =>
                    queryClient.invalidateQueries({ queryKey: ["manualLogAttachments", editingLog.id] })
                  }
                  onError={(title, message) => toast.error(title, message)}
                  onSuccess={(title, message) => toast.success(title, message)}
                />
              ) : (
                <PendingManualLogAttachmentsSection
                  paths={pendingAttachmentPaths}
                  onChange={setPendingAttachmentPaths}
                  onError={(message) => toast.error("Attachment failed", message)}
                />
              )}
            </div>

            {saveMutation.isError ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-100 lg:col-span-2">
                {saveMutation.error instanceof Error
                  ? saveMutation.error.message
                  : "Manual log could not be saved."}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--wt-border)] pt-4 lg:col-span-2">
              {editingLog ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => deleteMutation.mutate(editingLog.id)}
                  disabled={deleteMutation.isPending}
                  className="wt-action-danger"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              ) : (
                <span />
              )}
              <div className="flex flex-wrap justify-end gap-3">
                <Button type="button" variant="secondary" onClick={clearForm}>
                  <Eraser className="h-4 w-4" />
                  {editingLog ? "Cancel" : "Clear Form"}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={saveMutation.isPending}
                  className="min-w-36"
                >
                  <Save className="h-4 w-4" />
                  {saveMutation.isPending
                    ? "Saving..."
                    : editingLog
                      ? "Save Entry"
                      : "Save Log"}
                </Button>
              </div>
            </div>
          </form>
        </Panel>
      </div>

      <ManualLogDetailModal
        isOpen={Boolean(viewingLog)}
        log={viewingLog}
        onClose={() => setViewingLog(null)}
      />
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
    <header className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          className="inline-flex h-11 items-center gap-3 rounded-xl border border-[var(--wt-border)] bg-[var(--wt-input)] px-4 text-sm font-semibold text-[var(--wt-text-strong)] shadow-[var(--wt-control-shadow)] transition-[background-color,border-color,color,transform] duration-150 hover:border-blue-500/25 hover:bg-[var(--wt-surface-hover)] active:scale-[0.96]"
        >
          <CalendarDays className="h-4 w-4 text-[var(--wt-text-muted)]" />
          <span>{weekLabel}</span>
          <ChevronRight className="h-4 w-4 text-[var(--wt-text-muted)]" />
        </button>

        <div className="flex flex-wrap items-center gap-5">
          <HeroStat label="Total logs" value={totalLogs.toString()} tone="blue" />
          <HeroStat label="Included in report" value={includedCount.toString()} tone="green" />
          <HeroStat label="This week" value={formatMinutes(totalMinutes)} tone="orange" />
        </div>
      </div>
      <p className="max-w-3xl text-sm leading-6 text-[var(--wt-text-muted)]">
        Capture meetings, planning, testing, support, reviews, and other non-code work for {weekLabel}.
      </p>
    </header>
  );
}

function HeroStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: IconTone;
}) {
  const toneClass: Record<IconTone, string> = {
    blue: "bg-blue-500 text-blue-200 shadow-[0_0_18px_rgb(59_130_246/0.38)]",
    cyan: "bg-cyan-500 text-cyan-100 shadow-[0_0_18px_rgb(6_182_212/0.32)]",
    green: "bg-emerald-500 text-emerald-100 shadow-[0_0_18px_rgb(16_185_129/0.32)]",
    purple: "bg-violet-500 text-violet-100 shadow-[0_0_18px_rgb(139_92_246/0.32)]",
    orange: "bg-orange-500 text-orange-100 shadow-[0_0_18px_rgb(249_115_22/0.32)]",
    amber: "bg-amber-500 text-amber-100 shadow-[0_0_18px_rgb(245_158_11/0.32)]",
    rose: "bg-rose-500 text-rose-100 shadow-[0_0_18px_rgb(244_63_94/0.32)]",
    slate: "bg-slate-500 text-slate-100 shadow-[0_0_18px_rgb(100_116_139/0.24)]",
  };

  return (
    <div className="flex items-center gap-2.5 border-r border-[var(--wt-border)] pr-5 last:border-r-0 last:pr-0">
      <span className={`h-2.5 w-8 rounded-full ${toneClass[tone]}`} />
      <span className="text-sm font-semibold tabular-nums text-[var(--wt-text-strong)]">{value}</span>
      <span className="text-sm text-[var(--wt-text-muted)]">{label}</span>
    </div>
  );
}

function ManualLogRow({
  log,
  projectName,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
  isDeleting,
  isNewest,
}: {
  log: ManualLog;
  projectName?: string;
  onView: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  isNewest: boolean;
}) {
  const activity = activityTypes.find((item) => item.value === log.activityType);
  const tone = manualLogToneByType[log.activityType] ?? "slate";

  return (
    <article className="group rounded-xl border border-[var(--wt-border)] bg-[var(--wt-surface)] p-5 shadow-[var(--wt-panel-shadow)] transition-[background-color,border-color,box-shadow] duration-150 hover:border-blue-500/25 hover:bg-[var(--wt-surface-muted)]">
      <div className="min-w-0">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--wt-text-muted)]">
              {formatDate(log.date)}
            </span>
            <span className="text-slate-700">•</span>
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--wt-text-muted)]">
              {activity?.label ?? log.activityType}
            </span>
            {isNewest ? <Badge tone="blue">Most Recent</Badge> : null}
            {projectName ? (
              <>
                <span className="text-slate-700">•</span>
                <span className="truncate text-xs text-[var(--wt-text-muted)]">{projectName}</span>
              </>
            ) : null}
          </div>
          <p className="mt-4 max-w-[44rem] text-base font-semibold leading-7 text-[var(--wt-text-strong)]">
            {log.summary}
          </p>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 text-sm tabular-nums text-[var(--wt-text-muted)]">
              <Clock3 className="h-4 w-4" />
              {log.durationMinutes ? formatMinutes(log.durationMinutes) : "0m"}
            </span>
            <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${toneBadgeClass(tone)}`}>
              {activity?.label ?? log.activityType}
            </span>
            <Badge tone={log.includedInReport ? "green" : "slate"}>
              {log.includedInReport ? "Included" : "Not included"}
            </Badge>
          </div>

          <div className="flex shrink-0 items-center gap-2 opacity-80 transition-opacity duration-150 group-hover:opacity-100">
            <Button
              variant="ghost"
              onClick={onView}
              className="h-10 min-h-10 px-3"
              aria-label={`View manual log: ${log.summary}`}
              title="View manual log"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              onClick={onEdit}
              className="wt-action-info h-10 min-h-10 px-3"
              aria-label={`Edit manual log: ${log.summary}`}
              title="Edit manual log"
            >
              <Edit3 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              onClick={onDuplicate}
              className="h-10 min-h-10 px-3"
              aria-label={`Duplicate manual log: ${log.summary}`}
              title="Duplicate manual log"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              onClick={onDelete}
              disabled={isDeleting}
              className="wt-action-danger h-10 min-h-10 px-3"
              aria-label={`Delete manual log: ${log.summary}`}
              title="Delete manual log"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

function EmptyLogs() {
  return (
    <div className="flex min-h-[210px] items-center rounded-2xl border border-[var(--wt-border)] bg-[var(--wt-surface-muted)] p-8">
      <div className="flex items-center gap-5">
        <div className="grid h-14 w-14 place-items-center rounded-2xl border border-[var(--wt-border)] bg-[var(--wt-surface)] text-[var(--wt-text-muted)]">
          <ClipboardCheck className="h-7 w-7" />
        </div>
        <div>
          <p className="text-sm font-semibold text-[var(--wt-text-strong)]">No logs yet</p>
          <p className="mt-1 max-w-sm text-sm leading-6 text-[var(--wt-text-muted)]">
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
    <label className={`grid gap-2 text-xs font-semibold text-[var(--wt-text-muted)] ${className}`}>
      {label}
      {children}
      {error ? (
        <span className="text-[11px] text-red-500">{error}</span>
      ) : help ? (
        <span className="text-[11px] font-medium leading-5 text-[var(--wt-text-faint)]">{help}</span>
      ) : null}
    </label>
  );
}

const inputClass =
  "wt-input h-10 w-full rounded-xl px-3 text-sm transition-[border-color,box-shadow,background-color] disabled:opacity-60";

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
