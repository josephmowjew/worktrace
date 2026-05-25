import {
  BookOpen,
  CheckCircle2,
  Clock3,
  Command,
  FileText,
  Focus,
  GitCommit,
  ListChecks,
  NotebookText,
  Sparkles,
} from "lucide-react";
import { Panel } from "../components/ui/Panel";

const dailySteps = [
  {
    title: "Start on Today",
    detail: "Use Today as your command center: check active work, blockers, focus, and report readiness before you dive in.",
    icon: Sparkles,
  },
  {
    title: "Capture work as it happens",
    detail: "Use the inline Quick Add bar for small planned tasks and quick logs for meetings, planning, support, testing, or research that Git cannot see.",
    icon: NotebookText,
  },
  {
    title: "Use focus sessions",
    detail: "Start focus from a task or project. Stop it when you are done, then decide whether to create a manual log or update progress.",
    icon: Focus,
  },
  {
    title: "Review before you leave",
    detail: "Run End-of-Day Review to sync commits, add missing logs, mark completions, carry blockers, and flag report-ready items.",
    icon: CheckCircle2,
  },
];

const weeklySteps = [
  "Monday: use the Carryover Assistant to carry forward, drop, complete, or report unfinished work.",
  "During the week: sync commits, log non-code work, and keep blockers current.",
  "Friday: open the Prepare Report flow, clean up carryovers, then generate the report.",
  "Before sending: edit the Markdown preview so it reads like a polished human update.",
];

const commands = [
  { command: "Ctrl+K", detail: "Open the command palette." },
  { command: "Add task", detail: "Open today's full task form." },
  { command: "Create manual log", detail: "Open today's quick manual log." },
  { command: "Start focus session", detail: "Jump to the Today focus panel." },
  { command: "What did I do today?", detail: "Open the guided daily review." },
  { command: "Scan repos", detail: "Sync tracked repos, then review workspace discovery." },
  { command: "task: Fix export button", detail: "Create a planned task for this week." },
  { command: "log: Client sync 30m", detail: "Create a manual log for today." },
  { command: "focus: Report polish", detail: "Start a focus session." },
  { command: "sync", detail: "Sync repositories." },
  { command: "report", detail: "Open the Prepare Report flow." },
];

export function GuidePage() {
  return (
    <div className="space-y-4">
      <Panel className="relative overflow-hidden p-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_12%,rgba(59,130,246,0.24),transparent_28%),radial-gradient(circle_at_86%_18%,rgba(20,184,166,0.16),transparent_28%),linear-gradient(135deg,rgba(15,23,42,0.28),rgba(15,23,42,0.86))]" />
        <div className="relative grid gap-5 px-5 py-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.55fr)] lg:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
              <BookOpen className="h-3.5 w-3.5" />
              WorkTrace guide
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">How to use WorkTrace well</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              WorkTrace works best when you treat it as a light daily loop: plan the work, capture what actually happened, review the day, then generate the weekly update with almost no Friday cleanup.
            </p>
          </div>
          <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/35 p-4 shadow-2xl shadow-black/20">
            <GuideMetric icon={Clock3} label="Daily rhythm" value="5 min" />
            <GuideMetric icon={FileText} label="Weekly report goal" value="< 5 min" />
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel>
          <div className="mb-4 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-cyan-200" />
            <h2 className="text-base font-semibold text-white">Daily Workflow</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {dailySteps.map((step) => (
              <article key={step.title} className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                <step.icon className="h-5 w-5 text-cyan-200" />
                <h3 className="mt-3 text-sm font-semibold text-white">{step.title}</h3>
                <p className="mt-2 text-xs leading-5 text-slate-400">{step.detail}</p>
              </article>
            ))}
          </div>
        </Panel>

        <Panel>
          <div className="mb-4 flex items-center gap-2">
            <Command className="h-4 w-4 text-blue-200" />
            <h2 className="text-base font-semibold text-white">Fast Commands</h2>
          </div>
          <div className="space-y-2">
            {commands.map((item) => (
              <div key={item.command} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                <code className="text-xs font-semibold text-blue-100">{item.command}</code>
                <p className="mt-1 text-xs leading-5 text-slate-400">{item.detail}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <div className="mb-4 flex items-center gap-2">
            <GitCommit className="h-4 w-4 text-purple-200" />
            <h2 className="text-base font-semibold text-white">Weekly Reporting Rhythm</h2>
          </div>
          <div className="space-y-2">
            {weeklySteps.map((step) => (
              <div key={step} className="flex gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                <p className="text-sm leading-6 text-slate-300">{step}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="border-emerald-300/15 bg-emerald-400/10">
          <div className="mb-4 flex items-center gap-2">
            <Focus className="h-4 w-4 text-emerald-200" />
            <h2 className="text-base font-semibold text-white">Best Practices</h2>
          </div>
          <div className="space-y-3 text-sm leading-6 text-slate-300">
            <p>Keep tasks small enough that they can move during the week. Use blockers for things that need attention from someone else.</p>
            <p>Use manual logs for work that matters but does not produce commits: meetings, support, planning, QA, deployments, research, and client feedback.</p>
            <p>Let quiet nudges point out missing activity, blockers, stale work, and report gaps, then choose the action yourself.</p>
            <p>Do not wait until Friday to reconstruct the week. A two-minute daily review keeps the report calm.</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function GuideMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/45 p-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-500/10 text-cyan-200">
        <Icon className="h-4 w-4" />
      </span>
      <span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
        <span className="mt-1 block text-xl font-semibold text-white">{value}</span>
      </span>
    </div>
  );
}
