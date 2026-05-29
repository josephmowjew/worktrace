import {
  Calendar,
  FlaskConical,
  GitBranch,
  GitCommit,
  Rocket,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ActivityItem } from "../../types/activity";
import { GitContextBadges } from "./GitContextBadges";

const activityIcons: Record<string, LucideIcon> = {
  commit: GitCommit,
  Meeting: Calendar,
  Development: GitBranch,
  BugFix: FlaskConical,
  Testing: FlaskConical,
  Deployment: Rocket,
  Research: FlaskConical,
  Documentation: GitBranch,
  Planning: Calendar,
  Support: Calendar,
  CodeReview: GitBranch,
  ClientFeedback: Calendar,
  Debugging: FlaskConical,
  ClientCall: Calendar,
  AdminTask: GitBranch,
};

const activityColors: Record<string, string> = {
  commit: "bg-emerald-500/10 text-emerald-600",
  Meeting: "bg-blue-500/10 text-blue-600",
  Development: "bg-violet-500/10 text-violet-600",
  BugFix: "bg-orange-500/10 text-orange-600",
  Testing: "bg-cyan-500/10 text-cyan-600",
  Deployment: "bg-green-500/10 text-green-600",
  Research: "bg-purple-500/10 text-purple-600",
  Documentation: "bg-slate-500/10 text-slate-600",
  Planning: "bg-amber-500/10 text-amber-600",
  Support: "bg-pink-500/10 text-pink-600",
  CodeReview: "bg-indigo-500/10 text-indigo-600",
  ClientFeedback: "bg-rose-500/10 text-rose-600",
  Debugging: "bg-orange-500/10 text-orange-600",
  ClientCall: "bg-blue-500/10 text-blue-600",
  AdminTask: "bg-slate-500/10 text-slate-600",
};

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getCommitHash(summary: string): string | null {
  const match = summary.match(/^[a-f0-9]{7,}/);
  return match ? match[0] : null;
}

function getCommitMessage(summary: string): string {
  const hash = getCommitHash(summary);
  if (hash) {
    return summary.substring(hash.length).trim();
  }
  return summary;
}

export function RecentActivityItem({ item }: { item: ActivityItem }) {
  const Icon = activityIcons[item.activityType] || GitCommit;
  const colorClass = activityColors[item.activityType] || "bg-slate-500/10 text-slate-600";
  const isCommit = item.activityType === "commit";
  const commitHash = isCommit ? getCommitHash(item.summary) : null;
  const message = isCommit ? getCommitMessage(item.summary) : item.summary;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--wt-border)] bg-[var(--wt-surface)] p-3 shadow-[0_1px_2px_rgb(var(--wt-shadow)/0.06)] transition-colors hover:bg-[var(--wt-surface-muted)]">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${colorClass}`}>
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[var(--wt-text-strong)]">{message}</p>
            {commitHash && (
              <span className="text-[10px] font-mono text-[var(--wt-text-faint)]">{commitHash}</span>
            )}
          </div>
          <span className="shrink-0 text-[10px] text-[var(--wt-text-muted)]">
            {formatTimeAgo(item.occurredAt)}
          </span>
        </div>

        <div className="mt-1 flex items-center gap-2">
          {item.projectName && (
            <span className="truncate text-[11px] text-[var(--wt-text-muted)]">
              {item.projectName}
            </span>
          )}
          {isCommit ? <GitContextBadges branch={item.branch} refs={item.refs} worktree={item.worktree} /> : null}
        </div>
      </div>
    </div>
  );
}
