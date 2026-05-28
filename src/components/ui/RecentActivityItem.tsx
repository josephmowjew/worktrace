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
  commit: "bg-emerald-500/15 text-emerald-200",
  Meeting: "bg-blue-500/15 text-blue-200",
  Development: "bg-violet-500/15 text-violet-200",
  BugFix: "bg-orange-500/15 text-orange-200",
  Testing: "bg-cyan-500/15 text-cyan-200",
  Deployment: "bg-green-500/15 text-green-200",
  Research: "bg-purple-500/15 text-purple-200",
  Documentation: "bg-slate-500/15 text-slate-200",
  Planning: "bg-amber-500/15 text-amber-200",
  Support: "bg-pink-500/15 text-pink-200",
  CodeReview: "bg-indigo-500/15 text-indigo-200",
  ClientFeedback: "bg-rose-500/15 text-rose-200",
  Debugging: "bg-orange-500/15 text-orange-200",
  ClientCall: "bg-blue-500/15 text-blue-200",
  AdminTask: "bg-slate-500/15 text-slate-200",
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
  const colorClass = activityColors[item.activityType] || "bg-slate-500/15 text-slate-200";
  const isCommit = item.activityType === "commit";
  const commitHash = isCommit ? getCommitHash(item.summary) : null;
  const message = isCommit ? getCommitMessage(item.summary) : item.summary;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-slate-950/35 p-3 transition-colors hover:bg-white/5">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${colorClass}`}>
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-100">{message}</p>
            {commitHash && (
              <span className="text-[10px] font-mono text-slate-500">{commitHash}</span>
            )}
          </div>
          <span className="shrink-0 text-[10px] text-slate-500">
            {formatTimeAgo(item.occurredAt)}
          </span>
        </div>

        <div className="mt-1 flex items-center gap-2">
          {item.projectName && (
            <span className="truncate text-[11px] text-slate-400">
              {item.projectName}
            </span>
          )}
          {isCommit ? <GitContextBadges branch={item.branch} refs={item.refs} worktree={item.worktree} /> : null}
        </div>
      </div>
    </div>
  );
}
