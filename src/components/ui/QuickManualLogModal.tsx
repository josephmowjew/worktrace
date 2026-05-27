import { zodResolver } from "@hookform/resolvers/zod";
import { Save, X, FolderKanban, Users, Code, Bug, FlaskConical, Rocket, Eye, FileText, CalendarDays, Headphones, MessageSquare } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import type { Project } from "../../types/project";
import type { ActivityType, CreateManualLogInput } from "../../types/manualLog";
import { Button } from "./Button";
import { Panel } from "./Panel";
import { SelectField } from "./SelectField";

const activityTypes: Array<{ value: ActivityType; label: string; icon: React.ElementType }> = [
  { value: "Meeting", label: "Meeting", icon: Users },
  { value: "Development", label: "Development", icon: Code },
  { value: "BugFix", label: "Bug Fix", icon: Bug },
  { value: "Testing", label: "Testing", icon: FlaskConical },
  { value: "Deployment", label: "Deployment", icon: Rocket },
  { value: "Research", label: "Research", icon: Eye },
  { value: "Documentation", label: "Documentation", icon: FileText },
  { value: "Planning", label: "Planning", icon: CalendarDays },
  { value: "Support", label: "Support", icon: Headphones },
  { value: "CodeReview", label: "Code Review", icon: Eye },
  { value: "ClientFeedback", label: "Client Feedback", icon: MessageSquare },
];

const schema = z.object({
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
  durationMinutes: z.union([z.number().min(0), z.literal("")]),
  includedInReport: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export function QuickManualLogModal({
  isOpen,
  onClose,
  onSubmit,
  projects,
  date,
  isPending,
  error,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CreateManualLogInput) => void;
  projects: Project[];
  date: string;
  isPending: boolean;
  error?: string;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues(date),
  });

  useEffect(() => {
    if (isOpen) {
      form.reset(defaultValues(date));
    }
  }, [date, form, isOpen]);

  useEscapeKey(onClose, isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <Panel className="relative w-full max-w-lg overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">Quick Log</h2>
            <p className="mt-0.5 text-xs text-slate-400">Capture non-code work for today.</p>
          </div>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 px-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form
          className="grid gap-4 p-5"
          onSubmit={form.handleSubmit((values) => onSubmit(toInput(values)))}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date" error={form.formState.errors.date?.message}>
              <input type="date" className={inputClass} {...form.register("date")} />
            </Field>
            <Field label="Duration">
              <input
                type="number"
                min={0}
                className={inputClass}
                placeholder="30"
                {...form.register("durationMinutes", {
                  setValueAs: (value) => (value === "" ? "" : Number(value)),
                })}
              />
            </Field>
          </div>

          <Field label="Project">
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
              size="sm"
            />
          </Field>

          <Field label="Activity Type">
            <SelectField
              control={form.control}
              name="activityType"
              options={activityTypes.map((type) => ({
                value: type.value,
                label: type.label,
                icon: type.icon,
              }))}
              size="sm"
            />
          </Field>

          <Field label="Summary" error={form.formState.errors.summary?.message}>
            <textarea
              className={`${inputClass} min-h-20 resize-y py-3`}
              placeholder="Summarize the work in one clear sentence."
              {...form.register("summary")}
            />
          </Field>

          <Field label="Outcome">
            <textarea
              className={`${inputClass} min-h-20 resize-y py-3`}
              placeholder="Optional result, decision, or next step."
              {...form.register("outcome")}
            />
          </Field>

          <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/45 px-3 py-2 text-sm text-slate-300">
            <input type="checkbox" className="h-4 w-4 accent-blue-500" {...form.register("includedInReport")} />
            Include in weekly report
          </label>

          {error ? (
            <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
              {error}
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isPending} className="flex-1">
              <Save className="h-4 w-4" />
              {isPending ? "Saving..." : "Save Log"}
            </Button>
          </div>
        </form>
      </Panel>
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
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-xs font-semibold text-slate-300">
      {label}
      {children}
      {error ? <span className="text-[11px] text-red-300">{error}</span> : null}
    </label>
  );
}

function defaultValues(date: string): FormValues {
  return {
    projectId: "",
    date,
    activityType: "Meeting",
    summary: "",
    outcome: "",
    durationMinutes: "",
    includedInReport: true,
  };
}

function toInput(values: FormValues): CreateManualLogInput {
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
    followUp: null,
    includedInReport: values.includedInReport,
  };
}

const inputClass =
  "h-10 w-full rounded-xl border border-white/10 bg-slate-950/75 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/15";
