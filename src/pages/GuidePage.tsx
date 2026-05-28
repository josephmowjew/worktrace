import {
  BookOpen,
  CheckCircle2,
  Clock3,
  Command,
  FileText,
  Focus,
  GitCommit,
  Layers3,
  ListChecks,
  NotebookText,
  PackageCheck,
  PanelsTopLeft,
  Sparkles,
  Target,
} from "lucide-react";
import { Panel } from "../components/ui/Panel";
import { PageHeader } from "../components/ui/PageHeader";

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

const featureArticles = [
  {
    title: "Today Focus And Priority Reminders",
    icon: Target,
    detail:
      "Today Focus uses your daily Top 3 priorities as the work that deserves attention. WorkTrace checks them at work-block checkpoints and reminds you when something is still unfinished.",
    points: [
      "Set or confirm the Top 3 priorities on Today, then add planned minutes when useful.",
      "Incomplete priorities can show in-app reminder cards and optional desktop notifications.",
      "Use Start focus, Mark done, Snooze, or Dismiss today from the reminder card.",
      "Reminder checkpoints, snooze duration, quiet hours, and desktop notifications are configurable in Settings.",
    ],
  },
  {
    title: "Smart Activity Grouping",
    icon: Layers3,
    detail:
      "Smart Organize turns related commits into editable work items. It uses local Git evidence such as branch names, issue tokens, changed modules, file paths, timing, and task context, then leaves weak single commits as raw commits instead of forcing fake groups.",
    points: [
      "Open Activity Timeline and choose Smart Organize for the selected week.",
      "Expand a work item to inspect the supporting commits and why they were grouped.",
      "Rename the work item or edit the report summary; WorkTrace remembers that local correction for future similar work.",
      "Workspace items can span multiple projects when the evidence is strong, but workspace membership alone is not enough to group work.",
    ],
  },
  {
    title: "Project Details And PR Packages",
    icon: PackageCheck,
    detail:
      "Project Details reuses the same canonical work items from the timeline. Grouped commits are hidden as raw rows, but remain available as expandable evidence and PR inputs.",
    points: [
      "Select a work item to build a PR package from all child commits in that project.",
      "For workspace-level work items, Project Details uses the current repo slice of the shared group.",
      "The PR title and notes start from the work item title and report summary, while cherry-pick commands still use commit hashes.",
    ],
  },
  {
    title: "Tasks, Meetings, And Manual Logs",
    icon: NotebookText,
    detail:
      "Weekly Plan tasks and manual logs fill the gaps that commits cannot explain: meetings, support, planning, reviews, QA, blockers, and follow-ups.",
    points: [
      "Associate tasks and logs with projects so they appear in Project Details and reports.",
      "Completed tasks still appear in Project Details for the selected week with their status badge.",
      "Click tasks or meetings in Project Details to inspect the full captured context.",
    ],
  },
  {
    title: "Global Quick Capture",
    icon: Sparkles,
    detail:
      "Press Ctrl + Shift + Space to open a small capture window from anywhere. It is for the tiny bits of work that disappear if you wait: client calls, support issues, debugging, research, deployments, and admin tasks.",
    points: [
      "Type one sentence, choose a category, then press Enter to save immediately.",
      "Project and duration are optional. WorkTrace may suggest a recent project, but it only applies when you click the suggestion or choose a project yourself.",
      "Leave the project as General and time as No time when you want a quick note without extra metadata.",
      "Quick captures are saved as local manual logs and can be included in reports by default.",
      "Change the shortcut or disable it from Settings when another app already owns that key combination.",
    ],
  },
  {
    title: "Focus Sessions",
    icon: Focus,
    detail:
      "Focus sessions connect time spent to tasks or projects. When you stop a session, you can update progress and create a manual log so the time has report context.",
    points: [
      "Start focus from Today, a task, or a project.",
      "Stop focus when the work changes so coding time and manual context stay accurate.",
      "Use the generated log when the session captures useful non-commit context.",
    ],
  },
  {
    title: "Reports",
    icon: FileText,
    detail:
      "Reports prefer polished work items over raw commit lists. Group summaries become report bullets, and child commits are treated as supporting evidence instead of duplicate output.",
    points: [
      "Review weak titles before generating a report.",
      "Use report inclusion badges to decide what should be visible.",
      "Edit the final Markdown preview before sending so it sounds like you.",
    ],
  },
  {
    title: "Settings And Local Privacy",
    icon: PanelsTopLeft,
    detail:
      "WorkTrace is local-first. Git evidence, grouping data, title memory, embeddings, tasks, and report context stay on this machine unless you explicitly configure an integration.",
    points: [
      "Use Settings to connect or disconnect external integrations.",
      "Embeddings are optional quality signals and are not required for deterministic grouping.",
      "Full Sync is available for repair, while normal sync is incremental.",
    ],
  },
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
      <PageHeader
        icon={BookOpen}
        eyebrow="WorkTrace guide"
        title="How to use WorkTrace well"
        description="WorkTrace works best when you treat it as a light daily loop: plan the work, capture what actually happened, review the day, then generate the weekly update with almost no Friday cleanup."
        meta={
          <div className="grid min-w-[280px] gap-3 rounded-xl border border-white/10 bg-slate-950/45 p-3 sm:grid-cols-2">
            <GuideMetric icon={Clock3} label="Daily rhythm" value="5 min" />
            <GuideMetric icon={FileText} label="Weekly report goal" value="< 5 min" />
          </div>
        }
      />

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

      <Panel>
        <div className="mb-4 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-blue-200" />
          <h2 className="text-base font-semibold text-white">Feature Articles</h2>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {featureArticles.map((article) => (
            <article key={article.title} className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-blue-300/20 bg-blue-500/10 text-blue-200">
                  <article.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white">{article.title}</h3>
                  <p className="mt-2 text-xs leading-5 text-slate-400">{article.detail}</p>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {article.points.map((point) => (
                  <div key={point} className="flex gap-2 text-xs leading-5 text-slate-300">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
                    <p>{point}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </Panel>

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
